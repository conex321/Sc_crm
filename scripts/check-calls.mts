import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  const summary = await sql`
    select
      count(*)::int                              as total,
      count(account_id) filter (where channel='call')::int  as matched,
      count(*) filter (where channel='call' and account_id is null)::int as unmatched,
      count(*) filter (where channel='call' and direction='inbound')::int  as inbound,
      count(*) filter (where channel='call' and direction='outbound')::int as outbound
    from public.activities
    where channel='call'
  `;
  console.log("activities (call):", summary[0]);

  const recent = await sql`
    select a.occurred_at, a.direction, a.summary, a.account_id, c.from_number, c.to_number, c.duration_seconds
    from public.activities a
    join public.calls c on c.activity_id = a.id
    order by a.occurred_at desc
    limit 5
  `;
  console.log("\nrecent 5:");
  for (const r of recent) {
    console.log(JSON.stringify(r));
  }

  const unmatched = await sql`
    select
      coalesce(c.from_number, c.to_number) as phone,
      count(*)::int as n
    from public.activities a
    join public.calls c on c.activity_id = a.id
    where a.channel='call' and a.account_id is null
    group by 1
    order by 2 desc
    limit 10
  `;
  console.log("\ntop unmatched phones:");
  for (const r of unmatched) console.log(JSON.stringify(r));
} finally {
  await sql.end({ timeout: 5 });
}
