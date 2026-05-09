// Drive specific actions in the running Chrome via CDP. Each action is small
// and idempotent. Saves screenshots so Claude can verify the page state.
//
// Run: tsx scripts/gcp-action.mts <action> [args...]
//   actions:
//     dismiss-modal        — close any open dialog/snackbar
//     create-web-oauth <name> <redirect-uri>
//     extract-oauth-list   — list all OAuth clients on /apis/credentials
//     extract-new-client-modal — read the just-created-client modal
//     enable-api <api>     — open library page for the API + click Enable
//     create-service-account <name>
//     consent-test-users   — open consent test users page
//     drive-create-folder <name>
//     drive-share-folder <folder-url> <email>
//     navigate <url>       — just go to a URL, screenshot
import { chromium, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const SHOT_DIR = resolve(process.cwd(), ".playwright-shots");
await mkdir(SHOT_DIR, { recursive: true });

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
let page: Page = ctx.pages().find((p) => !p.url().startsWith("chrome://")) ?? ctx.pages()[0];
if (!page) page = await ctx.newPage();

async function shot(label: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const file = resolve(SHOT_DIR, `${ts}-${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`shot: ${file}`);
}

const action = process.argv[2];
const args = process.argv.slice(3);

try {
  switch (action) {
    case "dismiss-modal": {
      // Try common close patterns
      const okBtn = page.locator('button:has-text("OK"), button:has-text("Close"), button:has-text("Done")').first();
      if (await okBtn.isVisible().catch(() => false)) {
        await okBtn.click();
        await page.waitForTimeout(800);
      }
      // Also dismiss snackbar
      const snack = page.locator('[role="status"] button, mat-snack-bar-container button').first();
      if (await snack.isVisible().catch(() => false)) {
        await snack.click();
        await page.waitForTimeout(400);
      }
      await shot("dismissed");
      console.log(`url: ${page.url()}`);
      break;
    }

    case "create-web-oauth": {
      const name = args[0] ?? "SchoolConex CRM (Drive)";
      const redirectUri = args[1] ?? "http://localhost:3000/auth/google-drive-callback";
      // Direct URL to client-create form with Web app preselected isn't reliable;
      // navigate to /apis/credentials and click "Create credentials"
      await page.goto("https://console.cloud.google.com/apis/credentials", {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(2500);
      await shot("credentials-list");
      // Click "Create credentials" → "OAuth client ID"
      const createBtn = page.getByRole("button", { name: /Create credentials/i });
      await createBtn.click();
      await page.waitForTimeout(500);
      const oauthOption = page.getByRole("menuitem", { name: /OAuth client ID/i });
      await oauthOption.click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1500);
      await shot("create-form");
      // Application type select
      const typeSelect = page.locator('mat-select[role="combobox"]').first();
      await typeSelect.click();
      await page.waitForTimeout(400);
      await page.getByRole("option", { name: /Web application/i }).click();
      await page.waitForTimeout(800);
      // Name field
      await page.locator('input[matinput][formcontrolname="name"], input[matinput][placeholder="Name"]').fill(name).catch(async () => {
        // fallback: any visible name input
        const nameInput = page.locator('input[matinput]').first();
        await nameInput.fill(name);
      });
      // Add Authorized redirect URI
      const addUriBtn = page.getByRole("button", { name: /Add URI/i }).last();
      await addUriBtn.click().catch(() => {});
      await page.waitForTimeout(300);
      const uriInput = page.locator('input[matinput][placeholder*="URI"], input[matinput][formcontrolname="redirectUri"]').last();
      await uriInput.fill(redirectUri);
      await shot("create-form-filled");
      // Submit
      await page.getByRole("button", { name: /^Create$/i }).click();
      await page.waitForTimeout(2500);
      await shot("created");
      console.log("if a client-created modal appeared, run: extract-new-client-modal");
      break;
    }

    case "extract-new-client-modal": {
      // The post-create modal has the secret. Read both Client ID and Client secret.
      await page.waitForTimeout(800);
      const text = await page.locator("mat-dialog-container, [role=\"dialog\"]").innerText().catch(() => "");
      console.log("modal text:\n" + text);
      // Parse client id and secret
      const idMatch = text.match(/[\w-]+\.apps\.googleusercontent\.com/);
      // Secret on Web client looks like GOCSPX-...
      const secretMatch = text.match(/GOCSPX-[\w-]+/);
      console.log(JSON.stringify({
        clientId: idMatch?.[0] ?? null,
        clientSecret: secretMatch?.[0] ?? null,
      }));
      await shot("modal");
      break;
    }

    case "extract-oauth-list": {
      await page.goto("https://console.cloud.google.com/apis/credentials", {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(2500);
      const html = await page.content();
      const ids = Array.from(html.matchAll(/[\w-]+\.apps\.googleusercontent\.com/g)).map((m) => m[0]);
      const unique = [...new Set(ids)];
      console.log(JSON.stringify({ clientIds: unique }, null, 2));
      await shot("list");
      break;
    }

    case "enable-api": {
      const api = args[0]; // e.g., drive.googleapis.com
      if (!api) throw new Error("usage: enable-api <api-host>");
      await page.goto(
        `https://console.cloud.google.com/apis/library/${api}?project=gmail-mcp-personal-495520`,
        { waitUntil: "domcontentloaded" },
      );
      await page.waitForTimeout(4000);
      const enableBtn = page.getByRole("button", { name: /^Enable$/i });
      const manageBtn = page.getByRole("button", { name: /^Manage$/i });
      if (await enableBtn.isVisible().catch(() => false)) {
        await enableBtn.click();
        await page.waitForTimeout(4000);
        await shot(`enabled-${api}`);
        console.log(`Enabled ${api}.`);
      } else if (await manageBtn.isVisible().catch(() => false)) {
        await shot(`already-${api}`);
        console.log(`Already enabled (Manage button visible) for ${api}.`);
      } else {
        await shot(`unclear-${api}`);
        console.log(`Could not determine state for ${api} — see screenshot.`);
      }
      break;
    }

    case "consent-test-users": {
      await page.goto("https://console.cloud.google.com/auth/audience", {
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(2500);
      await shot("audience");
      break;
    }

    case "navigate": {
      const url = args[0];
      if (!url) throw new Error("usage: navigate <url>");
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      await shot("navigate");
      console.log(`url: ${page.url()}`);
      console.log(`title: ${await page.title()}`);
      break;
    }

    default:
      console.error(`unknown action: ${action}`);
      console.error("see file header for available actions");
      process.exit(2);
  }
} finally {
  await browser.close().catch(() => {});
}
