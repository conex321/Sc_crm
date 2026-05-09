// 1. Save the known Client ID from the modal
// 2. Click OK to dismiss
// 3. Navigate to the client edit page (Auth Platform UI)
// 4. Read or regenerate the secret
// 5. Persist both to .env.local
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

// 1. Try to read the client id from the modal (may already be visible)
const modalText = await page.locator('[role="dialog"], mat-dialog-container').first().innerText().catch(() => "");
let clientId: string | null = modalText.match(/[\w-]+\.apps\.googleusercontent\.com/)?.[0] ?? null;
console.log(`clientId from modal: ${clientId ?? "(none)"}`);

// 2. Click OK by coordinate (we know it's the bottom-right of the dialog)
const dialog = page.locator('[role="dialog"], mat-dialog-container').first();
if (await dialog.isVisible().catch(() => false)) {
  const box = await dialog.boundingBox();
  if (box) {
    // The OK button sits at roughly (box.x + box.width - 60, box.y + box.height - 35)
    await page.mouse.click(box.x + box.width - 60, box.y + box.height - 35);
    await page.waitForTimeout(800);
  }
}
await shot("after-ok");

// 3. Fallback if we still don't have a client ID: scrape the Clients list page
if (!clientId) {
  await page.goto("https://console.cloud.google.com/auth/clients?project=gmail-mcp-personal-495520", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2500);
  const html = await page.content();
  const ids = Array.from(html.matchAll(/[\w-]+\.apps\.googleusercontent\.com/g)).map((m) => m[0]);
  // Pick the newest (longest hex stretch in the suffix is a heuristic — instead pick by name)
  // we want the SchoolConex CRM (Drive) client. Find row by name.
  const targetRow = await page.locator('a:has-text("SchoolConex CRM"), tr:has-text("SchoolConex CRM")').first();
  if (await targetRow.isVisible().catch(() => false)) {
    const text = await targetRow.innerText();
    const m = text.match(/[\w-]+\.apps\.googleusercontent\.com/);
    if (m) clientId = m[0];
  }
  if (!clientId && ids.length > 0) clientId = ids[ids.length - 1];
}

if (!clientId) {
  console.error("Couldn't determine clientId");
  process.exit(2);
}
console.log(`Using clientId: ${clientId}`);

// 4. Navigate to the client edit page
await page.goto(
  `https://console.cloud.google.com/auth/clients/${encodeURIComponent(clientId)}?project=gmail-mcp-personal-495520`,
  { waitUntil: "domcontentloaded" },
);
await page.waitForTimeout(3000);
await shot("client-edit");

// 5. Try to extract the secret from the edit page.
//    On the Auth Platform UI, the secret often appears under a "Client secrets"
//    section as a masked value with a "Show"/"Copy" button.
let clientSecret: string | null = null;

// Try clicking any "Show"/"View" toggles
const showBtns = page.locator('button:has-text("Show"), button:has-text("View"), button[aria-label*="Show"]');
const showCount = await showBtns.count();
for (let i = 0; i < showCount; i++) {
  await showBtns.nth(i).click({ force: true }).catch(() => {});
}
await page.waitForTimeout(800);

// Now read the page text and look for GOCSPX
const pageText = await page.locator("body").innerText();
clientSecret = pageText.match(/GOCSPX-[\w-]+/)?.[0] ?? null;
console.log(`secret on edit page: ${clientSecret ? "found" : "not visible"}`);

await shot("client-edit-with-secret");

// 6. If still no secret, REGENERATE it (we can do this on the edit page)
if (!clientSecret) {
  console.log("Trying to regenerate secret…");
  // The new UI hides the "create new secret" / "rotate secret" affordance under
  // a "Add Secret" or similar button. Look for it.
  const rotateCandidates = [
    'button:has-text("Add secret")',
    'button:has-text("Create new secret")',
    'button:has-text("Reset secret")',
    'button:has-text("Generate new secret")',
    'button:has-text("Add a new secret")',
  ];
  for (const sel of rotateCandidates) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ force: true });
      await page.waitForTimeout(2000);
      // confirm modal if any
      const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Add")').last();
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(1500);
      }
      // re-scrape
      const t2 = await page.locator("body").innerText();
      clientSecret = t2.match(/GOCSPX-[\w-]+/)?.[0] ?? null;
      if (clientSecret) {
        console.log(`secret after rotate via ${sel}: found`);
        break;
      }
    }
  }
  await shot("client-edit-after-rotate");
}

// 7. Save what we have
let env = await readFile(ENV_FILE, "utf-8").catch(() => "");
const lines = env.split(/\r?\n/);
let foundId = false;
let foundSecret = false;
const out = lines.map((line) => {
  if (line.startsWith("GOOGLE_OAUTH_CLIENT_ID=")) {
    foundId = true;
    return `GOOGLE_OAUTH_CLIENT_ID=${clientId}`;
  }
  if (clientSecret && line.startsWith("GOOGLE_OAUTH_CLIENT_SECRET=")) {
    foundSecret = true;
    return `GOOGLE_OAUTH_CLIENT_SECRET=${clientSecret}`;
  }
  return line;
});
if (!foundId) out.push(`GOOGLE_OAUTH_CLIENT_ID=${clientId}`);
if (clientSecret && !foundSecret) out.push(`GOOGLE_OAUTH_CLIENT_SECRET=${clientSecret}`);
await writeFile(ENV_FILE, out.join("\n"), "utf-8");
console.log(`.env.local updated. clientId=set, clientSecret=${clientSecret ? "set" : "MISSING"}`);

await browser.close().catch(() => {});
