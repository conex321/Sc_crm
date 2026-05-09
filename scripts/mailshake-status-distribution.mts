import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const rows = await sql`
    select status, count(*)::int as n
    from public.mailshake_leads
    group by status
    order by n desc`;
  console.log("DB lead.status distribution:");
  for (const r of rows) console.log(`  ${String(r.n).padStart(5)}  ${r.status}`);
  await sql.end();
}
main();
