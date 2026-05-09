// Drives the open Chrome (CDP) to create a Shared Drive named "SchoolConex CRM".
// Requires the user to already be signed in to drive.google.com.
//
// Strategy: navigate to /drive/shared-drives, click the "+ New" / "New shared
// drive" button, type the name, click Create. Then read the new shared drive's
// URL and print its ID.
import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";

const SHARED_DRIVE_NAME = "SchoolConex CRM";
const SHOTS = ".playwright-shots";

await mkdir(SHOTS, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page =
  ctx.pages().find((p) => p.url().includes("drive.google.com")) ?? ctx.pages()[0];

console.log(`Active page: ${page.url()}`);
await page.bringToFront();
await page.goto("https://drive.google.com/drive/shared-drives", {
  waitUntil: "domcontentloaded",
});
await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
await page.screenshot({ path: `${SHOTS}/sd-00-list.png`, fullPage: true });

console.log("Looking for the New button…");

async function clickNew(page: Page) {
  // Drive's left rail renders two "+ New" buttons (one collapsed/hidden,
  // one visible). Find the visible one — the one with non-zero bounding
  // rect — and click via mouse coords so React/Material handlers fire.
  const center = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
    const news = buttons.filter((b) => (b.textContent ?? "").trim() === "New");
    for (const b of news) {
      const r = (b as HTMLElement).getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
    return null;
  });
  if (!center) throw new Error("Visible '+ New' button not found");
  await page.mouse.click(center.x, center.y);
}

await clickNew(page);
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOTS}/sd-01-after-new.png`, fullPage: true });

console.log("Looking for the Create dialog…");

// "+ New" opens a Material dialog titled "New shared drive". Drive renders
// many [role=dialog] wrappers up-front (most aria-hidden); pick the one
// containing the heading text.
const dialog = page
  .locator('[role="dialog"]', { hasText: "New shared drive" })
  .first();
await dialog.waitFor({ state: "visible", timeout: 15_000 });
await page.screenshot({ path: `${SHOTS}/sd-02-dialog.png`, fullPage: true });

const nameInput = dialog.locator('input[type="text"], input').first();
await nameInput.click();
await nameInput.fill(SHARED_DRIVE_NAME);
await page.screenshot({ path: `${SHOTS}/sd-03-name.png`, fullPage: true });

const createBtn = dialog.locator('button:has-text("Create"), [role="button"]:has-text("Create")').first();
await createBtn.click();
await page.screenshot({ path: `${SHOTS}/sd-04-created.png`, fullPage: true });

// Wait for the page to navigate into the new shared drive (URL contains
// /drive/folders/<id>) OR a panel showing the new drive
await page.waitForURL(/drive\.google\.com\/drive\/(folders|shared-drives)\//, {
  timeout: 20_000,
});
await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
await page.screenshot({ path: `${SHOTS}/sd-05-inside.png`, fullPage: true });

const url = page.url();
console.log(`URL after create: ${url}`);

// Extract id — Shared Drives use folders/<id> when entered.
const m = url.match(/folders\/([a-zA-Z0-9_-]+)/);
if (m) {
  console.log(`SHARED_DRIVE_ID=${m[1]}`);
} else {
  console.log(`(no id parsed from URL — inspect ${SHOTS}/sd-05-inside.png)`);
}

await browser.close();
