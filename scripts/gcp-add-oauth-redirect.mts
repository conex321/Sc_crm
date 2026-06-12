// Adds an authorized redirect URI on the existing Web OAuth client in the
// schoolconex-crm GCP project by driving the Cloud Console with Playwright.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const PROJECT = "schoolconex-crm";
const CLIENT_ID = "489266381443-vqdbp0n929pdjlj6tehpba7rtvci0e6n.apps.googleusercontent.com";
const REDIRECT_URI =
  process.argv[2] ?? "https://ooanslwrwjexdjwdphes.supabase.co/auth/v1/callback";
const SHOTS = ".playwright-shots";
const PROFILE_DIR = resolve(process.cwd(), process.env.PLAYWRIGHT_PROFILE_DIR ?? ".playwright-profile");

await mkdir(SHOTS, { recursive: true });

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: "chrome",
  headless: false,
  viewport: { width: 1440, height: 1000 },
  args: ["--no-first-run", "--no-default-browser-check"],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

async function screenshot(name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function redirectUriExists() {
  return page.evaluate((uri) => {
    const fields = Array.from(document.querySelectorAll("input, textarea")) as HTMLInputElement[];
    return fields.some((field) => field.value.trim() === uri);
  }, REDIRECT_URI);
}

async function waitForEditPage() {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3_000);

  if (/accounts\.google\.com/.test(page.url())) {
    await screenshot("oauth-redir-login-required");
    throw new Error("Google login required in .playwright-profile before Cloud Console can be automated.");
  }

  await page
    .getByText(/Authorized redirect URIs/i)
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
}

async function clickRedirectAddUri() {
  const clicked = await page.evaluate(() => {
    const textOf = (el: Element) => (el.textContent || "").replace(/\s+/g, " ").trim();
    const headers = Array.from(document.querySelectorAll("*")).filter((el) =>
      /^Authorized redirect URIs$/i.test(textOf(el)),
    );
    const header = headers
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.height > 0)
      .sort((a, b) => a.box.y - b.box.y)[0];

    if (!header) return false;

    const buttons = Array.from(document.querySelectorAll("button, [role='button']"))
      .map((el) => ({ el: el as HTMLElement, text: textOf(el), box: el.getBoundingClientRect() }))
      .filter(({ text, box }) => /add uri/i.test(text) && box.y > header.box.y);
    const button = buttons.sort((a, b) => a.box.y - b.box.y)[0];
    button?.el.click();
    return Boolean(button);
  });

  if (!clicked) {
    await screenshot("oauth-redir-add-button-missing");
    throw new Error("Could not find Add URI button below Authorized redirect URIs.");
  }
}

async function fillNewestRedirectInput() {
  await page.waitForTimeout(1_000);
  const filled = await page.evaluate((uri) => {
    const textOf = (el: Element) => (el.textContent || "").replace(/\s+/g, " ").trim();
    const header = Array.from(document.querySelectorAll("*"))
      .map((el) => ({ el, text: textOf(el), box: el.getBoundingClientRect() }))
      .filter(({ text, box }) => /^Authorized redirect URIs$/i.test(text) && box.width > 0 && box.height > 0)
      .sort((a, b) => a.box.y - b.box.y)[0];

    if (!header) return false;

    const fields = Array.from(document.querySelectorAll("input, textarea"))
      .map((el) => ({ el: el as HTMLInputElement, box: el.getBoundingClientRect() }))
      .filter(({ el, box }) => {
        const disabled = el.disabled || el.getAttribute("aria-disabled") === "true";
        return !disabled && box.width > 250 && box.height > 0 && box.y > header.box.y;
      })
      .sort((a, b) => b.box.y - a.box.y);

    const field = fields.find(({ el }) => el.value.trim() === "")?.el;
    if (!field) return false;

    field.focus();
    field.value = uri;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.blur();
    return true;
  }, REDIRECT_URI);

  if (!filled) {
    await screenshot("oauth-redir-input-missing");
    throw new Error("Could not find an empty redirect URI input to fill.");
  }
}

async function saveClient() {
  await page.waitForTimeout(1_000);
  const save = page.getByRole("button", { name: /^Save$/i }).last();
  await save.waitFor({ state: "visible", timeout: 20_000 });
  await save.click();
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(5_000);
}

// Navigate to Credentials page (lists OAuth clients)
const credsUrl = `https://console.cloud.google.com/apis/credentials?project=${PROJECT}`;
console.log(`Opening ${credsUrl}`);
await page.goto(credsUrl, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
await screenshot("oauth-redir-00-creds");

// Cloud Console accepts direct navigation to the client edit URL.
const editUrl = `https://console.cloud.google.com/apis/credentials/oauthclient/${CLIENT_ID}?project=${PROJECT}`;
console.log(`Navigating directly to edit page: ${editUrl}`);
await page.goto(editUrl, { waitUntil: "domcontentloaded" });
await waitForEditPage();
await screenshot("oauth-redir-01-edit");

if (await redirectUriExists()) {
  console.log(`Redirect URI already present: ${REDIRECT_URI}`);
} else {
  console.log(`Adding redirect URI: ${REDIRECT_URI}`);
  await clickRedirectAddUri();
  await fillNewestRedirectInput();
  await screenshot("oauth-redir-02-filled");
  await saveClient();
  await screenshot("oauth-redir-03-saved");
}

console.log("Reloading edit page to verify saved redirect URI.");
await page.goto(editUrl, { waitUntil: "domcontentloaded" });
await waitForEditPage();
await screenshot("oauth-redir-04-verified");

if (!(await redirectUriExists())) {
  throw new Error(`Redirect URI was not found after reload: ${REDIRECT_URI}`);
}

await ctx.close();
console.log(`Verified redirect URI on OAuth client: ${REDIRECT_URI}`);
