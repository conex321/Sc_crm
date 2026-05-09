// Click the Save button on the open Add-users panel and verify list afterward.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const SHOT_DIR = resolve(process.cwd(), ".playwright-shots");
await mkdir(SHOT_DIR, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => !p.url().startsWith("chrome://")) ?? ctx.pages()[0];

async function shot(label: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const file = resolve(SHOT_DIR, `${ts}-${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`shot: ${file}`);
}

const saveBtn = page.locator('button:has-text("Save")').last();
if (await saveBtn.isVisible().catch(() => false)) {
  console.log("Clicking Save…");
  await saveBtn.click({ force: true });
  await page.waitForTimeout(3000);
  await shot("01-after-save");
}

// Reload audience page and verify
await page.goto("https://console.cloud.google.com/auth/audience?project=gmail-mcp-personal-495520", {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(3000);
await shot("02-audience-list");
const text = (await page.locator("body").innerText()).slice(0, 4000);
console.log(text);

await browser.close().catch(() => {});
