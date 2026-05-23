// Import Mailshake recipients (from mailshake_leads.fields) as CRM contacts.
// One contact per (account, email). Uses raw postgres — no Drizzle/server-only.
// Run: tsx scripts/mailshake-import-contacts.mts [--dry]
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

function splitName(fullName: string | null, first: string | null, last: string | null) {
  const f = first?.trim();
  const l = last?.trim();
  if (f || l) return { first: f || "(unknown)", last: l || "" };
  if (!fullName) return { first: "(unknown)", last: "" };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  const leads = await sql<{
    id: string;
    account_id: string;
    email: string;
    full_name: string | null;
    first: string | null;
    last: string | null;
    phone_raw: string | null;
    title: string | null;
  }[]>`
    select l.id::text, l.account_id::text, lower(l.email) as email,
           l.full_name, l.fields->>'first' as first, l.fields->>'last' as last,
           l.fields->>'phoneNumber' as phone_raw, l.fields->>'title' as title
    from public.mailshake_leads l
    where l.account_id is not null
      and l.email is not null and length(trim(l.email)) > 0`;
  console.log(`leads with matched account: ${leads.length}`);

  const existing = await sql<{ account_id: string; email: string }[]>`
    select account_id::text, lower(email) as email
    from public.contacts
    where deleted_at is null and email is not null`;
  const existingSet = new Set(existing.map((e) => `${e.account_id}|${e.email}`));
  console.log(`existing contacts with email: ${existing.length}`);

  let created = 0;
  let skipped = 0;
  let linked = 0;
  let withPhone = 0;
  for (const l of leads) {
    const key = `${l.account_id}|${l.email}`;
    if (existingSet.has(key)) {
      skipped++;
      continue;
    }
    const { first, last } = splitName(l.full_name, l.first, l.last);
    const phone = normalizePhone(l.phone_raw);
    if (phone) withPhone++;
    if (dry) {
      created++;
      if (created <= 5) {
        console.log(`  [DRY] ${first} ${last} <${l.email}> phone=${phone ?? "—"} → acct ${l.account_id.slice(0, 8)}…`);
      }
      continue;
    }
    const ins = await sql<{ id: string }[]>`
      insert into public.contacts (account_id, first_name, last_name, email, phone, role, external_ids)
      values (${l.account_id}::uuid, ${first}, ${last || "(unknown)"}, ${l.email},
              ${phone}, ${l.title}, ${sql.json({ mailshake_lead_id: l.id })})
      returning id::text`;
    created++;
    existingSet.add(key);
    if (ins[0]) {
      await sql`
        update public.mailshake_leads
        set contact_id = ${ins[0].id}::uuid, updated_at = now()
        where id = ${l.id}::uuid`;
      linked++;
    }
  }
  console.log(`${dry ? "would create" : "created"}: ${created}`);
  console.log(`  with normalized phone: ${withPhone}`);
  console.log(`skipped (already exists): ${skipped}`);
  console.log(`linked back to mailshake_leads: ${linked}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
