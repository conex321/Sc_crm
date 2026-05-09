// Create a Web-application OAuth client in the Google Auth Platform UI
// (the newer /auth/clients flow, not the legacy /apis/credentials page).
// Captures the resulting Client ID + Secret and writes them to .env.local.
import { chromium } from "playwright";
import { config } from "dotenv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

config({ path: ".env.local" });

const SHOT_DIR = resolve(process.cwd(), ".playwright-shots");
const ENV_FILE = resolve(process.cwd(), ".env.local");
await mkdir(SHOT_DIR, { recursive: true });

const NAME = process.argv[2] ?? "SchoolConex CRM (Drive)";
const REDIRECT = process.argv[3] ?? "http://localhost:3000/auth/google-drive-callback";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => !p.url().startsWith("chrome://")) ?? ctx.pages()[0];

async function shot(label: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const file = resolve(SHOT_DIR, `${ts}-${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`shot: ${file}`);
}

async function pause(ms: number) {
  await page.waitForTimeout(ms);
}

// 1. Navigate straight to the Create client form
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID ?? "schoolconex-crm";
await page.goto(
  `https://console.cloud.google.com/auth/clients/create?project=${PROJECT_ID}`,
  { waitUntil: "domcontentloaded" },
);
await pause(2500);
// Make sure the search overlay isn't open
await page.keyboard.press("Escape");
await pause(300);
await shot("02-create-form");

// 2. Pick "Web application" in the Application type field. The field label
//    is "Application type *". Find the mat-select within the form region only
//    (not the top global search bar combobox).
const typeField = page.locator('mat-form-field:has-text("Application type"), [data-test="application-type"], div:has-text("Application type *") + * mat-select').first();
const typeSelect = typeField.locator('mat-select, [role="combobox"]').first();
await typeSelect.click({ force: true });
await pause(700);
await shot("03-type-open");
const webOption = page.getByRole("option", { name: /^Web application$/i }).first();
await webOption.click({ force: true });
await pause(1000);
await shot("04-type-picked");

// 4. Fill the Name (uses the form's labeled input, NOT the top search bar)
const nameInput = page.getByLabel(/^Name\s*\*?$/i).first();
await nameInput.waitFor({ state: "visible", timeout: 10_000 });
await nameInput.click({ clickCount: 3 });
await nameInput.fill(NAME);
await pause(300);

// 5. Scroll the form so the redirect-URIs section is visible
await page.evaluate(() => window.scrollTo({ top: 1200, behavior: "instant" as ScrollBehavior }));
await pause(500);
await shot("05a-scrolled");

// 6. Click "Add URI" under "Authorized redirect URIs" (the SECOND Add URI on the page;
//    the first is under "Authorized JavaScript origins")
const redirectSection = page
  .locator(':is(h2,h3,div):has-text("Authorized redirect URIs"), :is(h2,h3,div):has-text("Authorised redirect URIs")')
  .locator("xpath=./following::*[contains(@class,'add') or self::button][1]")
  .first();

// Fallback: just take all "Add URI" buttons and click the last one
const allAdd = page.locator('button:has-text("Add URI"), button:has-text("ADD URI"), button:has-text("Add URI ")');
const count = await allAdd.count();
console.log(`found ${count} "Add URI" buttons`);
if (count > 0) {
  await allAdd.nth(count - 1).click({ force: true });
} else {
  await redirectSection.click({ force: true }).catch(() => {});
}
await pause(700);
await shot("05b-add-clicked");

// 7. Fill the new URI input that appeared. Target the LAST visible URI input.
const uriInputs = page.locator(
  'input[matinput][placeholder*="https"], input[matinput][type="url"], input[matinput][formcontrolname*="uri" i]',
);
const uriCount = await uriInputs.count();
console.log(`URI inputs visible: ${uriCount}`);
if (uriCount === 0) {
  // last fallback: any input under Authorized redirect URIs section
  const fallback = page.locator(':is(h2,h3):has-text("redirect URIs") ~ * input').first();
  await fallback.fill(REDIRECT);
} else {
  await uriInputs.nth(uriCount - 1).fill(REDIRECT);
}
await shot("05c-form-filled");

// 8. Submit (Create button at the bottom of the page)
await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" as ScrollBehavior }));
await pause(400);
const submitBtn = page.locator('button:has-text("Create")').filter({ hasNotText: "OAuth" }).last();
await submitBtn.click();
await pause(3500);
await shot("06-after-submit");

// 7. Capture from the resulting modal
const dialogText = await page.locator('mat-dialog-container, [role="dialog"]').first().innerText().catch(() => "");
console.log("--- dialog text ---\n" + dialogText);

const clientId = dialogText.match(/[\w-]+\.apps\.googleusercontent\.com/)?.[0] ?? null;
let clientSecret: string | null = dialogText.match(/GOCSPX-[\w-]+/)?.[0] ?? null;

// If the secret isn't in the modal, look for a "copy secret" affordance via button labels
if (!clientSecret) {
  // Try the new UI which sometimes hides the secret behind a "Show" button
  const showBtn = page.locator('button:has-text("Show")').first();
  if (await showBtn.isVisible().catch(() => false)) {
    await showBtn.click();
    await pause(500);
    const text2 = await page.locator('mat-dialog-container, [role="dialog"]').first().innerText();
    clientSecret = text2.match(/GOCSPX-[\w-]+/)?.[0] ?? null;
  }
}

console.log(JSON.stringify({ clientId, clientSecret }));

if (clientId && clientSecret) {
  // Patch .env.local
  let env = await readFile(ENV_FILE, "utf-8").catch(() => "");
  const lines = env.split(/\r?\n/);
  let foundId = false;
  let foundSecret = false;
  const out = lines.map((line) => {
    if (line.startsWith("GOOGLE_OAUTH_CLIENT_ID=")) {
      foundId = true;
      return `GOOGLE_OAUTH_CLIENT_ID=${clientId}`;
    }
    if (line.startsWith("GOOGLE_OAUTH_CLIENT_SECRET=")) {
      foundSecret = true;
      return `GOOGLE_OAUTH_CLIENT_SECRET=${clientSecret}`;
    }
    return line;
  });
  if (!foundId) out.push(`GOOGLE_OAUTH_CLIENT_ID=${clientId}`);
  if (!foundSecret) out.push(`GOOGLE_OAUTH_CLIENT_SECRET=${clientSecret}`);
  await writeFile(ENV_FILE, out.join("\n"), "utf-8");
  console.log(".env.local updated.");
} else {
  console.error("Couldn't extract clientId+secret from modal — open the screenshot to inspect.");
  process.exit(2);
}

await browser.close().catch(() => {});
