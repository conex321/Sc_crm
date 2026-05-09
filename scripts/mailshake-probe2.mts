// Probe additional Mailshake endpoints. Run: tsx scripts/mailshake-probe2.mts <campaignId>
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const key = process.env.MAILSHAKE_API_KEY!;
const auth = `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
const id = process.argv[2];

async function get(path: string) {
  const res = await fetch(`https://api.mailshake.com/2017-04-01${path}`, {
    headers: { Authorization: auth },
  });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 400);
  }
  return { status: res.status, body };
}

async function main() {
  console.log("=== campaigns/list (full payload, perPage=2) ===");
  const list = await get(`/campaigns/list?perPage=2`);
  console.log(list.status);
  console.log(JSON.stringify(list.body, null, 2).slice(0, 4000));

  if (id) {
    console.log("\n=== sentEmails/list?campaignID=" + id + " (perPage=3) ===");
    const sent = await get(`/sentEmails/list?campaignID=${id}&perPage=3`);
    console.log(sent.status);
    console.log(JSON.stringify(sent.body, null, 2).slice(0, 3000));

    console.log("\n=== leads/list?campaignID=" + id + " (perPage=3) ===");
    const leads = await get(`/leads/list?campaignID=${id}&perPage=3`);
    console.log(leads.status);
    console.log(JSON.stringify(leads.body, null, 2).slice(0, 3000));

    console.log("\n=== recipients/get?campaignID=" + id + "&id=<first> ===");
    const recips = await get(`/recipients/list?campaignID=${id}&perPage=1`);
    const firstId = (recips.body as any)?.results?.[0]?.id;
    if (firstId) {
      const r = await get(`/recipients/get?id=${firstId}`);
      console.log(r.status);
      console.log(JSON.stringify(r.body, null, 2).slice(0, 3000));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
