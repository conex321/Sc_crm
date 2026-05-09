// Single-script consent screen wizard end-to-end.
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
  await page.screenshot({ path: resolve(SHOT_DIR, `${ts}-${label}.png`) });
}

await page.goto("https://console.cloud.google.com/auth/overview/create?project=schoolconex-crm", {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(3500);
await shot("0-loaded");

// === Step 1: App Information ===
const appName = page.getByLabel(/^App name/i).first();
await appName.click({ clickCount: 3 });
await appName.fill("SchoolConex CRM");
await page.waitForTimeout(400);

// Support email cfc-select
const supportEmail = page.locator('cfc-select').first();
await supportEmail.click({ force: true });
await page.waitForTimeout(900);
const opt = page.getByRole("option", { name: /matthew@schoolconex\.com/i }).first();
await opt.click({ force: true });
await page.waitForTimeout(500);
await shot("1-step1");

await page.getByRole("button", { name: /^Next$/i }).first().click({ force: true });
await page.waitForTimeout(1500);

// === Step 2: Audience: Internal ===
// Click the Internal radio label
const internal = page.locator(':is(label,div,span):has-text("Internal")').filter({ has: page.locator('input[type="radio"], mat-radio-button') }).first();
const internalLabel = await internal.isVisible().catch(() => false)
  ? internal
  : page.getByRole("radio", { name: /Internal/i }).first();
await internalLabel.click({ force: true });
await page.waitForTimeout(500);
await shot("2-step2");

await page.getByRole("button", { name: /^Next$/i }).first().click({ force: true });
await page.waitForTimeout(1500);

// === Step 3: Contact Information email chip-grid ===
// Use page.evaluate to find the visible mat-chip-grid input *under* "Contact Information"
const ok = await page.evaluate(() => {
  const headings = Array.from(document.querySelectorAll("*")).filter((el) =>
    /^Contact Information$/i.test((el as HTMLElement).innerText?.trim() ?? ""),
  );
  if (headings.length === 0) return false;
  const heading = headings[0] as HTMLElement;
  // Walk forward across siblings/parents
  let scope: Element = heading.parentElement ?? heading;
  for (let i = 0; i < 10 && scope; i++) {
    const inputs = Array.from(scope.querySelectorAll("input")) as HTMLInputElement[];
    for (const input of inputs) {
      const r = input.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (input.type === "checkbox" || input.type === "radio") continue;
      // Check that this input is below the heading
      const hr = heading.getBoundingClientRect();
      if (r.y < hr.y) continue;
      input.focus();
      return true;
    }
    scope = (scope.parentElement as Element) ?? scope;
  }
  return false;
});
console.log(`focused contact input: ${ok}`);
if (ok) {
  await page.keyboard.type("matthew@schoolconex.com");
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
}
await shot("3-step3");

await page.getByRole("button", { name: /^Next$/i }).first().click({ force: true });
await page.waitForTimeout(1500);

// === Step 4: Finish ===
const checkbox = page.locator('input[type="checkbox"]').first();
if (await checkbox.isVisible().catch(() => false)) {
  await checkbox.click({ force: true }).catch(() => {});
  await page.waitForTimeout(300);
}
const createBtn = page.getByRole("button", { name: /^Create$/i }).first();
if (await createBtn.isVisible().catch(() => false)) {
  await createBtn.click({ force: true });
  await page.waitForTimeout(5000);
}
await shot("4-final");
console.log("final URL:", page.url());

await browser.close().catch(() => {});
