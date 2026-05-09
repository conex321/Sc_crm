// Walk through the OAuth Consent Screen wizard:
//   1. App Information: name + user support email
//   2. Audience: Internal
//   3. Contact Information: developer email
//   4. Agree + Create
import { chromium } from "playwright";
import { config } from "dotenv";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

config({ path: ".env.local" });

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

// We expect the page to already be on the Project configuration wizard
await page.waitForTimeout(1500);
await shot("00-start");

// Step 1: App name
const appName = page.getByLabel(/App name/i).first();
await appName.waitFor({ state: "visible", timeout: 10_000 });
await appName.click({ clickCount: 3 });
await appName.fill("SchoolConex CRM");
await page.waitForTimeout(400);

// User support email — this is a select dropdown of authorized emails
const supportEmail = page.locator('mat-select').filter({ hasText: /support email/i }).first();
const supportEmailFallback = page.getByLabel(/User support email/i).first();
const supportEl = (await supportEmail.isVisible().catch(() => false))
  ? supportEmail
  : supportEmailFallback;
await supportEl.click({ force: true });
await page.waitForTimeout(800);
// Pick the first option which should be matthew@schoolconex.com
const firstOption = page.getByRole("option").first();
await firstOption.click({ force: true }).catch(async () => {
  // fallback: pick by text
  await page.getByRole("option", { name: /matthew@schoolconex\.com/i }).click({ force: true });
});
await page.waitForTimeout(500);
await shot("01-step1-filled");

// Click Next on App Information section
await page.getByRole("button", { name: /^Next$/i }).first().click({ force: true });
await page.waitForTimeout(1500);
await shot("02-step2-audience");

// Step 2: Pick Internal
const internalRadio = page
  .locator('input[type="radio"][value="Internal"], mat-radio-button:has-text("Internal")')
  .first();
const internalLabel = page.locator('label:has-text("Internal"), :is(mat-radio-button,div):has-text("Internal")').first();
await (await internalRadio.isVisible().catch(() => false)
  ? internalRadio
  : internalLabel
).click({ force: true });
await page.waitForTimeout(500);
await shot("03-internal-picked");

// Click Next
await page.getByRole("button", { name: /^Next$/i }).first().click({ force: true });
await page.waitForTimeout(1500);
await shot("04-step3-contact");

// Step 3: Contact email
const contactEmail = page.getByLabel(/Email addresses/i).or(page.getByLabel(/Email/i)).first();
await contactEmail.waitFor({ state: "visible", timeout: 8000 });
await contactEmail.click();
await contactEmail.fill("matthew@schoolconex.com");
// chip-style: press Enter to commit
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
await shot("05-contact-filled");

// Next on Contact Information
await page.getByRole("button", { name: /^Next$/i }).first().click({ force: true });
await page.waitForTimeout(1500);
await shot("06-finish");

// Final step: agree to user data policy + Create
const agreeBox = page.locator('input[type="checkbox"]').first();
if (await agreeBox.isVisible().catch(() => false)) {
  await agreeBox.click({ force: true }).catch(() => {});
  await page.waitForTimeout(300);
}
const createBtn = page.getByRole("button", { name: /^Create$/i });
if (await createBtn.isVisible().catch(() => false)) {
  await createBtn.click({ force: true });
  await page.waitForTimeout(3500);
}
await shot("07-final");

console.log("Consent wizard complete (or as far as it could get).");
await browser.close().catch(() => {});
