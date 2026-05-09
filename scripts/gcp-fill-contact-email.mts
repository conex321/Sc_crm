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
  await page.screenshot({ path: resolve(SHOT_DIR, `${ts}-${label}.png`) });
}

// Get the input id from DOM (the focused element)
const inputId = await page.evaluate(() => {
  // Find the visible input under "Contact Information"
  const all = Array.from(document.querySelectorAll("*"));
  const heading = all.find((el) =>
    /^Contact Information$/i.test((el as HTMLElement).innerText?.trim() ?? ""),
  );
  if (!heading) return null;
  const hr = heading.getBoundingClientRect();
  const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];
  // pick visible inputs below heading, prefer chip-input
  const candidate = inputs.find((i) => {
    const r = i.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.y > hr.y && (i.type === "text" || i.type === "" || i.type === "email");
  });
  if (!candidate) return null;
  if (!candidate.id) candidate.id = "claude-helper-id-" + Math.random().toString(36).slice(2);
  return candidate.id;
});
console.log(`input id: ${inputId}`);

if (!inputId) {
  console.error("No contact input found");
  process.exit(1);
}

const input = page.locator(`#${inputId}`);
await input.click({ force: true });
await page.waitForTimeout(200);
await input.fill("matthew@schoolconex.com");
await page.waitForTimeout(400);
await page.keyboard.press("Enter");
await page.waitForTimeout(800);
await shot("a-contact-filled");

// Click Next
await page.getByRole("button", { name: /^Next$/i }).first().click({ force: true });
await page.waitForTimeout(1500);
await shot("b-after-next");

// Agree + Create
const checkbox = page.locator('input[type="checkbox"]').first();
if (await checkbox.isVisible().catch(() => false)) {
  await checkbox.check({ force: true }).catch(() => {});
  await page.waitForTimeout(400);
}
const createBtn = page.getByRole("button", { name: /^Create$/i }).first();
if (await createBtn.isVisible().catch(() => false)) {
  await createBtn.click({ force: true });
  await page.waitForTimeout(6000);
}
await shot("c-final");
console.log(`final URL: ${page.url()}`);

await browser.close().catch(() => {});
