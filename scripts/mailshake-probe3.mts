// Probe more Mailshake endpoints. Run: tsx scripts/mailshake-probe3.mts <campaignId>
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const key = process.env.MAILSHAKE_API_KEY!;
const auth = `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
const id = process.argv[2] ?? "1504458";

async function get(path: string) {
  const res = await fetch(`https://api.mailshake.com/2017-04-01${path}`, {
    headers: { Authorization: auth },
  });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { status: res.status, body };
}

async function main() {
  const candidates = [
    `/campaigns/getStats?id=${id}`,
    `/opens/list?campaignID=${id}&perPage=3`,
    `/clicks/list?campaignID=${id}&perPage=3`,
    `/replies/list?campaignID=${id}&perPage=3`,
    `/replies/list?perPage=3`,
    `/sent/list?campaignID=${id}&perPage=3`,
    `/sent_emails/list?campaignID=${id}&perPage=3`,
    `/team/listSent?campaignID=${id}&perPage=3`,
    `/messages/list?campaignID=${id}&perPage=3`,
    `/recipients/getActivities?id=680345780`,
  ];
  for (const p of candidates) {
    const r = await get(p);
    console.log(`=== ${p} → ${r.status}`);
    const s = JSON.stringify(r.body, null, 2);
    console.log(s.length > 1500 ? s.slice(0, 1500) + " …" : s);
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
