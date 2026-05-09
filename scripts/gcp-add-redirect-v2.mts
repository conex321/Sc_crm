// More careful: add http://localhost:53682/oauth/callback and explicitly
// confirm the save persisted by reloading.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const REDIRECT_URI = "http://localhost:53682/oauth/callback";
const SHOTS = ".playwright-shots";
await mkdir(SHOTS, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages()[0];
console.log("starting page:", page.url());

await page.goto(
  "https://console.cloud.google.com/auth/clients/489266381443-vqdbp0n929pdjlj6tehpba7rtvci0e6n.apps.googleusercontent.com?project=schoolconex-crm",
  { waitUntil: "domcontentloaded" },
);
await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(2000);
console.log("now on:", page.url());

// Click the SECOND "Add URI" button (under Authorized redirect URIs).
console.log("clicking redirect-URI 'Add URI'…");
const addPos = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll("button, [role='button']"));
  const ad = btns.filter((b) => /^\+?\s*Add URI$/i.test((b.textContent || "").trim()));
  const sorted = ad
    .map((b) => {
      const r = (b as HTMLElement).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
    })
    .filter((b) => b.w > 0)
    .sort((a, b) => a.y - b.y);
  return sorted.length >= 2 ? { x: sorted[1].x, y: sorted[1].y } : null;
});
if (!addPos) throw new Error("redirect 'Add URI' not found");
await page.mouse.click(addPos.x, addPos.y);
await page.waitForTimeout(800);

// Find the new empty input — placeholder includes "https://www.example.com"
const inputPos = await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll("input"));
  const empty = inputs
    .filter((i) => i.value === "" && /www\.example\.com|URL/i.test(i.getAttribute("placeholder") || ""))
    .map((i) => {
      const r = i.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
    })
    .filter((b) => b.w > 0);
  return empty.length > 0 ? empty[empty.length - 1] : null;
});
if (!inputPos) throw new Error("empty redirect URI input not found");

await page.mouse.click(inputPos.x, inputPos.y);
await page.waitForTimeout(200);
await page.keyboard.type(REDIRECT_URI, { delay: 8 });
// Tab away to commit input
await page.keyboard.press("Tab");
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOTS}/v2-01-typed.png`, fullPage: true });

// Verify both URIs are present
const beforeSave = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("input"))
    .map((i) => i.value)
    .filter((v) => v && v.startsWith("http"));
});
console.log("URIs before save:", beforeSave);

// Scroll all the way down — Save button is at very bottom
await page.evaluate(() => {
  const scroller = document.scrollingElement || document.body;
  scroller.scrollTop = scroller.scrollHeight;
});
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOTS}/v2-02-scrolled.png`, fullPage: true });

// Find Save button (only one — type=submit). Use scrollIntoView + Playwright
// click so the button is reliably hit even if our manual scroll left a gap.
const saveLoc = page.locator('button[type="submit"]:has-text("Save")').first();
await saveLoc.waitFor({ state: "visible", timeout: 10_000 });
await saveLoc.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
const sb = await saveLoc.boundingBox();
console.log("save bbox:", sb);
await saveLoc.click();
console.log("clicked save, waiting…");
await page.waitForTimeout(5000);
await page.screenshot({ path: `${SHOTS}/v2-03-after-save.png`, fullPage: true });

// Reload page to verify persistence
console.log("reloading to verify…");
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/v2-04-reloaded.png`, fullPage: true });

const afterReload = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("input"))
    .map((i) => i.value)
    .filter((v) => v && v.startsWith("http"));
});
console.log("URIs after reload:", afterReload);

await browser.close();
