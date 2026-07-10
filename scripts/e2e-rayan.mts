// End-to-end smoke test:
//  1. Authenticate against Supabase REST as demo@schoolconex.com
//  2. Forge the @supabase/ssr cookie (`base64-...`) so the Next.js server
//     treats the request as signed-in
//  3. Walk a list of protected routes, capture status + a few HTML signals
//
// Run: tsx scripts/e2e-rayan.mts
import { config } from "dotenv";
import { Buffer } from "node:buffer";
config({ path: ".env.local" });

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const projectRef = new URL(SUPABASE_URL).host.split(".")[0];
const COOKIE_NAME = `sb-${projectRef}-auth-token`;

// Demo is the only sign-in user. Rayan's Dialpad calls just need to be visible.
const EMAIL = "demo@schoolconex.com";
const PASSWORD = "Test1234!";

type Session = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  token_type: string;
  user: { id: string; email: string };
};

async function signIn(): Promise<Session> {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    },
  );
  if (!res.ok) {
    throw new Error(`Supabase auth ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as Session;
}

function buildAuthCookie(session: Session): string {
  // @supabase/ssr 0.5.x: value is `base64-` + base64url(JSON(session))
  // No chunking needed for typical session sizes (<4kb).
  const json = JSON.stringify(session);
  const b64 = Buffer.from(json, "utf-8").toString("base64");
  return `${COOKIE_NAME}=base64-${b64}`;
}

type RouteCheck = {
  path: string;
  expectStatus?: number; // default 200
  expectBody?: RegExp[];
  expectLocation?: RegExp;
};

const ROUTES: RouteCheck[] = [
  { path: "/login", expectStatus: 307, expectLocation: /\/accounts/ },
  { path: "/", expectStatus: 307 }, // redirects to /accounts
  { path: "/accounts", expectBody: [/Accounts/, /SchoolConex/i] },
  { path: "/accounts/new", expectBody: [/Account name/, /Owner/] },
  { path: "/opportunities/new", expectBody: [/Pipeline|Stage/, /Owner/] },
  { path: "/dashboard", expectBody: [/Follow-up|Open leads|pipeline/i] },
  { path: "/opportunities", expectBody: [/Opportunit/i] },
  { path: "/inbox", expectBody: [/Inbound|Outbound|call/] },
  { path: "/settings", expectStatus: 307, expectLocation: /\/settings\/users/ },
  { path: "/settings/users", expectBody: [/Users|Role/i] },
  { path: "/settings/audit", expectBody: [/Audit|action/i] },
  { path: "/settings/catalog", expectBody: [/Catalog|Products|Packages/i] },
  { path: "/settings/integrations", expectBody: [/Integrations|Drive/i] },
  { path: "/settings/templates", expectBody: [/template/i] },
  { path: "/settings/pipelines", expectBody: [/Pipeline/i] },
];

async function fetchRoute(cookie: string, route: RouteCheck) {
  const url = `${SITE}${route.path}`;
  const t0 = Date.now();
  const res = await fetch(url, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  const dur = Date.now() - t0;
  const status = res.status;
  const expected = route.expectStatus ?? 200;
  const location = res.headers.get("location") ?? "";
  const text = await res.text();

  const bodyMisses: string[] = [];
  for (const re of route.expectBody ?? []) {
    if (!re.test(text)) bodyMisses.push(re.toString());
  }

  const okStatus = status === expected;
  const okBody = bodyMisses.length === 0;
  const okLocation = route.expectLocation ? route.expectLocation.test(location) : true;
  const ok = okStatus && okBody && okLocation;

  const tag = ok ? "✓" : "✗";
  let line = `${tag} ${route.path.padEnd(28)} ${String(status).padEnd(3)} ${dur}ms`;
  if (!okStatus) line += ` (expected ${expected})`;
  if (!okBody) line += `  missing: ${bodyMisses.join(", ")}`;
  if (!okLocation) line += `  location mismatch: ${location}`;
  if (status >= 300 && status < 400) {
    line += `  → ${location}`;
  }
  console.log(line);
  return { route: route.path, ok, status };
}

async function main() {
  console.log(`Signing in as ${EMAIL}…`);
  const session = await signIn();
  console.log(`✓ session for user_id=${session.user.id}`);
  const cookie = buildAuthCookie(session);

  // Discover a real account id from the list page so we can walk the edit
  // form too (the Radix empty-value crash of D-043 lived there).
  const listRes = await fetch(`${SITE}/accounts`, { headers: { Cookie: cookie } });
  const listHtml = await listRes.text();
  const accountId = listHtml.match(
    /\/accounts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/,
  )?.[1];
  const routes: RouteCheck[] = [...ROUTES];
  if (accountId) {
    routes.push({
      path: `/accounts/${accountId}/edit`,
      expectBody: [/Account name/, /Owner/, /Save changes/],
    });
    routes.push({
      path: `/accounts/${accountId}/contacts/new`,
      expectBody: [/First name|first_name|Contact/i, /Save|Create/i],
    });
  } else {
    console.log("⚠ no account id found on /accounts — skipping edit-form check");
  }

  console.log(`\nWalking ${routes.length} routes against ${SITE}\n`);
  const results = [];
  for (const route of routes) {
    results.push(await fetchRoute(cookie, route));
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} routes ok`);
  if (failed.length > 0) {
    console.log("Failed:", failed.map((r) => r.route).join(", "));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
