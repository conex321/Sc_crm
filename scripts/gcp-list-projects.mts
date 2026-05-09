// Open the Cloud Resource Manager and list projects matthew@schoolconex.com
// has access to. Don't click anything destructive — just enumerate.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const SHOT_DIR = resolve(process.cwd(), ".playwright-shots");
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
await shot("01-project-selector");
const text = (await page.locator("body").innerText()).slice(0, 6000);
console.log(text);

await browser.close().catch(() => {});
