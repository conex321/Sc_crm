# Codebase Concerns — risks, debt, footguns

> Written 2026-07-11 for the pipedrive-parity-v1 milestone. Every item below was
> verified in code or hit live during D-041…D-044 work — treat these as hard
> constraints, not suggestions.

## Data-layer footguns

- **PostgREST `.in()` URL limit** — supabase-js `.in()` filters travel in the
  request URL. >~100 values breaks with `TypeError: fetch failed`. Sub-batch at
  100 (pattern: `selectIn()` in `lib/import/engine.ts`). Hit live during the
  D-044 sheet import.
- **PostgREST 1,000-row response cap** — any single select silently truncates at
  ~1000 rows regardless of `.limit()`. Paginate with `.range(from, from+999)`
  loops (patterns: `finalizeBatch` in `lib/import/engine.ts`,
  `app/(dashboard)/accounts/imports/[batchId]/page.tsx`). Caused silent
  stat under-counting in D-044 before the fix.
- **Drizzle `db:push` drops unlisted columns** — `lib/db/schema.ts` must mirror
  every migration column, including the **generated column `accounts.norm_name`**
  (`generatedAlwaysAs`). Migrations must be idempotent: `scripts/apply-sql.mts`
  re-applies ALL files every run (guarded enums, `if not exists`, `create or
  replace`, drop-policy-then-create).
- **`integration_events_raw` is sacred** — append-only; never edit historical
  payloads (some old Dialpad rows are double-encoded JSON strings — handle both
  shapes on read, never rewrite).

## RLS realities

- **Reps cannot soft-delete** — setting `deleted_at` fails RLS because the
  non-admin SELECT visibility check (`deleted_at is null or is_admin()`) is
  applied against the new row. All delete paths for reps must be service-role
  server actions gated in app code (pattern: `requireOwnedBatch` in
  `app/(dashboard)/accounts/imports/actions.ts`). Hard DELETE is admin-only.
- **Accounts/opportunities SELECT is open to all authenticated** (D-038);
  per-rep privacy lives on activities/email_messages/calls/mailshake tables
  (migration 0008). UPDATE on accounts/contacts/opportunities is rep-open
  (migration 0011). Revenue figures (`billing_summary`) are **UI-gated
  admin-only** — every new surface must re-apply that gate.
- **No Supabase service-role KEY exists anywhere** (verified empty even in
  Vercel). Service-role DB access = the Drizzle client over `DATABASE_URL`
  only. Scripts that need the RLS path sign in with the password test account
  (`E2E_LOGIN_EMAIL`/`E2E_LOGIN_PASSWORD` in `.env.local` — post-D-044
  rotation; NEVER hardcode credentials, the repo is public on GitHub).

## UI footguns

- **Radix Select throws on `<SelectItem value="">`** (D-043 outage). Use
  sentinel values (`"unassigned"`, `"none"`, `"keep"`) and map to null
  server-side.
- **Compact density is intentional** — 14px root font, `text-xs`/`text-sm`, `size="sm"`
  buttons. The Pipedrive reskin must preserve data density, not inflate it.
- **`NEXT_PUBLIC_*` env vars are baked at build time** — changing one in Vercel
  requires a redeploy.
- **Legacy USD formatters** remain in `components/crm/opportunity-list.tsx`,
  `components/crm/document-list.tsx`, `app/(dashboard)/settings/catalog/page.tsx`,
  `app/(dashboard)/opportunities/[id]/page.tsx` — CAD via `Intl en-CA` is the
  prescriptive pattern (see `lib/crm/dashboard.ts` `fmtCad`); sweep during the
  design-system phase.

## Infra / process

- **Inngest functions are dead in production** (no `INNGEST_EVENT_KEY`/
  `SIGNING_KEY` in Vercel). Anything that must run in prod runs inline in the
  webhook route or as a Vercel cron (pattern: `lib/integrations/mailshake-events.ts`
  inline + daily sweeper). Do not add prod-critical logic as Inngest-only.
- **Gmail OAuth is `gmail.readonly` only**; sending email requires adding
  `gmail.send` scope + re-consent by each rep. As of 2026-07-06 **neither rep
  has connected Gmail** (`integration_credentials` empty) — the email phase has
  a human-activation dependency.
- **No staging** — `npx vercel --prod --yes` deploys straight to the live
  domain. Verify locally (dev server + Playwright + e2e walk) before deploying.
- **Scale**: ~5.5k accounts / ~6.8k contacts after imports. `/accounts` renders
  all matching rows server-side with no pagination — new list views (deals
  list, leads inbox, people/orgs) MUST paginate or window.
- **Lint is broken** (`next lint` invalid under Next 16; eslint 9 config
  circular) — tsc + build + e2e walk + Playwright are the actual gates. No unit
  test infrastructure.
- **Cron auth**: all `/api/cron/*` require `Authorization: Bearer $CRON_SECRET`;
  `/api/webhooks/*` + `/api/leads/*` are middleware-public and must validate
  internally.

## Grep findings (TODO/FIXME sweep 2026-07-11)

- No TODO/FIXME comments of consequence in `app/`, `lib/`, `components/`
  (checked); outstanding work is tracked in `Project_notes_folder/`, not code
  comments. Open notes items: Mailshake webhook registration + activation env
  (`MAILSHAKE_WEBHOOK_SECRET`, `SLACK_WEBHOOK_URL`, `SMTP_*`,
  `WEBSITE_LEAD_TOKEN`, `HUBSPOT_ACCESS_TOKEN`), Gmail connects, ⌘K search stub
  (`components/layout/global-search.tsx`).
