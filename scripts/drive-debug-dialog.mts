// Inspect the Manage members dialog structure.
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("drive.google.com")) ?? ctx.pages()[0];
// Do NOT bringToFront — that fires focus events that dismiss Drive's dialogs.

// Find all elements containing "Add people and groups" text
const info = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll("*"));
  // Find the deepest/leaf containing "Add people and groups"
  const matches = all.filter((b) => /Add people and groups/.test(b.textContent || ""));
  // Pick the smallest visible
  let smallest = null;
  let area = 1e12;
  for (const el of matches) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const a = r.width * r.height;
    if (a < area) {
      area = a;
      smallest = el;
    }
  }
  if (!smallest) return null;
  const r = smallest.getBoundingClientRect();
  // Walk up 12 ancestors
  const chain = [];
  let cur = smallest;
  for (let i = 0; i < 12; i++) {
    if (!cur) break;
    const cr = cur.getBoundingClientRect();
    chain.push({
      depth: i,
      tag: cur.tagName,
      role: cur.getAttribute("role"),
      cls: (cur.getAttribute("class") || "").slice(0, 60),
      ariaLabel: cur.getAttribute("aria-label"),
      jsname: cur.getAttribute("jsname"),
      jsaction: (cur.getAttribute("jsaction") || "").slice(0, 80),
      ariaModal: cur.getAttribute("aria-modal"),
      contenteditable: cur.getAttribute("contenteditable"),
      placeholder: cur.getAttribute("placeholder"),
      ariaPlaceholder: cur.getAttribute("aria-placeholder"),
      x: cr.x,
      y: cr.y,
      w: cr.width,
      h: cr.height,
    });
    cur = cur.parentElement;
  }
  return { leaf: { x: r.x, y: r.y, w: r.width, h: r.height }, chain };
});

console.log(JSON.stringify(info, null, 2));
await browser.close();
