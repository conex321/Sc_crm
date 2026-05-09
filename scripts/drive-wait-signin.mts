// Polls the open Chrome (CDP) until the user finishes Google sign-in and lands
// on drive.google.com/drive/shared-drives (or any drive.google.com page).
// Reports the signed-in account email by reading the account chip.
import { chromium } from "playwright";

const ws = "http://127.0.0.1:9222";
const browser = await chromium.connectOverCDP(ws);
const ctx = browser.contexts()[0];
const pages = ctx.pages();
const drivePage =
  pages.find((p) => p.url().includes("drive.google.com") || p.url().includes("accounts.google.com")) ??
  pages[0];

console.log(`Watching ${drivePage.url()}`);

const deadline = Date.now() + 1000 * 60 * 10; // 10 min
let lastUrl = "";
while (Date.now() < deadline) {
  const url = drivePage.url();
  if (url !== lastUrl) {
    console.log(`url -> ${url}`);
    lastUrl = url;
  }
  if (/drive\.google\.com\/drive(\/|$)/.test(url) && !url.includes("signin")) {
    console.log("Drive reached. Reading account chip…");
    try {
      const email = await drivePage
        .locator('[aria-label*="@" i], a[aria-label*="Account" i]')
        .first()
        .getAttribute("aria-label", { timeout: 5000 });
      if (email) console.log(`account chip: ${email}`);
    } catch {
      // chip is best-effort; sign-in is the real signal
    }
    console.log("✓ Signed-in to Drive.");
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 2000));
}
console.error("Timed out waiting for Drive sign-in.");
process.exit(2);
