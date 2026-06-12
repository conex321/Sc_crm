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

async function importMissingAccounts(): Promise<number> {
  // distinct on school name; prefer rows with an assigned rep so the new
  // account inherits ownership from the originating lead.
  const rows = await db.execute<{ school_name: string; assigned_user_id: string | null }>(sql`
    select distinct on (lower(trim(l.school_name)))
           l.school_name,
           l.assigned_user_id
      from public.mailshake_leads l
     where l.account_id is null
       and l.school_name is not null
       and length(trim(l.school_name)) > 0
     order by lower(trim(l.school_name)), l.assigned_user_id nulls last
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
      ownerUserId: r.assigned_user_id,
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
  const inserted = await db.execute<{ id: string }>(sql`
    with candidates as (
      select distinct on (l.account_id, lower(l.email))
             l.id,
             l.account_id,
             lower(l.email) as email,
             coalesce(nullif(l.fields->>'first', ''), nullif(split_part(coalesce(l.full_name, ''), ' ', 1), ''), '(unknown)') as first_name,
             coalesce(nullif(l.fields->>'last', ''), nullif(trim(regexp_replace(coalesce(l.full_name, ''), '^\\S+\\s*', '')), ''), '(unknown)') as last_name,
             l.fields->>'title' as role,
             regexp_replace(coalesce(l.fields->>'phoneNumber', ''), '\\D', '', 'g') as digits
      from public.mailshake_leads l
      where l.account_id is not null
        and l.contact_id is null
        and l.email is not null
        and length(trim(l.email)) > 0
      order by l.account_id, lower(l.email), l.updated_at desc
    )
    insert into public.contacts (
      account_id, first_name, last_name, email, phone, role, external_ids
    )
    select c.account_id,
           c.first_name,
           c.last_name,
           c.email,
           case
             when length(c.digits) = 10 then '+1' || c.digits
             when length(c.digits) = 11 and left(c.digits, 1) = '1' then '+' || c.digits
             when length(c.digits) > 7 then '+' || c.digits
             else null
           end,
           c.role,
           jsonb_build_object('mailshake_lead_id', c.id)
    from candidates c
    where not exists (
      select 1
      from public.contacts existing
      where existing.deleted_at is null
        and existing.account_id = c.account_id
        and lower(existing.email) = c.email
    )
    returning id::text
  `);

  const linked = await db.execute<{ id: string }>(sql`
    update public.mailshake_leads l
    set contact_id = c.id,
        updated_at = now()
    from public.contacts c
    where l.contact_id is null
      and l.account_id = c.account_id
      and lower(l.email) = lower(c.email)
      and c.deleted_at is null
    returning l.id::text
  `);

  return { created: inserted.length, linked: linked.length };
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
    .where(
      sql`${contacts.deletedAt} is null and (${contacts.phone} is not null or ${contacts.whatsappPhone} is not null)`,
    );

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
