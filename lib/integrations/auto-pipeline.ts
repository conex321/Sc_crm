import "server-only";
import { db } from "@/lib/db";
import {
  accounts,
  contacts,
  mailshakeLeads,
  activities,
  calls as callsTable,
} from "@/lib/db/schema";
import { sql, eq, and, isNull, ne } from "drizzle-orm";

/**
 * Auto-pipeline run after every Mailshake sync. Brings the CRM up to date with
 * any new Mailshake schools / recipients and retro-links Dialpad calls that
 * now have a contact to match against.
 *
 * Steps:
 *   1. Auto-create accounts for new school names (source='mailshake')
 *   2. Auto-create contacts for matched leads with no contact yet
 *   3. Re-link unmatched Dialpad calls against the now-fuller contacts table
 */
export type AutoPipelineResult = {
  newAccounts: number;
  newContacts: number;
  contactsLinkedBackToLead: number;
  callsMatched: number;
};

function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length > 7 ? `+${digits}` : null;
}

function lastSeven(p: string | null | undefined): string | null {
  if (!p) return null;
  const d = p.replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-7) : null;
}

function splitName(fullName: string | null, first: string | null, last: string | null) {
  const f = first?.trim();
  const l = last?.trim();
  if (f || l) return { first: f || "(unknown)", last: l || "" };
  if (!fullName) return { first: "(unknown)", last: "" };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

async function importMissingAccounts(): Promise<number> {
  const rows = await db.execute<{ school_name: string }>(sql`
    select distinct l.school_name
    from public.mailshake_leads l
    where l.account_id is null
      and l.school_name is not null
      and length(trim(l.school_name)) > 0
  `);

  const existing = await db
    .select({ name: accounts.name })
    .from(accounts)
    .where(sql`${accounts.deletedAt} is null`);
  const seen = new Set(existing.map((a) => a.name.trim().toLowerCase()));

  let created = 0;
  for (const r of rows) {
    const name = r.school_name.trim();
    if (seen.has(name.toLowerCase())) continue;
    await db.insert(accounts).values({
      name,
      type: "school",
      source: "mailshake",
    });
    seen.add(name.toLowerCase());
    created++;
  }

  if (created > 0) {
    // Backfill account_id on the just-created accounts' leads
    await db.execute(sql`
      update public.mailshake_leads l
      set account_id = a.id, updated_at = now()
      from public.accounts a
      where l.account_id is null
        and l.school_name is not null
        and lower(trim(a.name)) = lower(trim(l.school_name))
        and a.deleted_at is null
    `);
  }

  return created;
}

async function importMissingContacts(): Promise<{
  created: number;
  linked: number;
}> {
  const leads = await db.execute<{
    id: string;
    account_id: string;
    email: string;
    full_name: string | null;
    first: string | null;
    last: string | null;
    phone_raw: string | null;
    title: string | null;
  }>(sql`
    select l.id::text as id,
           l.account_id::text as account_id,
           lower(l.email) as email,
           l.full_name,
           l.fields->>'first' as first,
           l.fields->>'last' as last,
           l.fields->>'phoneNumber' as phone_raw,
           l.fields->>'title' as title
    from public.mailshake_leads l
    where l.account_id is not null
      and l.contact_id is null
      and l.email is not null
      and length(trim(l.email)) > 0
  `);

  if (leads.length === 0) return { created: 0, linked: 0 };

  const existingContacts = await db.execute<{ account_id: string; email: string }>(sql`
    select account_id::text as account_id, lower(email) as email
    from public.contacts
    where deleted_at is null and email is not null
  `);
  const seen = new Set(existingContacts.map((e) => `${e.account_id}|${e.email}`));

  let created = 0;
  let linked = 0;
  for (const l of leads) {
    const key = `${l.account_id}|${l.email}`;
    if (seen.has(key)) {
      // Just link the lead to the existing contact
      const existing = await db.execute<{ id: string }>(sql`
        select id::text from public.contacts
        where deleted_at is null
          and account_id = ${l.account_id}::uuid
          and lower(email) = ${l.email}
        limit 1
      `);
      if (existing[0]) {
        await db
          .update(mailshakeLeads)
          .set({ contactId: existing[0].id, updatedAt: new Date() })
          .where(eq(mailshakeLeads.id, l.id));
        linked++;
      }
      continue;
    }
    const { first, last } = splitName(l.full_name, l.first, l.last);
    const phone = normalizePhone(l.phone_raw);
    const inserted = await db
      .insert(contacts)
      .values({
        accountId: l.account_id,
        firstName: first,
        lastName: last || "(unknown)",
        email: l.email,
        phone,
        role: l.title ?? null,
        externalIds: { mailshake_lead_id: l.id },
      })
      .returning({ id: contacts.id });
    created++;
    seen.add(key);
    if (inserted[0]) {
      await db
        .update(mailshakeLeads)
        .set({ contactId: inserted[0].id, updatedAt: new Date() })
        .where(eq(mailshakeLeads.id, l.id));
      linked++;
    }
  }
  return { created, linked };
}

async function rematchUnlinkedCalls(): Promise<number> {
  const RAYAN = (process.env.DIALPAD_FILTER_USER_PHONE ?? "+14375234132").replace(/\D/g, "");
  const rayanLast7 = RAYAN.slice(-7);

  const unmatched = await db
    .select({
      activityId: activities.id,
      direction: activities.direction,
      fromNumber: callsTable.fromNumber,
      toNumber: callsTable.toNumber,
    })
    .from(activities)
    .leftJoin(callsTable, eq(callsTable.activityId, activities.id))
    .where(
      and(
        eq(activities.channel, "call"),
        isNull(activities.accountId),
        ne(activities.direction, "system"),
      ),
    );
  if (unmatched.length === 0) return 0;

  const contactRows = await db
    .select({
      id: contacts.id,
      accountId: contacts.accountId,
      phone: contacts.phone,
      whatsappPhone: contacts.whatsappPhone,
    })
    .from(contacts)
    .where(sql`${contacts.deletedAt} is null and (${contacts.phone} is not null or ${contacts.whatsappPhone} is not null)`);

  const idx = new Map<string, { contactId: string; accountId: string }>();
  for (const c of contactRows) {
    for (const p of [c.phone, c.whatsappPhone]) {
      const l7 = lastSeven(normalizePhone(p));
      if (!l7 || l7 === rayanLast7) continue;
      if (!idx.has(l7)) idx.set(l7, { contactId: c.id, accountId: c.accountId });
    }
  }
  if (idx.size === 0) return 0;

  let matched = 0;
  for (const u of unmatched) {
    const candidates = [u.fromNumber, u.toNumber]
      .map(normalizePhone)
      .filter((p): p is string => Boolean(p))
      .map((p) => lastSeven(p))
      .filter((p): p is string => Boolean(p) && p !== rayanLast7);
    let hit: { contactId: string; accountId: string } | null = null;
    for (const l7 of candidates) {
      const h = idx.get(l7);
      if (h) {
        hit = h;
        break;
      }
    }
    if (!hit) continue;
    await db
      .update(activities)
      .set({
        accountId: hit.accountId,
        contactId: hit.contactId,
        updatedAt: new Date(),
      })
      .where(eq(activities.id, u.activityId));
    matched++;
  }
  return matched;
}

export async function runAutoPipeline(): Promise<AutoPipelineResult> {
  const newAccounts = await importMissingAccounts();
  const contactResult = await importMissingContacts();
  const callsMatched = await rematchUnlinkedCalls();
  return {
    newAccounts,
    newContacts: contactResult.created,
    contactsLinkedBackToLead: contactResult.linked,
    callsMatched,
  };
}
