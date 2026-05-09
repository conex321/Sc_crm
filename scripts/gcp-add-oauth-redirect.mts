// Adds http://localhost:53682/oauth/callback as an authorized redirect URI
// on the existing Web OAuth client in the schoolconex-crm GCP project, by
// driving the Cloud Console in the open Chrome (CDP).
//
// Why: needed by drive-oauth-add-sa.mts to receive the auth code on a
// loopback listener.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const PROJECT = "schoolconex-crm";
const CLIENT_ID = "489266381443-vqdbp0n929pdjlj6tehpba7rtvci0e6n.apps.googleusercontent.com";
const REDIRECT_URI = "http://localhost:53682/oauth/callback";
const SHOTS = ".playwright-shots";
await mkdir(SHOTS, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages()[0] ?? (await ctx.newPage());

// Navigate to Credentials page (lists OAuth clients)
const credsUrl = `https://console.cloud.google.com/apis/credentials?project=${PROJECT}`;
console.log(`Opening ${credsUrl}`);
await page.goto(credsUrl, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
await page.screenshot({ path: `${SHOTS}/oauth-redir-00-creds.png`, fullPage: true });

// Click on the OAuth Web client by name (it's a link in the table). Drive the
// OAuth ID column and find the row whose ID starts with the client_id prefix.
const clientPrefix = CLIENT_ID.split("-")[0]; // "489266381443"
console.log(`Looking for OAuth client row containing ${clientPrefix}…`);

// The client list page renders client IDs in a table; the link is on the
// client name. Easiest: navigate directly to the client edit URL — Cloud
// Console accepts /apis/credentials/oauthclient/<clientid>?project=<p>.
const editUrl = `https://console.cloud.google.com/apis/credentials/oauthclient/${CLIENT_ID}?project=${PROJECT}`;
console.log(`Navigating directly to edit page: ${editUrl}`);
await page.goto(editUrl, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(2000);
await page.screenshot({ path: `${SHOTS}/oauth-redir-01-edit.png`, fullPage: true });

// Look for "Authorized redirect URIs" section. Click "+ Add URI" or the input
// to add a new entry.
console.log("Looking for redirect-uri input…");
const found = await page.evaluate(() => {
  // Strategy: find the input whose label/section is "Authorized redirect URIs"
  const labels = Array.from(document.querySelectorAll("*")).filter((el) =>
    /authorized redirect uris/i.test((el.textContent || "").trim()),
  );
  // Find the smallest such element (the section header), then find the
  // closest input or "Add URI" button below/right of it.
  // Simpler: find all "Add URI" buttons and click them all.
  const addBtns = Array.from(document.querySelectorAll("button, [role='button']")).filter((b) =>
    /^\+\s*add uri$/i.test((b.textContent || "").trim()) || /^add uri$/i.test((b.textContent || "").trim()),
  );
  return {
    labelCount: labels.length,
    addBtnCount: addBtns.length,
    addBtns: addBtns.map((b) => {
      const r = b.getBoundingClientRect();
      return { text: (b.textContent || "").trim(), x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  };
});
console.log(JSON.stringify(found, null, 2));

await page.screenshot({ path: `${SHOTS}/oauth-redir-02-state.png`, fullPage: true });
await browser.close();
console.log(
  "Inspect oauth-redir-*.png. If a redirect URI input is visible, the next " +
    "iteration of this script will fill it in.",
);
