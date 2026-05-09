// Inspect inputs on the current page (regardless of state).
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("drive.google.com")) ?? ctx.pages()[0];
await page.bringToFront();

const inputs = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll("input, textarea, [contenteditable='true']"));
  return all.map((el) => {
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      type: el.getAttribute("type"),
      placeholder: el.getAttribute("placeholder"),
      ariaLabel: el.getAttribute("aria-label"),
      ariaPlaceholder: el.getAttribute("aria-placeholder"),
      role: el.getAttribute("role"),
      value: (el).value,
      visible: r.width > 0 && r.height > 0,
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
    };
  }).filter((i) => i.visible);
});

console.log(JSON.stringify(inputs, null, 2));

const dialogs = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('[role="dialog"]')).map((el) => {
    const r = el.getBoundingClientRect();
    return {
      ariaLabel: el.getAttribute("aria-label"),
      ariaHidden: el.getAttribute("aria-hidden"),
      visible: r.width > 0 && r.height > 0,
      text: (el.textContent || "").slice(0, 100),
    };
  }).filter((d) => d.visible);
});
console.log("---- visible dialogs ----");
console.log(JSON.stringify(dialogs, null, 2));

await browser.close();
