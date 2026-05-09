// On the client detail page, click the Download icon next to the NEW secret
// row, then read the resulting JSON from the user's Downloads folder.
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

// Make sure we're on the right detail page
const wantedUrl =
  "https://console.cloud.google.com/auth/clients/531230694664-r4ckfth2r16psa1la169da0364cqgd6f.apps.googleusercontent.com?project=gmail-mcp-personal-495520";
if (!page.url().startsWith(wantedUrl.split("?")[0])) {
  await page.goto(wantedUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
}

// Scroll to the bottom of the right side panel where the secrets are listed
await page.evaluate(() =>
  window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" as ScrollBehavior }),
);
await page.waitForTimeout(800);
await shot("01-scrolled");

// The NEW secret row has 3 icons: copy, download, delete. Find the row that
// contains "NEW" badge and click the SECOND icon (download) within it.
//
// We'll iterate buttons inside the right column and target the ones near the
// "NEW" text.
const beforeFiles = await readdir(DOWNLOADS_DIR).catch(() => [] as string[]);
const before = new Set(beforeFiles);

// Locate the row by its NEW badge / SECOND "Client secret" cell
// The download button has aria-label that includes "Download" — use that.
const downloadButtons = page.locator(
  '[aria-label*="Download" i], [aria-label*="download" i]',
);
const dlCount = await downloadButtons.count();
console.log(`download buttons found: ${dlCount}`);

let downloaded = false;
for (let i = 0; i < dlCount; i++) {
  const btn = downloadButtons.nth(i);
  const visible = await btn.isVisible().catch(() => false);
  if (!visible) continue;
  console.log(`clicking download button #${i}`);
  await btn.click({ force: true }).catch(() => {});
  await page.waitForTimeout(2500);
  // poll Downloads
  for (let j = 0; j < 8; j++) {
    await page.waitForTimeout(1000);
    const now = await readdir(DOWNLOADS_DIR).catch(() => [] as string[]);
    const candidates = now.filter((f) => !before.has(f) && f.endsWith(".json"));
    if (candidates.length > 0) {
      const newest = (
        await Promise.all(
          candidates.map(async (f) => ({ f, m: (await stat(join(DOWNLOADS_DIR, f))).mtimeMs })),
        )
      ).sort((a, b) => b.m - a.m)[0].f;
      const filePath = join(DOWNLOADS_DIR, newest);
      console.log(`got ${filePath}`);
      const json = JSON.parse(await readFile(filePath, "utf-8"));
      const root = json.web ?? json.installed ?? {};
      const clientId: string | undefined = root.client_id;
      const clientSecret: string | undefined = root.client_secret;
      if (clientId && clientSecret) {
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
        console.log(`.env.local updated with both clientId + clientSecret`);
        downloaded = true;
        break;
      }
    }
  }
  if (downloaded) break;
}

if (!downloaded) {
  console.error("Couldn't trigger or read a downloaded secret.");
  await shot("99-fail");
  process.exit(1);
}

await browser.close().catch(() => {});
