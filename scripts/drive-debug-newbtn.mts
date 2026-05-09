// Debug: find the visible "+ New" button and report its DOM info.
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page =
  ctx.pages().find((p) => p.url().includes("drive.google.com")) ?? ctx.pages()[0];

await page.bringToFront();
const info = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('[guidedhelpid="new_menu_button"]'));
  return all.map((el, i) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    const cs = getComputedStyle(el as HTMLElement);
    return {
      i,
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      ariaHidden: el.getAttribute("aria-hidden"),
      parentDisplay: getComputedStyle(el.parentElement!).display,
      ariaLabel: el.getAttribute("aria-label"),
    };
  });
});
console.log(JSON.stringify(info, null, 2));

// Also report total button count and their text content
const buttonsByText = await page.evaluate(() => {
  const news = Array.from(document.querySelectorAll("button, [role='button']")).filter(
    (b) => (b.textContent ?? "").trim() === "New",
  );
  return news.map((el) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    return {
      tag: el.tagName,
      text: (el.textContent ?? "").slice(0, 30),
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      ariaHidden: el.getAttribute("aria-hidden"),
    };
  });
});
console.log("---- by text 'New' ----");
console.log(JSON.stringify(buttonsByText, null, 2));

await browser.close();
