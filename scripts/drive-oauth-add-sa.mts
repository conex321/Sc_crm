// Adds the SchoolConex CRM service account as Content Manager on the
// "SchoolConex CRM" Shared Drive via the Drive REST API, using a one-shot
// OAuth flow run in the already-open Chrome (CDP).
//
// Why: fighting Drive's web UI is unreliable. The REST path is deterministic.
//
// Flow:
//   1. Spin up a localhost HTTP server to catch the OAuth redirect.
//   2. Open the Google consent URL in the existing Chrome window.
//   3. Wait for the redirect to /oauth/callback?code=...
//   4. Exchange the code for an access token (no refresh needed; one-shot).
//   5. Call drive.permissions.create on the Shared Drive with
//      supportsAllDrives:true and role=organizer (Content Manager).
//   6. Verify by listing members.
//
// Inputs:
//   GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET — already in env.
//   GOOGLE_SERVICE_ACCOUNT_KEY.client_email — the SA principal.
//   SHARED_DRIVE_ID via process.argv[2] (default: 0AFnM-2HvmqO2Uk9PVA).
//
// The OAuth client must have "http://localhost:53682/oauth/callback" as a
// registered redirect URI. If not, this script will print Google's error
// HTML (received via the redirect) so you can add the URI in Cloud Console.

import { config } from "dotenv";
import { chromium } from "playwright";
import http from "node:http";

config({ path: ".env.local" });

const SHARED_DRIVE_ID = process.argv[2] ?? "0AFnM-2HvmqO2Uk9PVA";
const SA_EMAIL = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!).client_email as string;
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
const REDIRECT_PORT = 53682;
const REDIRECT_PATH = "/oauth/callback";
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}${REDIRECT_PATH}`;

console.log(`Shared Drive: ${SHARED_DRIVE_ID}`);
console.log(`SA email:     ${SA_EMAIL}`);
console.log(`Redirect URI: ${REDIRECT_URI} (must be registered in OAuth client)`);

// 1. Start local server to catch the redirect
const codePromise = new Promise<string>((resolve, reject) => {
  const server = http.createServer((req, res) => {
    if (!req.url || !req.url.startsWith(REDIRECT_PATH)) {
      res.writeHead(404).end();
      return;
    }
    const u = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
    const err = u.searchParams.get("error");
    const code = u.searchParams.get("code");
    if (err) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<h1>OAuth error: ${err}</h1>`);
      server.close();
      reject(new Error(`OAuth error: ${err}`));
      return;
    }
    if (code) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        "<h1>OK — code received. You can close this tab.</h1>" +
          "<script>window.close()</script>",
      );
      server.close();
      resolve(code);
      return;
    }
    res.writeHead(400).end("missing code/error");
  });
  server.listen(REDIRECT_PORT, "127.0.0.1");
});

// 2. Build consent URL and open in existing Chrome
const consentUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive",
    access_type: "online",
    prompt: "consent",
  }).toString();

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("google.com")) ?? ctx.pages()[0];
console.log("Opening consent URL in Chrome…");
await page.goto(consentUrl, { waitUntil: "domcontentloaded" });

// 3. Wait for the code (10 min)
console.log("Waiting for OAuth callback (consent in browser)…");
const code = await Promise.race([
  codePromise,
  new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error("timed out waiting for OAuth callback")), 600_000),
  ),
]);
console.log("✓ got code (length:", code.length, ")");

// 4. Exchange code for access token
console.log("Exchanging code…");
const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  }).toString(),
});
const token = (await tokenRes.json()) as { access_token?: string; error?: string; error_description?: string };
if (!token.access_token) {
  console.error("token error:", token);
  process.exit(2);
}
console.log("✓ got access token");

// 5. Call permissions.create
console.log(`Adding ${SA_EMAIL} as organizer (Content Manager) on ${SHARED_DRIVE_ID}…`);
const permRes = await fetch(
  `https://www.googleapis.com/drive/v3/files/${SHARED_DRIVE_ID}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
  {
    method: "POST",
    headers: {
      authorization: `Bearer ${token.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "user",
      role: "organizer",
      emailAddress: SA_EMAIL,
    }),
  },
);
const permJson = await permRes.json();
if (!permRes.ok) {
  console.error("permissions.create failed:", permJson);
  process.exit(3);
}
console.log("✓ permission created:", JSON.stringify(permJson));

// 6. Verify by listing
const listRes = await fetch(
  `https://www.googleapis.com/drive/v3/files/${SHARED_DRIVE_ID}/permissions?supportsAllDrives=true&fields=permissions(id,role,emailAddress,type)`,
  {
    headers: { authorization: `Bearer ${token.access_token}` },
  },
);
const listJson = (await listRes.json()) as { permissions?: Array<{ role: string; emailAddress: string }> };
console.log("\nMembers:");
for (const p of listJson.permissions ?? []) {
  console.log(`  - ${p.role} :: ${p.emailAddress}`);
}

await browser.close();
console.log("\n✓ Done");
