// Click "Download JSON" in the OAuth-client-created modal and capture the
// downloaded file. Parse client_id + client_secret, write to .env.local.
import { chromium } from "playwright";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";

const SHOT_DIR = resolve(process.cwd(), ".playwright-shots");
const SECRETS_DIR = resolve(process.cwd(), ".secrets");
const ENV_FILE = resolve(process.cwd(), ".env.local");
await mkdir(SHOT_DIR, { recursive: true });
await mkdir(SECRETS_DIR, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => !p.url().startsWith("chrome://")) ?? ctx.pages()[0];

async function shot(label: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const file = resolve(SHOT_DIR, `${ts}-${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`shot: ${file}`);
}

const downloadBtn = page.locator('button:has-text("Download JSON"), a:has-text("Download JSON")').first();
if (!(await downloadBtn.isVisible().catch(() => false))) {
  console.error("Download JSON button not visible — modal may have been dismissed already.");
  process.exit(2);
}

const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
await downloadBtn.click({ force: true });
console.log("Clicked Download JSON; waiting for download…");
const download = await downloadPromise;
const target = resolve(SECRETS_DIR, "oauth-client.json");
await download.saveAs(target);
console.log(`saved to ${target}`);

const json = JSON.parse(await readFile(target, "utf-8"));
const root = json.web ?? json.installed ?? {};
const clientId: string | undefined = root.client_id;
const clientSecret: string | undefined = root.client_secret;
console.log(JSON.stringify({ clientId, hasSecret: Boolean(clientSecret) }));

if (!clientId || !clientSecret) {
  console.error("client_id or client_secret missing in downloaded JSON");
  process.exit(3);
}

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

await shot("after-download");

// Now dismiss the modal
await page.keyboard.press("Escape").catch(() => {});
await page.waitForTimeout(500);
const okBtn = page.locator('button:has-text("OK"), [role="dialog"] button').last();
if (await okBtn.isVisible().catch(() => false)) {
  await okBtn.click({ force: true }).catch(() => {});
}

await browser.close().catch(() => {});
