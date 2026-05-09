// Click the just-created Web OAuth client, add a secret, and read the
// unmasked value from the copy-to-clipboard button's aria-label.
import { chromium } from "playwright";
import { config } from "dotenv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

config({ path: ".env.local" });

const SHOT_DIR = resolve(process.cwd(), ".playwright-shots");
const ENV_FILE = resolve(process.cwd(), ".env.local");
await mkdir(SHOT_DIR, { recursive: true });

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID ?? "schoolconex-crm";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => !p.url().startsWith("chrome://")) ?? ctx.pages()[0];

async function shot(label: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  await page.screenshot({ path: resolve(SHOT_DIR, `${ts}-${label}.png`) });
}

await page.goto(`https://console.cloud.google.com/auth/clients?project=${PROJECT_ID}`, {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(3500);
await shot("01-clients");

// Click the SchoolConex CRM (Drive) row
const rowLink = page.locator('a:has-text("SchoolConex CRM")').first();
await rowLink.waitFor({ state: "visible", timeout: 8000 });
await rowLink.click({ force: true });
await page.waitForLoadState("domcontentloaded");
await page.waitForTimeout(3500);
await shot("02-detail");

// Capture client ID from URL
const url = page.url();
const idFromUrl = url.match(/\/auth\/clients\/([^?]+)/)?.[1];
const clientId = idFromUrl ? decodeURIComponent(idFromUrl) : null;
console.log(`clientId: ${clientId}`);

// Scroll to bottom for the secrets area
await page.evaluate(() =>
  window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" as ScrollBehavior }),
);
await page.waitForTimeout(800);

// First check if there's already a secret with a copy button (shouldn't be on a brand new client, but defensive)
let aria = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button"));
  for (const b of btns) {
    const al = b.getAttribute("aria-label") ?? "";
    if (/Copy to clipboard:\s*GOCSPX-/i.test(al)) return al;
  }
  return null;
});
let clientSecret = aria ? aria.match(/GOCSPX-[\w-]+/)?.[0] ?? null : null;
console.log(`existing secret: ${clientSecret ? "FOUND" : "none"}`);

// If no secret yet, click "Add secret"
if (!clientSecret) {
  const addBtn = page.locator('button:has-text("Add secret"), button:has-text("Add a secret")').first();
  if (await addBtn.isVisible().catch(() => false)) {
    console.log("Clicking Add secret…");
    await addBtn.click({ force: true });
    await page.waitForTimeout(2500);
    // Confirm modal
    const confirm = page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("Confirm")').last();
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2500);
    }
    await shot("03-after-add-secret");
    aria = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      for (const b of btns) {
        const al = b.getAttribute("aria-label") ?? "";
        if (/Copy to clipboard:\s*GOCSPX-/i.test(al)) return al;
      }
      return null;
    });
    clientSecret = aria ? aria.match(/GOCSPX-[\w-]+/)?.[0] ?? null : null;
    console.log(`secret after add: ${clientSecret ? "FOUND" : "still missing"}`);
  }
}

if (!clientId || !clientSecret) {
  console.error(`Missing — clientId=${clientId ?? "?"}, clientSecret=${clientSecret ?? "?"}`);
  await shot("99-missing");
  process.exit(1);
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
console.log(`.env.local: clientId+secret written.`);
await browser.close().catch(() => {});
