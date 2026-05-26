// Probe Supabase Supavisor pooler hosts to find which region this project uses.
// Run: tsx scripts/find-supabase-pooler.mts
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const PROJECT_REF = "ooanslwrwjexdjwdphes";
const PASSWORD = new URL(process.env.DATABASE_URL!).password;
const REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ca-central-1",
  "sa-east-1",
];

for (const region of REGIONS) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  const url = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@${host}:6543/postgres`;
  process.stdout.write(`${region.padEnd(16)} `);
  try {
    const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 5, idle_timeout: 2 });
    const r = await sql`select 1 as ok`;
    await sql.end();
    if (r[0]?.ok === 1) {
      console.log(`✓ MATCH — pooler URL:`);
      console.log(`\n${url}\n`);
      process.exit(0);
    }
  } catch (err) {
    const m = (err as Error).message.slice(0, 80);
    console.log(`✗ ${m}`);
  }
}
console.log("\nNo region matched. Check Supabase dashboard → Project Settings → Database for the exact pooler host.");
