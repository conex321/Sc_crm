# Testing Patterns

**Analysis Date:** 2026-07-11

## Overview

**There is no unit-test framework wired up.** No jest/vitest config, no `test` npm script, no CI pipeline. Verification is a layered manual-plus-script approach:

1. Type gate: `npx tsc --noEmit`
2. Build gate: `npm run build`
3. Route smoke test: `tsx scripts/e2e-rayan.mts`
4. Node-assert integration checks: `tsx tests/integration-sync.test.mts`
5. Playwright MCP browser verification (interactive sessions, DB ground-truth checks)
6. Simulated-JWT RLS verification via direct SQL

**Lint is BROKEN:** `npm run lint` runs `next lint`, which is invalid in Next 16. Do NOT treat lint as a gate. The working gates are typecheck + build.

## Gate Commands

```bash
npx tsc --noEmit               # type gate (also: npm run typecheck)
npm run build                  # Next.js production build — catches RSC/client boundary errors
tsx scripts/e2e-rayan.mts      # signed-in route walk (needs dev server + env, see below)
tsx tests/integration-sync.test.mts   # pure-function integration assertions
```

Run typecheck + build before declaring any change done. Run the e2e route walk after changes touching pages, layouts, auth, or server actions.

## Route Smoke Test — `scripts/e2e-rayan.mts`

The primary regression net. What it does:

1. Loads env from `.env.local` (dotenv). Requires `E2E_LOGIN_PASSWORD` (and optionally `E2E_LOGIN_EMAIL`, default `demo@schoolconex.com` — the only password sign-in user). Exits 1 if missing.
2. Signs in against Supabase REST (`/auth/v1/token?grant_type=password`) using `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Forges the `@supabase/ssr` cookie: `sb-<projectRef>-auth-token=base64-<base64(JSON session)>` so the Next server treats requests as signed in.
4. Walks the `ROUTES` array (~19 routes) with `redirect: "manual"`, asserting per route: HTTP status (default 200), body regex markers (`expectBody: RegExp[]`), and redirect `Location` (`expectLocation`).
5. Dynamically discovers a real account id from `/accounts` HTML and walks `/accounts/{id}/edit` and `/accounts/{id}/contacts/new` too (this caught the D-043 Radix empty-value crash).
6. Prints ✓/✗ per route with timing; exits 1 if any route fails.

**Convention: when you add a new page, add an entry to `ROUTES` in `scripts/e2e-rayan.mts`:**

```typescript
{ path: "/my-new-page", expectBody: [/Marker text/, /Another marker/i] },
// or for redirects:
{ path: "/old", expectStatus: 307, expectLocation: /\/new/ },
```

Target defaults to `http://localhost:3000` (override with `NEXT_PUBLIC_SITE_URL`) — start `npm run dev` first, or point at prod `https://sc-crm-sand.vercel.app`.

## Node-Assert Integration Test — `tests/integration-sync.test.mts`

Single file, no framework: `node:assert/strict` against pure transform functions.

```typescript
import assert from "node:assert/strict";
process.env.DATABASE_URL ??= "postgres://example:example@example.invalid/example"; // satisfy import-time env checks

const mailshake = await import("../lib/integrations/mailshake-transform");
const recipient = mailshake.normalizeMailshakeRecipient("1504458", { ...fixture });
assert.equal(recipient.email, "sangeetakumar@3sixtyeducation.ca");
```

Covers `lib/integrations/mailshake-transform`, `lib/integrations/dialpad`, `lib/integrations/dialpad-client` (normalization, URL building, webhook event extraction). Run with `tsx tests/integration-sync.test.mts` — it either completes silently (pass) or throws (fail). Add new pure-logic assertions here rather than standing up a framework.

## Playwright MCP Browser Verification

`playwright` and `@playwright/test` are installed but there is **no `playwright.config.*` and no spec suite**. The pattern used is interactive Playwright-MCP sessions (artifacts in `.playwright-mcp/` — console logs, screenshots):

1. Sign in through the real login page as the demo user (`E2E_LOGIN_EMAIL`/`E2E_LOGIN_PASSWORD` from `.env.local`)
2. Interact with the UI (fill forms, drag pipeline cards, run imports)
3. **Verify ground truth in the database directly** — run pg queries via the `postgres` client / `tsx` one-off scripts against `DATABASE_URL`, not just by reading the UI
4. **Clean up test rows afterward** (delete or soft-delete anything created during verification)

## Simulated-JWT RLS Testing

To verify RLS policies behave per role without real browser sessions, run SQL against the service-role connection simulating an authenticated user:

```sql
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', '<user-uuid>', 'role', 'authenticated')::text, true);
  -- assert visibility, e.g.:
  select count(*) from activities;   -- admin sees all (178), rep sees own slice (74)
rollback;
```

Pattern established during D-038/D-039 verification (see `Project_notes_folder/sessions/2026-06-12-oauth-fix-per-rep-rls.md`). Key points:
- Wrap in `begin ... rollback` so nothing persists
- `set local role authenticated` switches off service-role bypass
- `request.jwt.claims` `sub` must be the target user's `auth.users` id
- Assert exact row counts for admin vs rep, and test both read AND write paths (e.g. rep attaching own unmatched inbox item)

## Coverage

**Requirements:** None enforced. No coverage tooling.

**Known gaps (be extra careful here):**
- Server actions have no automated tests — the `.select("id")` 0-row guard convention exists because an untested RLS interaction silently no-opped (D-043)
- UI components untested except via route-walk body markers and manual Playwright sessions
- Sync scripts (`scripts/mailshake-sync.mts`, `scripts/dialpad-*.mts`) verified only by running against real data + DB spot checks

## Test Data

- Demo user `demo@schoolconex.com` is the standing E2E identity (only password-auth user; credentials in `.env.local`, gitignored)
- `npm run demo:purge` (`scripts/purge-demo-data.mts`) removes demo data
- Fixtures are inline object literals in `tests/integration-sync.test.mts` (real anonymized Mailshake/Dialpad payload shapes) — no fixture directory

## Definition of Done for a Change

1. `npx tsc --noEmit` clean
2. `npm run build` succeeds
3. `tsx scripts/e2e-rayan.mts` all routes ✓ (with `ROUTES` extended for any new page)
4. For RLS/permission changes: sim-JWT SQL assertions for both admin and rep
5. For UI flows: Playwright MCP walkthrough + DB ground-truth query + cleanup
6. Do NOT run or rely on `npm run lint`

---

*Testing analysis: 2026-07-11*
