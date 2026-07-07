// Purge the demo/seed records (supabase/seed/0002_demo_data.sql) so every
// number in the CRM is real. Targets ONLY the seed's fixed UUIDs:
//   accounts  aaaaaaa1/2/3-…   contacts bbbbbbb…   opportunities ccccccc1/2/3-…
//   activities eeeeeee1-…e1/e2 (note + task children cascade)
// Accounts/contacts/opportunities are SOFT-deleted (deleted_at) — reversible,
// and a re-run of the seed no-ops on them (fixed ids still conflict).
// The two demo activities are hard-deleted (activities has no deleted_at);
// do NOT re-run the seed against prod or they come back.
// Safety: aborts if non-demo rows reference the demo accounts (unless --force).
// Run: tsx scripts/purge-demo-data.mts [--dry] [--force]
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";

const dry = process.argv.includes("--dry");
const force = process.argv.includes("--force");

const ACCOUNTS = [
  "aaaaaaa1-1111-4111-8111-aaaaaaaaaaaa",
  "aaaaaaa2-2222-4222-8222-aaaaaaaaaaab",
  "aaaaaaa3-3333-4333-8333-aaaaaaaaaaac",
];
const CONTACTS = [
  "bbbbbbb1-1111-4111-8111-bbbbbbbbbbb1",
  "bbbbbbb1-1111-4111-8111-bbbbbbbbbbb2",
  "bbbbbbb2-2222-4222-8222-bbbbbbbbbbb1",
  "bbbbbbb3-3333-4333-8333-bbbbbbbbbbb1",
];
const OPPS = [
  "ccccccc1-1111-4111-8111-ccccccccccc1",
  "ccccccc2-2222-4222-8222-ccccccccccc2",
  "ccccccc3-3333-4333-8333-ccccccccccc3",
];
const ACTIVITIES = [
  "eeeeeee1-1111-4111-8111-eeeeeeeeeee1",
  "eeeeeee1-1111-4111-8111-eeeeeeeeeee2",
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  // Safety pre-checks: anything real hanging off the demo accounts?
  const refs = await sql<{ src: string; n: string }[]>`
    select 'mailshake_leads' as src, count(*) n from public.mailshake_leads
      where account_id = any(${ACCOUNTS}::uuid[])
    union all
    select 'documents', count(*) from public.documents
      where account_id = any(${ACCOUNTS}::uuid[])
    union all
    select 'non-demo activities', count(*) from public.activities
      where account_id = any(${ACCOUNTS}::uuid[]) and not (id = any(${ACTIVITIES}::uuid[]))
    union all
    select 'non-demo opportunities', count(*) from public.opportunities
      where account_id = any(${ACCOUNTS}::uuid[]) and not (id = any(${OPPS}::uuid[]))
        and deleted_at is null`;
  const blocking = refs.filter((r) => Number(r.n) > 0);
  console.log(
    "references:",
    refs.map((r) => `${r.src}=${r.n}`).join("  "),
  );
  if (blocking.length > 0 && !force) {
    console.error("Non-demo rows reference the demo accounts — aborting (use --force to override).");
    await sql.end();
    process.exit(1);
  }

  const counts = async () => {
    const r = await sql<{ what: string; n: string }[]>`
      select 'accounts' what, count(*) n from public.accounts
        where id = any(${ACCOUNTS}::uuid[]) and deleted_at is null
      union all
      select 'contacts', count(*) from public.contacts
        where id = any(${CONTACTS}::uuid[]) and deleted_at is null
      union all
      select 'opportunities', count(*) from public.opportunities
        where id = any(${OPPS}::uuid[]) and deleted_at is null
      union all
      select 'activities', count(*) from public.activities
        where id = any(${ACTIVITIES}::uuid[])`;
    return r.map((x) => `${x.what}=${x.n}`).join("  ");
  };
  console.log("live demo rows before:", await counts());

  if (dry) {
    console.log("--dry: no changes made.");
    await sql.end();
    return;
  }

  await sql`update public.opportunities set deleted_at = now(), updated_at = now()
    where id = any(${OPPS}::uuid[]) and deleted_at is null`;
  await sql`update public.contacts set deleted_at = now(), updated_at = now()
    where id = any(${CONTACTS}::uuid[]) and deleted_at is null`;
  await sql`update public.accounts set deleted_at = now(), updated_at = now()
    where id = any(${ACCOUNTS}::uuid[]) and deleted_at is null`;
  await sql`delete from public.activities where id = any(${ACTIVITIES}::uuid[])`;

  console.log("live demo rows after: ", await counts());
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
