// Visual validation of Mailshake integration. Logs in as demo@schoolconex.com,
// walks /campaigns → campaign detail → matched-account detail → screenshots
// each step into .playwright-shots/.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { chromium } from "playwright";
import postgres from "postgres";
import { mkdir } from "node:fs/promises";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SHOTS = ".playwright-shots";

async function main() {
  await mkdir(SHOTS, { recursive: true });

  // Pick two test targets directly from the DB:
  //   1) the highest-lead-count campaign  (visit detail)
  //   2) the account with the most leads  (visit account detail → Campaigns tab)
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const [topCampaign] = await sql`
    select c.mailshake_id, c.title, count(l.*)::int as leads
    from public.mailshake_campaigns c
    left join public.mailshake_leads l on l.campaign_id = c.id
    group by c.id order by leads desc limit 1`;
  const [topAccount] = await sql`
    select a.id, a.name, count(l.*)::int as leads
    from public.accounts a
    join public.mailshake_leads l on l.account_id = a.id
    where a.deleted_at is null
    group by a.id order by leads desc limit 1`;
  await sql.end();

  console.log("top campaign:", topCampaign);
  console.log("top account:", topAccount);

  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // 1) Login
  await page.goto(`${BASE}/login`);
  await page.locator('input[name="email"]').fill("demo@schoolconex.com");
  await page.locator('input[name="password"]').fill(process.env.E2E_LOGIN_PASSWORD!);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 15_000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ]);
  console.log("after login url:", page.url());
  await page.screenshot({ path: `${SHOTS}/ms-01-after-login.png`, fullPage: true });

  // 2) Campaigns page
  await page.goto(`${BASE}/campaigns`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  console.log("/campaigns title:", await page.locator("h1").first().textContent());
  await page.screenshot({ path: `${SHOTS}/ms-02-campaigns.png`, fullPage: true });

  const campaignRows = await page.locator("table tbody tr").count();
  console.log(`/campaigns rendered ${campaignRows} rows`);

  // 3) Top campaign detail
  await page.goto(`${BASE}/campaigns/${topCampaign.mailshake_id}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(500);
  console.log(
    "campaign detail title:",
    await page.locator("h1").first().textContent(),
  );
  const schoolRows = await page.locator("table tbody tr").count();
  console.log(`campaign detail schools-touched rows: ${schoolRows}`);
  await page.screenshot({
    path: `${SHOTS}/ms-03-campaign-detail.png`,
    fullPage: true,
  });

  // 4) Account detail → Campaigns tab
  await page.goto(`${BASE}/accounts/${topAccount.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `${SHOTS}/ms-04-account-activity.png`,
    fullPage: true,
  });
  await page.getByRole("tab", { name: /Campaigns/i }).click();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `${SHOTS}/ms-05-account-campaigns.png`,
    fullPage: true,
  });

  // 5) Settings → Integrations
  await page.goto(`${BASE}/settings/integrations`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `${SHOTS}/ms-06-integrations.png`,
    fullPage: true,
  });

  await browser.close();
  console.log("screenshots written to", SHOTS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
