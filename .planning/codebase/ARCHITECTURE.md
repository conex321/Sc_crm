# Architecture

**Analysis Date:** 2026-07-11

## Pattern Overview

**Overall:** Next.js App Router (server-first) monolith on Vercel, backed by Supabase Postgres, with a dual-privilege data-access model and an event-driven integration layer (webhooks + Vercel cron + Inngest).

**Key Characteristics:**
- Server Components render pages directly from typed query helpers in `lib/crm/*` — no client-side data fetching layer, no REST API for the UI.
- **Two DB clients with different privileges (critical invariant):**
  - Supabase `sb` client (`lib/supabase/server.ts`, anon key + user JWT cookie) — **enforces RLS**. Used by ALL user-facing pages and server actions.
  - Drizzle `db` client (`lib/db/index.ts`, `DATABASE_URL` service role) — **bypasses RLS**. Used ONLY by crons, webhooks, Inngest jobs, and integration helpers. Tightening RLS automatically scopes page reads; it never affects crons.
- Single-table activity timeline: parent `activities` row + 1:1 child tables per channel (`notes`, `tasks`, `calls`, `messages`, `email_events`, `email_messages`, `contract_events`, `payments`).
- Append-only raw event log (`integration_events_raw`) as the ingestion boundary — webhooks persist first, process after (sacred/never mutated except `processed_at`/`error`).

## Layers

**Presentation (Server Components + client forms):**
- Purpose: Render CRM pages; forms are client components that submit to server actions.
- Location: `app/(dashboard)/*/page.tsx`, `components/crm/*`, `components/layout/*`, `components/ui/*` (shadcn/ui)
- Contains: async server components (`await requireUser()`, then call `lib/crm/*` helpers), client form components (`"use client"` in `components/crm/`)
- Depends on: `lib/crm/*` (reads), `app/(dashboard)/*/actions.ts` (writes), `lib/auth/session.ts`
- Used by: end users via Next.js routing

**Server Actions (writes):**
- Purpose: All user-initiated mutations.
- Location: `app/(dashboard)/*/actions.ts` (e.g. `app/(dashboard)/accounts/actions.ts`, `app/(dashboard)/opportunities/actions.ts`, `app/(dashboard)/settings/users/actions.ts`)
- Contains: `"use server"` functions following the canonical pattern (see Data Flow below)
- Depends on: `lib/auth/session.ts` (`requireUser`/`requireRole`), `lib/supabase/server.ts` (`sb` client, RLS-enforced), `zod`
- Used by: form components in `components/crm/*`

**Query Helpers (reads):**
- Purpose: Typed, reusable read queries for pages.
- Location: `lib/crm/` — `accounts.ts`, `contacts.ts`, `opportunities.ts`, `activities.ts`, `dashboard.ts`, `documents.ts`, `mailshake.ts`
- Contains: `import "server-only"` modules exporting typed row shapes (e.g. `AccountWithOwner`) and list/get functions built on the `sb` client with explicit `select` strings, `.is("deleted_at", null)` soft-delete filters, and relational embeds (`owner:owner_user_id(id, full_name)`)
- Depends on: `lib/supabase/server.ts`
- Used by: page server components

**Integration Layer (service-role writes):**
- Purpose: Ingest and normalize external events into CRM records.
- Location: `lib/integrations/` — `record-activity.ts` (**the single canonical writer for parent `activities` rows** — all integration code inserts activities through it, paired with a child-table insert in the caller), `contact-matcher.ts` (email/phone/name matching via Drizzle service role — RLS client would see zero rows in cron context), `auto-pipeline.ts` (post-Mailshake-sync: auto-create accounts/contacts, retro-link Dialpad calls), `mailshake-sync.ts` / `mailshake-events.ts` / `mailshake-transform.ts` / `mailshake.ts`, `dialpad.ts` / `dialpad-client.ts`, `stripe.ts`, `twilio.ts`, `google/{gmail,drive,oauth}.ts`, `mailer.ts`, `digest.ts`, `slack-notify.ts`
- Depends on: `lib/db` (Drizzle service role), `lib/db/schema.ts`
- Used by: `app/api/cron/*`, `app/api/webhooks/*`, `inngest/functions/*`

**Import Engine:**
- Purpose: CSV/Excel/API lead imports with dedupe and revertible lineage (D-044).
- Location: `lib/import/engine.ts` (chunk processor), `lib/import/columns.ts` (column mapping)
- Pattern: deliberately NOT `server-only` — accepts any `SupabaseClient`; the import wizard's server actions (`app/(dashboard)/accounts/import/actions.ts`) pass the RLS-enforced client, while scripts pass a service-role client. Authorization lives with the caller. Dedupe: accounts by generated `norm_name` column; contacts by `(account_id, lower(email))` then full name. Lineage recorded per row in `import_batch_rows` (`created` vs `matched`) so revert deletes only rows the batch CREATED.

**Background Jobs (Inngest):**
- Purpose: Async event processing and scheduled syncs.
- Location: `inngest/client.ts`, `inngest/functions/` — `mailshake-process-event.ts`, `dialpad-process-event.ts`, `stripe-process-event.ts`, `whatsapp-process-event.ts`, `mailshake-sync-campaigns.ts`, `dialpad-sync-rayan.ts`, `drive-status-reconcile.ts`; served at `app/api/inngest/route.ts`
- Used by: webhook routes send `inngest.send(...)` after persisting the raw event

## Data Flow

**User read (page render):**
1. Request hits `middleware.ts` → `lib/supabase/middleware.ts` `updateSession()` — refreshes Supabase session cookie, redirects unauthenticated users to `/login` unless path is in `PUBLIC_PATHS`
2. Page server component calls `requireUser()` (`lib/auth/session.ts`)
3. Page calls a `lib/crm/*` helper (e.g. `listAccounts()` in `lib/crm/accounts.ts`) using the RLS-enforced `sb` client — per-rep visibility comes from RLS policies (`supabase/migrations/0008_per_rep_ownership.sql`, `0011_rep_edit_access.sql`)
4. Component renders rows; filtering via URL `searchParams`

**User write (server action) — canonical pattern (`app/(dashboard)/accounts/actions.ts`):**
1. `"use server"` at file top
2. `const user = await requireUser()` (or `requireRole(["admin"])`)
3. `const parsed = schema.parse(fromForm(form))` — zod schema per action file
4. `const sb = await getSupabaseServerClient()` — RLS-enforced writes, stamping `created_by`/`updated_by` with `user.id`
5. `if (error) throw new Error(error.message)` — thrown errors surface as toasts in the client form
6. **Guard against RLS silent no-op on UPDATE:** `.select("id")` after update, then `if (!data || data.length === 0) throw` — RLS filtering to 0 rows otherwise looks like a successful save (D-043)
7. `revalidatePath(...)` then `redirect(...)`

**Inbound integration event (webhook):**
1. `app/api/webhooks/{mailshake,dialpad,stripe,whatsapp}/route.ts` — public per `PUBLIC_PATHS` allowlist in `lib/supabase/middleware.ts`; each verifies its provider signature/secret
2. Insert raw payload into `integration_events_raw` via Drizzle with `.onConflictDoNothing()` on `(provider, event_id)` — idempotency boundary
3. If newly inserted, `inngest.send(...)` to trigger the matching `inngest/functions/*-process-event.ts`
4. Processor matches contact/account via `lib/integrations/contact-matcher.ts`, writes the parent row via `recordActivity()` (`lib/integrations/record-activity.ts`), inserts the channel child row, marks `processed_at`
5. Unmatched events land as activities with `account_id = NULL` → surfaced in `/inbox` (Unmatched inbox, D-014)

**Scheduled sync (Vercel cron):**
1. `app/api/cron/{mailshake-sync,dialpad-sync,gmail-sync,daily-digest}/route.ts` — GET, guarded by `Authorization: Bearer ${CRON_SECRET}` (Vercel injects it); schedules in `vercel.json`
2. Route calls the shared sync helper (e.g. `syncAllCampaigns()` in `lib/integrations/mailshake-sync.ts`), then `runAutoPipeline()` and event sweeps
3. Sync owner attribution comes from `MAILSHAKE_SYNC_USER_EMAIL`/`MAILSHAKE_SYNC_USER_ID`; owner columns stamped on INSERT only so admin reassignments survive re-syncs (D-038)

**State Management:**
- No client state library. Server components + URL search params for filters; `revalidatePath` after mutations; `sonner` toasts for action errors.

## Key Abstractions

**Activity parent/child (D-011):**
- Purpose: One timeline across all channels. Parent `activities` (channel, direction, occurred_at, summary, nullable account/contact/opportunity/user links); child tables keyed by `activity_id` PK/FK hold channel payloads.
- Examples: `lib/db/schema.ts` lines defining `activities`, `notes`, `tasks`, `calls`, `messages`, `emailEvents`, `emailMessages`, `contractEvents`, `payments`; rendered by `components/crm/activity-timeline.tsx`
- Pattern: insert parent via `recordActivity()`, child via caller

**Dual-client trust model:**
- Purpose: RLS is the single authorization layer for humans; service role is reserved for verified machine sources.
- Examples: `lib/supabase/server.ts` (user), `lib/db/index.ts` (machine; lazy Proxy init because Next 16's build phase imports the module without env)
- Pattern: `import "server-only"` on every module touching either client

**Idempotent external-ID upserts:**
- Purpose: Safe re-syncs/re-imports.
- Examples: `accounts.external_ids` jsonb (`quickbooks_id`, `stripe_ids`), `accounts.norm_name` generated column (dedupe key — MUST stay in lockstep with migration `0012_import_batches.sql`), unique indexes on `mailshake_leads.mailshake_lead_id`, `calls.dialpad_call_id`, `email_messages.provider_message_id`, `integration_events_raw (provider, event_id)`

## Entry Points

**`middleware.ts` → `lib/supabase/middleware.ts`:**
- Triggers: every request
- Responsibilities: session refresh + auth gate; `PUBLIC_PATHS` = `/login`, `/auth/callback`, `/auth/sign-out`, `/api/inngest`, `/api/health`, `/api/webhooks`, `/api/cron`, `/api/leads`

**`app/(dashboard)/layout.tsx`:**
- Triggers: all authenticated pages
- Responsibilities: sidebar (`components/layout/app-sidebar.tsx`), top bar, global search

**`app/api/cron/*/route.ts`:** Vercel scheduled invocations (CRON_SECRET bearer auth)

**`app/api/webhooks/*/route.ts`:** provider POSTs (per-provider signature verification)

**`app/api/leads/website/route.ts`:** public website lead-form intake

**`app/api/inngest/route.ts`:** Inngest function serving

**`app/auth/{callback,gmail-callback,google-drive-callback,sign-out}/route.ts`:** Supabase OAuth + per-user Google OAuth callbacks (tokens stored in `integration_credentials`)

## Error Handling

**Strategy:** throw in server actions → client form catches and shows `sonner` toast; webhook/cron routes return JSON `{ ok: false, error }` with 4xx/5xx and record failures in `integration_events_raw.error`.

**Patterns:**
- Zod `.parse()` throws on invalid form input (validation happens server-side)
- Post-UPDATE `.select("id")` row-count guard against RLS silent no-ops (D-043)
- Webhooks return 200 for unrecognized-but-valid payloads to stop provider retries

## Cross-Cutting Concerns

**Logging:** `console.*` in crons/integrations; `audit_log` table (schema in `lib/db/schema.ts`, triggers in `supabase/migrations/0001_rls_and_triggers.sql`) records row-level before/after; viewer at `app/(dashboard)/settings/audit/page.tsx`
**Validation:** zod schemas colocated in each `actions.ts`
**Authentication:** Supabase Auth (Google OAuth) via cookie session; `requireUser()` / `requireRole()` in `lib/auth/session.ts`; profile row in `users` table mirrors `auth.users` (post-signup trigger). Roles: rep / manager / admin (D-039: matthew=admin, rayan=rep)
**Authorization:** Postgres RLS policies in `supabase/migrations/` (`0001`, `0003`, `0004`, `0008`, `0011`) — the only per-row access control; app code does not re-implement it

## Data Model Core

- `users` — wraps `auth.users`; role, `dialpad_user_id`/`dialpad_phone` for call attribution
- `accounts` — schools/orgs; owner, `customer_status` (active/inactive/prospect from QuickBooks/Stripe), `external_ids`, `billing_summary`, generated `norm_name`, soft delete
- `contacts` — belong to accounts; email/phone/whatsapp; soft delete
- `pipelines` / `pipeline_stages` — per service line (principal_service, lms, courses); stage position/probability/won/lost
- `opportunities` — account + pipeline + stage; amount, owner, status open/won/lost; `opportunity_line_items` ↔ `products`/`packages` catalog
- `activities` + child tables (see Key Abstractions)
- `mailshake_campaigns` / `mailshake_leads` — synced campaign + per-recipient lead state, linked to accounts/contacts
- `documents` / `contract_templates` — Google Drive file references
- `import_batches` / `import_batch_rows` — import runs + per-row lineage for safe revert
- `integration_events_raw` — append-only webhook audit log; **sacred: never delete or rewrite payloads**
- `audit_log` — row-level change history

---

*Architecture analysis: 2026-07-11*
