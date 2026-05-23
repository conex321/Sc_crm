// Full data audit: Mailshake sync state + Dialpad call matching state.
// Run: tsx scripts/status-audit.mts
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

function row(label: string, v: unknown) {
  console.log(`  ${label.padEnd(40)} ${v}`);
}

async function main() {
  console.log("\n=== MAILSHAKE ===");
  const [{ n: campaigns }] = await sql<[{ n: number }]>`select count(*)::int as n from public.mailshake_campaigns`;
  const [{ n: leads }] = await sql<[{ n: number }]>`select count(*)::int as n from public.mailshake_leads`;
  const [{ n: leadsMatched }] = await sql<[{ n: number }]>`select count(*)::int as n from public.mailshake_leads where account_id is not null`;
  const [{ n: leadsContact }] = await sql<[{ n: number }]>`select count(*)::int as n from public.mailshake_leads where contact_id is not null`;
  const [{ ts: lastSync }] = await sql<[{ ts: string }]>`select max(last_synced_at) as ts from public.mailshake_campaigns`;
  row("campaigns synced", campaigns);
  row("engaged leads", leads);
  row("leads → account matched", `${leadsMatched}/${leads}`);
  row("leads → contact matched", `${leadsContact}/${leads}`);
  row("last sync", lastSync);

  console.log("\n=== ACCOUNTS / CONTACTS ===");
  const [{ n: accountsTotal }] = await sql<[{ n: number }]>`select count(*)::int as n from public.accounts where deleted_at is null`;
  const [{ n: accountsMS }] = await sql<[{ n: number }]>`select count(*)::int as n from public.accounts where source = 'mailshake' and deleted_at is null`;
  const [{ n: accountsOther }] = await sql<[{ n: number }]>`select count(*)::int as n from public.accounts where (source is null or source != 'mailshake') and deleted_at is null`;
  const [{ n: contactsTotal }] = await sql<[{ n: number }]>`select count(*)::int as n from public.contacts where deleted_at is null`;
  const [{ n: contactsWithPhone }] = await sql<[{ n: number }]>`select count(*)::int as n from public.contacts where deleted_at is null and (phone is not null and length(phone) > 0)`;
  const [{ n: contactsWithEmail }] = await sql<[{ n: number }]>`select count(*)::int as n from public.contacts where deleted_at is null and (email is not null and length(email) > 0)`;
  row("accounts (total)", accountsTotal);
  row("  source=mailshake", accountsMS);
  row("  other / null source", accountsOther);
  row("contacts (total)", contactsTotal);
  row("  with phone", contactsWithPhone);
  row("  with email", contactsWithEmail);

  console.log("\n=== DIALPAD CALLS ===");
  const [{ n: callsTotal }] = await sql<[{ n: number }]>`select count(*)::int as n from public.calls`;
  const [{ n: actsCall }] = await sql<[{ n: number }]>`select count(*)::int as n from public.activities where channel = 'call'`;
  const [{ n: actsCallMatched }] = await sql<[{ n: number }]>`select count(*)::int as n from public.activities where channel = 'call' and account_id is not null`;
  const [{ n: actsCallUnmatched }] = await sql<[{ n: number }]>`select count(*)::int as n from public.activities where channel = 'call' and account_id is null`;
  const [{ n: actsInternal }] = await sql<[{ n: number }]>`select count(*)::int as n from public.activities where channel = 'call' and summary like '%internal%'`;
  const [{ ts: lastCall }] = await sql<[{ ts: string }]>`select max(occurred_at) as ts from public.activities where channel='call'`;
  row("calls (child rows)", callsTotal);
  row("call activities (parent)", actsCall);
  row("  matched to account", `${actsCallMatched}/${actsCall}`);
  row("  unmatched (inbox)", actsCallUnmatched);
  row("  internal Rayan↔coworker", actsInternal);
  row("last call ingested", lastCall);

  console.log("\n=== UNMATCHED CALLS — sample of destinations ===");
  const sample = await sql`
    select
      a.occurred_at,
      a.direction,
      c.from_number,
      c.to_number,
      a.summary
    from public.activities a
    left join public.calls c on c.activity_id = a.id
    where a.channel = 'call' and a.account_id is null and a.summary not like '%internal%'
    order by a.occurred_at desc
    limit 10`;
  for (const r of sample) {
    console.log(`  ${r.occurred_at?.toISOString?.() ?? r.occurred_at} ${r.direction.padEnd(8)} from=${r.from_number ?? '-'} to=${r.to_number ?? '-'}`);
  }

  console.log("\n=== CROSS-CHECK: do any unmatched call numbers appear in Mailshake recipient fields? ===");
  // Mailshake leads store fields json; check if phoneNumber field overlaps with call numbers
  const [{ n: msWithPhone }] = await sql<[{ n: number }]>`
    select count(*)::int as n from public.mailshake_leads
    where fields->>'phoneNumber' is not null and length(fields->>'phoneNumber') > 0`;
  row("mailshake leads with phoneNumber field", msWithPhone);

  const matchProbe = await sql`
    with call_numbers as (
      select distinct regexp_replace(coalesce(c.from_number, ''), '\\D', '', 'g') as phone
      from public.activities a join public.calls c on c.activity_id = a.id
      where a.channel = 'call' and a.account_id is null
        and a.direction = 'inbound'
        and a.summary not like '%internal%'
      union
      select distinct regexp_replace(coalesce(c.to_number, ''), '\\D', '', 'g') as phone
      from public.activities a join public.calls c on c.activity_id = a.id
      where a.channel = 'call' and a.account_id is null
        and a.direction = 'outbound'
        and a.summary not like '%internal%'
    ),
    ms_numbers as (
      select id, account_id, school_name, fields->>'phoneNumber' as phone_raw,
             regexp_replace(coalesce(fields->>'phoneNumber',''), '\\D','','g') as phone
      from public.mailshake_leads
      where fields->>'phoneNumber' is not null
    )
    select
      ms.school_name,
      ms.phone_raw as ms_phone,
      cn.phone as call_digits
    from ms_numbers ms
    join call_numbers cn on right(ms.phone, 7) = right(cn.phone, 7) and length(cn.phone) >= 7
    limit 10`;
  console.log(`  overlap matches (last-7-digits): ${matchProbe.length}`);
  for (const r of matchProbe) {
    console.log(`    ${r.school_name} — Mailshake:${r.ms_phone}  Call:${r.call_digits}`);
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
