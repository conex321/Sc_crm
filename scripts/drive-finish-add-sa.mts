// Assumes the Manage members dialog is already open. Fills in the SA email,
// sets role to Content Manager, sends. Inspect screenshots if it fails.
import { config } from "dotenv";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

config({ path: ".env.local" });

const SA_EMAIL = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!).client_email as string;
const SHOTS = ".playwright-shots";
await mkdir(SHOTS, { recursive: true });

console.log(`SA: ${SA_EMAIL}`);
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("drive.google.com")) ?? ctx.pages()[0];
await page.bringToFront();

// Find the input by walking the DOM for a focused-looking text-entry inside
// a visible dialog containing "Manage members".
const inputBox = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('[role="dialog"]'));
  for (const d of all) {
    const r = d.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (!/Manage members/i.test(d.textContent || "")) continue;
    const ed = d.querySelector(
      "input, textarea, [contenteditable='true'], [contenteditable=''], [role='combobox']",
    );
    if (!ed) continue;
    const er = ed.getBoundingClientRect();
    return {
      x: er.x + er.width / 2,
      y: er.y + er.height / 2,
      tag: ed.tagName,
      role: ed.getAttribute("role"),
      ce: ed.getAttribute("contenteditable"),
    };
  }
  return null;
});
console.log("input target:", inputBox);
if (!inputBox) throw new Error("No input inside an open Manage members dialog");

await page.mouse.click(inputBox.x, inputBox.y);
await page.waitForTimeout(300);
await page.keyboard.type(SA_EMAIL, { delay: 12 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOTS}/finish-01-typed.png`, fullPage: true });

await page.keyboard.press("Enter");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}/finish-02-after-enter.png`, fullPage: true });

// Set role to Content manager. The role chip becomes visible after the email
// resolves to a chip. Find a button with role-name text inside the visible
// Manage members dialog.
console.log("Looking for role chip…");
const rolePos = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('[role="dialog"]'));
  for (const d of all) {
    const r = d.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (!/Manage members/i.test(d.textContent || "")) continue;
    const btns = Array.from(d.querySelectorAll("button, [role='button'], [role='combobox']"));
    const matches = btns.filter((b) => {
      const t = (b.textContent || "").trim();
      return /^(Editor|Manager|Content manager|Viewer|Commenter|Contributor)/i.test(t);
    });
    // Pick the rightmost (closest to the email row's right edge)
    let best = null;
    let bestX = -1;
    for (const b of matches) {
      const br = b.getBoundingClientRect();
      if (br.width > 0 && br.height > 0 && br.x > bestX) {
        bestX = br.x;
        best = {
          x: br.x + br.width / 2,
          y: br.y + br.height / 2,
          text: (b.textContent || "").trim().slice(0, 30),
        };
      }
    }
    if (best) return best;
  }
  return null;
});
console.log("role chip:", rolePos);

if (rolePos) {
  await page.mouse.click(rolePos.x, rolePos.y);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/finish-03-role-menu.png`, fullPage: true });

  // Pick "Content manager"
  const cmPos = await page.evaluate(() => {
    const items = Array.from(
      document.querySelectorAll('[role="menuitem"], [role="option"], li, .a-J-c, [data-tooltip]'),
    );
    for (const b of items) {
      const t = (b.textContent || "").trim();
      if (/^content manager/i.test(t)) {
        const r = b.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
    }
    return null;
  });
  console.log("Content manager option:", cmPos);
  if (cmPos) {
    await page.mouse.click(cmPos.x, cmPos.y);
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/finish-04-after-role.png`, fullPage: true });
}

// Click Send / Share / Done. Inside the same dialog.
console.log("Looking for submit button…");
const sendPos = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('[role="dialog"]'));
  for (const d of all) {
    const r = d.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (!/Manage members/i.test(d.textContent || "")) continue;
    const btns = Array.from(d.querySelectorAll("button, [role='button']"));
    for (const b of btns) {
      const t = (b.textContent || "").trim();
      if (/^(Send|Share|Add|Save)$/i.test(t)) {
        const br = b.getBoundingClientRect();
        if (br.width > 0 && br.height > 0) {
          return { x: br.x + br.width / 2, y: br.y + br.height / 2, text: t };
        }
      }
    }
  }
  return null;
});
console.log("send button:", sendPos);

if (sendPos) {
  await page.mouse.click(sendPos.x, sendPos.y);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/finish-05-after-send.png`, fullPage: true });

  // External-share warning dialog
  const confirmPos = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('[role="dialog"]'));
    for (const d of all) {
      const r = d.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (!/Share anyway|Share externally|outside.*organization|Confirm/i.test(d.textContent || "")) continue;
      const btns = Array.from(d.querySelectorAll("button, [role='button']"));
      for (const b of btns) {
        const t = (b.textContent || "").trim();
        if (/^(Share anyway|Share|Confirm|OK|Continue)$/i.test(t)) {
          const br = b.getBoundingClientRect();
          if (br.width > 0 && br.height > 0) {
            return { x: br.x + br.width / 2, y: br.y + br.height / 2, text: t };
          }
        }
      }
    }
    return null;
  });
  if (confirmPos) {
    console.log("confirming external-share:", confirmPos);
    await page.mouse.click(confirmPos.x, confirmPos.y);
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: `${SHOTS}/finish-06-final.png`, fullPage: true });
} else {
  // No Send/Add/Save button — Manager dialog typically just has "Done"
  console.log("No Send button; trying Done…");
  const donePos = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('[role="dialog"]'));
    for (const d of all) {
      const r = d.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (!/Manage members/i.test(d.textContent || "")) continue;
      const btns = Array.from(d.querySelectorAll("button, [role='button']"));
      for (const b of btns) {
        if ((b.textContent || "").trim() === "Done") {
          const br = b.getBoundingClientRect();
          if (br.width > 0 && br.height > 0) {
            return { x: br.x + br.width / 2, y: br.y + br.height / 2 };
          }
        }
      }
    }
    return null;
  });
  console.log("done button:", donePos);
  if (donePos) {
    await page.mouse.click(donePos.x, donePos.y);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/finish-06-final.png`, fullPage: true });
  }
}

console.log("Done. Inspect .playwright-shots/finish-*.png");
await browser.close();
