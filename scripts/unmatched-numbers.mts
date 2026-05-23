// Find frequent unmatched call numbers — these are repeat callers/callees
// that should be turned into CRM contacts.
// Run: tsx scripts/unmatched-numbers.mts
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";

const RAYAN = (process.env.DIALPAD_FILTER_USER_PHONE ?? "+14375234132").replace(/\D/g, "");
async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const rows = await sql<{ ext: string; n: number; in: number; out: number; first: string; last: string }[]>`
    with calls_x as (
      select
        a.id, a.direction, a.occurred_at,
        case
          when a.direction = 'inbound' then c.from_number
          else c.to_number
        end as ext
      from public.activities a
      join public.calls c on c.activity_id = a.id
      where a.channel = 'call' and a.account_id is null and a.summary not like '%internal%'
    )
    select ext,
           count(*)::int as n,
           sum(case when direction = 'inbound' then 1 else 0 end)::int as in,
           sum(case when direction = 'outbound' then 1 else 0 end)::int as out,
           min(occurred_at)::text as first,
           max(occurred_at)::text as last
    from calls_x
    where ext is not null and regexp_replace(ext, '\\D', '', 'g') != ${RAYAN}
    group by ext
    order by n desc
    limit 25`;
  console.log(`unmatched external numbers (top 25):`);
  console.log(`  count  in  out   number             first → last`);
  for (const r of rows) {
    console.log(`  ${String(r.n).padStart(5)}  ${String(r.in).padStart(2)}  ${String(r.out).padStart(3)}   ${r.ext.padEnd(16)}   ${r.first?.slice(0,10)} → ${r.last?.slice(0,10)}`);
  }
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
