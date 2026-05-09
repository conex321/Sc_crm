// Connect to the running headed Chrome (started by browser-launch.mts) over CDP
// and report what's on screen. Saves a screenshot so Claude can "see" the page.
//
// Run: tsx scripts/gcp-probe.mts [task]
//   tasks:
//     status        — default; report URL + signed-in account + page title
//     screenshot    — full-page screenshot to .playwright-shots/<timestamp>.png
//     credentials   — navigate to APIs & Services → Credentials, list OAuth clients
//     iam           — navigate to IAM → Service accounts, list them
//     drive         — open drive.google.com
//     <url>         — navigate to a specific URL
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const SHOT_DIR = resolve(process.cwd(), ".playwright-shots");
const task = process.argv[2] ?? "status";

await mkdir(SHOT_DIR, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
if (!ctx) throw new Error("No context found — is browser-launch.mts running?");
let page = ctx.pages().find((p) => !p.url().startsWith("chrome://")) ?? ctx.pages()[0];
if (!page) page = await ctx.newPage();

async function shot(label: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const file = resolve(SHOT_DIR, `${ts}-${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`screenshot: ${file}`);
}

async function status() {
  const url = page.url();
  const title = await page.title();
  console.log(JSON.stringify({ url, title }, null, 2));
  // Try to detect signed-in account from the GCP page chrome
  try {
    const account = await page.evaluate(() => {
      const aria = document.querySelector(
        '[aria-label*="Google Account"], [aria-label*="@"], [data-email]',
      );
      const dataEmail = (aria as HTMLElement | null)?.getAttribute("data-email");
      const ariaLabel = (aria as HTMLElement | null)?.getAttribute("aria-label");
      const match = ariaLabel?.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      return dataEmail ?? match?.[0] ?? null;
    });
    if (account) console.log(`signed-in account: ${account}`);
  } catch {
    // ignore
  }
}

if (task === "status") {
  await status();
  await shot("status");
} else if (task === "screenshot") {
  await shot("manual");
} else if (task === "credentials") {
  await page.goto("https://console.cloud.google.com/apis/credentials", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2500);
  await status();
  await shot("credentials");
  // Try to scrape the OAuth 2.0 Client IDs table
  const rows = await page.evaluate(() => {
    const out: { name: string; clientId: string; type: string; created?: string }[] = [];
    const tables = document.querySelectorAll("table");
    for (const t of tables) {
      const rows = t.querySelectorAll("tr");
      for (const r of rows) {
        const cells = Array.from(r.querySelectorAll("td")).map((c) => c.innerText.trim());
        if (cells.length >= 3 && /OAuth/i.test(cells.join(" "))) {
          out.push({ name: cells[0], type: cells[1], clientId: cells[2], created: cells[3] });
        }
        if (cells.length >= 3 && /\.apps\.googleusercontent\.com/.test(cells.join(" "))) {
          const idCell = cells.find((c) => /\.apps\.googleusercontent\.com/.test(c)) ?? "";
          out.push({ name: cells[0], type: cells[1] ?? "", clientId: idCell });
        }
      }
    }
    return out;
  });
  console.log("OAuth client rows scraped:", JSON.stringify(rows, null, 2));
} else if (task === "iam") {
  await page.goto("https://console.cloud.google.com/iam-admin/serviceaccounts", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2500);
  await status();
  await shot("iam-service-accounts");
  const accounts = await page.evaluate(() => {
    const out: { email: string; name?: string }[] = [];
    document.querySelectorAll("a, td").forEach((el) => {
      const text = (el as HTMLElement).innerText;
      const m = text?.match(/[\w.+-]+@[\w-]+\.iam\.gserviceaccount\.com/);
      if (m) out.push({ email: m[0] });
    });
    // dedupe
    const seen = new Set<string>();
    return out.filter((a) => (seen.has(a.email) ? false : (seen.add(a.email), true)));
  });
  console.log("Service accounts:", JSON.stringify(accounts, null, 2));
} else if (task === "drive") {
  await page.goto("https://drive.google.com/drive/my-drive", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2500);
  await status();
  await shot("drive");
} else if (task.startsWith("http")) {
  await page.goto(task, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await status();
  await shot("nav");
} else {
  console.error(`unknown task: ${task}`);
  process.exit(2);
}

await browser.close().catch(() => {}); // detach without killing the headed browser
