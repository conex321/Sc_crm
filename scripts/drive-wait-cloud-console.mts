// Polls until the Chrome window leaves accounts.google.com and lands on
// console.cloud.google.com (post password re-auth).
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];

const deadline = Date.now() + 1000 * 60 * 10;
let lastUrl = "";
while (Date.now() < deadline) {
  const url = page.url();
  if (url !== lastUrl) {
    console.log(`url -> ${url}`);
    lastUrl = url;
  }
  if (/console\.cloud\.google\.com/.test(url) && !/accounts\.google\.com/.test(url)) {
    console.log("✓ in Cloud Console");
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 2000));
}
console.error("Timed out");
process.exit(2);
