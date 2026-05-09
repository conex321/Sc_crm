// Click Internal radio + Next via direct DOM interaction. Then keep walking.
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

// Click Internal radio via DOM (more reliable than locators)
const clickedInternal = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll("mat-radio-button, input[type='radio'], label"));
  for (const el of all) {
    const text = ((el as HTMLElement).innerText ?? "").trim();
    if (/^Internal$/i.test(text)) {
      // Try clicking parent to trigger Material's wrapper handler
      (el as HTMLElement).click();
      return text;
    }
  }
  // Fallback: click by aria-label
  const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
  for (const r of radios) {
    const lbl = (r as HTMLInputElement).getAttribute("aria-label") ?? "";
    if (/Internal/i.test(lbl)) {
      (r as HTMLElement).click();
      return lbl;
    }
  }
  return null;
});
console.log(`clicked Internal: ${clickedInternal}`);
await page.waitForTimeout(700);
await shot("a-internal-clicked");

// Click Next on Audience
await page.getByRole("button", { name: /^Next$/i }).first().click({ force: true });
await page.waitForTimeout(1500);
await shot("b-after-audience-next");

// === Step 3: Contact Information ===
const focused = await page.evaluate(() => {
  const headings = Array.from(document.querySelectorAll("*")).filter((el) =>
    /^Contact Information$/i.test((el as HTMLElement).innerText?.trim() ?? ""),
  );
  if (headings.length === 0) return false;
  const h = headings[0] as HTMLElement;
  const hr = h.getBoundingClientRect();
  // Find first input below the heading whose tagName is INPUT type=text or no type
  const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];
  const candidate = inputs.find((i) => {
    const r = i.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.y > hr.y && (i.type === "text" || i.type === "" || i.type === "email");
  });
  if (!candidate) return false;
  candidate.focus();
  return true;
});
console.log(`focused contact: ${focused}`);
if (focused) {
  await page.keyboard.type("matthew@schoolconex.com");
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
}
await shot("c-contact-typed");

// Next on Contact
await page.getByRole("button", { name: /^Next$/i }).first().click({ force: true });
await page.waitForTimeout(1500);
await shot("d-after-contact-next");

// Finish: agree + Create
const agreed = await page.evaluate(() => {
  const cb = document.querySelector('input[type="checkbox"]:not([disabled])') as HTMLInputElement | null;
  if (!cb) return false;
  if (!cb.checked) cb.click();
  return cb.checked;
});
console.log(`agreed: ${agreed}`);
await page.waitForTimeout(500);

const createBtn = page.getByRole("button", { name: /^Create$/i }).first();
if (await createBtn.isVisible().catch(() => false)) {
  console.log("Clicking Create…");
  await createBtn.click({ force: true });
  await page.waitForTimeout(6000);
}
await shot("e-final");
console.log("final URL:", page.url());

await browser.close().catch(() => {});
