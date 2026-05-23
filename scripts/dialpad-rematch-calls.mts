// Re-match unmatched call activities to accounts/contacts based on the now-
// populated contacts table. Updates activities.account_id + contact_id for
// any call whose from/to number matches a contact's phone (E.164 or last-7).
// Run: tsx scripts/dialpad-rematch-calls.mts [--dry]
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";

const dry = process.argv.includes("--dry");
const RAYAN_PHONE = process.env.DIALPAD_FILTER_USER_PHONE ?? "+14375234132";

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

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  // Load all unmatched call activities + their child phone numbers.
  const calls = await sql<{
    activity_id: string;
    direction: string;
    from_number: string | null;
    to_number: string | null;
  }[]>`
    select a.id::text as activity_id, a.direction,
           c.from_number, c.to_number
    from public.activities a
    left join public.calls c on c.activity_id = a.id
    where a.channel = 'call'
      and a.account_id is null
      and a.summary not like '%internal%'
  `;
  console.log(`unmatched call activities: ${calls.length}`);

  // Load all contacts with phones (E.164 + last-7 lookup table).
  const contacts = await sql<{
    id: string;
    account_id: string;
    phone: string | null;
    whatsapp_phone: string | null;
    full_name: string;
  }[]>`
    select id::text, account_id::text, phone, whatsapp_phone,
           coalesce(first_name,'') || ' ' || coalesce(last_name,'') as full_name
    from public.contacts
    where deleted_at is null and (phone is not null or whatsapp_phone is not null)
  `;
  console.log(`contacts with phones: ${contacts.length}`);

  // Build index: last-7 → list of {contactId, accountId}
  const idx = new Map<string, Array<{ contactId: string; accountId: string; e164: string | null; name: string }>>();
  for (const c of contacts) {
    for (const p of [c.phone, c.whatsapp_phone]) {
      const l7 = lastSeven(normalizePhone(p));
      if (!l7) continue;
      const arr = idx.get(l7) ?? [];
      arr.push({
        contactId: c.id,
        accountId: c.account_id,
        e164: normalizePhone(p),
        name: c.full_name,
      });
      idx.set(l7, arr);
    }
  }
  console.log(`phone index entries: ${idx.size}`);

  let matched = 0;
  let skipped = 0;
  for (const call of calls) {
    // The "external" number is whichever one isn't Rayan's own line.
    const candidates = [call.from_number, call.to_number]
      .map(normalizePhone)
      .filter((p): p is string => Boolean(p))
      .filter((p) => lastSeven(p) !== lastSeven(RAYAN_PHONE));
    let hit: { contactId: string; accountId: string; name: string } | null = null;
    for (const p of candidates) {
      const l7 = lastSeven(p);
      if (!l7) continue;
      const list = idx.get(l7);
      if (list && list.length > 0) {
        hit = list[0];
        break;
      }
    }
    if (!hit) {
      skipped++;
      continue;
    }
    matched++;
    if (matched <= 8) {
      console.log(`  match: ${call.activity_id.slice(0, 8)}… ${call.direction} → ${hit.name} (${hit.accountId.slice(0, 8)}…)`);
    }
    if (!dry) {
      await sql`
        update public.activities
        set account_id = ${hit.accountId}::uuid,
            contact_id = ${hit.contactId}::uuid,
            updated_at = now()
        where id = ${call.activity_id}::uuid`;
    }
  }
  console.log(`${dry ? "would match" : "matched"}: ${matched}`);
  console.log(`still unmatched: ${skipped}`);
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
