// Add both Gmail OAuth callback URIs to the schoolconex-crm OAuth Web client.
// Idempotent: skips URIs that are already registered.
//
// Requires the persistent headed Chrome to be running on CDP port 9222
// (launch via `npx tsx scripts/browser-launch.mts`) and signed in as
// matthew@schoolconex.com.
//
// Usage: npx tsx scripts/gcp-add-gmail-redirect-uris.mts
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const URIS_TO_ADD = [
  "https://sc-crm-sand.vercel.app/auth/gmail-callback",
  "http://localhost:3000/auth/gmail-callback",
];

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

// Read current URIs to see which we already have.
const existing = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("input"))
    .map((i) => i.value)
    .filter((v) => v && v.startsWith("http"));
});
console.log("existing URIs:", existing);

const toAdd = URIS_TO_ADD.filter((u) => !existing.includes(u));
if (toAdd.length === 0) {
  console.log("all target URIs already present — nothing to do");
  await browser.close();
  process.exit(0);
}

for (const uri of toAdd) {
  console.log(`adding: ${uri}`);
  // Click second "Add URI" button (under Authorized redirect URIs).
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
  if (!addPos) throw new Error("redirect 'Add URI' button not found");
  await page.mouse.click(addPos.x, addPos.y);
  await page.waitForTimeout(800);

  const inputPos = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll("input"));
    const empty = inputs
      .filter(
        (i) =>
          i.value === "" &&
          /www\.example\.com|URL/i.test(i.getAttribute("placeholder") || ""),
      )
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
  await page.keyboard.type(uri, { delay: 8 });
  await page.keyboard.press("Tab");
  await page.waitForTimeout(500);
}

await page.screenshot({ path: `${SHOTS}/gmail-redirect-01-typed.png`, fullPage: true });

const beforeSave = await page.evaluate(() =>
  Array.from(document.querySelectorAll("input"))
    .map((i) => i.value)
    .filter((v) => v && v.startsWith("http")),
);
console.log("URIs before save:", beforeSave);

await page.evaluate(() => {
  const s = document.scrollingElement || document.body;
  s.scrollTop = s.scrollHeight;
});
await page.waitForTimeout(500);

const saveLoc = page.locator('button[type="submit"]:has-text("Save")').first();
await saveLoc.waitFor({ state: "visible", timeout: 10_000 });
await saveLoc.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await saveLoc.click();
console.log("clicked save, waiting…");
await page.waitForTimeout(5000);
await page.screenshot({ path: `${SHOTS}/gmail-redirect-02-after-save.png`, fullPage: true });

console.log("reloading to verify…");
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/gmail-redirect-03-reloaded.png`, fullPage: true });

const after = await page.evaluate(() =>
  Array.from(document.querySelectorAll("input"))
    .map((i) => i.value)
    .filter((v) => v && v.startsWith("http")),
);
console.log("URIs after reload:", after);

const missing = URIS_TO_ADD.filter((u) => !after.includes(u));
if (missing.length > 0) {
  console.error("MISSING after save:", missing);
  process.exit(2);
}
console.log("all target URIs present ✓");

await browser.close();
