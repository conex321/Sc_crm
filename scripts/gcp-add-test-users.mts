// Add test users to the OAuth consent screen so they can use the OAuth client
// while the consent screen is still in "Testing" mode.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const SHOT_DIR = resolve(process.cwd(), ".playwright-shots");
await mkdir(SHOT_DIR, { recursive: true });

// Only add accounts that are REAL Google identities (rejected otherwise).
// demo@/ai@ are local-only Supabase auth users — not Google accounts.
const TEST_USERS = ["rayan@schoolconex.com", "matthewsefati@gmail.com"];

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => !p.url().startsWith("chrome://")) ?? ctx.pages()[0];

async function shot(label: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const file = resolve(SHOT_DIR, `${ts}-${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`shot: ${file}`);
}

// Close any open side panel first (Esc) and reload the audience page fresh
await page.keyboard.press("Escape").catch(() => {});
await page.waitForTimeout(300);
await page.goto(
  "https://console.cloud.google.com/auth/audience?project=gmail-mcp-personal-495520",
  { waitUntil: "domcontentloaded" },
);
await page.waitForTimeout(3000);
await shot("01-audience");

const bodyText = (await page.locator("body").innerText()).slice(0, 4000);
console.log("--- audience page (first 4kb) ---");
console.log(bodyText);
console.log("--- end ---");

// Find an "Add users" button (the test users section has its own Add button)
const addBtn = page
  .locator(
    'button:has-text("Add users"), button:has-text("Add a test user"), a:has-text("Add users")',
  )
  .first();

if (!(await addBtn.isVisible().catch(() => false))) {
  console.error("'Add users' button not visible — print page text above to see the layout");
  await shot("02-no-add-btn");
  process.exit(1);
}

await addBtn.click({ force: true });
await page.waitForTimeout(1500);
await shot("03-add-users-panel");

// The side panel that appears has a textarea/input for adding emails (one per line
// or comma-separated). Find a textarea or input with "email" hint.
const emailInput = page
  .locator(
    'textarea[placeholder*="email" i], input[type="email"], input[aria-label*="email" i], textarea',
  )
  .first();

await emailInput.waitFor({ state: "visible", timeout: 8000 });
// Clear any previous entry, then type each email and press Enter to commit it as a chip
await emailInput.click();
await page.keyboard.press("Control+A");
await page.keyboard.press("Delete");
for (const email of TEST_USERS) {
  await page.keyboard.type(email);
  await page.keyboard.press("Enter");
  await pause(300);
}
await shot("04-emails-typed");

// Save
const saveBtn = page.locator('button:has-text("Save"), button:has-text("Add")').last();
await saveBtn.click({ force: true });
await pause(2500);
await shot("05-after-save");

console.log(`Added test users: ${TEST_USERS.join(", ")}`);
await browser.close().catch(() => {});

async function pause(ms = 600) {
  await page.waitForTimeout(ms);
}
