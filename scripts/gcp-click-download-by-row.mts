// Find the row containing the masked NEW secret (****zG54), get its
// bounding box, and click roughly where the download icon sits (the 2nd
// icon out of 3 to the right of the masked value).
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

// Make sure we're on the detail page; reload if not
const wantedBase =
  "/auth/clients/531230694664-r4ckfth2r16psa1la169da0364cqgd6f.apps.googleusercontent.com";
if (!page.url().includes(wantedBase)) {
  await page.goto(
    `https://console.cloud.google.com${wantedBase}?project=gmail-mcp-personal-495520`,
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForTimeout(3000);
}

await shot("00-detail");

// Find the bounding box of the NEW secret value display (e.g., text "****zG54")
const secretCell = page.locator('text=/\\*\\*\\*\\*[a-zA-Z0-9]{4,8}/').last();
const secretBox = await secretCell.boundingBox().catch(() => null);
if (!secretBox) {
  console.error("Couldn't find the masked secret cell");
  process.exit(1);
}
console.log(`secret cell box: ${JSON.stringify(secretBox)}`);

// Snapshot Downloads folder before clicking
const beforeFiles = await readdir(DOWNLOADS_DIR).catch(() => [] as string[]);
const before = new Set(beforeFiles);

// The icons sit immediately to the right of the secret cell. The cell width
// extends to the masked value; from screenshot the masked text is at ~x=1665
// and the three icons are at ~x=1770 (copy), 1805 (download), 1840 (delete).
// We click roughly the middle icon = secret_cell.x + secret_cell.width + ~140
const baseX = secretBox.x + secretBox.width;
const clickX = baseX + 140; // the download icon is ~140px past the masked value
const clickY = secretBox.y + secretBox.height / 2;

// First click at the copy icon (closer in, ~100px)
const tries = [
  { dx: 140, label: "guess-download" }, // ~download
  { dx: 105, label: "guess-copy" }, // ~copy
  { dx: 175, label: "guess-trash" }, // ~delete (don't actually want this)
];

// Try only the download position (dx=140). If nothing happens, fall back.
let downloaded: string | null = null;
for (const t of tries.slice(0, 1)) {
  const x = baseX + t.dx;
  const y = clickY;
  console.log(`Clicking at (${x}, ${y}) — ${t.label}`);
  await page.mouse.click(x, y);
  await page.waitForTimeout(2500);
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(1000);
    const now = await readdir(DOWNLOADS_DIR).catch(() => [] as string[]);
    const candidates = now.filter((f) => !before.has(f) && f.endsWith(".json"));
    if (candidates.length > 0) {
      const newest = (
        await Promise.all(
          candidates.map(async (f) => ({ f, m: (await stat(join(DOWNLOADS_DIR, f))).mtimeMs })),
        )
      ).sort((a, b) => b.m - a.m)[0].f;
      downloaded = join(DOWNLOADS_DIR, newest);
      break;
    }
  }
  if (downloaded) break;
}

if (!downloaded) {
  console.error("Download didn't trigger from coordinate click.");
  await shot("01-no-download");
  process.exit(2);
}

console.log(`downloaded: ${downloaded}`);
const json = JSON.parse(await readFile(downloaded, "utf-8"));
const root = json.web ?? json.installed ?? {};
const clientId: string | undefined = root.client_id;
const clientSecret: string | undefined = root.client_secret;

if (!clientId || !clientSecret) {
  console.error("client_id or client_secret missing in JSON");
  process.exit(3);
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
console.log(".env.local updated with both clientId + clientSecret.");

await browser.close().catch(() => {});
