// Adds http://localhost:53682/oauth/callback to the OAuth client's
// "Authorized redirect URIs" list, then clicks Save. Driven via CDP.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const REDIRECT_URI = "http://localhost:53682/oauth/callback";
const SHOTS = ".playwright-shots";
await mkdir(SHOTS, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page =
  ctx.pages().find((p) => /console\.cloud\.google\.com/.test(p.url())) ??
  ctx.pages()[0];
console.log("page:", page.url());

await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
await page.screenshot({ path: `${SHOTS}/redir-00-edit.png`, fullPage: true });

// Probe what's on the page: section labels, inputs, and add buttons.
const probe = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll("*"));

  // Find "Authorized redirect URIs" header element (smallest visible matching).
  const matches = all.filter((b) => {
    const t = (b.textContent || "").trim();
    return t === "Authorized redirect URIs" || t === "Authorised redirect URIs";
  });
  let header = null;
  let smallestArea = 1e12;
  for (const el of matches) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const a = r.width * r.height;
    if (a < smallestArea) {
      smallestArea = a;
      header = { x: r.x, y: r.y, w: r.width, h: r.height };
    }
  }

  // All "Add URI" / "+ Add URI" buttons
  const addBtns = Array.from(document.querySelectorAll("button, [role='button']")).filter((b) =>
    /add (uri|url)/i.test((b.textContent || "").trim()),
  ).map((b) => {
    const r = (b as HTMLElement).getBoundingClientRect();
    return { text: (b.textContent || "").trim(), x: r.x, y: r.y, w: r.width, h: r.height };
  });

  // All inputs with type=text or url
  const inputs = Array.from(document.querySelectorAll("input")).filter((i) => {
    const r = i.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }).map((i) => {
    const r = i.getBoundingClientRect();
    return {
      type: i.getAttribute("type"),
      name: i.getAttribute("name"),
      placeholder: i.getAttribute("placeholder"),
      ariaLabel: i.getAttribute("aria-label"),
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
    };
  });

  return { header, addBtns, inputs };
});
console.log(JSON.stringify(probe, null, 2));
await browser.close();
