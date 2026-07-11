# Codebase Structure

**Analysis Date:** 2026-07-11

## Directory Layout

```
SchoolConex_CRM/
├── app/
│   ├── (auth)/login/            # Login page + auth actions
│   ├── (dashboard)/             # All authenticated CRM pages (shared layout.tsx)
│   │   ├── accounts/            # Account list/detail/new/edit + nested contacts
│   │   │   ├── [id]/            # Detail, edit, contacts/[contactId]/edit, contacts/new
│   │   │   ├── import/          # CSV/Excel import wizard (page + actions)
│   │   │   └── imports/         # Import batch history + [batchId] detail + revert actions
│   │   ├── activities/          # Server actions for notes/tasks (actions.ts only)
│   │   ├── campaigns/           # Mailshake campaign list + [id] detail
│   │   ├── dashboard/           # KPI dashboard
│   │   ├── documents/           # Drive document actions (actions.ts only)
│   │   ├── inbox/               # Unmatched-activity inbox (account_id IS NULL)
│   │   ├── opportunities/       # List, [id] detail/edit, new, line-items + invoice actions
│   │   └── settings/            # audit/, catalog/ (products+packages), integrations/,
│   │                            #   pipelines/, templates/, users/ (role management)
│   ├── api/
│   │   ├── cron/                # Vercel cron routes: daily-digest, dialpad-sync,
│   │   │                        #   gmail-sync, mailshake-sync (CRON_SECRET bearer)
│   │   ├── webhooks/            # dialpad, mailshake, stripe, whatsapp (public, sig-verified)
│   │   ├── gmail/connect/       # Per-user Gmail OAuth start
│   │   ├── google-drive/connect/# Per-user Drive OAuth start
│   │   ├── inngest/             # Inngest function serving endpoint
│   │   └── leads/website/       # Public website lead-form intake
│   ├── auth/                    # callback, gmail-callback, google-drive-callback, sign-out
│   ├── layout.tsx               # Root layout
│   └── page.tsx                 # Root redirect
├── components/
│   ├── crm/                     # Domain components (forms, timeline, pipeline board, wizard)
│   ├── layout/                  # app-sidebar, top-bar, global-search, user-menu
│   └── ui/                      # shadcn/ui primitives (button, dialog, table, ...)
├── hooks/                       # use-mobile.ts
├── inngest/
│   ├── client.ts                # Inngest client (id: schoolconex-crm)
│   └── functions/               # *-process-event, *-sync, drive-status-reconcile + index.ts
├── lib/
│   ├── auth/session.ts          # getCurrentUser / requireUser / requireRole
│   ├── crm/                     # Read query helpers (RLS sb client, server-only)
│   ├── db/                      # index.ts (Drizzle service-role client), schema.ts
│   ├── import/                  # engine.ts (chunk processor), columns.ts (mapping)
│   ├── integrations/            # Provider clients + record-activity, contact-matcher,
│   │   │                        #   auto-pipeline, mailshake-*, dialpad*, stripe, twilio,
│   │   │                        #   mailer, digest, slack-notify
│   │   └── google/              # gmail.ts, drive.ts, oauth.ts
│   ├── supabase/                # server.ts, browser.ts, middleware.ts (auth gate)
│   └── utils.ts                 # cn() etc.
├── supabase/
│   ├── migrations/              # 0001..0012 SQL (RLS, triggers, RPCs, tables)
│   └── seed/                    # Default pipelines, demo data
├── scripts/                     # Operational one-shots (*.mts): apply-sql, backfills,
│                                #   reattribution, user SQL, e2e probes, browser automation
├── tests/                       # integration-sync.test.mts
├── docs/                        # research/ (pipedrive-teardown), superpowers, website-lead-form
├── Project_notes_folder/        # Agent memory (PROJECT_NOTES, decisions, sessions) — DO NOT DELETE
├── middleware.ts                # Delegates to lib/supabase/middleware.ts
├── drizzle.config.ts            # Drizzle Kit config
├── vercel.json                  # Cron schedules + deploy config
└── proxy.ts                     # Local dev proxy
```

## Directory Purposes

**`app/(dashboard)/`:**
- Purpose: every authenticated CRM screen; route group shares `app/(dashboard)/layout.tsx` (sidebar + top bar)
- Contains: `page.tsx` server components (reads via `lib/crm/*`) and colocated `actions.ts` server actions (writes via RLS `sb` client)
- Key files: `app/(dashboard)/accounts/page.tsx`, `app/(dashboard)/accounts/actions.ts`, `app/(dashboard)/opportunities/[id]/page.tsx`

**`app/api/`:**
- Purpose: machine entry points only — crons, webhooks, OAuth connect, Inngest, public lead intake. The UI never calls these; it uses server actions.
- All paths under `/api/webhooks`, `/api/cron`, `/api/inngest`, `/api/leads` are public per the allowlist in `lib/supabase/middleware.ts` and self-authenticate (signatures / CRON_SECRET).

**`components/crm/`:**
- Purpose: domain-specific UI. Forms are `"use client"` and call server actions; display components receive server-fetched props.
- Key files: `account-form.tsx`, `contact-form.tsx`, `opportunity-form.tsx`, `activity-timeline.tsx`, `pipeline-board.tsx`, `import-wizard.tsx`, `line-items-editor.tsx`

**`components/ui/`:**
- Purpose: shadcn/ui primitives, generated via `components.json`. Do not put domain logic here.

**`lib/crm/`:**
- Purpose: all page-facing READ queries; one module per entity (`accounts.ts`, `contacts.ts`, `opportunities.ts`, `activities.ts`, `dashboard.ts`, `documents.ts`, `mailshake.ts`). Export row types + list/get functions. Always `import "server-only"` and use `getSupabaseServerClient()`.

**`lib/db/`:**
- Purpose: Drizzle service-role client (`index.ts`, bypasses RLS — crons/integrations only) and the full schema (`schema.ts`). Keep `schema.ts` in lockstep with `supabase/migrations/` (generated columns like `accounts.norm_name` get dropped by drizzle push if absent).

**`lib/integrations/`:**
- Purpose: external-system logic. `record-activity.ts` is the ONLY place that inserts parent `activities` rows from integration code. `contact-matcher.ts` and `auto-pipeline.ts` also use the service-role client by design.

**`lib/import/`:**
- Purpose: import engine shared by the UI wizard and scripts. Client-agnostic — caller supplies the SupabaseClient (RLS or service-role) and thus the authorization.

**`inngest/functions/`:**
- Purpose: async processors triggered by webhook-sent events + scheduled syncs. Register new functions in `inngest/functions/index.ts`; served by `app/api/inngest/route.ts`.

**`supabase/migrations/`:**
- Purpose: numbered SQL migrations (RLS policies, triggers, RPCs, new tables). Applied with `tsx scripts/apply-sql.mts` — NOT drizzle push.

**`scripts/`:**
- Purpose: operational one-shot `.mts` scripts (backfills, reattribution, provisioning, e2e probes, Playwright/CDP browser automation). Run with `tsx`. `create-*-user.sql` re-assert role assignments (D-039) — keep idempotent.

**`Project_notes_folder/`:**
- Purpose: agent session memory — `PROJECT_NOTES.md`, `decisions.md`, `CHANGELOG.md`, `sessions/`. Not application code. **Do not delete or restructure.**

## Key File Locations

**Entry Points:**
- `middleware.ts` → `lib/supabase/middleware.ts`: auth gate + public-path allowlist
- `app/(dashboard)/layout.tsx`: authenticated shell
- `app/api/cron/*/route.ts`, `app/api/webhooks/*/route.ts`: machine entry points

**Configuration:**
- `vercel.json`: cron schedules; `drizzle.config.ts`; `next.config.ts`; `components.json` (shadcn); `tsconfig.json` (`@/*` path alias)

**Core Logic:**
- `lib/db/schema.ts`: single source of truth for the data model (with migrations)
- `lib/auth/session.ts`: `requireUser` / `requireRole`
- `lib/integrations/record-activity.ts`: canonical activity writer
- `lib/import/engine.ts`: import/dedupe engine

**Testing:**
- `tests/integration-sync.test.mts` (minimal — one integration test file)

## Naming Conventions

**Files:**
- kebab-case everywhere: `contact-matcher.ts`, `activity-timeline.tsx`, `mailshake-sync.ts`
- Server actions: colocated `actions.ts` next to the `page.tsx` they serve
- One-shot scripts: `scripts/<domain>-<verb>.mts` (e.g. `dialpad-backfill.mts`)

**Directories:**
- Route groups `(auth)` / `(dashboard)`; dynamic segments `[id]`, `[contactId]`, `[batchId]`

## Where to Add New Code

**New CRM entity/page:**
- Read helper: `lib/crm/<entity>.ts` (server-only, `sb` client, exported row types)
- Page: `app/(dashboard)/<entity>/page.tsx` (+ `[id]/page.tsx`, `new/page.tsx`)
- Mutations: `app/(dashboard)/<entity>/actions.ts` ("use server", zod, `requireUser`, `sb`, row-count guard on updates, `revalidatePath`)
- Form component: `components/crm/<entity>-form.tsx`
- Schema: add table to `lib/db/schema.ts` AND a new numbered migration in `supabase/migrations/` (with RLS policies); apply via `tsx scripts/apply-sql.mts`

**New integration:**
- Provider client + sync logic: `lib/integrations/<provider>.ts`
- Webhook: `app/api/webhooks/<provider>/route.ts` — verify signature, insert `integration_events_raw` with `onConflictDoNothing`, send Inngest event
- Processor: `inngest/functions/<provider>-process-event.ts`, register in `inngest/functions/index.ts`
- Write activities ONLY via `recordActivity()` + child-table insert; match via `contact-matcher.ts`
- Scheduled sync: `app/api/cron/<provider>-sync/route.ts` + entry in `vercel.json`

**Utilities:**
- Shared helpers: `lib/utils.ts`; client hooks: `hooks/`

## Special Directories

**`supabase/seed/`:** default pipelines + demo data SQL. Committed. Run manually.
**`.planning/`:** GSD planning docs. Committed.
**`Project_notes_folder/`:** agent memory. Committed. Never delete.
**`.playwright-mcp/`:** browser-automation artifacts. Generated. Not committed.
**`node_modules/`, `tsconfig.tsbuildinfo`:** generated, not committed.

---

*Structure analysis: 2026-07-11*
