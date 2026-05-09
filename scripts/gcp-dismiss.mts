// Brute-force modal dismiss. Tries: pressing Escape, clicking text variants,
// clicking by coordinate as last resort.
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

// 1. Escape
console.log("Trying Escape…");
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// 2. Force-click "OK" text
const candidates = [
  'text="OK"',
  'button:has-text("OK")',
  '[role="button"]:has-text("OK")',
];
for (const sel of candidates) {
  const loc = page.locator(sel).first();
  if (await loc.isVisible().catch(() => false)) {
    console.log(`Trying ${sel} ...`);
    await loc.click({ force: true, timeout: 3000 }).catch((err) => console.log(`  click failed: ${err.message}`));
    await page.waitForTimeout(500);
  }
}

// 3. Snackbar X
const snackX = page.locator('text="OAuth client created"').locator("..").getByRole("button");
if (await snackX.first().isVisible().catch(() => false)) {
  await snackX.first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
}

// 4. Click at expected OK coordinates (near bottom-right of dialog)
console.log("Trying coordinate click on OK area…");
const dialog = page.locator('[role="dialog"], mat-dialog-container').first();
if (await dialog.isVisible().catch(() => false)) {
  const box = await dialog.boundingBox();
  if (box) {
    const x = box.x + box.width - 60;
    const y = box.y + box.height - 30;
    await page.mouse.click(x, y);
    await page.waitForTimeout(500);
  }
}

await shot("after-dismiss");
console.log(`url: ${page.url()}`);
const dialogStillVisible = await page
  .locator('[role="dialog"], mat-dialog-container')
  .first()
  .isVisible()
  .catch(() => false);
console.log(`dialog still visible: ${dialogStillVisible}`);
await browser.close().catch(() => {});
