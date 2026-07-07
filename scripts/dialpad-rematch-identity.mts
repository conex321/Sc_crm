// Re-match unmatched call activities using every identity signal in the raw
// Dialpad payloads: phone (E.164/last-7) → contact email → contact full name
// (unique only) → account name (normalized, unique only). On email/name
// matches, backfills the contact's missing phone from the call.
// Handles both raw-payload shapes (object + legacy double-encoded string).
// Run: tsx scripts/dialpad-rematch-identity.mts [--dry]
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";

const dry = process.argv.includes("--dry");

function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length > 7 ? `+${digits}` : null;
}
function lastSeven(p: string | null | undefined) {
  if (!p) return null;
  const d = p.replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-7) : null;
}
const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

type Hit = { contactId: string | null; accountId: string; hasPhone: boolean; label: string };

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  const repRows = await sql<{ phone: string | null }[]>`
    select dialpad_phone as phone from public.users where dialpad_phone is not null`;
  const repLast7s = new Set(
    [...repRows.map((r) => r.phone), process.env.DIALPAD_FILTER_USER_PHONE ?? "+14375234132"]
      .map((p) => lastSeven(normalizePhone(p)))
      .filter((p): p is string => Boolean(p)),
  );

  const unmatched = await sql<{
    activity_id: string;
    from_number: string | null;
    to_number: string | null;
    p_email: string | null;
    p_name: string | null;
  }[]>`
    with ev as (
      select event_id,
             case when jsonb_typeof(payload) = 'string'
                  then (payload #>> '{}')::jsonb
                  else payload end as p
        from public.integration_events_raw
       where provider = 'dialpad'
    )
    select a.id::text as activity_id, c.from_number, c.to_number,
           ev.p->'contact'->>'email' as p_email,
           ev.p->'contact'->>'name'  as p_name
      from public.activities a
      left join public.calls c on c.activity_id = a.id
      left join ev on ev.event_id = c.dialpad_call_id
     where a.channel = 'call'
       and a.account_id is null
       and a.direction <> 'system'
       and a.summary not like '%internal%'
  `;
  console.log(`unmatched call activities: ${unmatched.length}`);

  const contactRows = await sql<{
    id: string;
    account_id: string;
    phone: string | null;
    whatsapp_phone: string | null;
    email: string | null;
    full_name: string;
  }[]>`
    select id::text, account_id::text, phone, whatsapp_phone, email,
           trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) as full_name
      from public.contacts where deleted_at is null`;

  const byPhone = new Map<string, Hit>();
  const byEmail = new Map<string, Hit>();
  const byContactName = new Map<string, Hit | "ambiguous">();
  for (const c of contactRows) {
    const hit: Hit = {
      contactId: c.id,
      accountId: c.account_id,
      hasPhone: Boolean(c.phone),
      label: c.full_name,
    };
    for (const p of [c.phone, c.whatsapp_phone]) {
      const l7 = lastSeven(normalizePhone(p));
      if (!l7 || repLast7s.has(l7)) continue;
      if (!byPhone.has(l7)) byPhone.set(l7, hit);
    }
    if (c.email) {
      const e = c.email.trim().toLowerCase();
      if (e && !byEmail.has(e)) byEmail.set(e, hit);
    }
    const fn = c.full_name.toLowerCase();
    if (fn.length >= 5) byContactName.set(fn, byContactName.has(fn) ? "ambiguous" : hit);
  }

  const accountRows = await sql<{ id: string; name: string }[]>`
    select id::text, name from public.accounts where deleted_at is null`;
  const byAccountName = new Map<string, Hit | "ambiguous">();
  const accountNorms: Array<{ norm: string; hit: Hit }> = [];
  for (const a of accountRows) {
    const n = normName(a.name);
    if (n.length < 6) continue;
    const hit: Hit = { contactId: null, accountId: a.id, hasPhone: true, label: a.name };
    byAccountName.set(n, byAccountName.has(n) ? "ambiguous" : hit);
    accountNorms.push({ norm: n, hit });
  }

  // Containment pass for freeform Dialpad labels like "Tim - St. Mary" or
  // "Janki (Veritas International School)": try each label segment against
  // account names by substring, unique winner only. Digit-only segments
  // (caller-ID numbers) are skipped.
  function containmentMatch(rawName: string): Hit | null {
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
          if (found && found.accountId !== hit.accountId) return null; // ambiguous
          found = hit;
          break;
        }
      }
    }
    return found;
  }
  console.log(
    `indexes — phones: ${byPhone.size}, emails: ${byEmail.size}, contact names: ${byContactName.size}, account names: ${byAccountName.size}`,
  );

  const counts = { phone: 0, email: 0, contact_name: 0, account_name: 0, name_contains: 0 };
  let phonesStamped = 0;
  let still = 0;
  const samples: string[] = [];

  for (const u of unmatched) {
    const email = u.p_email?.trim().toLowerCase() ?? "";
    if (email.endsWith("@schoolconex.com")) {
      still++;
      continue;
    }
    const externalE164s = [u.from_number, u.to_number]
      .map(normalizePhone)
      .filter((p): p is string => {
        const l7 = lastSeven(p);
        return Boolean(p) && Boolean(l7) && !repLast7s.has(l7!);
      });

    let hit: Hit | null = null;
    let by: keyof typeof counts | null = null;
    for (const p of externalE164s) {
      const h = byPhone.get(lastSeven(p)!);
      if (h) {
        hit = h;
        by = "phone";
        break;
      }
    }
    if (!hit && email && byEmail.has(email)) {
      hit = byEmail.get(email)!;
      by = "email";
    }
    if (!hit && u.p_name && u.p_name.trim().length >= 5) {
      const c = byContactName.get(u.p_name.trim().toLowerCase());
      if (c && c !== "ambiguous") {
        hit = c;
        by = "contact_name";
      } else {
        const a = byAccountName.get(normName(u.p_name));
        if (a && a !== "ambiguous") {
          hit = a;
          by = "account_name";
        } else {
          const contained = containmentMatch(u.p_name);
          if (contained) {
            hit = contained;
            by = "name_contains";
          }
        }
      }
    }
    if (!hit || !by) {
      still++;
      continue;
    }
    counts[by]++;
    if (samples.length < 15) {
      samples.push(`  ${by.padEnd(13)} "${u.p_name ?? u.from_number ?? "?"}" → ${hit.label}`);
    }
    if (!dry) {
      await sql`
        update public.activities
           set account_id = ${hit.accountId}::uuid,
               contact_id = ${hit.contactId ? hit.contactId : null},
               updated_at = now()
         where id = ${u.activity_id}::uuid`;
    }
    if (hit.contactId && !hit.hasPhone && externalE164s[0]) {
      if (!dry) {
        await sql`
          update public.contacts
             set phone = ${externalE164s[0]}, updated_at = now()
           where id = ${hit.contactId}::uuid and phone is null`;
      }
      hit.hasPhone = true;
      phonesStamped++;
    }
  }

  console.log(`\n${dry ? "WOULD match" : "matched"} by:`, counts);
  console.log(`total ${dry ? "would match" : "matched"}: ${Object.values(counts).reduce((a, b) => a + b, 0)}`);
  console.log(`contact phones ${dry ? "would be " : ""}stamped: ${phonesStamped}`);
  console.log(`still unmatched: ${still}`);
  if (samples.length) console.log(`\nsample matches:\n${samples.join("\n")}`);
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
