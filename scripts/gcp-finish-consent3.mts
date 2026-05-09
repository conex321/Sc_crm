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

// Reset back to the wizard
await page.goto("https://console.cloud.google.com/auth/overview/create?project=schoolconex-crm", {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(3500);
await shot("01-back-to-wizard");

// Scroll until we see "Contact Information" in viewport
await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll("*")).find((e) =>
    /Contact Information/i.test((e as HTMLElement).innerText?.trim() ?? ""),
  );
  if (el) (el as HTMLElement).scrollIntoView({ block: "center" });
});
await page.waitForTimeout(1000);
await shot("02-contact-in-view");

// Find the input that sits BELOW "Contact Information" and is visible AND inside an mat-form-field with the proper label
const targetCoord = await page.evaluate(() => {
  // Find all visible mat-form-fields
  const fields = Array.from(document.querySelectorAll("mat-form-field, .mdc-text-field"));
  for (const field of fields) {
    const r = field.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const labelText = (field.querySelector("label, mat-label") as HTMLElement | null)?.innerText ?? "";
    if (/^Email addresses/i.test(labelText)) {
      const input = field.querySelector("input") as HTMLInputElement | null;
      if (input) {
        const ir = input.getBoundingClientRect();
        return { x: ir.x + ir.width / 2, y: ir.y + ir.height / 2, label: labelText };
      }
    }
  }
  return null;
});
console.log("target:", targetCoord);

if (!targetCoord) {
  console.error("Couldn't find email input via mat-form-field path");
  process.exit(1);
}

await page.mouse.click(targetCoord.x, targetCoord.y);
await page.waitForTimeout(400);
await page.keyboard.type("matthew@schoolconex.com");
await page.waitForTimeout(400);
await page.keyboard.press("Enter");
await page.waitForTimeout(1000);
await shot("03-typed");

// Click Next button visible inside the wizard
const nextBtns = page.getByRole("button", { name: /^Next$/i });
const c = await nextBtns.count();
for (let i = 0; i < c; i++) {
  const btn = nextBtns.nth(i);
  if (await btn.isVisible().catch(() => false)) {
    await btn.click({ force: true });
    await page.waitForTimeout(1500);
    break;
  }
}
await shot("04-after-next");

// Look for the agreement checkbox + Create button
await page.evaluate(() => {
  const finish = Array.from(document.querySelectorAll("*")).find((e) =>
    /^Finish$/i.test((e as HTMLElement).innerText?.trim() ?? ""),
  );
  if (finish) (finish as HTMLElement).scrollIntoView({ block: "center" });
});
await page.waitForTimeout(800);
await shot("05-finish-in-view");

const checkbox = page.locator('input[type="checkbox"]').first();
if (await checkbox.isVisible().catch(() => false)) {
  await checkbox.click({ force: true }).catch(() => {});
  await page.waitForTimeout(400);
}
const createBtn = page.getByRole("button", { name: /^Create$/i });
if (await createBtn.isVisible().catch(() => false)) {
  await createBtn.click({ force: true });
  await page.waitForTimeout(5000);
}
await shot("06-after-create");
console.log("final URL:", page.url());
await browser.close().catch(() => {});
