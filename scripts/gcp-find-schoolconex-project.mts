// Find the just-created "SchoolConex CRM" project's actual project ID and
// switch the browser to it.
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

await page.goto("https://console.cloud.google.com/projectselector2/home/dashboard", {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(4000);
await shot("01-projects");
const text = await page.locator("body").innerText();

// Find SchoolConex CRM card → next "Project ID:" value
const blocks = text.split(/\n\s*\n+/);
const idx = blocks.findIndex((b) => /SchoolConex CRM/.test(b));
console.log(`block index: ${idx}`);
let projectId: string | null = null;
if (idx >= 0) {
  const surrounding = blocks.slice(idx, idx + 5).join("\n");
  console.log(`surrounding:\n${surrounding}`);
  const m = surrounding.match(/Project ID:\s*([\w-]+)/);
  if (m) projectId = m[1];
}
if (!projectId) {
  // Loop through all project ID lines and find one whose surrounding text mentions "SchoolConex CRM"
  const re = /(SchoolConex CRM[\s\S]{0,400}?)Project ID:\s*([\w-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    projectId = m[2];
    break;
  }
}

if (!projectId) {
  console.error("Couldn't find SchoolConex CRM project");
  process.exit(2);
}
console.log(`SchoolConex CRM projectId: ${projectId}`);

// Persist
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

// Switch the browser to the new project
await page.goto(`https://console.cloud.google.com/home/dashboard?project=${projectId}`, {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(3000);
await shot("02-switched");
console.log(`switched. URL: ${page.url()}`);

await browser.close().catch(() => {});
