// Capture a screenshot of the current page state.
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("drive.google.com")) ?? ctx.pages()[0];
await page.bringToFront();
await page.screenshot({ path: ".playwright-shots/snap-now.png", fullPage: true });
console.log("URL:", page.url());
await browser.close();
