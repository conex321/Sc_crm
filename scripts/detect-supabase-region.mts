import { config } from "dotenv";
config({ path: ".env.local" });
import dns from "node:dns/promises";
import postgres from "postgres";

const PROJECT_REF = "ooanslwrwjexdjwdphes";
const PASSWORD = new URL(process.env.DATABASE_URL!).password;

console.log("=== 1. Inspect API response headers ===");
const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`;
try {
  const r = await fetch(url, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
  });
  for (const [k, v] of r.headers) {
    if (k.match(/region|cf-|x-/i)) console.log(`  ${k}: ${v}`);
  }
} catch (e) {
  console.log(`  fetch error: ${(e as Error).message}`);
}

console.log("\n=== 2. DNS resolve db.<ref>.supabase.co ===");
try {
  const ips = await dns.resolve4(`db.${PROJECT_REF}.supabase.co`);
  console.log(`  IPv4: ${ips.join(", ")}`);
} catch {
  try {
    const ips6 = await dns.resolve6(`db.${PROJECT_REF}.supabase.co`);
    console.log(`  IPv6 only: ${ips6.join(", ")}`);
  } catch (e) {
    console.log(`  no DNS: ${(e as Error).message}`);
  }
}

console.log("\n=== 3. Try Supavisor 2.0 (aws-1-*) hostnames ===");
const REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-central-1", "eu-central-2", "eu-west-1", "eu-west-2", "eu-west-3", "eu-north-1",
  "ap-southeast-1", "ap-southeast-2", "ap-south-1", "ap-northeast-1", "ap-northeast-2",
  "ca-central-1", "sa-east-1",
];

for (const region of REGIONS) {
  for (const prefix of ["aws-0", "aws-1"]) {
    const host = `${prefix}-${region}.pooler.supabase.com`;
    const u = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@${host}:6543/postgres`;
    try {
      const sql = postgres(u, { prepare: false, max: 1, connect_timeout: 4, idle_timeout: 1 });
      const r = await sql`select 1 as ok`;
      await sql.end();
      if (r[0]?.ok === 1) {
        console.log(`✓ ${prefix}-${region}  MATCH`);
        console.log(`\nPOOLER URL:`);
        console.log(u);
        process.exit(0);
      }
    } catch (err) {
      const m = (err as Error).message.slice(0, 60);
      if (!m.includes("ENOTFOUND") && !m.includes("not found")) {
        console.log(`  ${prefix}-${region}: ${m}`);
      }
    }
  }
}

console.log("\nNo pooler region matched. Likely the Supabase project is on a non-standard region — check Supabase dashboard → Project Settings → Database.");
