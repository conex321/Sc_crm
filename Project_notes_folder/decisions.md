## Architecture & Key Decisions

### D-001 — Integration philosophy: Hybrid (sync + selective send) — 2026-05-06
**Decision:** CRM ingests events from all five vendors (Dialpad, WhatsApp, Stripe, Mailshake, Google Drive) and adds outbound only for high-value actions (generate contract, log call note, push to Mailshake campaign, trigger Stripe invoice). Reps continue working in Dialpad app, WhatsApp, and Mailshake natively.
**Why:** Lightest path to a unified per-account history without rebuilding inboxes/dialers. Preserves rep workflows.
**Alternatives considered:** Read-only sync (rejected — reps still tab between tools, less value); full source-of-truth control plane with click-to-call + embedded inboxes (rejected — months of extra build, partial duplication of vendor functionality).

### D-002 — Drive-as-source-of-truth for contracts — 2026-05-06
**Decision:** Contracts stay in Google Drive. CRM stores `documents` rows with `drive_file_id`, `drive_link`, mime, status, and metadata. No PDF/DOCX bytes copied into Supabase Storage. Supabase Storage used only for ad-hoc non-contract uploads (avatars, screenshots in notes).
**Why:** Avoids dual-source-of-truth and reconciliation bugs. Leverages existing Drive folder structure.
**Alternatives considered:** CRM-owned in Supabase Storage with Drive backup (rejected — dual maintenance overhead); two-way mirror (rejected — sync bugs not worth the UX gain).

### D-003 — Multiple configurable pipelines per service line; multi-opp per account — 2026-05-06
**Decision:** Pipelines are admin-editable, one per service line (Principal Service, LMS, Courses initially). One account (a school) can have multiple open opportunities simultaneously, each in its own pipeline.
**Why:** Service lines have meaningfully different sales motions; schools regularly buy more than one thing.
**Alternatives considered:** Single universal pipeline + service-type tag (rejected — stages forced into one shape); single-opp-per-account (rejected — doesn't match how schools buy).

### D-004 — Application stack: Next.js 15 + Supabase + Vercel + Inngest — 2026-05-06
**Decision:**
- Frontend + server: Next.js 15 (App Router, Server Components, Server Actions, Route Handlers for webhooks)
- DB / Auth / Storage: Supabase (Postgres + Auth + Storage)
- Background jobs: Inngest (managed)
- Hosting: Vercel for the web app
- UI primitives: Tailwind + shadcn/ui

**Why:** One codebase covers UI + webhooks + cron handlers. Supabase already in use. All managed services — no infra team needed. Inngest gives retries / scheduled syncs / fan-out without rolling own queue.
**Alternatives considered:** Remix or SvelteKit (no functional advantage); React SPA + dedicated backend (overkill for an internal tool); Retool/Budibase low-code (lower ceiling, not chosen).

### D-005 — Catalog model: products + packages + line-item quotes — 2026-05-06
**Decision:** Three tables — `products` (the 70+ courses + service tiers), `packages` (named bundles, joined to products via `package_items`), `opportunity_line_items` (quote rows referencing product or package, with quantity, unit_price override, discount_pct).
**Why:** Covers ~95% of real B2B selling without becoming a CPQ project.
**Alternatives considered:** Flat SKU list (rejected — no overrides, every package = manual data entry); full CPQ with rules engine + approval workflows (rejected — overkill).

### D-006 — MVP v1 scope: Foundation + Drive + Dialpad — 2026-05-06
**Decision:** v1 ships with auth, accounts/contacts/opportunities, configurable pipelines, account-360 page with timeline, manual notes/tasks, Google Drive integration (attach + generate-from-template + status reconciliation), and Dialpad call-log ingestion. Defer: WhatsApp, Mailshake, Stripe, full catalog/quoting.
**Why:** Reps need daily-usable in ~6 weeks; pipelines + Drive contracts + Dialpad calls is the smallest combination that beats the current spreadsheet workflow.
**Alternatives considered:** Foundation only (rejected — no time saved, low adoption); foundation + all integrations end-to-end (rejected — ~12-16 weeks before any feedback); foundation + Mailshake + Stripe (rejected — Dialpad/Drive higher daily-touch value).

### D-007 — Auth: Google Workspace SSO via Supabase Auth, domain-restricted — 2026-05-06
**Decision:** Supabase Auth + Google OAuth, restricted to the company domain via the `hd` parameter and a server-side email-domain check at sign-in. No password auth, no signup flow.
**Why:** Reps already have Google accounts; one-click login; no separate password management.
**Alternatives considered:** Email/password (rejected — extra credential to manage); magic link (acceptable fallback if SSO has a hiccup, not primary).

### D-008 — Three-tier RBAC enforced by Postgres RLS — 2026-05-06
**Decision:** Roles `rep` / `manager` / `admin`. Reps CRUD their own records, read everyone's. Managers reassign + edit any record. Admins additionally edit catalog, pipelines, user roles, integration credentials. Enforcement is Postgres RLS policies on every table; Server Actions re-check role for writes (defense in depth).
**Why:** RLS makes authorization a database guarantee — can't be bypassed by a buggy route.
**Alternatives considered:** App-only authorization (rejected — fragile); fine-grained ACLs per record (rejected — premature for small team).

### D-009 — Drive integration uses dual auth (per-user OAuth + service account) — 2026-05-06
**Decision:** Per-user OAuth with `drive.file` scope (least privilege — only files the app creates or the user explicitly opens via Drive Picker) for rep-attached files and rep-owned generated contracts. Service account with shared access to "CRM Templates" and "CRM Generated" folders for system-level operations (template reads, periodic status reconciliation).
**Why:** Files generated by reps must appear in their personal Drive and use their identity for sharing. System operations need a stable, user-independent identity. `drive.file` is far less invasive than `drive.readonly`.
**Alternatives considered:** Service account only (rejected — files appear orphaned to the rep); per-user only (rejected — no stable identity for cron jobs); broad `drive.readonly` scope (rejected — security overreach).

### D-010 — Webhook ingestion: raw event log + idempotent parsing — 2026-05-06
**Decision:** Every inbound webhook payload is signature-verified, then inserted into `integration_events_raw` (append-only, unique index on `(provider, event_id)`), then an Inngest job is enqueued to parse + write typed activity rows. The webhook handler returns 200 fast.
**Why:** Replay capability when a parser bug eats data. Idempotency on dedup key. Failure isolation via Inngest retries + dead-letter view.
**Alternatives considered:** Direct synchronous parsing in webhook handler (rejected — webhook timeouts + retry storms on transient failures); skip the raw log (rejected — no replay).

### D-011 — Polymorphic activity timeline (parent + per-channel child tables) — 2026-05-06
**Decision:** Single `activities` table holds common fields (account_id, contact_id, opportunity_id, channel, direction, occurred_at, summary). Per-channel child tables (`calls`, `messages`, `email_events`, `notes`, `tasks`, `contract_events`, `payments`) extend with channel-specific fields, joined 1:1 via `activity_id`.
**Why:** Type-safe queries, RLS clarity, easy to add new channels.
**Alternatives considered:** Single `activities` table with JSON payload (rejected — no schema enforcement, harder to index); fully-separate per-channel tables with no parent (rejected — UNION queries get messy for the timeline view).

### D-012 — WhatsApp ingestion gated on Business API decision — 2026-05-06
**Decision:** Open question for v2/v3 planning: WhatsApp ingestion only works if the team is on WhatsApp Business API (Meta Cloud API or a BSP like Twilio). Personal WhatsApp / standalone WhatsApp Business app cannot be ingested via API.
**Why:** Architectural blocker for that integration. Surfacing now so it's resolved before Phase 6.
**Alternatives if Business API is not viable:** Skip WhatsApp ingestion entirely, accept manual notes; revisit shared-device approaches (fragile, not recommended).

### D-013 — Phase 1 execution lock-in — 2026-05-06
**Decision:** No Drive, Dialpad, Stripe, Mailshake, WhatsApp, quoting, or AI work until Phase 1 ships and is stable in real use (= two reps using it daily for a full week without blocker bugs). Phase 1 tables only: `users`, `accounts`, `contacts`, `pipelines`, `pipeline_stages`, `opportunities`, `activities`, `notes`, `tasks`, `audit_log`.
**Why:** Prevents scope creep — biggest risk now is mixing in integrations early and ending up half-built everywhere instead of usable anywhere.
**Alternatives considered:** Build Drive in parallel with foundation (rejected — splits attention, slows time-to-first-rep-using-it).

### D-014 — `activities.account_id` nullable + Unmatched inbox — 2026-05-06
**Decision:** `activities.account_id` is nullable. Inbound events from integrations (Phase 3+) whose contact lookup fails are inserted with `account_id = NULL` and surfaced in an explicit "Unmatched inbox" view where a rep can manually associate them to an account.
**Why:** Inbound calls/messages from unknown numbers can't be lost, but also shouldn't fail the webhook handler. Putting them in an inbox is the standard CRM pattern.
**Alternatives considered:** Drop unmatched events (rejected — data loss); auto-create a placeholder contact (rejected — pollutes contacts).

### D-015 — Standardized audit columns — 2026-05-06
**Decision:** Every table includes: `created_at`, `updated_at` (touched by trigger), `created_by` (uuid → users, nullable for system inserts), `updated_by` (uuid → users, nullable). Customer-facing entities (`accounts`, `contacts`, `opportunities`, `documents`) additionally include `deleted_at` for soft delete (RLS predicate hides soft-deleted rows from `rep` and `manager`; `admin` can see them).
**Why:** Consistency across tables, audit trail without a separate event-source table, soft delete prevents accidental data loss.
**Alternatives considered:** Audit-log-only (rejected — joining for "who last edited this row" is annoying); no audit columns (rejected — no accountability).

### D-017 — Phase 1 lock-in (D-013) relaxed by user instruction — 2026-05-06
**Decision:** Continue past Phase 1 into Phases 2-6 in this same session. User explicitly said "continue to the rest of the phases" after Phase 1 was committed. D-013 ("no Phase 2 work until Phase 1 stable in real use") was overridden by direct user request.
**Why:** User wants the full system code-complete in one push; vendor credentials will land asynchronously. Risk accepted: Phase 1 hasn't had its full week of two-rep daily use, but no production data is at stake.
**How to apply:** Each phase 2-6 is delivered as code-complete + DB schema + webhook endpoints. Activation requires vendor credentials + webhook URL registration on the vendor side. None of the integrations will fire without real credentials.

### D-018 — Activity inserts from integrations bypass RLS via Drizzle — 2026-05-06
**Decision:** Webhook handlers and Inngest job code use the server-only Drizzle client (DATABASE_URL = postgres role) to insert activities + child rows. This bypasses RLS, which is correct because webhooks have already been signature-verified and the system has no user identity to enforce against. App-code paths (Server Actions called from UI) still go through Supabase server client → RLS-enforced.
**Why:** RLS predicates require auth.uid(); webhook context has no user, and we don't want to weaken RLS to "allow anonymous inserts on activities" (would be a security regression).
**How to apply:** Use `recordActivity()` from `lib/integrations/record-activity.ts` for any future integration that needs to write activities. Do NOT call it from UI Server Actions.

### D-016 — UI direction: sidebar-first compact CRM/dashboard — 2026-05-06
**Decision:** Sidebar-first navigation (collapsible, primary entities: Accounts, Opportunities, Settings). Top utility bar for global search, quick-create, user menu. Compact typography (small base font, dense tables, low-padding cards). CRM/dashboard information density, not a marketing-style layout. shadcn/ui components used with reduced paddings.
**Why:** Reps need information density. Marketing-style large-padding layouts waste screen real estate when scanning hundreds of records.
**Alternatives considered:** Top-nav-only (rejected — sidebar communicates entity hierarchy better); standard shadcn defaults (rejected — too airy for a CRM).

### D-019 — Dialpad activated via poll-sync, not webhook — 2026-05-06
**Decision:** For local/dev (and as primary path until production webhook URL is registered), Dialpad call ingestion runs via Inngest cron `dialpad-sync-rayan` (`*/10 min`) hitting `GET /api/v2/call?user_id=...&started_after=<epoch_ms>&limit=50`. Watermark = max(`received_at`) on `integration_events_raw` minus 60s for clock skew. The webhook handler at `/api/webhooks/dialpad` continues to exist and remains idempotent — both paths share the same `integration_events_raw` dedup index on `(provider, event_id)`.
**Why:** Webhooks need a public URL (ngrok / deployed). Polling works against any environment. Dialpad's `/call` endpoint requires a company-admin API key (not user-tier — see F-005 / earlier 401 explorations).
**How to apply:** In `.env.local`, set `DIALPAD_API_KEY` to a company-admin key (not a personal-token JWT). Set `DIALPAD_FILTER_USER_ID` (currently `6598548464648192` for Rayan).
**Constraints:** Dialpad caps `limit` at 50 per page (we paginate via cursor). Duration field is in **milliseconds** (not seconds) — convert via `Math.round(c.duration / 1000)` before storing in `calls.duration_seconds` (smallint). Recording URL lives at `recording_details[0].url`, not `recording_url[0]`.

### D-020 — Internal calls (Workspace ↔ Workspace) tagged but still ingested — 2026-05-06
**Decision:** When a Dialpad call's `contact.email` ends with `@schoolconex.com`, mark the activity summary with `· internal` suffix and skip phone-to-contact matching (the other party is a coworker, not a CRM contact). Still ingest the call so the timeline + audit trail is complete.
**Why:** Rayan ↔ Matthew calls were polluting the unmatched inbox + contact-match attempts. Internal calls don't belong on a customer account anyway.
**How to apply:** Filter logic in `inngest/functions/dialpad-sync-rayan.ts` and `scripts/dialpad-backfill.mts`. The `· internal` label is in the activity summary; UI can suppress these later if desired.

### D-021 — Demo user created via direct SQL into auth.users — 2026-05-06
**Decision:** For local testing without configuring Supabase's Google provider, create a sign-in user via direct INSERT into `auth.users` (with `crypt(password, gen_salt('bf'))` and `email_confirmed_at = now()`) plus a matching `auth.identities` row with `provider='email'`. The post-signup trigger fires and creates the `public.users` row; first user gets role `admin`.
**Demo creds:** `demo@schoolconex.com` / `Test1234!`. Idempotent SQL at `scripts/create-demo-user.sql` + tsx wrapper at `scripts/run-demo-user.mts`.
**Why:** Email/password fallback on `/login` (also added) lets us test full pages without external Google OAuth setup. Once the user configures Supabase's Google provider, real Google sign-in works alongside the form.
**How to apply:** Run `npx tsx scripts/run-demo-user.mts` to create or refresh. NEVER do this in production — the password hash sits in DB.

### D-022 — Email/password sign-in form added alongside Google SSO — 2026-05-06
**Decision:** `/login` page now shows email + password fields above the Google button, separated by an "or" divider. Server Action `signInWithEmailPassword` validates domain (`@schoolconex.com`), calls `supabase.auth.signInWithPassword`, redirects on error to `/login?error=credentials|missing|domain`.
**Why:** Local development testing without Google provider configured. Useful as a fallback for production if SSO breaks. Does NOT bypass any RLS / role checks — same auth surface.
**How to apply:** Disable in production by removing the form (or gate behind `NODE_ENV !== 'production'`) once Supabase Google provider is configured. Or keep both, since they share identity.

### D-023 — Browser automation via Playwright + persistent Chrome over CDP — 2026-05-06
**Decision:** For tasks that need GCP / Drive / dashboard interaction, launch a long-running headed Chromium with the user's installed Chrome (`channel: "chrome"`) using a persistent profile dir at `.playwright-profile/` and `--remote-debugging-port=9222`. Many small one-shot scripts under `scripts/gcp-*.mts` connect via `chromium.connectOverCDP("http://127.0.0.1:9222")`, do an action, save a screenshot to `.playwright-shots/`, and disconnect.
**Why:** Single source of session state (cookies, login). User can manually intervene in the same window. Each script stays small + composable.
**Constraints:**
  - Downloads triggered via JS click sometimes don't fire `page.waitForEvent("download")` over CDP — use a polling-Downloads-folder fallback OR install the listener BEFORE the click. Service-account JSON download worked with the BEFORE-click listener.
  - Material radio buttons need `radio.check({ force: true })` (Playwright's role-aware path) — DOM `.click()` triggers visual but not Material's binding.
  - "Email addresses" chip-input style fields: walk `mat-form-field` → label match → child `input` and `fill()` via Playwright (not `keyboard.type`) for reliable input event dispatch.
  - GCP "Create credentials" / chip-input shows a global Search bar combobox at the same role; SCOPE selectors to the form region or you'll click search.

### D-024 — Drive integration project: schoolconex-crm under SchoolConex Workspace, NOT personal Gmail — 2026-05-06
**Decision:** GCP project for the Drive integration is `schoolconex-crm` (project number `489266381443`), created under the **schoolconex.com** organization while signed in as **matthew@schoolconex.com**. Earlier work was accidentally done under matthewsefati@gmail.com (project `gmail-mcp-personal-495520`); user explicitly course-corrected mid-session and that work was discarded (see F-003).
**Why:** Drive integration is a SchoolConex business resource, not personal. Living under the company Workspace org gives admin oversight, billing, and the ability to use Internal-mode OAuth consent (no app verification needed for `@schoolconex.com` users).
**How to apply:** All Google credentials in `.env.local` reference this project. If anything mentions `gmail-mcp-personal`, it's stale.

### D-025 — OAuth consent screen: Internal user type — 2026-05-06
**Decision:** Configured the OAuth consent screen for `schoolconex-crm` as **Internal** user type. Internal means only `@schoolconex.com` Workspace accounts can authenticate; no test-user list maintenance, no app verification by Google needed.
**Why:** Workspace org membership IS the auth gate. Avoids the test-user-cap-100 limit and consent-screen verification flow. Keeps onboarding one-click for any rep on the domain.
**How to apply:** If we ever want non-`@schoolconex.com` users to authenticate (external clients, partners), we'd need to switch to External + go through verification. Don't.

### D-026 — Drive folders owned by service account; Workspace user shared as writer — 2026-05-06
**Decision:** Both `CRM Templates` and `CRM Generated` folders were created via the service account (programmatically, via Drive API). Each is shared with `matthew@schoolconex.com` as `writer`. They appear in his Drive under "Shared with me".
**Why:** Folders don't consume storage, so SA-owned folders don't trigger the storage-quota issue (D-026 caveat / F-004). Sharing as writer means Matthew can drop templates in.
**Caveat:** Files INSIDE these folders, when created by the SA, charge against the SA's storage quota — which is 0. So the "generate contract from template" flow (which copies a Doc) currently fails with `storageQuotaExceeded`. See F-004 for the two production fix options (Shared Drive OR Domain-Wide Delegation).
**Status:** SUPERSEDED by D-027. The pre-Shared-Drive folder IDs are commented out in `.env.local` for reference.

### D-027 — F-005 fix: SchoolConex CRM Shared Drive hosts both folders — 2026-05-07
**Decision:** Created a new Shared Drive named "SchoolConex CRM" (id `0AFnM-2HvmqO2Uk9PVA`) under the schoolconex.com org via the Drive UI as `matthew@schoolconex.com`. Added the SA `schoolconex-crm-drive@schoolconex-crm.iam.gserviceaccount.com` as `organizer` (Content Manager) on the Shared Drive via Drive REST API `permissions.create` with `supportsAllDrives:true`, authenticated through a one-shot OAuth loopback flow (`access_type=online`, no refresh token persisted). New folders created inside the Shared Drive: `CRM Templates` (`1T7ItO_S8O4sGsnftj3kWz04L1R0fJQPo`) + `CRM Generated` (`1NR8wyn013tPE2NLWl4ke5OSc4UDJiXZj`). `.env.local` updated; legacy My-Drive folder IDs preserved as `*_LEGACY` comments. Selected Option A from F-005 because (a) Shared Drive needs zero ongoing impersonation gymnastics, (b) doesn't require admin.google.com domain-wide-delegation config, and (c) survives an SA rotation cleanly.
**Why:** Files in a Shared Drive are owned by the Drive itself, not by the creating principal — so the SA's 0 personal storage quota never matters. This unblocks the "generate contract from template" flow (and any future SA-as-writer pattern).
**How to apply (for future agents):**
- All Drive API calls that touch CRM Templates / CRM Generated (or any descendant) MUST pass `supportsAllDrives: true` (and for `files.list`, additionally `includeItemsFromAllDrives: true`, `corpora: "drive"`, `driveId: GOOGLE_DRIVE_SHARED_DRIVE_ID`). See `scripts/drive-smoke.mts` and `scripts/drive-create-folders-in-sd.mts` for the canonical invocation.
- When `lib/integrations/google/drive.ts` (or wherever the contract-generation flow lives) is implemented, set `supportsAllDrives: true` everywhere, AND when copying templates use the Shared Drive folder as the parent.
- The OAuth Web client at `489266381443-vqdbp0n929pdjlj6tehpba7rtvci0e6n` now has TWO authorized redirect URIs: `http://localhost:3000/auth/google-drive-callback` (for Supabase / app-level Drive OAuth — was pre-existing) and `http://localhost:53682/oauth/callback` (for the loopback admin-task flow). Both are needed; don't delete either.

### D-028 — Smoke scripts track current redirects + Rayan Dialpad email fields — 2026-05-07
**Decision:** Keep the validation scripts aligned with current runtime behavior: authenticated `/login` is expected to redirect to `/accounts`, `/settings` redirects to `/settings/users`, and `/inbox` cards currently render call summaries/durations/internal tags rather than raw phone numbers. `scripts/dialpad-list-calls.mts` now prints `target_email`, `target_phone`, `contact_email`, and `contact_phone` so Rayan targeting can be proven from Dialpad payloads without inspecting the full record.
**Why:** The app behavior was correct but smoke scripts were failing on stale expectations, which hid the useful validation signal. The Dialpad list script now makes `target.email=rayan@schoolconex.com` visible in compact output.

### D-029 — External integration callbacks bypass app auth — 2026-05-08
**Decision:** `PUBLIC_PATHS` in `lib/supabase/middleware.ts` includes `/api/webhooks` and `/api/inngest`. User-facing app pages and app-owned APIs stay protected; third-party callback endpoints do their own signature/payload validation.
**Why:** Full verification showed unauthenticated webhook POSTs were redirected to `/login` before reaching the route handlers. Dialpad/Mailshake/Stripe/Twilio and Inngest cannot supply a Supabase session cookie, so middleware auth must not gate those callback surfaces.

### D-031 — Mailshake polling = lead pipeline only; events via webhook — 2026-05-09
**Decision:** Activate Mailshake in two layers. Layer 1 (live now): a 30-min Inngest cron `mailshake-sync-campaigns` calls `GET /campaigns/list` + `GET /leads/list?campaignID=<id>` per non-archived campaign and upserts into `mailshake_campaigns` and `mailshake_leads`. This gives the lead-pipeline status per recipient (`open` / `closed` / `ignored`). Layer 2 (pending webhook setup in Mailshake): real-time per-event firehose (sent / opened / clicked / replied / bounced incl. reply body) flows via `/api/webhooks/mailshake` → `email_events` → activity timeline. UI surfaces Layer 1 in `/campaigns` + `/campaigns/[id]` + the Campaigns tab on account detail, with a banner explaining Layer 2 activation.
**Why:** Mailshake's REST API does not expose per-event endpoints (probed `/sentEmails`, `/opens`, `/clicks`, `/replies`, `/messages` — all 404). Polling can only reflect the lead-pipeline status. Webhooks are the only path for actual event tracking. The handler already exists, so activation is a one-time URL registration in the Mailshake dashboard.
**How to apply:** Run `npm run mailshake:sync` to manually trigger Layer 1. Register `https://<deployed-host>/api/webhooks/mailshake` in Mailshake → Account → Webhooks for events `sent`, `open`, `click`, `reply`, `bounce`, then set `MAILSHAKE_WEBHOOK_SECRET` in env. Use `tsx --conditions=react-server` for any tsx script that imports the libs that pull `server-only` (the `react-server` condition resolves the package to its no-op `empty.js`).

### D-033 — Auto-import contacts from Mailshake recipients — 2026-05-22
**Decision:** Companion to D-032. For every `mailshake_leads` row with a matched `account_id` and an email, auto-create a CRM contact with `first_name`/`last_name` from `fields.first`/`fields.last` (fall back to splitting `full_name`), `email` from the lead, `phone` from `fields.phoneNumber` (normalized E.164, defaulting US +1 for 10-digit numbers), `role` from `fields.title`, `external_ids = { mailshake_lead_id }`. Update `mailshake_leads.contact_id` to link back. Wired as `npm run mailshake:import-contacts` (with `--dry`). First run: 295 contacts created (225 with normalized phones). Idempotent (dedup on `(account_id, lower(email))`). Uses raw `postgres` not Drizzle — avoids the `--conditions=react-server` complication.
**Why:** Without contacts, the Dialpad call matcher (`matchPhoneToContact`) has nothing to match against. D-032 created the schools but left them empty — calls to/from real recipients all landed in the Unmatched Inbox even when Mailshake already had their phone. After this fix, the phone matcher correctly links calls to accounts. Proven: 1 Baig Academy call (Javed Faruqui, 647-268-3320) matched immediately on first rematch run.
**How to apply:** Run after `mailshake:import-accounts` whenever new schools/recipients land. Then `npm run dialpad:rematch-calls` to retroactively link historical calls. Reversible: `delete from contacts where external_ids ? 'mailshake_lead_id'`. Cron does NOT yet run this (open question #26) — operator-triggered for now.

### D-037 — Matthew Rubio onboarded as CRM admin; phone-fallback attribution for legacy calls — 2026-05-27
**Decision:** Created `matthew@schoolconex.com` as a CRM user (admin role, id `d577fdc0-513a-47ea-8012-f44148fac27d`) via the auth.users INSERT pattern (no password — Google SSO). Mapped his Dialpad ids: `users.dialpad_user_id='5502522061422592'`, `users.dialpad_phone='+16474956991'`. Added `users.dialpad_phone text` column (migration 0007) so historical webhook-ingested calls — whose raw payload lacks `user_id`/`target.id` — can be attributed by matching `calls.from_number`/`calls.to_number` against the rep's phone (`scripts/dialpad-reattribute-by-phone.mts`, last-7-digit fallback).
**Why:** The first reattribute pass (D-035) only covered calls with proper payload owner ids — about 7 of 134 historical calls. The remaining 127 were old webhook-ingested rows whose payloads use a different shape. Phone matching is the only reliable signal left for those, and Matthew is the only other rep currently making calls.
**Outcome:** Historical 136 calls → Matthew 54 + Rayan 49 + 33 unassigned (external-to-external, no rep number on either side). Ongoing cron continues to use the payload-owner path for new calls.
**How to apply:** Migration 0007 + `scripts/run-matthew-user.mts` + `scripts/dialpad-reattribute-by-phone.mts`. To add another rep later: insert their auth user, look up their Dialpad ids via `npm run dialpad:lookup-user <email>`, `update users set dialpad_user_id='…', dialpad_phone='…' where google_email='…'`, then re-run the phone reattribute to retroactively claim their historical calls.

### D-035 — Per-rep Dialpad attribution via `users.dialpad_user_id` — 2026-05-26
**Decision:** Add a `dialpad_user_id text` column on `public.users` (unique partial index). Every Dialpad call's `activities.user_id` is resolved from the call payload's `user_id` (outbound) or `target.id` (inbound), looked up against `users.dialpad_user_id`. The env-pinned `DIALPAD_FILTER_USER_EMAIL` is now a fallback only — used when the call has no rep id, or that id has no CRM mapping. Migration 0005 seeds Rayan's mapping (`6598548464648192`).
**Why:** Before this change, the cron stamped `activities.user_id` with whichever single user `DIALPAD_FILTER_USER_EMAIL` pointed at — meaning 103 of 134 calls were all credited to Rayan even though some were Matthew's. Querying "calls per rep this week" was impossible. The fix is small: one column + one lookup, mirrors the same shape we already use for Mailshake sender mapping.
**How to apply:** Apply migration 0005. To add a new rep: `update users set dialpad_user_id = '<dpid>' where google_email = '<email>'`. Find a rep's Dialpad id via `npm run dialpad:lookup-user <email>`. Existing call rows are re-attributed by `npx tsx scripts/dialpad-reattribute-calls.mts` (idempotent — re-reads each call's raw payload from `integration_events_raw` and rewrites `activities.user_id`).
**Alternatives considered:** Per-rep webhook subscriptions (rejected — Dialpad webhooks are workspace-level, not per-user); a sidecar `dialpad_user_mapping` table (rejected — one column on `users` is simpler since the mapping is always 1:1).

### D-036 — Gmail mailbox sync uses per-user OAuth (closes F-006) — 2026-05-26
**Decision:** Each rep grants `gmail.readonly` via the existing `schoolconex-crm` OAuth Web client. Tokens are persisted in the existing `integration_credentials` table keyed `(user_id, provider='google_gmail')`. The daily cron `/api/cron/gmail-sync` (Vercel cron, 09:00 UTC) iterates every connected rep, pulls messages since their per-rep watermark, classifies each thread's direction relative to the rep's address, matches external participants to CRM contacts via the existing `matchEmailToContact`, and persists headers/body into the new `email_messages` table (1:1 child of `activities`, mirrors the `calls` / `messages` pattern from D-011).
**Why over DWD:** Workspace Domain-Wide Delegation needs admin.google.com config + a Google verification cycle for sensitive scopes. Per-user OAuth uses the existing Internal-mode consent screen (D-025) — any `@schoolconex.com` account self-serves in ~30s. The OAuth client + `integration_credentials` table already exist for Drive; same shape extends cleanly. F-006 service-account impersonation path is abandoned.
**How to apply:**
- Register `https://sc-crm-sand.vercel.app/auth/gmail-callback` (and `http://localhost:3000/auth/gmail-callback` for dev) as authorized redirect URIs on OAuth client `489266381443-vqdbp0n929pdjlj6tehpba7rtvci0e6n`.
- Add `https://www.googleapis.com/auth/gmail.readonly` to the consent screen scopes.
- Each rep: sign in → `/settings/integrations` → Connect Gmail.
**Schema decision:** New `email_messages` table because Gmail messages have full headers + body that don't fit `email_events` (Mailshake-event-shaped). Internal-only threads (every participant `@schoolconex.com`) are stored but skip contact-matching and get the `· internal` summary suffix — mirrors Dialpad D-020.

### D-034 — Mailshake recipients are canonical; Dialpad sync is company-wide — 2026-05-23
**Decision:** Treat Mailshake `/recipients/list` as the canonical campaign membership feed and overlay `/leads/list` status only for recipients that entered the Mailshake lead pipeline. The `mailshake_leads` table now stores both `status='recipient'` and engaged lead statuses. The Mailshake cron runs the auto-pipeline automatically so accounts/contacts stay populated. Dialpad polling, backfill, and webhook processing are company-wide by default; `DIALPAD_SYNC_SCOPE=user` is the explicit legacy filter.
**Why:** The prior implementation synced 305 engaged Mailshake leads while missing 2,678 silent recipient emails, leaving the CRM underpopulated. Dialpad was also pinned to Rayan by default, so non-Rayan company calls/webhooks would be skipped even with a company-admin API key.
**How to apply:** Run `npm run mailshake:sync` to sync campaigns/recipients and run the auto-pipeline. Run `npm run dialpad:backfill -- 30` for a company-wide 30-day call replay. Current 2026-05-23 DB state: 3,095 Mailshake recipient rows, 3,060 account/contact matches; 57/57 live 30-day Dialpad company calls present, 0 missing.

### D-032 — Auto-import schools from Mailshake `recipient.fields.account` — 2026-05-09
**Decision:** When a lead row's `recipient.fields.account` (Mailshake's school-name field) doesn't match any CRM account, auto-create the account with `name = trim(fields.account)`, `type = 'school'`, `source = 'mailshake'`, then re-match leads. Idempotent (case-insensitive name dedup against existing accounts). Wired as `npm run mailshake:import-accounts` (with `--dry` for preview). First run created 274 accounts, lifted match rate from 0/305 to 301/305 (98.7%).
**Why:** Mailshake recipients are pre-existing in Mailshake but the CRM started empty. Manually creating 274 schools is friction; auto-import makes the per-school view immediately useful.
**How to apply:** Run after every meaningful Mailshake sync that introduces new schools. Reversible: `delete from public.accounts where source='mailshake' and not exists (select 1 from contacts c where c.account_id = accounts.id)`.

### D-030 — Local Inngest verification uses `INNGEST_DEV=1` — 2026-05-08
**Decision:** Added `server-only` as an explicit dependency and set `INNGEST_DEV=1` in `.env.local` for local verification. `.env.example` documents that production must unset `INNGEST_DEV` and use `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`.
**Why:** `GET /api/inngest` returned 500 in local production-server smoke until Inngest was told to run in local dev mode. With `INNGEST_DEV=1`, the endpoint returns metadata (`function_count:6`, `mode:"dev"`).


### D-038 — Per-rep data visibility via ownership columns + tightened RLS — 2026-06-12

**Decision:** Reps see only their own synced data; admins see everything. Implemented as migration `supabase/migrations/0008_per_rep_ownership.sql`: (a) new columns `mailshake_campaigns.owner_user_id` and `mailshake_leads.assigned_user_id` (FK → users, set-null); (b) SELECT RLS rewritten on `activities`, `email_messages`, `calls`, `mailshake_campaigns`, `mailshake_leads` to `is_admin() OR user_id = auth.uid() OR account_id IN (accounts owned by auth.uid())` (child tables via the parent activity); (c) backfill of all 29 campaigns + 3,095 leads to Rayan, with cascade of `accounts.owner_user_id` and `activities.user_id` (mailshake_event channel) from lead assignment. Sync code stamps ownership on INSERT only (`MAILSHAKE_SYNC_USER_EMAIL` env var, set to rayan@schoolconex.com in Vercel prod) so admin reassignments survive future syncs. `auto-pipeline.ts importMissingAccounts` now inherits `owner_user_id` from the originating lead. `accounts`/`contacts`/`opportunities` SELECT intentionally left open to all authenticated (collaboration), per user decision.

**Why:** Matthew (admin) must see everything; Rayan (rep) only his Mailshake campaigns/leads, his Dialpad calls, his Gmail. Pages read via Supabase JS (anon key + JWT) so RLS enforces automatically; crons write via Drizzle/service-role and bypass RLS by design.

**Verification (2026-06-12, simulated JWTs against prod):** admin sees 178/178 activities, 176 calls, 29 campaigns; Rayan sees exactly his computed slice (74 activities, 72 calls, 45 unmatched) and can UPDATE (attach) his own unmatched activity. Manual reconciliation UI shipped: `components/crm/attach-to-account-dialog.tsx` + `attachActivityToAccount` server action + `ActivityTimeline allowAttach` prop, wired on `/inbox`.

### D-039 — Role correction: Matthew is THE admin, Rayan is a rep — 2026-06-12

**Decision:** `matthew@schoolconex.com` role='admin', `rayan@schoolconex.com` role='rep'. Swapped in prod DB 2026-06-12 (they were inverted — see F-019). Both user-creation scripts now re-assert the correct role on every re-run: `scripts/create-matthew-user.sql` upserts role='admin' in its ON CONFLICT branch; `scripts/create-rayan-user.sql` sets role='rep' in both its exists- and create-branches (it formerly promoted Rayan to admin, which is how the inversion happened).

**Why:** Per-rep RLS (D-038) keys on `public.is_admin()`; with roles inverted, Rayan saw everything and Matthew saw only his own rows — the exact opposite of intent.

### D-040 — Notes-process wiring standardized across agent entry points — 2026-07-03

**Decision:** The CRM repo follows the same project-memory setup as `E:\Claude\SchoolConex\` and `E:\Claude\Cobionix\`: (a) repo root `CLAUDE.md` created — hard rules (gws-sc account lock, draft-only email/Slack), read-`Project_notes_folder`-first instruction, update-project-notes self-perpetuation clause, and the repo footguns (Drizzle-service-role vs Supabase-RLS split, NEXT_PUBLIC_* rebuild requirement, D-039 roles, commit/push-only-on-request); (b) a `E:\Claude\SchoolConex\SchoolConex_CRM\` row added to the project mapping table in the global skill `C:\Users\msefa\.claude\skills\update-project-notes\SKILL.md`, placed above the broader `E:\Claude\SchoolConex\` row so the more specific prefix wins; (c) project-local skill copies confirmed byte-identical in `.claude\skills\` and `.codex\skills\` (md5 bb863a0d…) — any future edit must be applied to both.

**Why:** Matthew asked for the CRM's notes folder and process to mirror the other project folders. The notes folder and local skill already existed; the missing pieces were the root CLAUDE.md wiring (Cobionix pattern) and the global mapping-table registry row.

**How to apply:** Nothing to run. A fresh agent in this repo reads `CLAUDE.md` → `Project_notes_folder\PROJECT_NOTES.md` → `context.md` → last 3 lines of `sessions\INDEX.md`, then keeps notes updated via the local skill.

### D-041 — QuickBooks + Stripe customer import into the CRM — 2026-07-06

**Decision:** SchoolConex's real customer book (signed-up + churned) was pulled from live QuickBooks Online + Stripe and imported into CRM `accounts`/`contacts` with an active/inactive/prospect lifecycle. Result: **72 customer accounts (34 active / 7 inactive / 31 prospect), 45 contacts**; billing rollup $1.34M invoiced / $291k outstanding.

**Data source + auth (critical):** The QBO refresh token is owned by the production finance server (Hetzner `schoolconex-finance`, 78.47.233.60, app `/opt/cfo/app`, daily 06:00 America/Toronto sync; ref D-063 in `SchoolConex_Quickbooks_Api`). The local `.env` token is a stale bootstrap — using it would fail or break the prod sync. The pull was run **server-side** over SSH (`~/.ssh/hetzner_codinginabox_ed25519`), reusing the app's own `src/services/qbo.js` auth so the one triggered token rotation persisted correctly; a temp read-only script (`scripts/export-customers-crm.mjs`) was copied in, run, its JSON scp'd back, and the script removed. Pulled `Customer WHERE Active=true` + `Active=false` (union), all invoices/payments, and live Stripe customers. Live data > offline exports: offline files were active-only and stale (e.g. Lorvale showed active though inactivated 2026-06-26).

**Pipeline (both re-runnable, PII git-ignored under `.quickbooks/`):**
1. `scripts/quickbooks-build-canonical.mts` — dedupe + classify → `.quickbooks/qbo-canonical.json`. Trusts live QBO "(merged into X)" annotations + Active flag as authoritative (the 2026-05-28 review CSV was stale, even had #212/#213 backwards). Drops 5 merge-shells, applies an explicit MERGE map for not-yet-merged dups (incl. Doon #96→#93), folds 29/34 Stripe by email→name, skips 2 deleted-shell Stripe records, creates 3 new Stripe-only. Two "Michelle Zhang" (#5/#138) kept SEPARATE (namesakes, different emails). Classification: `inactive` if primary QBO record Active=false OR last invoice >18mo; `prospect` if never invoiced; else `active`.
2. `scripts/quickbooks-import-customers.mts` (npm `quickbooks:import`, `--dry`) — idempotent upsert. Match order: `external_ids->>'quickbooks_id'` → stripe id → normalized name (enriches existing Mailshake accounts instead of duplicating — 7 enriched). Owner left null. Re-run = 0 inserts.

**Schema (migration 0009 + `lib/db/schema.ts`):** added to `accounts`: `customer_status` enum(active/inactive/prospect), `external_ids jsonb default {}` (quickbooks_id/quickbooks_ids/stripe_ids), `email text`, `billing_summary jsonb`. Idempotent (guarded enum + add-column-if-not-exists + indexes); verified re-run-safe. No RLS change (accounts SELECT stays open per D-038).

**UI:** accounts list has a status filter (All/Customers/Active/Inactive/Prospect) + Status badge column; detail page shows a billing card. **Revenue figures (Outstanding column + billing card) are admin-only** — consistent with D-038 (reps see only their own data); reps see the status badge but not dollar amounts. Amounts labeled CAD.

**Verification:** adversarial multi-agent review (8 findings, all fixed: namesake-enrich collapse guard, importer/builder norm alignment, billing_summary coalesce-not-wipe, admin-gated revenue, CAD labeling, querystring preservation, $0 display). Spot-checks: Choice Education active ($495k inv), Lorvale inactive ✓, both Michelle Zhangs separate ✓. `tsc` + `next build` green. Import NOT re-run after fixes (edge cases never fired; current data correct).

**Open:** (a) confirm reps (Rayan) should stay revenue-blind, or relax the admin gate; (b) not committed/deployed yet — awaiting Matthew.

### D-042 — CRM connections & visibility upgrade (call-match fix, real dashboard, follow-up queue, notifications, website leads) — 2026-07-06

**Context:** Audit of the live prod DB found the plumbing worked but the CRM wasn't functioning as one: Rayan last signed in Jun 12 (24 days prior), 0 Gmail/Drive connections, 1 note + 1 task total (both demo-seed), 87% of Dialpad calls unmatched, Mailshake reply/open events never processed, dashboard showing a fake $70.7k demo pipeline. Matthew's decisions this session: website lead capture ✅, notifications = email digest + Slack + in-app (all three) ✅, customer accounts → **Rayan** ✅, purge demo data ✅.

**Root cause found (biggest single fix):** `lib/integrations/contact-matcher.ts` used the cookie-based Supabase client (`getSupabaseServerClient`), but every caller is a cron/event processor with no user session → `auth.role()='anon'` → the `contacts_select` RLS policy returned **zero rows** → inline matching silently never matched in prod. **Rewrote the matcher on the Drizzle service-role `db` client** (same trust model as `record-activity.ts`); this fixes matching for Dialpad ingest, Gmail sync, and all event processors at once.

**Changes shipped:**
1. **Call matching** — new `matchIdentityToContact({phone,email,name})` ladder (phone → contact email → contact full-name unique-only → account-name normalized/containment); `stampContactPhoneIfEmpty` backfills a matched contact's phone so future calls hit the fast path. Wired into the live Dialpad cron + both Inngest fns. `lib/integrations/auto-pipeline.ts` `rematchUnlinkedCalls` extended to pull identity from raw payloads (handles both the object shape and the **legacy double-encoded JSON-string** shape — 127/220 rows). New `scripts/dialpad-rematch-identity.mts` (npm `dialpad:rematch-identity`, `--dry`) backfilled 6 (Veritas cluster via containment); matched 29→35 / unmatched 191→185. Most of the remaining 185 are genuine unknown numbers/generic Dialpad labels ("Toronto ON", raw phone strings) with no CRM counterpart — expected.
2. **Real dashboard** — new `lib/crm/dashboard.ts` (RLS `sb` client; per-rep scoping is automatic via migration-0008 policies, admin sees all). Rewrote `app/(dashboard)/dashboard/page.tsx`: KPIs (follow-ups due, open leads + engaged-this-week, calls last-7 vs prior-7, emails), a **follow-up queue**, your-tasks with overdue flag, pipeline-by-stage with **weighted forecast**, admin-only customer-book + CAD revenue tiles + per-rep activity leaderboard, and a **"Connect Gmail" banner** when the signed-in user has no `google_gmail` credential.
3. **Follow-up queue** — migration `0010_followup_view.sql`: `followup_leads` view (`security_invoker=true` so RLS scopes each rep) = open Mailshake leads joined to their account's last call/email touch, + `activities_account_occurred_idx`. Surfaces open leads with no touch in 7+ days. (Views aren't in `lib/db/schema.ts` — queried via `sb`.)
4. **Kanban** — `components/crm/pipeline-board.tsx`: currency-aware formatter (CAD default, groups mixed currencies as "CA$X + US$Y"), stage %-probability badges, "Mine only" owner toggle, header weighted-forecast total. Killed the hardcoded USD formatter.
5. **Mailshake real-time** — extracted processing into `lib/integrations/mailshake-events.ts` (`processMailshakeRawEvent` + `sweepUnprocessedMailshakeEvents`). Webhook now processes **inline** (prod has no Inngest keys, so inline is the only path that runs); the Inngest fn is a thin dev-only wrapper; the daily sync cron sweeps any unprocessed. A reply fires a Slack ping. **Decision: inline over activating Inngest Cloud** — the work is one match + two inserts, idempotent at both layers, and prod has run Vercel-cron-first for months.
6. **Notifications (all three)** — in-app (dashboard banners/badges), `lib/integrations/slack-notify.ts` (dependency-free POST to `SLACK_WEBHOOK_URL`; no-ops when unset), and a daily digest: `lib/integrations/digest.ts` + `lib/integrations/mailer.ts` (nodemailer via Workspace SMTP, inert until `SMTP_USER`/`SMTP_PASS`) + `app/api/cron/daily-digest/route.ts` (Vercel cron 11:30 UTC, `?dry=1`). These are **CRM app→user notifications**, distinct from the draft-only rule for Claude composing mail on Matthew's behalf.
7. **Website lead capture ("traffic")** — `app/api/leads/website/route.ts` (public, `/api/leads` allowlisted in middleware): shared-secret `WEBSITE_LEAD_TOKEN` (**fails closed** if unset), honeypot, match-or-create account+contact (`source='website'`), inbound activity, follow-up **task assigned to Rayan**, Slack ping. Idempotent via a raw-event dedupe key. Docs: `docs/website-lead-form.md` (server-proxy + HTML snippets for the web team).
8. **Ops** — `scripts/assign-customer-owners.mts` set all 72 QB/Stripe accounts → Rayan (65 newly + 7 already). `scripts/purge-demo-data.mts` soft-deleted the 3 demo opps + accounts + contacts and hard-deleted the 2 demo activities (by fixed seed UUIDs from `supabase/seed/0002_demo_data.sql`) — dashboard pipeline is now honestly empty rather than $70.7k fake.

**Verification:** `tsc` + `next build` green; e2e route walk 13/13 (dashboard/kanban render under a real RLS session); website endpoint smoke-tested (401 bad token, honeypot dropped, create + dedupe, full account/contact/task side-effects — test data cleaned up); Mailshake webhook inline processing verified (email_event created, raw marked processed, no Inngest) — cleaned up; digest `?dry=1` renders Rayan's 296-stale-lead summary, `mailerConfigured:false` (correctly inert). Migration 0010 applied idempotently.

**Open / ops steps for activation (none block the deploy):** set `MAILSHAKE_WEBHOOK_SECRET` + register the webhook in Mailshake; `SLACK_WEBHOOK_URL`; `SMTP_USER`/`SMTP_PASS` (+ optional `SMTP_FROM`) for the digest; `WEBSITE_LEAD_TOKEN` + hand the web team `docs/website-lead-form.md`; Matthew + Rayan connect Gmail. Committed `588ccfb` + pushed 2026-07-09; deployed to prod with D-043.

### D-043 — Account/opportunity edit crash fixed + rep-wide edit access — 2026-07-09

**Trigger:** Rayan clicked the pencil (Edit) on a client account, got an error, and couldn't save. Investigation found two stacked bugs.

**Bug 1 — the error he saw:** Radix Select 2.x (`@radix-ui/react-select` 2.2.6 via the `radix-ui` meta-package) **throws** `A <Select.Item /> must have a value prop that is not an empty string`. The account form's Owner "Unassigned" item and the opportunity form's Owner/Primary-contact items all used `value=""` → the forms crashed on interaction, for every user. Fix: sentinel values (`"unassigned"`, `"none"`) in `components/crm/account-form.tsx` + `components/crm/opportunity-form.tsx`, mapped back to `null` in `app/(dashboard)/accounts/actions.ts` + `app/(dashboard)/opportunities/actions.ts` (zod accepts the sentinels).

**Bug 2 — the permission wall behind it:** `accounts_update_own` / `contacts_update` / `opportunities_update_own` (migration 0001) gated UPDATE on `owner_user_id = auth.uid()` (or admin). A rep saving a record they didn't own either errored (with-check when changing owner) or — worse — **silently saved nothing**: Supabase `.update()` without `.select()` matches 0 rows, returns no error, and the page redirected as if saved. **Decision (Matthew, 2026-07-09): reps can edit ALL accounts, contacts, and opportunities, including reassigning owners.** Migration `0011_rep_edit_access.sql` opens the three UPDATE policies to `auth.role() = 'authenticated'` (matching the always-open INSERT policies). DELETE stays admin-only; billing figures stay admin-gated in the UI (D-041). Update actions now append `.select("id")` and throw a clear "not found or no permission" error on 0 rows so silent no-ops can't recur.

**Regression net:** e2e route walk (`scripts/e2e-rayan.mts`) now covers `/accounts/new`, `/opportunities/new`, and a live account's `/edit` page (discovers a real id from the list HTML). Note: SSR checks can't catch this class of bug — Radix mounts dropdown items client-side on open — so form-interaction changes warrant a browser test.

**Verification:** tsc + build green; e2e 16/16; real-browser Playwright test (sign in → edit "Toronto EMC" → open Owner dropdown [the exact crash site] → save → DB shows the change, owner preserved); simulated-JWT RLS check in a rolled-back transaction (Rayan updates a non-owned account → 1 row; owner→null → 1 row; DELETE → 0 rows). Committed `665744c`, pushed, deployed to prod (login 200 / accounts 307→login).

**Contact-flow addendum (2026-07-09, commit `ba2fc31`):** verified rep contact create + edit end-to-end (contact form has no Radix Selects → no crash risk; INSERT always open; UPDATE via 0011; sim-JWT probe on a non-owned account: insert 1 / update 1 / is_primary sweep ≥1 / hard delete 0; browser run: create → edit → persisted, test row cleaned up). `updateContact` got the same `.select()`+0-row guard; e2e walks `/accounts/[id]/contacts/new` (17/17). **RLS quirk worth knowing:** a rep CANNOT soft-delete (set `deleted_at`) contacts/accounts — Postgres rejects the new row because the non-admin SELECT visibility check (`deleted_at is null or is_admin()`) is applied to it. That's consistent with "deletes stay admin-only" and no UI exposes contact delete, so left as-is deliberately. Deployed.

### D-044 — Pipedrive-style lead import + bulk ops; OSSD sheet imported; HubSpot importer; credential rotation — 2026-07-11

**Ask:** Rayan imports leads himself from Excel/CSV (template with headers linked to DB fields, auto-map on header match, manual mapping otherwise), bulk-deletes and bulk-edits what he imported; then migrate the existing lead databases (the "International OSSD Leads" Google Sheet and everything in HubSpot).

**Built:**
- **Wizard `/accounts/import`** (`components/crm/import-wizard.tsx` + `app/(dashboard)/accounts/import/`): download .xlsx/.csv template generated client-side from `lib/import/columns.ts` (single field registry driving template, auto-map aliases, validation — can never drift); upload parsed **client-side** with SheetJS (no server body limits, 10k-row cap); auto-map (exact + aliases like School/Company→Account Name, Contact Title→Role); mapping step; preview; sequential 500-row chunks via server actions; summary.
- **Engine `lib/import/engine.ts`** (shared by wizard + scripts): account dedupe on the new **`accounts.norm_name` stored generated column** (migration 0012, indexed; MUST stay mirrored in `lib/db/schema.ts`); contact dedupe (account,email)→(account,full name), fill-blank-only enrichment; names derived from email local-part when absent; per-row lineage in `import_batch_rows` (created|matched) + `unique(batch,row_index)` → chunk retries idempotent. **PostgREST gotchas handled:** `.in()` lists sub-batched at 100 (URL-length), lineage reads paginated (silent 1,000-row response cap — this bug initially undercounted big batches' stats until fixed).
- **History + bulk ops** `/accounts/imports[/batchId]`: RLS-scoped batches (`import_batches`/`import_batch_rows`, owner-or-admin policies, migration 0012); checkbox selection; **bulk edit** (owner/type/country/source, sb client); **bulk delete** (created rows only) + **revert whole batch** via Drizzle service-role actions gated on `batch.created_by === user || admin` (reps can't soft-delete under RLS — same D-043 pattern); revert deletes ONLY what the batch created, never matched records.
- **OSSD sheet imported live** (`npm run leads:import-sheet`, gws-sc auth): Kuwait/China/Saudi "(Validated)" tabs → **2,782 new accounts + ~2,900 contacts, all owned by Rayan**, as 3 revertable batches in his history. Explicit per-tab mapping ("Email" = school inbox → account_email). First run crashed mid-chunk (the `.in()` URL bug) leaving 465 accounts without lineage; second run matched them; reconciled by relabeling those rows matched→created + recomputing batch counters + deleting the orphan batch — final counters match the dry run (594/1,421/771 new).
- **HubSpot importer** (`npm run leads:import-hubspot`, `--dry`): pages all companies+contacts (+associations), same engine, stamps `external_ids.hubspot_id` → idempotent re-runs = future sync primitive. **Blocked on `HUBSPOT_ACCESS_TOKEN`** (Private App, scopes crm.objects.companies.read + contacts.read) — Matthew to create.
- **Auth model for scripts:** no Supabase service-role key exists ANYWHERE (verified empty in Vercel too); scripts run the engine on an anon client signed in with the password test account, then flip `import_batches.created_by` to Rayan via the Drizzle/pg connection.
- **xlsx dep:** SheetJS 0.20.3 from the official CDN tarball (npm registry copy is stale 0.18.5 with advisories); dynamic-imported client-side only.

**Security (found by the push classifier, fixed same session):** the demo password was hardcoded in 7+ scripts in the **public** GitHub repo — i.e. anyone could log into prod (demo + admin accounts = admin role; rayan also had it). Fixed: all scripts now read `E2E_LOGIN_EMAIL`/`E2E_LOGIN_PASSWORD` from `.env.local`; SQL seed files use a CHANGE_ME placeholder; **passwords rotated in prod for demo/admin/rayan** (random secret, stored only in `.env.local`; old literal remains in git history but is now useless). Google SSO unaffected (matthew has no password identity). Prod sign-in re-verified with the rotated credential.

**Verified:** tsc + build green; e2e 19/19 (import routes added; also ran against PROD post-rotation); full browser wizard loop (template → upload → 17/17 auto-map → import → 1 created/2 matched [lowercase "toronto emc" matched Toronto EMC] → bulk edit → revert → DB ground truth; test data purged); sim-JWT RLS (Rayan sees only his batches, insert-as-other blocked); China batch page renders all 1,425 accounts past the old cap. Commit `d6640d8`, pushed, deployed to prod.

**Open:** HubSpot token from Matthew → run `leads:import-hubspot -- --dry` then live; remaining OSSD tabs ("international school data base" etc.) skipped by design — importable on request; future scheduled/two-way platform sync can reuse batches.source + external_ids + the engine via Inngest/cron.

### D-045 — Pipedrive parity milestone (features + design), GSD-managed — 2026-07-11

**Decision:** Rebuild the CRM to simulate Pipedrive's feature set and match its visual design. Grounded in (a) a 104-agent deep-research teardown with 3-vote adversarial verification against Pipedrive's own docs (`docs/research/pipedrive-teardown.md` — kanban card/sort mechanics, per-stage rotting rules, forecast-view spec, Leads Inbox list+panel spec, plan-tier gating, and Pipedrive's three-layer semantic token architecture with base 0–800 shade scales and groups Surface/Fill/Divider/Text/Icon/Primary/Negative/Warning/Positive/Info, $primary-default=$green-600), and (b) a 7-document codebase map (`.planning/codebase/`).

**Matthew's scoping (2026-07-11):** wave 1 = Deals & Leads parity + Contacts/detail parity + Email in the CRM + Insights; FULL Pipedrive look (SchoolConex logo, Pipedrive visual language); execution = GSD autonomous with deploy + report per phase.

**GSD milestone `pipedrive-parity-v1`:** `.planning/` initialized (PROJECT.md, config yolo/standard/parallel/inherit with research+plan-check+verifier on, REQUIREMENTS.md with 31 REQ-IDs, ROADMAP.md 6 phases, STATE.md). Phases: 1 Design system (DSGN-01..05) → 2 Deals parity (DEAL-01..07) → 3 Leads inbox (LEAD-01..04) → 4 Contacts & orgs (CONT-01..07) → 5 Email sales inbox (MAIL-01..05, human dep: both reps must connect Gmail + re-consent for gmail.send) → 6 Insights (INSG-01..03). Wave 2 backlog logged as v2 requirements (automations builder, sequences, web forms, chatbot, projects, calendar, quotes PDF, AI, PWA). Per-phase gate: tsc+build+e2e+Playwright → prod deploy → report → notes. Project CLAUDE.md gained a GSD section (rules 13–14) — original rules 1–12 preserved.

**Open:** exact Pipedrive hexes/typography sampled from figma.com/@pipedrive during Phase 1; per-phase D-IDs will follow as phases ship.

### D-046 — Phase 1 shipped: Pipedrive design system (pipedrive-parity-v1) — 2026-07-11

**Shipped + DEPLOYED.** The whole app now renders in Pipedrive's visual language on their real token architecture: 122 `pd-*` base-palette literals (6 colors × 11 shades, light+dark) **extracted verbatim from Pipedrive's live token CSS** (cdn.yul-1.pipedriveassets.com), semantic layer (Surface/Fill/Divider/Text/Icon/Primary/Negative/Warning/Positive/Info) in `:root`/`.dark`, bridged onto shadcn variables strictly via `@theme inline` (plain-`@theme` var refs silently break dark switching — encoded as a rule). Primary green-600 `#2d8647`; app bg `#f5f5f6`; ink `#21232c`; Inter via next/font. **Dark mode was previously unreachable** (next-themes installed but no provider) — ThemeProvider now mounted + Light/Dark/System toggle in the user menu. New shell: 48px white top bar with pill ⌘K search + green "+" quick-add (New deal/account/contact/activity), Pipedrive-fashion sidebar (green active tint). Component deltas across the shadcn kit; palette sweep (zero hardcoded emerald/amber/sky classes remain); `lib/format.ts` fmtMoney/fmtCad replacing SIX legacy USD sites.

**Verified:** gsd-verifier 9/9 (VERIFICATION.md passed); tsc+build green; e2e 19/19; live browser pass — accounts/kanban screenshots match Pipedrive language, quick-add menu works, **kanban drag Lead→Quote persisted to DB** (note: dragging by the card TITLE does nothing by design — the title link stopPropagations; drag by card body), dark-mode board eyeballed. Test deal cleaned up. Deployed to prod (Inter live on sc-crm-sand.vercel.app). Commits `1957a17..9ef2892` pushed.

**Notes:** `en-CA` renders CAD as plain `$` (kept identical to blessed formatter; opportunity detail keeps ` · CUR` suffix). USD *data defaults* (forms/zod/DB) deliberately untouched — ask Matthew whether to flip to CAD. Recorded roadmap deviations: quick-add gains Lead/Person/Org entries in Phases 3-4; nav gains Leads/People/Orgs/Mail/Insights in their phases (UI-SPEC forbids dead placeholders). GSD artifacts under .planning/phases/01-pipedrive-design-system/.

### D-047 — Phase 2 SHIPPED: deals parity (Pipedrive kanban + list + forecast + 3-panel detail) (pipedrive-parity-v1) — 2026-07-11

**Full Phase 2 (DEAL-01..07) shipped + DEPLOYED to prod** (commits `2fff1ae..e409bf2` on `feat/mailshake-activation`; verifier 5/5 passed; browser-verified). Wave 1 = data + board; wave 2 = views + 3-panel detail (two executors, disjoint file fences, parallel).

- **Migration 0013** (applied twice to prove idempotency): `pipeline_stages.rot_days`, `opportunities.label/won_at/lost_at` (+ backfill from updated_at), partial index on expected_close_date, `opportunity_next_task` security_invoker view (earliest open task per open deal, filterable by pipeline_id), and the three activity RPCs (`create_note`/`create_task`/`toggle_task_complete`) recreated with a rot-reset touch (`update opportunities set updated_by = auth.uid()` → touch_updated_at trigger bumps updated_at). `lib/db/schema.ts` in lockstep. Gotcha found: `activities_opportunity_idx` already existed from 0001 as `(opportunity_id, occurred_at desc)` — schema.ts mirrors the REAL 0001 definition, 0013's create-if-not-exists is a fresh-DB no-op.
- **`stageStatusPatch` (app/(dashboard)/opportunities/actions.ts, unexported):** single source of status + won_at/lost_at derivation from stage is_won/is_lost flags; only re-stamps timestamps on an actual status transition. Used by `updateOpportunity` (**bug fix** — it previously wrote stage_id without recomputing status), `moveOpportunityStage` (now with the 0-row RLS guard), and new `markOpportunityWonLost(opportunityId, stageId, reason)`.
- **Label-wipe guard:** `label` is omitted from insert/update payloads when the form has no `label` key — the current edit form (no label control) can never null out labels set from the board/list. Fixed six-key palette in `lib/crm/labels.ts` (red Hot / yellow Warm / blue Cold / green Qualified / purple Priority / gray On hold).
- **`listOpportunitiesByPipeline` → `BoardOpportunity[]`:** merges `next_task` (view filtered by pipeline_id ONLY — never `.in()` ID lists) + `is_rotten` (vs stage rot_days). Rep caveat (expected per D-038, not a bug): reps don't see other reps' tasks through the security_invoker view — those cards show the yellow "no activity" state.
- **Shared components for plans 02/03:** `components/ui/popover.tsx` (consolidated `radix-ui`, no new dep), `DealActivityPopover` (complete-or-schedule without opening the deal), `WonLostDialog` (won: optional reason; lost: required select + Other→comment), `DealLabelChip`, `lib/crm/deal-board-utils.ts` (`sumByCurrency`, `compareDeals`/`DealSort`).
- **PipelineBoard rebuilt:** spec 4-row card (title-link stopPropagation and PointerSensor distance:4 untouched), rotten red-tile treatment + "{r} rotten" header counts, next-activity default sort + Sort-by select, won/lost stages removed as columns → fixed bottom Won/Lost drop zones (ids `dropzone:won`/`dropzone:lost`) that open the reason dialog (cancel = automatic snap-back since nothing moves optimistically), and the **resync fix** (`useEffect` on `initialOpportunities` + `router.refresh()` after every popover/dialog mutation; rollback uses the pre-drag snapshot, not the stale closure). Admin per-stage "Rotting in (days)" editor at /settings/pipelines.

**Wave 2 (DEAL-05/06/07):** `?view=kanban|list|forecast` on /opportunities with shared URL filter state (owner/label/won-lost chips/pipeline via `deals-filter-bar.tsx`). **List** (`deals-list.tsx`, `view-actions.ts`): 50/page, sortable headers via a bounded ≤500-row server-JS sort (PostgREST can't order the base table by the `opportunity_next_task` view), gear column-picker (localStorage), D-044-style checkbox bulk toolbar (bulk edit owner/label; **delete admin-gated client AND server** via `requireRole(["admin"])`). **Forecast** (`forecast-board.tsx`): month-bucket columns (current + horizon, "No close date" bucket), 3-line weighted headers (open/won/combined), won deals bucket on won date, **drag a card to another month rewrites expected_close_date** (last day of month) via server action. **3-panel deal detail** (`[id]/page.tsx` + `[id]/detail-actions.ts` + `stage-stepper`/`deal-close-buttons`/`deal-summary-panel`): left summary with inline-editable fields + stage stepper, center Notes/Activity/Timeline composer, Won/Lost buttons reuse WonLostDialog; reused note/task composers + activity timeline + line-items unchanged. "+ Deal" button + view switcher on the deals header.

**Phase gate (all green):** `tsc` + `npm run build` clean; migration 0013 re-applied idempotently; **e2e 21/21** (added `?view=list`/`?view=forecast`; list-view signal relaxed to accept the legitimate "No deals yet" empty state); **live Playwright pass** — created a labeled test deal via quick-add, drag Lead→Quote persisted (label `red` stored), **Lost drop-zone → reason dialog** (predefined reasons: No budget / Lost to competitor / Went cold / Bad timing / Not a fit / Other) → DB shows status `lost`, stage `Closed Lost`, `lost_at` + `lost_reason` stamped; list(status=lost) + forecast(month buckets + No-close-date) render; 3-panel detail screenshot matches Pipedrive layout; test deal cleaned up. Deployed (`e409bf2`); prod deal views serve (307→login). Found + fixed a real pre-existing bug: `updateOpportunity` never recomputed won/lost status on stage change (now via `stageStatusPatch`). Deferred (recorded): Source field renders "—" until Phase 3 leads; email-action rot resets until Phase 5. GSD artifacts: `.planning/phases/02-deals-parity/` (3 SUMMARYs + VERIFICATION 5/5).
