// Click "Download JSON" + read the resulting file from the user's Downloads folder.
// Falls back to navigating to the client edit page and reading the secret there.
import { chromium } from "playwright";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, join } from "node:path";

const SHOT_DIR = resolve(process.cwd(), ".playwright-shots");
const ENV_FILE = resolve(process.cwd(), ".env.local");
const DOWNLOADS_DIR = join(homedir(), "Downloads");
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

const beforeFiles = await readdir(DOWNLOADS_DIR).catch(() => [] as string[]);
const before = new Set(beforeFiles);

const downloadBtn = page.locator('button:has-text("Download JSON"), a:has-text("Download JSON")').first();
if (!(await downloadBtn.isVisible().catch(() => false))) {
  console.error("Download JSON not visible — modal may be dismissed.");
  process.exit(2);
}
await downloadBtn.click({ force: true });
console.log("Clicked Download JSON. Polling Downloads folder for new client_secret*.json…");

// Poll Downloads folder for up to 15s
let foundFile: string | null = null;
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(1000);
  const now = await readdir(DOWNLOADS_DIR).catch(() => [] as string[]);
  const candidates = now
    .filter((f) => !before.has(f))
    .filter((f) => f.endsWith(".json"))
    .filter((f) => /client_secret|gmail-mcp|531230694664|web/i.test(f));
  if (candidates.length > 0) {
    // pick newest
    const withStat = await Promise.all(
      candidates.map(async (f) => ({
        f,
        m: (await stat(join(DOWNLOADS_DIR, f))).mtimeMs,
      })),
    );
    withStat.sort((a, b) => b.m - a.m);
    foundFile = join(DOWNLOADS_DIR, withStat[0].f);
    break;
  }
}

if (!foundFile) {
  console.error("No client_secret*.json appeared in Downloads.");
  await shot("download-fail");
  process.exit(3);
}
console.log(`Found ${foundFile}`);

const json = JSON.parse(await readFile(foundFile, "utf-8"));
const root = json.web ?? json.installed ?? {};
const clientId: string | undefined = root.client_id;
const clientSecret: string | undefined = root.client_secret;
console.log(JSON.stringify({ clientId, hasSecret: Boolean(clientSecret) }));

if (!clientId || !clientSecret) {
  console.error("Missing client_id or client_secret in JSON");
  process.exit(4);
}

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

// Dismiss the modal
await page.keyboard.press("Escape").catch(() => {});
await browser.close().catch(() => {});
