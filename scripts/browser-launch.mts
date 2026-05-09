// Long-running headed Chromium with persistent profile.
// Stays open across test scripts; connect to it via CDP at
// http://127.0.0.1:9222 from any sibling script.
//
// Run: tsx scripts/browser-launch.mts [start-url]
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const PROFILE_DIR = resolve(process.cwd(), ".playwright-profile");
const CDP_PORT = 9222;
const startUrl = process.argv[2] ?? "https://console.cloud.google.com/apis/credentials";

await mkdir(PROFILE_DIR, { recursive: true });

console.log(`Launching Chromium with profile at ${PROFILE_DIR}`);
console.log(`Starting URL: ${startUrl}`);
console.log(`CDP port: ${CDP_PORT}`);

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  channel: "chrome", // use installed Google Chrome (not bundled chromium)
  args: [
    `--remote-debugging-port=${CDP_PORT}`,
    "--no-first-run",
    "--no-default-browser-check",
  ],
  viewport: null,
});

const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(startUrl, { waitUntil: "domcontentloaded" });

console.log("\nBrowser ready. Log into your Google account in the open Chrome window.");
console.log("Tell Claude to continue when you're signed in. The browser will stay open.");
console.log(`(CDP available at http://127.0.0.1:${CDP_PORT})\n`);

// Keep the process alive forever. The script never exits — use Ctrl+C
// or `taskkill` to close. This is intentional: tests connect via CDP.
ctx.on("close", () => {
  console.log("Context closed; exiting.");
  process.exit(0);
});
await new Promise(() => {}); // never resolves
