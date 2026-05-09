// List every Save-like button on the OAuth client edit page.
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => /console\.cloud\.google\.com/.test(p.url())) ?? ctx.pages()[0];

await page.evaluate(() => {
  const s = document.scrollingElement || document.body;
  s.scrollTop = s.scrollHeight;
});
await page.waitForTimeout(500);
await page.screenshot({ path: ".playwright-shots/save-debug.png", fullPage: true });

const all = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll("button, [role='button'], input[type='submit']"));
  return els
    .filter((b) => /save|continue|create|done|update/i.test((b.textContent || "").trim()))
    .map((b) => {
      const r = (b as HTMLElement).getBoundingClientRect();
      return {
        text: (b.textContent || "").trim().slice(0, 30),
        tag: b.tagName,
        type: b.getAttribute("type"),
        cls: (b.getAttribute("class") || "").slice(0, 50),
        ariaLabel: b.getAttribute("aria-label"),
        ariaDisabled: b.getAttribute("aria-disabled"),
        disabled: b.hasAttribute("disabled"),
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
      };
    });
});
console.log(JSON.stringify(all, null, 2));
await browser.close();
