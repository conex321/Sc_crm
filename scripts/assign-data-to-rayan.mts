// Tag existing Dialpad call activities + Mailshake-imported accounts to Rayan
// so they show as "his" data on his login. Idempotent.
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

try {
  const [rayan] = await sql`
    select id from public.users where google_email = 'rayan@schoolconex.com' limit 1`;
  if (!rayan) throw new Error("rayan@schoolconex.com not found in public.users");
  const rayanId: string = rayan.id;
  console.log(`rayan id: ${rayanId}`);

  // 1) Tag all call activities as Rayan's (the Dialpad sync only ingests his calls)
  const calls = await sql`
    update public.activities
       set user_id = ${rayanId}, updated_at = now()
     where channel = 'call' and (user_id is null or user_id <> ${rayanId})`;
  console.log(`activities (calls) updated → user_id=rayan: ${calls.count}`);

  // 2) Set Rayan as owner of every Mailshake-imported account that's unowned
  const accs = await sql`
    update public.accounts
       set owner_user_id = ${rayanId}, updated_at = now()
     where source = 'mailshake' and owner_user_id is null and deleted_at is null`;
  console.log(`accounts (source=mailshake, unowned) → owner=rayan: ${accs.count}`);

  // 3) Verify
  const [counts] = await sql`
    select
      (select count(*)::int from public.activities where user_id = ${rayanId} and channel='call') as call_activities,
      (select count(*)::int from public.accounts where owner_user_id = ${rayanId} and deleted_at is null) as owned_accounts,
      (select count(*)::int from public.mailshake_leads l join public.accounts a on a.id = l.account_id
         where a.owner_user_id = ${rayanId}) as mailshake_leads_on_owned_accounts`;
  console.log("\nverification:");
  console.log(counts);
} finally {
  await sql.end({ timeout: 5 });
}
