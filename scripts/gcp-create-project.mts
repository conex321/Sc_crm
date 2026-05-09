// Create a new GCP project called "SchoolConex CRM" under the schoolconex.com
// organization, then capture its project ID.
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

await page.goto("https://console.cloud.google.com/projectcreate", {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(4000);
await shot("01-create-project-form");

// Find the Project name input
const nameInput = page.getByLabel(/Project name/i).first();
await nameInput.waitFor({ state: "visible", timeout: 10_000 });
await nameInput.click({ clickCount: 3 });
await nameInput.fill("SchoolConex CRM");
await page.waitForTimeout(800);
await shot("02-name-typed");

// Submit (Create button)
const createBtn = page.getByRole("button", { name: /^Create$/i });
await createBtn.click({ force: true });
console.log("Submitted project creation; waiting up to 60s for it to be ready…");

// GCP shows a notification when project is ready, then redirects to dashboard.
// Poll the URL for a redirect that includes ?project=schoolconex-crm-* or
// matching the new project's ID.
const start = Date.now();
let projectId: string | null = null;
while (Date.now() - start < 90_000) {
  await page.waitForTimeout(2000);
  const u = page.url();
  const m = u.match(/[?&]project=([\w-]+)/);
  if (m) {
    projectId = m[1];
    if (projectId.startsWith("schoolconex-crm")) break;
    // Sometimes redirects to the dashboard with a different project context;
    // check if we're on the new dashboard
  }
}

if (!projectId) {
  // Fallback: navigate to project list and find SchoolConex CRM by name
  await page.goto("https://console.cloud.google.com/projectselector2/home/dashboard", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(3000);
  const html = await page.content();
  const re = /SchoolConex CRM[\s\S]{0,400}?Project ID:\s*([\w-]+)/;
  const m = html.match(re);
  if (m) projectId = m[1];
}

if (!projectId) {
  console.error("Couldn't determine the new project ID");
  await shot("99-project-id-missing");
  process.exit(1);
}
console.log(`new projectId: ${projectId}`);
await shot("03-project-created");

// Persist the project ID
let env = await readFile(ENV_FILE, "utf-8").catch(() => "");
const lines = env.split(/\r?\n/);
let found = false;
const out = lines.map((line) => {
  if (line.startsWith("GOOGLE_CLOUD_PROJECT_ID=")) {
    found = true;
    return `GOOGLE_CLOUD_PROJECT_ID=${projectId}`;
  }
  return line;
});
if (!found) out.push(`GOOGLE_CLOUD_PROJECT_ID=${projectId}`);
await writeFile(ENV_FILE, out.join("\n"), "utf-8");
console.log(`.env.local: GOOGLE_CLOUD_PROJECT_ID=${projectId}`);

await browser.close().catch(() => {});
