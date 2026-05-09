// Navigate to the Clients list, find the "SchoolConex CRM (Drive)" row,
// click it, capture the actual Client ID + secret on the detail page.
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const SHOT_DIR = resolve(process.cwd(), ".playwright-shots");
const ENV_FILE = resolve(process.cwd(), ".env.local");
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

await page.goto("https://console.cloud.google.com/auth/clients?project=gmail-mcp-personal-495520", {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(3000);
await shot("01-clients-list");

// Take innerText of every table row to enumerate clients
const rows = await page.locator('tr').evaluateAll((nodes) =>
  nodes.map((n) => (n as HTMLElement).innerText).filter((t) => t && t.includes("googleusercontent.com")),
);
console.log("Client rows on page:");
for (const r of rows) console.log("  " + r.replace(/\n/g, " | "));

// Click the row containing "SchoolConex CRM" (the new Web client)
const rowLink = page.locator('a:has-text("SchoolConex CRM")').first();
await rowLink.waitFor({ state: "visible", timeout: 5000 });
await rowLink.click();
await page.waitForLoadState("domcontentloaded");
await page.waitForTimeout(3000);
await shot("02-detail");

// Read the URL — it should now contain the real client ID
const url = page.url();
console.log(`detail URL: ${url}`);
const idFromUrl = url.match(/\/auth\/clients\/([^?]+)/)?.[1];
const clientId = idFromUrl ? decodeURIComponent(idFromUrl) : null;
console.log(`clientId from URL: ${clientId}`);

// Look for the secret. The new Auth Platform UI displays the most recent
// secret hash but masks the value. Try clicking any "Show" button or the
// "Add a secret" button if no secret exists yet.
let pageText = await page.locator("body").innerText();
let clientSecret: string | null = pageText.match(/GOCSPX-[\w-]+/)?.[0] ?? null;

if (!clientSecret) {
  // Try clicking copy/show buttons near the secret field
  const showBtns = page.locator(
    'button:has-text("Show"), button:has-text("View"), [aria-label*="Show secret" i], [aria-label*="View secret" i]',
  );
  const c = await showBtns.count();
  for (let i = 0; i < c; i++) {
    await showBtns.nth(i).click({ force: true }).catch(() => {});
  }
  await page.waitForTimeout(800);
  pageText = await page.locator("body").innerText();
  clientSecret = pageText.match(/GOCSPX-[\w-]+/)?.[0] ?? null;
}

await shot("03-detail-after-show");
console.log(`secret on detail page: ${clientSecret ? "FOUND" : "not visible"}`);

if (!clientSecret) {
  console.log("Secret not visible — looking for an 'Add secret' / 'Add a secret' button…");
  const addSecret = page.locator(
    'button:has-text("Add secret"), button:has-text("Add a secret"), button:has-text("Add Secret"), button:has-text("Create new secret"), button:has-text("Generate new secret")',
  ).first();
  if (await addSecret.isVisible().catch(() => false)) {
    await addSecret.click({ force: true });
    await page.waitForTimeout(2000);
    await shot("04-after-add-secret");
    // confirm any modal
    const confirmBtn = page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("Confirm")').last();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2500);
    }
    pageText = await page.locator("body").innerText();
    clientSecret = pageText.match(/GOCSPX-[\w-]+/)?.[0] ?? null;
    await shot("05-after-confirm");
    console.log(`secret after add: ${clientSecret ? "FOUND" : "still missing"}`);
  } else {
    console.log("No 'Add secret' button visible.");
  }
}

// Fix .env.local — remove any wrong stale value first
let env = await readFile(ENV_FILE, "utf-8").catch(() => "");
const lines = env.split(/\r?\n/);
let foundId = false;
let foundSecret = false;
const out = lines.map((line) => {
  if (line.startsWith("GOOGLE_OAUTH_CLIENT_ID=")) {
    foundId = true;
    return clientId ? `GOOGLE_OAUTH_CLIENT_ID=${clientId}` : line;
  }
  if (line.startsWith("GOOGLE_OAUTH_CLIENT_SECRET=")) {
    foundSecret = true;
    return clientSecret ? `GOOGLE_OAUTH_CLIENT_SECRET=${clientSecret}` : line;
  }
  return line;
});
if (clientId && !foundId) out.push(`GOOGLE_OAUTH_CLIENT_ID=${clientId}`);
if (clientSecret && !foundSecret) out.push(`GOOGLE_OAUTH_CLIENT_SECRET=${clientSecret}`);
await writeFile(ENV_FILE, out.join("\n"), "utf-8");
console.log(
  `.env.local updated — clientId=${clientId ? "set" : "MISSING"}, clientSecret=${clientSecret ? "set" : "MISSING"}`,
);

await browser.close().catch(() => {});
