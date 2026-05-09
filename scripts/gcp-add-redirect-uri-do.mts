// Click the second "Add URI" button under "Authorized redirect URIs",
// type the loopback callback URL, then click Save.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const REDIRECT_URI = "http://localhost:53682/oauth/callback";
const SHOTS = ".playwright-shots";
await mkdir(SHOTS, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => /console\.cloud\.google\.com/.test(p.url())) ?? ctx.pages()[0];
console.log("page:", page.url());

// Dismiss the cookie banner if visible
const cookiePos = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button, [role='button']"));
  for (const b of btns) {
    const t = (b.textContent || "").trim();
    if (/^OK, got it$/i.test(t)) {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
  }
  return null;
});
if (cookiePos) {
  console.log("dismissing cookie banner");
  await page.mouse.click(cookiePos.x, cookiePos.y);
  await page.waitForTimeout(500);
}

// Find the SECOND "Add URI" button — the one for Authorized redirect URIs.
// (The first is for JS origins.)
console.log("locating redirect-URI 'Add URI' button…");
const addPos = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button, [role='button']"));
  const ad = btns.filter((b) => /^\+?\s*Add URI$/i.test((b.textContent || "").trim()));
  // Sort by y, return the second
  const sorted = ad
    .map((b) => {
      const r = (b as HTMLElement).getBoundingClientRect();
      return { el: b, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
    })
    .filter((b) => b.w > 0)
    .sort((a, b) => a.y - b.y);
  if (sorted.length < 2) return null;
  return { x: sorted[1].x, y: sorted[1].y, count: sorted.length };
});
console.log("redirect Add URI:", addPos);
if (!addPos) throw new Error("Couldn't find second Add URI button");

await page.mouse.click(addPos.x, addPos.y);
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOTS}/redir-01-input.png`, fullPage: true });

// Find the empty input below "Authorized redirect URIs". A new input should
// appear after clicking Add URI. Pick the LAST input with placeholder
// "https://www.example.com" (i.e., the newly-added one).
const inputPos = await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll("input"));
  const empty = inputs
    .filter((i) => i.value === "" && /www\.example\.com|URL/i.test(i.getAttribute("placeholder") || ""))
    .map((i) => {
      const r = i.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
    })
    .filter((b) => b.w > 0);
  return empty.length > 0 ? empty[empty.length - 1] : null;
});
console.log("input target:", inputPos);
if (!inputPos) throw new Error("No empty redirect URI input found");

await page.mouse.click(inputPos.x, inputPos.y);
await page.waitForTimeout(200);
await page.keyboard.type(REDIRECT_URI, { delay: 8 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}/redir-02-typed.png`, fullPage: true });

// Save: scroll down, find the Save button at the bottom
console.log("scrolling to find Save…");
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(500);
const savePos = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button, [role='button']"));
  const ds = btns.filter((b) => /^Save$/i.test((b.textContent || "").trim()));
  // Pick the visible one
  for (const b of ds) {
    const r = (b as HTMLElement).getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
  }
  return null;
});
console.log("save:", savePos);
if (!savePos) throw new Error("Save button not found");
await page.mouse.click(savePos.x, savePos.y);
await page.waitForTimeout(3000);
await page.screenshot({ path: `${SHOTS}/redir-03-saved.png`, fullPage: true });

console.log("Done. Inspect redir-*.png");
await browser.close();
