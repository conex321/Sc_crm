// Assign an owner to the imported QuickBooks/Stripe customer accounts (D-041
// import left owner_user_id null). Targets exactly the customer book: rows
// with customer_status set and no owner yet — never touches accounts that
// already have an owner, so later manual reassignments stick.
// Run: tsx scripts/assign-customer-owners.mts [--dry] [--owner email]
// Owner default per D-042 decision (2026-07-06): rayan@schoolconex.com.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";

const dry = process.argv.includes("--dry");
const ownerFlag = process.argv.indexOf("--owner");
const ownerEmail =
  ownerFlag > -1 ? process.argv[ownerFlag + 1] : "rayan@schoolconex.com";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  const owner = await sql<{ id: string; full_name: string }[]>`
    select id::text, full_name from public.users
    where lower(google_email) = ${ownerEmail.toLowerCase()} limit 1`;
  if (!owner[0]) {
    console.error(`No CRM user found for ${ownerEmail}`);
    process.exit(1);
  }
  console.log(`owner: ${owner[0].full_name} <${ownerEmail}> (${owner[0].id.slice(0, 8)}…)`);

  const targets = await sql<{ customer_status: string; n: string }[]>`
    select customer_status::text, count(*) n from public.accounts
    where customer_status is not null and owner_user_id is null and deleted_at is null
    group by 1 order by 1`;
  const total = targets.reduce((s, t) => s + Number(t.n), 0);
  console.log(
    `unowned customer accounts: ${total} (${targets.map((t) => `${t.customer_status}: ${t.n}`).join(", ") || "none"})`,
  );
  if (total === 0) {
    console.log("Nothing to do.");
    await sql.end();
    return;
  }

  if (!dry) {
    const updated = await sql`
      update public.accounts
         set owner_user_id = ${owner[0].id}::uuid, updated_at = now()
       where customer_status is not null and owner_user_id is null and deleted_at is null
      returning id`;
    console.log(`assigned: ${updated.length}`);
  } else {
    console.log(`WOULD assign: ${total}`);
  }

  const after = await sql<{ owner: string | null; n: string }[]>`
    select u.google_email as owner, count(*) n
      from public.accounts a left join public.users u on u.id = a.owner_user_id
     where a.customer_status is not null and a.deleted_at is null
     group by 1 order by 2 desc`;
  console.log("customer book by owner now:", JSON.stringify(after));
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
