import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  console.log("\n=== Calls per rep, all time ===");
  const allTime = await sql`
    select u.full_name, count(*)::int as cnt,
           count(*) filter (where a.account_id is not null)::int as matched
    from public.activities a
    join public.users u on u.id = a.user_id
    where a.channel = 'call'
    group by u.full_name order by 2 desc
  `;
  for (const r of allTime) console.log(" ", JSON.stringify(r));

  console.log("\n=== Calls per rep, last 7 days ===");
  const week = await sql`
    select coalesce(u.full_name, '(unassigned)') as name, count(*)::int as cnt
    from public.activities a
    left join public.users u on u.id = a.user_id
    where a.channel = 'call' and a.occurred_at > now() - interval '7 days'
    group by 1 order by 2 desc
  `;
  for (const r of week) console.log(" ", JSON.stringify(r));

  console.log("\n=== Which schools Rayan called (all time, top 15) ===");
  const rayanSchools = await sql`
    select acc.name as school, count(*)::int as calls,
           max(a.occurred_at)::date as last_call
    from public.activities a
    join public.users u on u.id = a.user_id and u.google_email = 'rayan@schoolconex.com'
    join public.accounts acc on acc.id = a.account_id
    where a.channel = 'call'
    group by acc.name order by 2 desc limit 15
  `;
  if (rayanSchools.length === 0) {
    console.log("  (none — no matched calls yet for Rayan; raise match rate by populating more contact phones)");
  } else {
    for (const r of rayanSchools) console.log(" ", JSON.stringify(r));
  }

  console.log("\n=== Rayan's recent 10 calls (any matched or not) ===");
  const recent = await sql`
    select a.occurred_at::date as date, a.direction,
           coalesce(acc.name, '(no account)') as account,
           c.from_number, c.to_number, c.duration_seconds
    from public.activities a
    join public.users u on u.id = a.user_id and u.google_email = 'rayan@schoolconex.com'
    join public.calls c on c.activity_id = a.id
    left join public.accounts acc on acc.id = a.account_id
    where a.channel = 'call'
    order by a.occurred_at desc limit 10
  `;
  for (const r of recent) console.log(" ", JSON.stringify(r));
} finally {
  await sql.end({ timeout: 5 });
}
