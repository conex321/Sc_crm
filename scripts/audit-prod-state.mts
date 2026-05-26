import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  const wm = await sql`
    select max(received_at) as latest, count(*)::int as raw_rows
    from public.integration_events_raw where provider='dialpad'
  `;
  console.log("dialpad watermark:", JSON.stringify(wm[0]));

  const cnts = await sql`
    select
      (select count(*)::int from accounts where deleted_at is null) as accounts,
      (select count(*)::int from contacts where deleted_at is null) as contacts,
      (select count(*)::int from mailshake_leads) as ms_leads,
      (select count(*)::int from mailshake_campaigns) as ms_campaigns,
      (select count(*)::int from calls) as calls,
      (select count(*)::int from activities where channel='call') as call_activities,
      (select count(*)::int from activities where channel='call' and account_id is not null) as call_matched,
      (select max(occurred_at) from activities where channel='call') as latest_call,
      (select min(occurred_at) from activities where channel='call') as earliest_call
  `;
  console.log("counts:", JSON.stringify(cnts[0]));

  const users = await sql`select id, full_name, google_email, role from users order by created_at`;
  console.log("users:");
  for (const u of users) console.log(" ", JSON.stringify(u));

  const attr = await sql`
    select coalesce(u.full_name, '(unassigned)') as name,
           coalesce(u.google_email, '(unassigned)') as email,
           count(*)::int as cnt
    from activities a left join users u on u.id = a.user_id
    where a.channel='call'
    group by 1, 2 order by 3 desc
  `;
  console.log("call attribution:");
  for (const r of attr) console.log(" ", JSON.stringify(r));

  // Check if any contact has phone populated (key to matching working)
  const phoneCheck = await sql`
    select count(*)::int as with_phone,
           count(*) filter (where phone is not null)::int as phone_set
    from contacts where deleted_at is null
  `;
  console.log("contact phones:", JSON.stringify(phoneCheck[0]));
} finally {
  await sql.end({ timeout: 5 });
}
