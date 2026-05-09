// Quick DB stats: campaigns + leads counts.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const c = await sql`select count(*)::int as n from public.mailshake_campaigns`;
  const l = await sql`select count(*)::int as n from public.mailshake_leads`;
  const m = await sql`select count(*)::int as n from public.mailshake_leads where account_id is not null`;
  const top = await sql`
    select c.title, count(l.*)::int as leads, count(*) filter (where l.status in ('replied','won','interested'))::int as replies
    from public.mailshake_campaigns c
    left join public.mailshake_leads l on l.campaign_id = c.id
    group by c.id, c.title
    order by leads desc
    limit 10`;
  const ts = await sql`select max(last_synced_at) as t from public.mailshake_campaigns`;
  console.log(`campaigns: ${c[0].n}`);
  console.log(`leads:     ${l[0].n}`);
  console.log(`matched:   ${m[0].n}`);
  console.log(`last sync: ${ts[0].t}`);
  console.log("top by leads:");
  for (const r of top) console.log(`  ${r.leads.toString().padStart(5)}  replies=${String(r.replies).padStart(3)}  ${r.title}`);
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
