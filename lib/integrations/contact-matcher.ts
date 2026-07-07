import "server-only";
import { db } from "@/lib/db";
import { accounts, contacts, users } from "@/lib/db/schema";
import { and, eq, isNull, like, or, sql } from "drizzle-orm";

// All matchers query via the Drizzle service-role client, NOT the cookie-based
// Supabase client: every caller is a cron route or event processor where no
// user session exists, so an RLS-enforced client would see zero contact rows
// and matching would silently never succeed (same trust model as
// record-activity.ts — only verified-source integration code imports this).

/**
 * Normalize a phone number to E.164 (best-effort) for matching.
 * - Strips formatting characters
 * - Adds + if missing and the leading digits look like a country code
 * - Falls back to last-7-digits matching for local numbers
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  // US default — most reps + clients are US-based for SchoolConex
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length > 7 ? `+${digits}` : null;
}

export function lastSeven(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-7) : null;
}

/** Strip everything but [a-z0-9] — same normalizer as the QuickBooks importer. */
export function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type ContactMatch = {
  contactId: string;
  accountId: string;
  fullName: string;
};

const contactCols = {
  id: contacts.id,
  accountId: contacts.accountId,
  firstName: contacts.firstName,
  lastName: contacts.lastName,
};

function toMatch(row: {
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
}): ContactMatch {
  return {
    contactId: row.id,
    accountId: row.accountId,
    fullName: `${row.firstName} ${row.lastName}`,
  };
}

/**
 * Match a phone number to a contact. Tries:
 *   1. Exact E.164 match on contacts.phone or contacts.whatsapp_phone
 *   2. Last-7-digits substring match (local-format fallback)
 * Returns null on no match.
 */
export async function matchPhoneToContact(
  phone: string,
): Promise<ContactMatch | null> {
  const e164 = normalizePhone(phone);
  if (!e164) return null;

  const exact = await db
    .select(contactCols)
    .from(contacts)
    .where(
      and(
        isNull(contacts.deletedAt),
        or(eq(contacts.phone, e164), eq(contacts.whatsappPhone, e164)),
      ),
    )
    .limit(1);
  if (exact[0]) return toMatch(exact[0]);

  const last7 = lastSeven(e164);
  if (!last7) return null;

  const fuzzy = await db
    .select(contactCols)
    .from(contacts)
    .where(
      and(
        isNull(contacts.deletedAt),
        or(like(contacts.phone, `%${last7}`), like(contacts.whatsappPhone, `%${last7}`)),
      ),
    )
    .limit(1);
  return fuzzy[0] ? toMatch(fuzzy[0]) : null;
}

/**
 * Match an email address to a contact (case-insensitive exact).
 */
export async function matchEmailToContact(
  email: string,
): Promise<ContactMatch | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const rows = await db
    .select(contactCols)
    .from(contacts)
    .where(
      and(isNull(contacts.deletedAt), sql`lower(${contacts.email}) = ${normalized}`),
    )
    .limit(1);
  return rows[0] ? toMatch(rows[0]) : null;
}

export type IdentityMatch = {
  accountId: string;
  contactId: string | null;
  matchedBy: "phone" | "email" | "contact_name" | "account_name";
};

/**
 * Match a call/message counterparty by whatever identity Dialpad (or another
 * provider) gave us, strongest signal first:
 *   1. phone → matchPhoneToContact
 *   2. email → matchEmailToContact (skipping internal @schoolconex.com)
 *   3. contact full name — only when exactly ONE contact carries that name
 *   4. account name (punctuation-insensitive) — only when exactly ONE account
 * Name passes are unique-only to avoid false positives on common names.
 */
export async function matchIdentityToContact(identity: {
  phone?: string | null;
  email?: string | null;
  name?: string | null;
}): Promise<IdentityMatch | null> {
  if (identity.phone) {
    const m = await matchPhoneToContact(identity.phone);
    if (m) return { accountId: m.accountId, contactId: m.contactId, matchedBy: "phone" };
  }

  const email = identity.email?.trim().toLowerCase();
  if (email && !email.endsWith("@schoolconex.com")) {
    const m = await matchEmailToContact(email);
    if (m) return { accountId: m.accountId, contactId: m.contactId, matchedBy: "email" };
  }

  const name = identity.name?.trim();
  if (name && name.length >= 5) {
    const byContact = await db
      .select(contactCols)
      .from(contacts)
      .where(
        and(
          isNull(contacts.deletedAt),
          sql`lower(${contacts.firstName} || ' ' || ${contacts.lastName}) = ${name.toLowerCase()}`,
        ),
      )
      .limit(2);
    if (byContact.length === 1) {
      return {
        accountId: byContact[0].accountId,
        contactId: byContact[0].id,
        matchedBy: "contact_name",
      };
    }

    const normed = normName(name);
    if (normed.length >= 6) {
      const byAccount = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(
            isNull(accounts.deletedAt),
            sql`regexp_replace(lower(${accounts.name}), '[^a-z0-9]', '', 'g') = ${normed}`,
          ),
        )
        .limit(2);
      if (byAccount.length === 1) {
        return { accountId: byAccount[0].id, contactId: null, matchedBy: "account_name" };
      }
    }
  }

  return null;
}

/**
 * Backfill a contact's phone from a live signal (e.g. the number a matched
 * call came from) so future calls hit the fast phone path. Fills only when
 * the contact has no phone yet, and never with a rep's own line.
 */
export async function stampContactPhoneIfEmpty(
  contactId: string,
  phone: string | null | undefined,
): Promise<boolean> {
  const e164 = normalizePhone(phone);
  if (!e164) return false;
  const l7 = lastSeven(e164);

  const repRows = await db
    .select({ dialpadPhone: users.dialpadPhone })
    .from(users)
    .where(sql`${users.dialpadPhone} is not null`);
  const repLines = new Set(
    [...repRows.map((r) => r.dialpadPhone), process.env.DIALPAD_FILTER_USER_PHONE]
      .map((p) => lastSeven(p))
      .filter(Boolean),
  );
  if (l7 && repLines.has(l7)) return false;

  const updated = await db
    .update(contacts)
    .set({ phone: e164, updatedAt: new Date() })
    .where(and(eq(contacts.id, contactId), isNull(contacts.phone)))
    .returning({ id: contacts.id });
  return updated.length > 0;
}
