// Enable Drive + Docs APIs in the gmail-mcp-personal project. Sticks the
// project context first by visiting the dashboard before going to library URLs.
import { chromium } from "playwright";
import { config } from "dotenv";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

config({ path: ".env.local" });

const SHOT_DIR = resolve(process.cwd(), ".playwright-shots");
await mkdir(SHOT_DIR, { recursive: true });

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID ?? "schoolconex-crm";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => !p.url().startsWith("chrome://")) ?? ctx.pages()[0];

async function shot(label: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const file = resolve(SHOT_DIR, `${ts}-${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`shot: ${file}`);
}

// 1. Set project context via dashboard URL
console.log("Setting project context…");
await page.goto(`https://console.cloud.google.com/home/dashboard?project=${PROJECT_ID}`, {
  waitUntil: "domcontentloaded",
});
await page.waitForTimeout(4000);
await shot("01-dashboard");

const apis = ["drive.googleapis.com", "docs.googleapis.com"];
for (const api of apis) {
  console.log(`\n=== ${api} ===`);
  await page.goto(`https://console.cloud.google.com/apis/library/${api}?project=${PROJECT_ID}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(7000);
  await shot(`02-${api}-loaded`);

  // Use page.evaluate to find a visible button whose exact text is "Enable" or "Manage"
  const action = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("button, a"));
    const visible = all.filter((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (el as HTMLElement).offsetParent !== null;
    });
    const enable = visible.find((el) => /^Enable$/.test((el as HTMLElement).innerText.trim()));
    if (enable) {
      (enable as HTMLElement).click();
      return "enabled";
    }
    const manage = visible.find((el) => /^Manage$/.test((el as HTMLElement).innerText.trim()));
    if (manage) return "already";
    return "none";
  });
  console.log(`${api}: action=${action}`);
  if (action === "enabled") {
    await page.waitForTimeout(10_000);
    await shot(`03-${api}-enabled`);
  } else if (action === "none") {
    await shot(`99-${api}-no-button`);
  }
}

await browser.close().catch(() => {});
