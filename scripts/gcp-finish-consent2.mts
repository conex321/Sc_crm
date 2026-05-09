// Targeted: click the visible Email addresses input under Contact Information,
// type, commit chip, click Next, click Create.
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

// Find chip-grid inputs (Material chip-input pattern), filter to ones visible
const chipInputs = page.locator(
  'mat-chip-grid input, mat-chip-list input, [role="grid"] input, input[type="email"]',
);
const visibleChipInput = chipInputs.filter({ hasNot: page.locator(":hidden") }).first();
const count = await chipInputs.count();
console.log(`chip inputs total: ${count}`);

// Click the input via coordinate of the highlighted form field area as fallback
const visibleInputCoord = await page.evaluate(() => {
  // Find label containing "Email addresses" and locate sibling input
  const labels = Array.from(document.querySelectorAll("label, span, div")).filter((el) =>
    /Email addresses/i.test((el as HTMLElement).innerText?.trim() ?? ""),
  );
  for (const lbl of labels) {
    const formField = lbl.closest("mat-form-field, .mdc-text-field, fieldset") ?? lbl.parentElement;
    if (!formField) continue;
    const input = formField.querySelector("input") as HTMLInputElement | null;
    if (!input) continue;
    const r = input.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      input.focus();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
  }
  return null;
});
console.log("input coord:", visibleInputCoord);

if (visibleInputCoord) {
  await page.mouse.click(visibleInputCoord.x, visibleInputCoord.y);
  await page.waitForTimeout(400);
  await page.keyboard.type("matthew@schoolconex.com");
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
}
await shot("01-typed");

// Click Next
const nextBtns = page.getByRole("button", { name: /^Next$/i });
const nextCount = await nextBtns.count();
for (let i = 0; i < nextCount; i++) {
  const btn = nextBtns.nth(i);
  if (await btn.isVisible().catch(() => false)) {
    await btn.click({ force: true });
    await page.waitForTimeout(1500);
    break;
  }
}
await shot("02-after-next");

// Final agree + Create
const checkbox = page.locator('input[type="checkbox"]').first();
if (await checkbox.isVisible().catch(() => false)) {
  await checkbox.click({ force: true }).catch(() => {});
  await page.waitForTimeout(300);
}
const createBtn = page.getByRole("button", { name: /^Create$/i });
if (await createBtn.isVisible().catch(() => false)) {
  await createBtn.click({ force: true });
  await page.waitForTimeout(4000);
}
await shot("03-final");
console.log(`final URL: ${page.url()}`);

await browser.close().catch(() => {});
