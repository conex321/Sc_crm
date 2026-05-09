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

// Click Next on Audience section
await page.getByRole("button", { name: /^Next$/i }).first().click({ force: true });
await page.waitForTimeout(2000);
await shot("a-after-aud-next");

// Step 3: Email addresses chip-input. Use Playwright role-based locators.
const emailInput = page
  .locator('input[matchipinputfor], input[role="combobox"][aria-haspopup="listbox"]')
  .filter({ hasNot: page.locator("[aria-label*='Search']") })
  .last();
const emailInputAlt = page.getByLabel(/^Email addresses/i).first();
const target = (await emailInput.isVisible().catch(() => false)) ? emailInput : emailInputAlt;
try {
  await target.click({ force: true, timeout: 5000 });
  await page.keyboard.type("matthew@schoolconex.com");
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
} catch (err) {
  // Try via DOM
  await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];
    // The email input has matChipInputFor or aria-label "Email addresses"
    const candidate = inputs.find((i) => {
      const r = i.getBoundingClientRect();
      const aria = i.getAttribute("aria-label") ?? "";
      const id = i.id ?? "";
      return r.width > 0 && r.height > 0 && (
        i.hasAttribute("matchipinputfor") ||
        /Email addresses/i.test(aria) ||
        /email/i.test(id)
      );
    });
    candidate?.focus();
  });
  await page.keyboard.type("matthew@schoolconex.com");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
}
await shot("b-email-typed");

// Click Next on Contact
await page.getByRole("button", { name: /^Next$/i }).first().click({ force: true });
await page.waitForTimeout(1500);
await shot("c-after-contact-next");

// Finish: agree + Create
const checkbox = page.locator('input[type="checkbox"]').first();
if (await checkbox.isVisible().catch(() => false)) {
  await checkbox.check({ force: true }).catch(() => {});
  await page.waitForTimeout(400);
}
const createBtn = page.getByRole("button", { name: /^Create$/i }).first();
if (await createBtn.isVisible().catch(() => false)) {
  console.log("Clicking Create…");
  await createBtn.click({ force: true });
  await page.waitForTimeout(6000);
}
await shot("d-final");
console.log("final URL:", page.url());

await browser.close().catch(() => {});
