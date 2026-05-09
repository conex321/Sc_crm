// Create another key on the existing service account, this time using a
// proper context-level download listener. Save the JSON to .secrets/.
import { chromium } from "playwright";
import { config } from "dotenv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

config({ path: ".env.local" });

const SHOT_DIR = resolve(process.cwd(), ".playwright-shots");
const SECRETS_DIR = resolve(process.cwd(), ".secrets");
const ENV_FILE = resolve(process.cwd(), ".env.local");
await mkdir(SHOT_DIR, { recursive: true });
await mkdir(SECRETS_DIR, { recursive: true });

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID ?? "schoolconex-crm";
const SA_EMAIL = `schoolconex-crm-drive@${PROJECT_ID}.iam.gserviceaccount.com`;

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => !p.url().startsWith("chrome://")) ?? ctx.pages()[0];

async function shot(label: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  await page.screenshot({ path: resolve(SHOT_DIR, `${ts}-${label}.png`) });
}

await page.goto(
  `https://console.cloud.google.com/iam-admin/serviceaccounts/details/${encodeURIComponent(SA_EMAIL)}/keys?project=${PROJECT_ID}`,
  { waitUntil: "domcontentloaded" },
);
await page.waitForTimeout(4000);
await shot("01-keys-page");

const addKey = page.locator('button:has-text("Add key"), button:has-text("ADD KEY")').first();
await addKey.click({ force: true });
await page.waitForTimeout(800);
const createKey = page.locator('button:has-text("Create new key"), [role="menuitem"]:has-text("Create new key")').first();
await createKey.click({ force: true });
await page.waitForTimeout(1500);
await shot("02-modal");

const jsonRadio = page.getByRole("radio", { name: /JSON/i }).first();
await jsonRadio.check({ force: true }).catch(() => {});
await page.waitForTimeout(400);

// Set up download listener BEFORE clicking, on the page (context level not
// supported via CDP).
const downloadPromise = page.waitForEvent("download", { timeout: 30_000 }).catch(() => null);

const createBtn = page.locator('button:has-text("Create"), button:has-text("CREATE")').last();
await createBtn.click({ force: true });
console.log("Clicked Create on key modal; waiting for download…");

const download = await downloadPromise;
if (!download) {
  console.error("Download event never fired");
  await shot("99-no-event");
  process.exit(1);
}

const target = resolve(SECRETS_DIR, "service-account.json");
await download.saveAs(target);
console.log(`saved to ${target}`);

const json = await readFile(target, "utf-8");
const parsed = JSON.parse(json) as { client_email: string; project_id: string };
console.log(`SA email: ${parsed.client_email}, project: ${parsed.project_id}`);

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
console.log(".env.local: GOOGLE_SERVICE_ACCOUNT_KEY written");

await browser.close().catch(() => {});
