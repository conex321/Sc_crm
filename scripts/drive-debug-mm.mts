// Inspect the "Manage members" element to understand its event wiring.
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("drive.google.com")) ?? ctx.pages()[0];
await page.bringToFront();

const info = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll("*"));
  const found = all.filter((b) => (b.textContent || "").trim() === "Manage members");
  return found.map((el) => {
    const chain = [];
    let cur = el;
    let depth = 0;
    while (cur && depth < 12) {
      const r = cur.getBoundingClientRect();
      chain.push({
        depth,
        tag: cur.tagName,
        cls: (cur.getAttribute("class") || "").slice(0, 80),
        role: cur.getAttribute("role"),
        jsaction: (cur.getAttribute("jsaction") || "").slice(0, 100),
        ariaLabel: cur.getAttribute("aria-label"),
        href: cur.getAttribute("href"),
        w: r.width,
        h: r.height,
      });
      cur = cur.parentElement;
      depth++;
    }
    return chain;
  });
});

console.log(JSON.stringify(info, null, 2));
await browser.close();
