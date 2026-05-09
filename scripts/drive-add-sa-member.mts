// Adds the SchoolConex CRM service account as a Content Manager on the
// "SchoolConex CRM" Shared Drive via the open Chrome (CDP).
//
// Strategy: open the Shared Drive page, click "Manage members", paste the
// SA email, set role to Content Manager, then Send.
import { config } from "dotenv";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

config({ path: ".env.local" });

const SHARED_DRIVE_ID = process.argv[2] ?? "0AFnM-2HvmqO2Uk9PVA";
const SA_EMAIL = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!).client_email as string;
const SHOTS = ".playwright-shots";
await mkdir(SHOTS, { recursive: true });

console.log(`Shared Drive: ${SHARED_DRIVE_ID}`);
console.log(`SA email:     ${SA_EMAIL}`);

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("drive.google.com")) ?? ctx.pages()[0];
await page.bringToFront();

await page.goto(`https://drive.google.com/drive/folders/${SHARED_DRIVE_ID}`, {
  waitUntil: "domcontentloaded",
});
await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
await page.screenshot({ path: `${SHOTS}/sa-00-inside.png`, fullPage: true });

// Click the "Manage members" link. The text appears in many wrapper DIVs
// (toolbar, panes, etc.) — pick the SMALLEST visible element containing
// only that text, which is the actual rendered link, then click it.
console.log("Clicking 'Manage members'…");
const linkBox = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll("*"));
  const matches = all.filter((b) => (b.textContent || "").trim() === "Manage members");
  let best = null;
  let bestArea = 1e12;
  for (const el of matches) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      const area = r.width * r.height;
      if (area < bestArea) {
        bestArea = area;
        best = {
          x: r.x + r.width / 2,
          y: r.y + r.height / 2,
          w: r.width,
          h: r.height,
        };
      }
    }
  }
  return best;
});
console.log("Manage members link:", linkBox);
if (!linkBox) throw new Error("'Manage members' link not visible");
await page.mouse.click(linkBox.x, linkBox.y);

// Wait for the dialog. Use the input placeholder as the dialog open signal.
const inputProbe = page.getByPlaceholder(/Add people and groups/i).first();
await inputProbe.waitFor({ state: "visible", timeout: 15_000 });
await page.screenshot({ path: `${SHOTS}/sa-01-after-mm-click.png`, fullPage: true });

const input = inputProbe;
await input.click();
await input.fill(SA_EMAIL);
await page.screenshot({ path: `${SHOTS}/sa-02-typed.png`, fullPage: true });

// Wait for autocomplete chip to settle, then commit with Enter
await page.waitForTimeout(800);
await page.keyboard.press("Enter");
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOTS}/sa-03-chip.png`, fullPage: true });

// Now grab the dialog containing the input for downstream queries.
const dialog = page.locator('[role="dialog"]').filter({ has: input });

// Set role to Content Manager. The role select is usually a button labeled
// "Editor" by default. Click it, then pick "Content manager".
console.log("Setting role to 'Content manager'…");
const roleClick = await dialog.evaluate((d) => {
  const btns = Array.from(d.querySelectorAll("button, [role='button']"));
  const roleNames = ["Editor", "Content manager", "Manager", "Viewer", "Commenter", "Contributor"];
  for (const b of btns) {
    const t = (b.textContent ?? "").trim();
    if (roleNames.some((n) => t.startsWith(n))) {
      const r = (b as HTMLElement).getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        (b as HTMLElement).click();
        return { found: true, text: t, x: r.x, y: r.y };
      }
    }
  }
  return { found: false };
});
console.log("role chip click:", roleClick);
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOTS}/sa-04-role-menu.png`, fullPage: true });

// Pick "Content manager" from the menu (rendered in a separate popup)
const cmCenter = await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], li'));
  const cm = items.filter((b) => /content manager/i.test(b.textContent ?? ""));
  for (const b of cm) {
    const r = (b as HTMLElement).getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
  }
  return null;
});
if (cmCenter) {
  await page.mouse.click(cmCenter.x, cmCenter.y);
} else {
  console.log("Could not find Content manager option; check sa-04 screenshot");
}
await page.waitForTimeout(500);
await page.screenshot({ path: `${SHOTS}/sa-05-after-role.png`, fullPage: true });

// Click Send / Share / Done
console.log("Submitting…");
const sendCenter = await dialog.evaluate((d) => {
  const btns = Array.from(d.querySelectorAll("button, [role='button']")) as HTMLElement[];
  for (const b of btns) {
    const t = (b.textContent ?? "").trim();
    if (/^(Send|Share|Done|Save|Add)$/i.test(t)) {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: t };
      }
    }
  }
  return null;
});
console.log("send button:", sendCenter);
if (sendCenter) await page.mouse.click(sendCenter.x, sendCenter.y);

// Some Drive variants pop a confirmation when sharing with a non-Workspace
// principal (SA is "noreply.io" type). Accept it by clicking Share/Confirm.
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/sa-06-after-send.png`, fullPage: true });
const confirmCenter = await page.evaluate(() => {
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
  for (const d of dialogs) {
    if (!/Share anyway|Share externally|Confirm/i.test(d.textContent ?? "")) continue;
    const btns = Array.from(d.querySelectorAll("button, [role='button']")) as HTMLElement[];
    for (const b of btns) {
      if (/^(Share anyway|Share|Confirm|OK)$/i.test((b.textContent ?? "").trim())) {
        const r = b.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
  }
  return null;
});
if (confirmCenter) {
  console.log("confirming external-share warning…");
  await page.mouse.click(confirmCenter.x, confirmCenter.y);
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: `${SHOTS}/sa-07-final.png`, fullPage: true });

console.log("Done. Inspect .playwright-shots/sa-*.png to verify.");
await browser.close();
