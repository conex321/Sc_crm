import { mkdirSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import { chromium } from "playwright";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const GROUP = process.argv[2] ?? "core";
const SHOTS = ".playwright-shots/full-validate";

type RouteCheck = {
  name: string;
  path: string;
  needsForm?: boolean;
  needsRows?: boolean;
  screenshot?: boolean;
};

async function samples() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  try {
    const [row] = await sql<[
      {
        account_id: string;
        contact_id: string;
        contact_account_id: string;
        opportunity_id: string;
        campaign_id: string;
        product_id: string | null;
        package_id: string | null;
      },
    ]>`
      select
        (select id::text from public.accounts where deleted_at is null order by updated_at desc limit 1) account_id,
        (select id::text from public.contacts where deleted_at is null order by updated_at desc limit 1) contact_id,
        (select account_id::text from public.contacts where deleted_at is null order by updated_at desc limit 1) contact_account_id,
        (select id::text from public.opportunities where deleted_at is null order by updated_at desc limit 1) opportunity_id,
        (select mailshake_id::text from public.mailshake_campaigns where is_archived=false order by last_synced_at desc limit 1) campaign_id,
        (select id::text from public.products where is_active=true order by updated_at desc limit 1) product_id,
        (select id::text from public.packages where is_active=true order by updated_at desc limit 1) package_id
    `;
    return row;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function routesFor(group: string, s: Awaited<ReturnType<typeof samples>>): RouteCheck[] {
  const all: Record<string, RouteCheck[]> = {
    core: [
      { name: "dashboard", path: "/dashboard", screenshot: true },
      { name: "accounts", path: "/accounts", needsRows: true, screenshot: true },
      { name: "account-detail", path: `/accounts/${s.account_id}`, screenshot: true },
      { name: "opportunities", path: "/opportunities", screenshot: true },
      { name: "opportunity-detail", path: `/opportunities/${s.opportunity_id}`, screenshot: true },
      { name: "inbox", path: "/inbox", needsRows: true, screenshot: true },
    ],
    forms: [
      { name: "account-new", path: "/accounts/new", needsForm: true },
      { name: "account-edit", path: `/accounts/${s.account_id}/edit`, needsForm: true },
      { name: "contact-new", path: `/accounts/${s.account_id}/contacts/new`, needsForm: true },
      {
        name: "contact-edit",
        path: `/accounts/${s.contact_account_id}/contacts/${s.contact_id}/edit`,
        needsForm: true,
      },
      { name: "opportunity-new", path: "/opportunities/new", needsForm: true },
      { name: "opportunity-edit", path: `/opportunities/${s.opportunity_id}/edit`, needsForm: true },
    ],
    integrations: [
      { name: "campaigns", path: "/campaigns", needsRows: true, screenshot: true },
      { name: "campaign-detail", path: `/campaigns/${s.campaign_id}`, needsRows: true, screenshot: true },
      { name: "settings-integrations", path: "/settings/integrations", screenshot: true },
      { name: "settings-templates", path: "/settings/templates" },
      { name: "settings-pipelines", path: "/settings/pipelines" },
    ],
    settings: [
      { name: "settings-users", path: "/settings/users", needsRows: true },
      { name: "settings-audit", path: "/settings/audit", needsRows: true },
      { name: "settings-catalog", path: "/settings/catalog", screenshot: true },
      { name: "product-new", path: "/settings/catalog/products/new", needsForm: true },
      { name: "package-new", path: "/settings/catalog/packages/new", needsForm: true },
      ...(s.product_id
        ? [
            {
              name: "product-edit",
              path: `/settings/catalog/products/${s.product_id}/edit`,
              needsForm: true,
            },
          ]
        : []),
      ...(s.package_id
        ? [
            {
              name: "package-edit",
              path: `/settings/catalog/packages/${s.package_id}/edit`,
              needsForm: true,
            },
          ]
        : []),
    ],
  };
  return all[group] ?? all.core;
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const s = await samples();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const issues: string[] = [];
  page.on("pageerror", (err) => issues.push(`pageerror:${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") issues.push(`console:${msg.text().slice(0, 180)}`);
  });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.locator('input[name="email"]').fill("demo@schoolconex.com");
  await page.locator('input[name="password"]').fill("Test1234!");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20_000 }).catch(() => {}),
    page.locator('button[type="submit"]').first().click(),
  ]);

  const results = [];
  for (const route of routesFor(GROUP, s)) {
    const started = Date.now();
    const res = await page.goto(`${BASE}${route.path}`, {
      waitUntil: "domcontentloaded",
      timeout: 25_000,
    });
    await page.waitForTimeout(500);
    const body = await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");
    const h1 = (await page.locator("h1").first().textContent({ timeout: 2_000 }).catch(() => ""))
      ?.trim()
      .slice(0, 80);
    const rows = await page.locator("table tbody tr").count().catch(() => 0);
    const forms = await page.locator("form").count().catch(() => 0);
    const inputs = await page.locator('input, textarea, select, [role="combobox"]').count().catch(() => 0);
    const badText = /Application error|Unhandled Runtime Error|404: This page could not be found/i.test(body);
    const ok =
      res.status() < 400 &&
      body.length > 100 &&
      !badText &&
      (!route.needsForm || (forms > 0 && inputs > 0)) &&
      (!route.needsRows || rows > 0);

    if (route.screenshot) {
      await page.screenshot({ path: `${SHOTS}/${GROUP}-${route.name}.png`, fullPage: true });
    }

    results.push({
      ...route,
      status: res.status(),
      ok,
      h1,
      rows,
      forms,
      inputs,
      ms: Date.now() - started,
    });
  }

  await browser.close();
  const report = { group: GROUP, results, issues, shots: SHOTS };
  writeFileSync(`${SHOTS}/${GROUP}-report.json`, JSON.stringify(report, null, 2));

  for (const r of results) {
    console.log(
      `${r.ok ? "OK" : "FAIL"} ${r.name} ${r.status} h1=${JSON.stringify(r.h1)} rows=${r.rows} forms=${r.forms} inputs=${r.inputs}`,
    );
  }
  console.log(`SUMMARY group=${GROUP} routes=${results.length} failed=${results.filter((r) => !r.ok).length} issues=${issues.length} shots=${SHOTS}`);
  for (const issue of issues.slice(0, 8)) console.log(`ISSUE ${issue}`);
  if (results.some((r) => !r.ok) || issues.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
