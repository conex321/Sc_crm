import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const SHOT_DIR = resolve(process.cwd(), ".playwright-shots");
await mkdir(SHOT_DIR, { recursive: true });
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => !p.url().startsWith("chrome://")) ?? ctx.pages()[0];

const radio = page.getByRole("radio", { name: /Internal/i }).first();
await radio.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await radio.check({ force: true }).catch(async () => {
  await radio.click({ force: true });
});
await page.waitForTimeout(700);
const ts = new Date().toISOString().replace(/[:.]/g, "-");
await page.screenshot({ path: resolve(SHOT_DIR, `${ts}-radio-after.png`) });
const isChecked = await radio.isChecked().catch(() => false);
console.log(`radio checked: ${isChecked}`);
await browser.close().catch(() => {});
