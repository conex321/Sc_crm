// Dump info on every button near the masked secret cells, so we can identify
// which one is "download".
import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => !p.url().startsWith("chrome://")) ?? ctx.pages()[0];

await page.evaluate(() =>
  window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" as ScrollBehavior }),
);
await page.waitForTimeout(500);

const info = await page.evaluate(() => {
  const masked = Array.from(document.querySelectorAll("*")).filter((el) =>
    /^\*{2,}[a-zA-Z0-9]{2,8}$/.test((el as HTMLElement).innerText?.trim() ?? ""),
  );
  return masked.map((el) => {
    const row = (el as HTMLElement).closest("[class*='row'], div");
    if (!row) return { masked: (el as HTMLElement).innerText, buttons: [] };
    // Walk a few ancestors to find a row-level container that holds 3 icons
    let container = row;
    for (let i = 0; i < 5; i++) {
      const btns = container.querySelectorAll("button");
      if (btns.length >= 2 && btns.length <= 5) break;
      container = (container.parentElement as Element) ?? container;
    }
    const btns = Array.from(container.querySelectorAll("button"));
    const r = (container as HTMLElement).getBoundingClientRect();
    return {
      masked: (el as HTMLElement).innerText.trim(),
      rowRect: { x: r.x, y: r.y, w: r.width, h: r.height },
      buttons: btns.map((b) => ({
        ariaLabel: b.getAttribute("aria-label"),
        title: b.getAttribute("title"),
        text: b.innerText.trim(),
        rect: (() => {
          const rr = b.getBoundingClientRect();
          return { x: rr.x, y: rr.y, w: rr.width, h: rr.height };
        })(),
        iconText: b.querySelector("mat-icon")?.textContent ?? null,
        iconHTML: b.querySelector("svg, mat-icon")?.outerHTML?.slice(0, 200) ?? null,
      })),
    };
  });
});

console.log(JSON.stringify(info, null, 2));

const dpr = await page.evaluate(() => window.devicePixelRatio);
const vp = await page.viewportSize();
console.log({ devicePixelRatio: dpr, viewport: vp });
await browser.close().catch(() => {});
