// Configure the OAuth consent screen for schoolconex-crm as Internal.
// Internal = only schoolconex.com Workspace accounts can authenticate; no
// test-user list or app verification needed.
import { chromium } from "playwright";
import { config } from "dotenv";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

config({ path: ".env.local" });

const SHOT_DIR = resolve(process.cwd(), ".playwright-shots");
await mkdir(SHOT_DIR, { recursive: true });
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID ?? "schoolconex-crm";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => !p.url().startsWith("chrome://")) ?? ctx.pages()[0];

async function shot(label: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const file = resolve(SHOT_DIR, `${ts}-${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`shot: ${file}`);
}

await page.goto(`https://console.cloud.google.com/auth/branding?project=${PROJECT_ID}`, {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(4000);
await shot("01-branding");

const text = (await page.locator("body").innerText()).slice(0, 4000);
console.log("--- branding page (first 4kb) ---");
console.log(text);
console.log("--- end ---");

// On a fresh project, there's a "Get started" button to start consent setup.
const getStarted = page.locator('button:has-text("Get started"), a:has-text("Get started")').first();
if (await getStarted.isVisible().catch(() => false)) {
  console.log("Clicking Get started…");
  await getStarted.click({ force: true });
  await page.waitForTimeout(2500);
  await shot("02-getstarted");
}

await browser.close().catch(() => {});
