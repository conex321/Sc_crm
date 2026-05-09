// Smoke: list Mailshake campaigns. Confirms MAILSHAKE_API_KEY is valid.
// Run: tsx scripts/mailshake-list-campaigns.mts
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const key = process.env.MAILSHAKE_API_KEY;
if (!key) {
  console.error("MAILSHAKE_API_KEY not set in .env.local");
  process.exit(1);
}

const auth = `Basic ${Buffer.from(`${key}:`).toString("base64")}`;

async function main() {
  const res = await fetch("https://api.mailshake.com/2017-04-01/campaigns/list?perPage=100", {
    headers: { Authorization: auth },
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    console.log(text.slice(0, 500));
    process.exit(res.ok ? 0 : 1);
  }
  if (!res.ok) {
    console.error(body);
    process.exit(1);
  }
  const results = body.results ?? [];
  console.log(`Total campaigns: ${results.length}`);
  for (const c of results) {
    console.log(
      `  [${c.id}] ${c.title}  status=${c.status ?? "?"}  paused=${c.paused ?? "?"}  ` +
        `created=${c.created ?? "?"}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
