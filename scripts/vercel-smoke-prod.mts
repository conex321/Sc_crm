// Smoke-test the live Vercel deployment with the demo user.
// Run: tsx scripts/vercel-smoke-prod.mts
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "https://sc-crm-sand.vercel.app";
const SHOTS = ".playwright-shots";

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const log = (n: string, v: unknown) => console.log(`  ${n}: ${v}`);

  await page.goto(`${BASE}/login`);
  log("login title", await page.title());
  await page.screenshot({ path: `${SHOTS}/prod-01-login.png`, fullPage: true });

  await page.locator('input[name="email"]').fill("demo@schoolconex.com");
  await page.locator('input[name="password"]').fill("Test1234!");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ]);
  log("after-login url", page.url());
  await page.screenshot({ path: `${SHOTS}/prod-02-after-login.png`, fullPage: true });

  await page.goto(`${BASE}/campaigns`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  log("campaigns url", page.url());
  log("campaigns h1", await page.locator("h1").first().textContent());
  log("campaigns table rows", await page.locator("table tbody tr").count());
  await page.screenshot({ path: `${SHOTS}/prod-03-campaigns.png`, fullPage: true });

  await browser.close();
  console.log(`screenshots → ${SHOTS}/prod-*.png`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
