// Probe a single Mailshake campaign + its recipients to inspect available fields.
// Run: tsx scripts/mailshake-probe.mts <campaignId>
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const key = process.env.MAILSHAKE_API_KEY;
if (!key) {
  console.error("MAILSHAKE_API_KEY not set");
  process.exit(1);
}
const auth = `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
const id = process.argv[2];
if (!id) {
  console.error("usage: tsx scripts/mailshake-probe.mts <campaignId>");
  process.exit(1);
}

async function get(path: string) {
  const res = await fetch(`https://api.mailshake.com/2017-04-01${path}`, {
    headers: { Authorization: auth },
  });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function main() {
  console.log("=== campaigns/get ===");
  const camp = await get(`/campaigns/get?id=${id}`);
  console.log(camp.status);
  console.log(JSON.stringify(camp.body, null, 2).slice(0, 3000));

  console.log("\n=== recipients/list (page 1, perPage=5) ===");
  const recips = await get(`/recipients/list?campaignID=${id}&perPage=5`);
  console.log(recips.status);
  console.log(JSON.stringify(recips.body, null, 2).slice(0, 3000));

  console.log("\n=== team/listSenders ===");
  const senders = await get(`/team/listSenders?perPage=5`);
  console.log(senders.status);
  console.log(JSON.stringify(senders.body, null, 2).slice(0, 1500));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
