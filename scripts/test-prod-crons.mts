// Trigger both production cron endpoints with the CRON_SECRET and print results.
// Run: tsx scripts/test-prod-crons.mts
import { config } from "dotenv";
config({ path: ".env.local" });

const BASE = "https://sc-crm-sand.vercel.app";
const SECRET = process.env.CRON_SECRET;
if (!SECRET) {
  console.error("CRON_SECRET not in .env.local");
  process.exit(1);
}

async function hit(path: string) {
  console.log(`\n=== ${path} ===`);
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${SECRET}` },
      signal: AbortSignal.timeout(290_000),
    });
    const text = await res.text();
    const ms = Date.now() - t0;
    console.log(`HTTP ${res.status} · ${ms}ms`);
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      console.log(text.slice(0, 800));
    }
  } catch (err) {
    console.error(`FAIL: ${(err as Error).message}`);
  }
}

await hit("/api/cron/mailshake-sync");
await hit("/api/cron/dialpad-sync");
