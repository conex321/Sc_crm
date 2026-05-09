// Finish the consent wizard from Step 3 onward.
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

// Find the input under "Contact Information" by walking the DOM (no nested fn decls)
const filled = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll("*"));
  const heading = all.find((el) =>
    /^Contact Information$/i.test((el as HTMLElement).innerText?.trim() ?? ""),
  );
  if (!heading) return false;
  let cur: Element | null = heading;
  let found: HTMLInputElement | null = null;
  while (cur && !found) {
    const candidate = cur.querySelector?.(
      'input[type="text"], input[type="email"], input:not([type])',
    ) as HTMLInputElement | null;
    if (candidate && (candidate as HTMLElement).offsetParent !== null) {
      found = candidate;
      break;
    }
    cur = cur.nextElementSibling ?? cur.parentElement?.nextElementSibling ?? null;
  }
  if (!found) return false;
  found.focus();
  found.value = "";
  found.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
});
console.log(`focused contact input: ${filled}`);
if (filled) {
  await page.keyboard.type("matthew@schoolconex.com");
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
}
await shot("01-contact-typed");

// Click Next button visible under Contact Information section
const nextBtns = page.getByRole("button", { name: /^Next$/i });
const nextCount = await nextBtns.count();
for (let i = 0; i < nextCount; i++) {
  const btn = nextBtns.nth(i);
  if (await btn.isVisible().catch(() => false)) {
    await btn.click({ force: true });
    await page.waitForTimeout(1500);
    break;
  }
}
await shot("02-after-next");

// Final agree + Create
const checkbox = page.locator('input[type="checkbox"]').first();
if (await checkbox.isVisible().catch(() => false)) {
  await checkbox.click({ force: true }).catch(() => {});
  await page.waitForTimeout(300);
}

const createBtn = page.getByRole("button", { name: /^Create$/i });
if (await createBtn.isVisible().catch(() => false)) {
  console.log("Clicking Create…");
  await createBtn.click({ force: true });
  await page.waitForTimeout(4000);
}
await shot("03-final");
console.log(`final URL: ${page.url()}`);

await browser.close().catch(() => {});
