import "server-only";
import { db } from "@/lib/db";
import {
  accounts,
  contacts,
  mailshakeLeads,
  activities,
  users,
  calls as callsTable,
} from "@/lib/db/schema";
import { sql, eq, and, isNull } from "drizzle-orm";

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

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Re-link unmatched calls by every identity signal we have: the call's phone
 * numbers (existing behaviour) plus the Dialpad contact email/name stored in
 * the raw payload. Name matches are unique-only (skip ambiguous names).
 * On an email/name match, the contact's missing phone is backfilled from the
 * call so future calls match on the fast phone path.
 */
async function rematchUnlinkedCalls(): Promise<number> {
  const repPhoneRows = await db
    .select({ phone: users.dialpadPhone })
    .from(users)
    .where(sql`${users.dialpadPhone} is not null`);
  const repLast7s = new Set(
    [...repPhoneRows.map((r) => r.phone), process.env.DIALPAD_FILTER_USER_PHONE ?? "+14375234132"]
      .map((p) => lastSeven(normalizePhone(p)))
      .filter((p): p is string => Boolean(p)),
  );

  // Unmatched calls + identity from the raw Dialpad payload. Older backfill
  // rows stored the payload double-encoded as a JSON string — unwrap both
  // shapes (read-only; historical payloads are never rewritten).
  const unmatched = await db.execute<{
    activity_id: string;
    from_number: string | null;
    to_number: string | null;
    p_email: string | null;
    p_name: string | null;
  }>(sql`
    with ev as (
      select event_id,
             case when jsonb_typeof(payload) = 'string'
                  then (payload #>> '{}')::jsonb
                  else payload end as p
        from public.integration_events_raw
       where provider = 'dialpad'
    )
    select a.id as activity_id, c.from_number, c.to_number,
           ev.p->'contact'->>'email' as p_email,
           ev.p->'contact'->>'name'  as p_name
      from public.activities a
      left join public.calls c on c.activity_id = a.id
      left join ev on ev.event_id = c.dialpad_call_id
     where a.channel = 'call'
       and a.account_id is null
       and a.direction <> 'system'
       and a.summary not like '%internal%'
  `);
  if (unmatched.length === 0) return 0;

  const contactRows = await db
    .select({
      id: contacts.id,
      accountId: contacts.accountId,
      phone: contacts.phone,
      whatsappPhone: contacts.whatsappPhone,
      email: contacts.email,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(contacts)
    .where(sql`${contacts.deletedAt} is null`);

  type Hit = { contactId: string | null; accountId: string; hasPhone: boolean };
  const byPhone = new Map<string, Hit>();
  const byEmail = new Map<string, Hit>();
  const byContactName = new Map<string, Hit | "ambiguous">();
  for (const c of contactRows) {
    const hit: Hit = { contactId: c.id, accountId: c.accountId, hasPhone: Boolean(c.phone) };
    for (const p of [c.phone, c.whatsappPhone]) {
      const l7 = lastSeven(normalizePhone(p));
      if (!l7 || repLast7s.has(l7)) continue;
      if (!byPhone.has(l7)) byPhone.set(l7, hit);
    }
    if (c.email) {
      const e = c.email.trim().toLowerCase();
      if (e && !byEmail.has(e)) byEmail.set(e, hit);
    }
    const fullName = `${c.firstName} ${c.lastName}`.trim().toLowerCase();
    if (fullName.length >= 5) {
      byContactName.set(fullName, byContactName.has(fullName) ? "ambiguous" : hit);
    }
  }

  const accountRows = await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(sql`${accounts.deletedAt} is null`);
  const byAccountName = new Map<string, Hit | "ambiguous">();
  const accountNorms: Array<{ norm: string; hit: Hit }> = [];
  for (const a of accountRows) {
    const n = normName(a.name);
    if (n.length < 6) continue;
    const hit: Hit = { contactId: null, accountId: a.id, hasPhone: true };
    byAccountName.set(n, byAccountName.has(n) ? "ambiguous" : hit);
    accountNorms.push({ norm: n, hit });
  }

  // Freeform Dialpad labels ("Tim - St. Mary", "Janki (Veritas International
  // School)"): try each label segment against account names by substring,
  // unique winner only; digit-only segments (caller-ID numbers) skipped.
  const containmentMatch = (rawName: string): Hit | null => {
    const segments = rawName
      .split(/[-(),·/|]+/)
      .map((s) => normName(s))
      .filter((s) => s.length >= 6 && !/^\d+$/.test(s));
    const whole = normName(rawName);
    if (whole.length >= 8 && !/^\d+$/.test(whole) && !segments.includes(whole)) {
      segments.push(whole);
    }
    if (segments.length === 0) return null;
    let found: Hit | null = null;
    for (const { norm, hit } of accountNorms) {
      for (const seg of segments) {
        if (norm.includes(seg) || (norm.length >= 8 && seg.includes(norm))) {
          if (found && found.accountId !== hit.accountId) return null;
          found = hit;
          break;
        }
      }
    }
    return found;
  };

  let matched = 0;
  for (const u of unmatched) {
    const externalL7s = [u.from_number, u.to_number]
      .map((p) => lastSeven(normalizePhone(p)))
      .filter((p): p is string => Boolean(p) && !repLast7s.has(p!));
    const email = u.p_email?.trim().toLowerCase() ?? "";
    if (email.endsWith("@schoolconex.com")) continue;

    let hit: Hit | null = null;
    for (const l7 of externalL7s) {
      const h = byPhone.get(l7);
      if (h) {
        hit = h;
        break;
      }
    }
    if (!hit && email) hit = byEmail.get(email) ?? null;
    if (!hit && u.p_name && u.p_name.trim().length >= 5) {
      const byC = byContactName.get(u.p_name.trim().toLowerCase());
      if (byC && byC !== "ambiguous") hit = byC;
      if (!hit) {
        const byA = byAccountName.get(normName(u.p_name));
        if (byA && byA !== "ambiguous") hit = byA;
      }
      if (!hit) hit = containmentMatch(u.p_name);
    }
    if (!hit) continue;

    await db
      .update(activities)
      .set({
        accountId: hit.accountId,
        contactId: hit.contactId,
        updatedAt: new Date(),
      })
      .where(eq(activities.id, u.activity_id));
    matched++;

    // Backfill the contact's phone from the call so the next call matches fast.
    if (hit.contactId && !hit.hasPhone && externalL7s.length > 0) {
      const e164 = [u.from_number, u.to_number]
        .map(normalizePhone)
        .find((p) => p && lastSeven(p) === externalL7s[0]);
      if (e164) {
        await db
          .update(contacts)
          .set({ phone: e164, updatedAt: new Date() })
          .where(and(eq(contacts.id, hit.contactId), isNull(contacts.phone)));
        hit.hasPhone = true;
      }
    }
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
