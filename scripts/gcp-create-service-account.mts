// Create a service account named "schoolconex-crm-drive" in the schoolconex-crm
// project, then create a JSON key and capture it.
import { chromium } from "playwright";
import { config } from "dotenv";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, join } from "node:path";

config({ path: ".env.local" });

const SHOT_DIR = resolve(process.cwd(), ".playwright-shots");
const SECRETS_DIR = resolve(process.cwd(), ".secrets");
const ENV_FILE = resolve(process.cwd(), ".env.local");
const DOWNLOADS_DIR = join(homedir(), "Downloads");
await mkdir(SHOT_DIR, { recursive: true });
await mkdir(SECRETS_DIR, { recursive: true });

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID ?? "schoolconex-crm";
const SA_NAME = "schoolconex-crm-drive";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => !p.url().startsWith("chrome://")) ?? ctx.pages()[0];

async function shot(label: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  await page.screenshot({ path: resolve(SHOT_DIR, `${ts}-${label}.png`) });
}

await page.goto(
  `https://console.cloud.google.com/iam-admin/serviceaccounts/create?project=${PROJECT_ID}`,
  { waitUntil: "domcontentloaded" },
);
await page.waitForTimeout(4000);
await shot("01-create-sa-form");

// Fill service account name
const nameInput = page.getByLabel(/Service account name/i).first();
await nameInput.waitFor({ state: "visible", timeout: 10_000 });
await nameInput.click({ clickCount: 3 });
await nameInput.fill(SA_NAME);
await page.waitForTimeout(800);
await shot("02-name-typed");

// Click "Create and continue" (skips role assignment)
const createContinue = page.getByRole("button", { name: /Create and continue|^Create$/i }).first();
await createContinue.click({ force: true });
await page.waitForTimeout(2500);
await shot("03-after-create");

// Click "Done" or skip the optional role + optional grant access
// First, look for "Done" button (skips remaining steps)
const doneBtn = page.getByRole("button", { name: /^Done$/i }).first();
if (await doneBtn.isVisible().catch(() => false)) {
  await doneBtn.click({ force: true });
  await page.waitForTimeout(2500);
  await shot("04-done");
} else {
  // Maybe we need to click "Continue" and then "Done"
  const continueBtn = page.getByRole("button", { name: /^Continue$/i }).first();
  if (await continueBtn.isVisible().catch(() => false)) {
    await continueBtn.click({ force: true });
    await page.waitForTimeout(1500);
    const done2 = page.getByRole("button", { name: /^Done$/i }).first();
    if (await done2.isVisible().catch(() => false)) {
      await done2.click({ force: true });
      await page.waitForTimeout(2500);
    }
  }
}

// We should now be on the service accounts list
await page.waitForTimeout(2000);
await shot("05-list");

// Find the service account email (format: schoolconex-crm-drive@<project>.iam.gserviceaccount.com)
const saEmail = `${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com`;
console.log(`expected SA email: ${saEmail}`);

// Navigate to the keys page for this SA
await page.goto(
  `https://console.cloud.google.com/iam-admin/serviceaccounts/details/${encodeURIComponent(saEmail)}?project=${PROJECT_ID}`,
  { waitUntil: "domcontentloaded" },
);
await page.waitForTimeout(3500);
await shot("06-sa-detail");

// Click "Keys" tab
const keysTab = page.locator('a:has-text("Keys"), [role="tab"]:has-text("Keys")').first();
if (await keysTab.isVisible().catch(() => false)) {
  await keysTab.click({ force: true });
  await page.waitForTimeout(2500);
  await shot("07-keys-tab");
}

// Click "Add key" → "Create new key"
const addKey = page.locator('button:has-text("Add key"), button:has-text("ADD KEY")').first();
await addKey.click({ force: true });
await page.waitForTimeout(900);
await shot("08-add-key-menu");
const createKey = page.locator('button:has-text("Create new key"), [role="menuitem"]:has-text("Create new key")').first();
await createKey.click({ force: true });
await page.waitForTimeout(1500);
await shot("09-create-key-modal");

// Pick JSON (default) and click Create
const jsonRadio = page.getByRole("radio", { name: /JSON/i }).first();
await jsonRadio.check({ force: true }).catch(() => {});
await page.waitForTimeout(500);

const beforeFiles = await readdir(DOWNLOADS_DIR).catch(() => [] as string[]);
const before = new Set(beforeFiles);

const createBtn = page.locator('button:has-text("Create"), button:has-text("CREATE")').last();
await createBtn.click({ force: true });
await page.waitForTimeout(2500);
await shot("10-after-create-key");

// Poll Downloads for the new JSON
let foundFile: string | null = null;
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(1000);
  const now = await readdir(DOWNLOADS_DIR).catch(() => [] as string[]);
  const candidates = now.filter((f) => !before.has(f) && f.endsWith(".json"));
  if (candidates.length > 0) {
    const newest = (
      await Promise.all(
        candidates.map(async (f) => ({ f, m: (await stat(join(DOWNLOADS_DIR, f))).mtimeMs })),
      )
    ).sort((a, b) => b.m - a.m)[0].f;
    foundFile = join(DOWNLOADS_DIR, newest);
    break;
  }
}

if (!foundFile) {
  console.error("Service account JSON didn't appear in Downloads");
  await shot("99-no-download");
  process.exit(1);
}

// Move to .secrets/
const targetPath = resolve(SECRETS_DIR, "service-account.json");
const json = await readFile(foundFile, "utf-8");
await writeFile(targetPath, json, "utf-8");
console.log(`moved ${foundFile} -> ${targetPath}`);

// Persist the JSON contents (single-line) to .env.local as GOOGLE_SERVICE_ACCOUNT_KEY
const single = JSON.stringify(JSON.parse(json));
let env = await readFile(ENV_FILE, "utf-8").catch(() => "");
const lines = env.split(/\r?\n/);
let found = false;
const out = lines.map((line) => {
  if (line.startsWith("GOOGLE_SERVICE_ACCOUNT_KEY=")) {
    found = true;
    return `GOOGLE_SERVICE_ACCOUNT_KEY=${single}`;
  }
  return line;
});
if (!found) out.push(`GOOGLE_SERVICE_ACCOUNT_KEY=${single}`);
await writeFile(ENV_FILE, out.join("\n"), "utf-8");

const parsed = JSON.parse(json) as { client_email: string };
console.log(`service account email: ${parsed.client_email}`);
console.log(".env.local: GOOGLE_SERVICE_ACCOUNT_KEY written");

await browser.close().catch(() => {});
