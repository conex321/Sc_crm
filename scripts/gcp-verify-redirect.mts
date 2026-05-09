// Reload the OAuth client edit page and report the current redirect URIs.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

await mkdir(".playwright-shots", { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];

await page.goto(
  "https://console.cloud.google.com/auth/clients/489266381443-vqdbp0n929pdjlj6tehpba7rtvci0e6n.apps.googleusercontent.com?project=schoolconex-crm",
  { waitUntil: "domcontentloaded" },
);
await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(2000);
await page.screenshot({ path: ".playwright-shots/verify-redir.png", fullPage: true });

const inputs = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("input"))
    .map((i) => ({
      value: i.value,
      placeholder: i.getAttribute("placeholder"),
      ariaLabel: i.getAttribute("aria-label"),
    }))
    .filter((i) => i.value || /URL|example/i.test(i.placeholder || ""));
});
console.log("inputs:", JSON.stringify(inputs, null, 2));

await browser.close();
