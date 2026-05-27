# Project Notes — SchoolConex CRM

**Last updated:** 2026-05-27
**Last agent:** Claude
**Session summary:** Per-rep activation live in prod. Audited 2026-05-26; fixed empty-window crash in `iterateCalls` (F-017); added `users.dialpad_user_id` + per-call lookup (D-035); built per-user Gmail OAuth + daily cron + `email_messages` table (D-036, closes F-006). Then 2026-05-27 added Matthew as CRM user (admin, `d577fdc0-...`), seeded his Dialpad mappings (`5502522061422592` / `+16474956991`), added `users.dialpad_phone` column (migration 0007), and built phone-fallback reattribute script. Final attribution on 136 historical calls: **Matthew 54, Rayan 49, unassigned 33** (was 103 Rayan / 31 unassigned before). Production deploy `dpl_6jj1RUoranStF5eiqwxMjpZH7Q9Z` (commit `ff4cfc6`) live on `sc-crm-sand.vercel.app`; commit `03b0a35` pushed and rebuilding. Last manual step: register Gmail OAuth redirect URI in GCP console (60 sec, harness blocks the automation).
**Notes mode:** single-file (line count >500 — split still recommended before the next large notes update)

---

## Current State

**All six phases code-complete.** Project at `e:\Claude\SchoolConex\SchoolConex_CRM` is the in-house CRM:

- Commits on `main` (8 commits, all phases):
  1. Scaffold (Next.js 16 + Tailwind v4 + Supabase + Drizzle)
  2. Schema/auth/shell
  3. CRM pages + notes/tasks + demo seed (Phase 1 done)
  4. Notes update
  5. **Phase 2** Google Drive (OAuth, attach, generate-from-template, status reconcile)
  6. **Phase 3** Dialpad (webhook, contact match, calls timeline)
  7. **Phase 4** Catalog & line-item quoting
  8. **Phase 5** Stripe + Mailshake (webhooks + send-invoice + email events)
  9. **Phase 6** WhatsApp via Twilio
- Stack: Next.js 16.2.4 (Turbopack), React 19, Tailwind v4, shadcn/ui, Drizzle 0.45, @dnd-kit, googleapis, stripe, inngest
- Supabase project `ooanslwrwjexdjwdphes`: full schema live (~22 tables) with RLS on every one, default pipelines + demo data seeded
- 25 routes building cleanly; 4 webhook endpoints registered; 5 Inngest functions registered
- Auth works against Supabase Google SSO (subject to dashboard config)
- First @schoolconex.com sign-in is auto-promoted to admin

**What's *live* today (Phase 1 functional UI):**
- Sign in → Accounts list / detail-360 (Activity, Contacts, Opportunities, Documents tabs)
- Opportunities kanban (drag-and-drop) + detail with line-item editor
- Notes + tasks + activity timeline
- Settings: Users & roles, Pipelines (read-only), Catalog, Contract templates, Audit log, Integrations
- Per-rep dashboard with KPI tiles + open tasks
- Demo data seeded (3 accounts, 4 contacts, 3 opportunities, 1 note + task)

**Integration activation status:**
- **Dialpad call ingestion** — ✅ ACTIVATED, per-rep attribution as of 2026-05-26 (D-035 + F-017 fix; awaits migration 0005 + reattribute script). Company-admin API key in `DIALPAD_API_KEY`. Cron/backfill/webhook are company-wide by default. Each ingested call's `activities.user_id` is now resolved from the call's `user_id` (outbound) or `target.id` (inbound) via `users.dialpad_user_id`. Rayan's mapping seeded in migration 0005 (`6598548464648192`); add more reps by setting their `users.dialpad_user_id` (resolve via `npm run dialpad:lookup-user <email>`). Verification on 2026-05-26 audit: DB shows 134 calls (23 matched), watermark advanced 2026-05-26T07:58Z meaning today's scheduled cron ingested 7 new calls successfully. On-demand re-hits during quiet windows previously crashed with "page.items is not iterable"; fixed via `page.items ?? []` guard in `iterateCalls`.
- **Google Drive integration** — ✅ LIVE end-to-end. Project `schoolconex-crm` under schoolconex.com org. OAuth Web client + service account credentials in `.env.local`. Shared Drive "SchoolConex CRM" (id `0AFnM-2HvmqO2Uk9PVA`) hosts both folders: `CRM Templates` (`1T7ItO_S8O4sGsnftj3kWz04L1R0fJQPo`) + `CRM Generated` (`1NR8wyn013tPE2NLWl4ke5OSc4UDJiXZj`). SA `schoolconex-crm-drive@schoolconex-crm.iam.gserviceaccount.com` is organizer (Content Manager) on the Shared Drive — added via OAuth loopback flow as matthew@schoolconex.com. Smoke test passes full create/delete cycle. F-005 resolved via D-027.
- **Gmail mailbox ingestion** — ⏳ CODE-COMPLETE, awaiting OAuth redirect registration + first rep consent. Per-user OAuth flow implemented (D-036): `/api/gmail/connect` → Google consent (`gmail.readonly`) → `/auth/gmail-callback` → token persisted in `integration_credentials` (provider='google_gmail'). Daily sync at 09:00 UTC walks every connected rep, watermarks per-rep on `integration_events_raw`, matches threads to CRM contacts by external email, and persists headers + body into new `email_messages` table. Connect button surfaced on `/settings/integrations`. Pre-launch: add redirect URI `https://sc-crm-sand.vercel.app/auth/gmail-callback` to the schoolconex-crm OAuth client and add `gmail.readonly` to the consent screen. F-006 closed by D-036.
- **Stripe** — code-complete, needs `STRIPE_SECRET_KEY` + webhook secret
- **Mailshake** — ✅ LIVE for recipient + lead-pipeline polling. `MAILSHAKE_API_KEY` set in `.env.local`. Vercel cron `/api/cron/mailshake-sync` pulls all campaigns, every active campaign recipient (`/recipients/list`), then overlays engaged lead status from `/leads/list`. Verified/backfilled 2026-05-23: 29 campaigns, 3,095 active recipient rows, 3,060/3,095 matched to CRM accounts and contacts. The 35 unmatched rows have no matched school/account. UI: `/campaigns` defaults to all campaigns, `/campaigns/[id]`, Campaigns tab on account detail, Mailshake card on `/settings/integrations` with Live + matched-count display. ⚠️ Real-time email events (sent/opened/clicked/replied/bounced) and reply text still require webhook registration in Mailshake → Account → Webhooks (handler wired at `/api/webhooks/mailshake` and is public per D-029). `MAILSHAKE_WEBHOOK_SECRET` currently empty — handler accepts unsigned events until set.
- **WhatsApp via Twilio** — code-complete, needs `TWILIO_AUTH_TOKEN` + WhatsApp number
- **Inngest** — ✅ local endpoint verified in dev mode. `.env.local` has `INNGEST_DEV=1`; production must unset that and use `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`. `GET /api/inngest` returned metadata with `function_count:6`, `mode:"dev"` on a production-server smoke.

**Sign-in for testing (local):**
- `demo@schoolconex.com` / `Test1234!` — admin role, was the very first row in `public.users`. Created via direct SQL into `auth.users` + `auth.identities` with `crypt(... , gen_salt('bf'))` + `email_confirmed_at` set so no email confirmation needed.
- Email/password fallback was added to `/login` (alongside Google SSO) to enable local testing without configuring Supabase's Google provider. Also reads `?error=credentials|missing|domain` query param.
- Rayan@schoolconex.com auth user was created earlier and then deleted (user clarified demo was the only sign-in identity needed).

**Browser automation infrastructure:**
- Playwright + persistent Chrome profile at `.playwright-profile/` (gitignored).
- Long-running Chrome over CDP (`scripts/browser-launch.mts`, port 9222) lets dozens of small `scripts/gcp-*.mts` scripts navigate / probe / click without re-authenticating.
- Screenshot library at `.playwright-shots/` for verification (gitignored).

The persistent-notes system is live in single-file mode. The skill auto-runs after every material change.

---

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

## File & Directory Map

- `e:\Claude\SchoolConex\SchoolConex_CRM\` — project root (Next.js 16 + Supabase + Drizzle CRM, ~25 routes, 9 commits)
- `Project_notes_folder/` — persistent notes (single-file mode)
  - `PROJECT_NOTES.md` — this file
  - `CHANGELOG.md` — append-only audit log
- `.claude/skills/update-project-notes/SKILL.md` + `.codex/skills/update-project-notes/SKILL.md` — auto-invoked notes skill
- `docs/superpowers/specs/2026-05-06-schoolconex-crm-design.md` — final design spec, source of truth
- `app/`, `components/`, `lib/`, `inngest/`, `supabase/migrations/` — main app code (see spec for layout)
- `scripts/` — operational scripts:
  - `apply-sql.mts` / `run-demo-user.mts` / `run-rayan-user.mts` / `remove-rayan-user.mts` — DB ops
  - `dialpad-{lookup-user,list-calls,backfill}.mts` — Dialpad ops (`npm run dialpad:*`)
  - `check-calls.mts` — DB inspection
  - `e2e-rayan.mts` + `e2e-inbox-check.mts` — programmatic e2e auth + render tests
  - `browser-launch.mts` — long-running headed Chrome over CDP, port 9222
  - `gcp-*.mts` (~15 scripts) — small one-shot GCP browser actions: probe, dismiss, list, create, enable, etc.
  - `drive-smoke.mts` — Drive SA smoke test (now exercises full create+delete with `supportsAllDrives:true`)
  - `drive-create-shared-drive.mts` / `drive-add-sa-member.mts` / `drive-finish-add-sa.mts` — UI-driven Shared Drive setup attempts (kept for reference; the working path is OAuth)
  - `drive-oauth-add-sa.mts` — one-shot OAuth loopback flow that adds the SA to the Shared Drive via REST. Reusable for any other admin-task that needs user-OAuth (just swap the API call).
  - `drive-create-folders-in-sd.mts` — idempotent: ensures `CRM Templates` + `CRM Generated` exist inside the Shared Drive, prints folder IDs.
  - `drive-wait-signin.mts` / `drive-wait-cloud-console.mts` / `cdp-probe.mts` / `drive-snap.mts` — small CDP utilities for orchestrating headed-browser flows.
  - `gcp-add-redirect-uri-do.mts` / `gcp-add-redirect-v2.mts` / `gcp-verify-redirect.mts` — Cloud Console redirect-URI management (used to register `http://localhost:53682/oauth/callback`).
- `.playwright-profile/` — persistent Chrome profile (gitignored)
- `.playwright-shots/` — debugging screenshots from automation runs (gitignored)
- `.secrets/service-account.json` — Drive service account JSON key (gitignored)
- `.env.local` — Supabase URL+anon, Postgres DATABASE_URL, Dialpad admin key + Rayan filter, Google OAuth client id+secret + service account JSON + folder IDs + project id (gitignored)
- `test.md` — empty file user opened in IDE; ignore
- Outside project root:
  - `C:\Users\msefa\.claude\plans\i-d-like-you-to-serene-emerson.md` — Claude Code plan-mode plan file (was active during brainstorm; now obsolete)
- **GCP project under SchoolConex Workspace:** `schoolconex-crm` (project number `489266381443`, owner matthew@schoolconex.com)
- **Supabase project:** `ooanslwrwjexdjwdphes`

---

## Accomplishments Log

### Session 2026-05-06 — Brainstorm + design (Claude, ~1 hour)
- Six architectural decisions locked via `/superpowers:brainstorming` Q&A flow (D-001 through D-006 from user-driven choices; D-007 through D-012 from agent-recommended defaults the user accepted by approving each design section)
- Full design presented across five sections, all approved:
  1. System overview & tech stack
  2. Core data model (12 tables)
  3. Integration architecture (Drive + Dialpad detailed; Stripe / Mailshake / WhatsApp patterns sketched)
  4. Auth, security, RLS, file handling
  5. Phased roadmap (6 phases, ~12 weeks total, v1 in ~5.5 weeks)
- Project notes folder created at `e:\Claude\SchoolConex\SchoolConex_CRM\Project_notes_folder` (single-file mode)
- `update-project-notes` skill installed in `.claude/skills/` and `.codex/skills/`

### Session 2026-05-06 — Spec tightening + Phase 1 step 1 (Claude)
- Spec tightened with D-013 (Phase 1 lock-in), D-014 (nullable `account_id` + Unmatched inbox), D-015 (standardized audit columns), D-016 (sidebar-first compact UI direction)
- Project scaffolded: git init (main), package.json, tsconfig, next.config.ts, postcss.config.mjs, app/{layout.tsx,page.tsx,globals.css}, lib/utils.ts, eslint flat config, prettier, components.json (shadcn), .env.example, README.md
- Folder shape created with `.gitkeep` markers per spec
- Dependencies installed; Next.js auto-upgraded from 15.1.6 → 16.2.4 to resolve CVE-2025-66478 (F-001); Drizzle ORM upgraded to latest patched (resolves SQL-injection advisory). Stack ended on Next.js 16, not 15.
- `npm run build` passes (Turbopack, 6s compile, 3 static routes)
- Initial commit: `a47f81a` "Phase 1 step 1: scaffold Next.js 15 + Tailwind v4 + Supabase + Drizzle" (commit message says 15 — actual installed version is 16; minor cosmetic discrepancy, not worth amending)

### Session 2026-05-06 — Dialpad activation + demo user + e2e tests (Claude, ~1 hour)
- Dialpad token-tier exploration: original token (JWT, scope `calls:list`, tier 0) returned 401 on `/api/v2/call`. User then provided a company-admin API key which works.
- Resolved Rayan's Dialpad user: `id=6598548464648192`, `phone=+14375234132`, `emails=[rayan@schoolconex.com]`. Pinned via `DIALPAD_FILTER_USER_ID` in `.env.local`.
- Built `lib/integrations/dialpad-client.ts` (typed wrappers: `getUser`, `listCalls`, `iterateCalls` with cursor pagination, `durationSeconds` ms→s helper, `getRecordingUrl` for `recording_details[].url` shape).
- Built `inngest/functions/dialpad-sync-rayan.ts` — `*/10 min` cron, watermarked via max(`received_at`), idempotent on `(provider, event_id)`.
- Built `scripts/dialpad-backfill.mts` — manual N-day backfill that goes straight to Postgres (parent activity + calls child + raw event, no Inngest needed). `npm run dialpad:backfill -- 30` ingested 96 calls for Rayan (72 inbound / 24 outbound). 0 matched contacts (demo data has fake phones).
- Internal-call tagging: 24 of 96 calls were Rayan ↔ another @schoolconex.com employee (Matthew); summary now suffix `· internal` and contact-match is skipped (D-020).
- Demo sign-in: `scripts/create-demo-user.sql` + `scripts/run-demo-user.mts` create `demo@schoolconex.com / Test1234!` via direct insert into `auth.users` + `auth.identities`. Trigger creates `public.users` row with role `admin` (first user).
- Email/password fallback added to `/login` (D-022). `signInWithEmailPassword` Server Action validates @schoolconex.com domain.
- E2E test rig: `scripts/e2e-rayan.mts` + `scripts/e2e-inbox-check.mts`. Sign-in via Supabase REST → forge `sb-{ref}-auth-token` cookie → walk 13 protected routes → 11/13 success (the 2 "failures" are correct redirects). Inbox check verified all 96 calls render with correct durations (4:14, 31:36, etc.) and internal tag.

### Session 2026-05-06 — Google Drive provisioning via browser automation (Claude, ~2 hours)
- Installed Playwright + headed Chrome over CDP (D-023). Wrote `scripts/browser-launch.mts` (long-running profile-persistent Chrome) + a dozen one-shot `scripts/gcp-*.mts` action scripts.
- **F-004**: First setup pass was done in `matthewsefati@gmail.com` personal account / project `gmail-mcp-personal`. User course-corrected. Discarded all that work.
- Switched to `matthew@schoolconex.com`. Listed projects under schoolconex.com org (6 found, none CRM-related).
- Created NEW project `schoolconex-crm` (project number 489266381443) under schoolconex.com org.
- Enabled `drive.googleapis.com` and `docs.googleapis.com` (via in-page DOM-eval click since Playwright role-locators kept missing the Enable button).
- Configured OAuth consent screen as **Internal** user type — wrestled with Material chip-input + radio bindings; final solve = `radio.check({force: true})` + `input.fill()` via resolved id (D-023, D-025).
- Created Web OAuth client; captured the new secret by reading `aria-label="Copy to clipboard: GOCSPX-..."` on the copy button (the modal doesn't display the unmasked secret in text).
- Created service account `schoolconex-crm-drive@schoolconex-crm.iam.gserviceaccount.com`. Downloaded JSON key (proper Playwright `page.waitForEvent('download')` set up BEFORE the click). Saved to `.secrets/service-account.json` + single-line copy in `GOOGLE_SERVICE_ACCOUNT_KEY`.
- Created Drive folders programmatically via Drive API (using the just-captured SA): `CRM Templates` (`1i0H2W1FZAvaxaOq0BXWGGQryRGpgCakZ`) + `CRM Generated` (`1ZkPo1ApnIBqZhZzwm9LkEaMNG3aeHaaz`). Both shared with matthew@schoolconex.com as writer.
- Drive smoke test: SA auth verified, both folders readable. Doc creation FAILED with `storageQuotaExceeded` (F-005). Smoke test rewritten to verify auth+read only.
- All Google credentials in `.env.local` populated: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_DRIVE_TEMPLATES_FOLDER_ID`, `GOOGLE_DRIVE_GENERATED_FOLDER_ID`, `GOOGLE_CLOUD_PROJECT_ID=schoolconex-crm`.

### Session 2026-05-07 — F-005 fix via Shared Drive (Claude, ~1.5 hours)
- User picked Option A (Shared Drive) and asked Claude to drive the browser autonomously.
- Re-launched headed Chrome (`scripts/browser-launch.mts`) pointed at `drive.google.com/drive/shared-drives`. User signed in as `matthew@schoolconex.com`.
- **Created Shared Drive** "SchoolConex CRM" (id `0AFnM-2HvmqO2Uk9PVA`) via Drive web UI (`scripts/drive-create-shared-drive.mts`). Required two iterations to find the right click target — Drive renders the "+ New" pill twice, only the second is visible (the first is `display:none` with `guidedhelpid="new_menu_button"` in a hidden rail variant). Final selector: pick the smallest visible element with text "New", click via `mouse.click()` at center coords. The "New shared drive" dialog has a unique title that disambiguates from Drive's many other `[role=dialog]` wrappers including the always-rendered hidden "Showing viewer" dialog.
- **Adding the SA via Drive UI was a dead end** — the "Manage members" link's text element has no clickable ancestor in 6 levels (Drive uses delegated event handling that we couldn't reliably reproduce via CDP). Pivoted to Drive REST API.
- **OAuth loopback flow** (`scripts/drive-oauth-add-sa.mts`): listen on `127.0.0.1:53682`, open the consent URL in the same Chrome session, exchange the code for a Drive-scoped access token, call `permissions.create` with `supportsAllDrives:true`, role=`organizer`. Required adding the redirect URI to the OAuth client first.
- **Adding the redirect URI** (`scripts/gcp-add-redirect-v2.mts`): user's password challenge cleared via the same Chrome (Cloud Console required re-auth even though Drive was logged in). Then drove the OAuth client edit page to click "+ Add URI", typed `http://localhost:53682/oauth/callback`, clicked Save. First Save click missed (clicked at y=891 instead of the actual Save button at y=837 — the page shifts when URIs are added). Second attempt with Playwright's `locator.click()` + `scrollIntoViewIfNeeded` worked. The OAuth client now has TWO redirect URIs: localhost:3000/auth/google-drive-callback (pre-existing for app-level Drive OAuth) and localhost:53682/oauth/callback (new, for admin tasks).
- **OAuth flow itself ran clean** once the URI was registered: user picked matthew@schoolconex.com on the consent screen, approved the Drive scope, redirect fired into the loopback server, `permissions.create` returned a 200 with `kind: "drive#permission"`, member list confirmed both matthew@schoolconex.com and the SA as `organizer`.
- **Created folders inside the Shared Drive** (`scripts/drive-create-folders-in-sd.mts`): SA used `files.create` with `parents:[SHARED_DRIVE_ID]` and `supportsAllDrives:true`. New IDs `CRM Templates` `1T7ItO_S8O4sGsnftj3kWz04L1R0fJQPo` and `CRM Generated` `1NR8wyn013tPE2NLWl4ke5OSc4UDJiXZj`.
- **Updated `.env.local`** with `GOOGLE_DRIVE_SHARED_DRIVE_ID` and the new folder IDs; legacy My-Drive folder IDs kept as `*_LEGACY` comments for reference.
- **Updated `scripts/drive-smoke.mts`** to test a full create-Doc + delete cycle (was previously read-only). Smoke test passes: SA creates a Google Doc inside `CRM Generated`, the response shows `driveId === GOOGLE_DRIVE_SHARED_DRIVE_ID`, then deletes the Doc cleanly. F-005 confirmed resolved.

### Session 2026-05-07 — Validation + Rayan email probe (Codex, ~45 minutes)
- Re-ran `scripts/drive-smoke.mts`; it passed full Shared Drive create/delete with `driveId=0AFnM-2HvmqO2Uk9PVA`.
- Confirmed `scripts/dialpad-lookup-user.mts rayan@schoolconex.com` resolves Rayan as `id=6598548464648192`, email `rayan@schoolconex.com`, phone `+14375234132`.
- Updated `scripts/dialpad-list-calls.mts` to print target/contact email fields; `scripts/dialpad-list-calls.mts 3` pulled 3 records via Rayan's `user_id`, with outbound samples showing `target_email:"rayan@schoolconex.com"`.
- Updated smoke expectations in `scripts/e2e-inbox-check.mts` and `scripts/e2e-rayan.mts`; `/inbox` validation passes and the route walk is now 13/13.
- Probed Gmail mailbox access for `rayan@schoolconex.com` through the service account with `gmail.readonly`; Google returned `401 unauthorized_client`. Logged F-006 because Gmail mailbox ingestion is blocked until Workspace DWD or per-user Gmail OAuth is authorized.

### Session 2026-05-09 — Mailshake activation + UI (Claude, ~3 hours)
- Added `MAILSHAKE_API_KEY` to `.env.local`. Smoke (`npm run mailshake:list-campaigns`) returned 29 campaigns. Probed individual endpoints to map Mailshake's actual API surface (F-009): only `/campaigns/list`, `/recipients/list`, `/leads/list` are usable for polling.
- Added `mailshake_campaigns` + `mailshake_leads` tables to `lib/db/schema.ts`. Pushed via `npm run db:push` (force). Recreated RLS policies via `npm run db:apply-migrations`. Added `supabase/migrations/0004_mailshake_campaigns_rls.sql` (read by all authenticated, write by admin/service role only).
- Built `lib/integrations/mailshake.ts` (Mailshake client: `listCampaigns`, `listLeads`, `paginate` with cycle-token guard + maxPages=100). Built `lib/integrations/mailshake-sync.ts` (`syncAllCampaigns`, `syncCampaign`, `rematchAllLeads`, `matchLead` — email→contact, then school name→account). Built Inngest cron `mailshake-sync-campaigns` (every 30 min, registered in `inngest/functions/index.ts`).
- Manual scripts: `mailshake:sync`, `mailshake:import-accounts` (with `--dry`), `mailshake:stats`. All use `tsx --conditions=react-server` so `server-only` resolves to its no-op stub via the package's exports map.
- Auto-import 274 schools from Mailshake recipient.fields.account → `accounts` (source='mailshake'). Re-matched: 301/305 leads now linked to CRM accounts (98.7%). The 4 unmatched leads have no `fields.account` populated upstream.
- UI: `/campaigns` (list with engaged/open/closed/ignored columns + Top schools table + amber webhook-not-set banner), `/campaigns/[id]` (campaign detail with stats row + per-school grouping with status badges, every school links to its account), Campaigns tab on account detail (lists every campaign that touched the account with recipients + status), Mailshake card on `/settings/integrations` (campaigns synced, leads tracked, last sync, webhook secret status). Sidebar entry "Campaigns" added between Opportunities and Dashboard.
- After first round of UI testing, discovered my labels were wrong — Mailshake's lead status is `open|closed|ignored` (lead pipeline), not the email-event categories I'd assumed (opens/clicks/replies/bounces). Re-labeled across `lib/crm/mailshake.ts`, `/campaigns`, `/campaigns/[id]`, and account Campaigns tab. Added explanatory copy + a banner on `/campaigns` explaining the webhook activation path.
- Validated end-to-end via Playwright (`scripts/mailshake-e2e-validate.mts`): login as `demo@schoolconex.com` → `/accounts` redirect → `/campaigns` (43 rows = 29 campaigns + 14 top schools) → click into top campaign → 107 schools touched grouped + linked to accounts → navigate to top account (Disha Consultants) → Campaigns tab shows Gujarat-Forth-Batch-A with 3 recipients. Screenshots in `.playwright-shots/ms-*.png`.

### Session 2026-05-08 — Full verification sweep (Codex, ~1.5 hours)
- Ran static verification: `npm run typecheck` passed, `npm run build` passed and generated all 24 static pages plus dynamic app/API routes.
- Ran authenticated route smoke: `scripts/e2e-rayan.mts` passed 13/13, `/inbox` smoke passed, and a dynamic-route probe passed 10/10 account/contact/opportunity/catalog create/edit/detail URLs with real DB IDs.
- Ran live integrations: Drive Shared Drive smoke passed create/delete with `driveId=0AFnM-2HvmqO2Uk9PVA`; Dialpad lookup/list passed for Rayan; DB counts show 96 call activities (72 inbound / 24 outbound).
- Found and fixed F-007: middleware auth blocked unauthenticated webhook/Inngest callbacks. Added `/api/webhooks` + `/api/inngest` to public paths; webhook no-op POSTs now reach their route handlers.
- Found and fixed F-008: `/api/inngest` returned 500 without local Inngest dev mode. Added `server-only`, documented/set `INNGEST_DEV=1`, and verified a production-server smoke returns Inngest metadata (`function_count:6`, `mode:"dev"`).
- Confirmed remaining known blockers: Gmail mailbox pull still returns `401 unauthorized_client`; catalog/products/packages/templates tables are empty; `npm run lint`, direct `eslint .`, and `npm run format:check` are not green; `npm audit` reports 7 moderate advisories.

---

## Failures & Resolutions

### F-001 — Next.js 15.1.6 ships with security vulnerability (CVE-2025-66478) — 2026-05-06
**Issue:** Initial scaffold pinned `next@15.1.6`. `npm install` reported a critical-severity advisory (CVE-2025-66478).
**Root cause:** Older Next.js patch shipped with a known issue patched in later releases.
**Fix:** `npm install next@latest eslint-config-next@latest` — resolved to Next 16.2.4. Build still passes.
**Guardrail:** When pinning Next.js (or any major dep), use the latest stable patch at the time of writing rather than a hand-picked older version. Run `npm audit` immediately after `npm install` and address `high`/`critical` severities before committing.

### F-002 — Supabase blocks `ALTER DATABASE ... SET ...` from regular roles — 2026-05-06
**Issue:** First migration attempt set the allowed-email-domain via `alter database postgres set app.allowed_email_domain = 'schoolconex.com'` so the post-signup trigger could read it as a GUC. Failed with "permission denied to set parameter".
**Root cause:** Managed Supabase doesn't expose the `postgres` superuser; the role used for migrations cannot mutate database-level GUCs.
**Fix:** Hardcoded the allowed domain in `handle_new_auth_user()` directly. Documented in the function body that to change it, edit the function and re-run the migration.
**Guardrail:** For Supabase, prefer hardcoded values, RPC parameters, or a dedicated `app_config` table over Postgres GUCs. Any setting that needs to vary per-environment goes in env vars and is read in app code, not DB.

### F-003 — Next.js 16 renamed `middleware.ts` → `proxy.ts` and changed config conventions — 2026-05-06
**Issue:** First build under Next 16 emitted a deprecation warning ("middleware file convention is deprecated, use proxy") and a separate type error (implicit `any` on Supabase `setAll` cookie param under stricter TS settings).
**Root cause:** Next.js 16 release renamed the routing helper from `middleware` to `proxy`; also tightened TS expectations for cookie callback shapes.
**Fix:** Renamed `middleware.ts` → `proxy.ts`, exported function `proxy` instead of `middleware`. Added explicit `CookieToSet[]` type to both `lib/supabase/server.ts` and `lib/supabase/middleware.ts` to satisfy strict TS. Also moved `experimental.typedRoutes` to top-level `typedRoutes` in `next.config.ts`.
**Guardrail:** When upgrading Next majors, scan the build output for deprecation warnings before assuming a green build means we're on supported APIs.

### F-004 — Initial GCP work was done in the wrong Google account — 2026-05-06
**Issue:** The first Drive integration setup (Web OAuth client, test users, exploration) was done while the headed Chrome was logged into `matthewsefati@gmail.com` (personal) under project `gmail-mcp-personal-495520`. User course-corrected mid-session: "I want connected is the SchoolConex drive, which is matthew@schoolconex.com".
**Root cause:** Browser-launch script just opened the GCP console without specifying which Google account to use; the user had been logged into their personal Gmail in this Chrome profile. I should have asked which account up front.
**Fix:** Discarded everything in `gmail-mcp-personal`. Cleared `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` from `.env.local`. Re-did all setup under `matthew@schoolconex.com` in a brand-new project `schoolconex-crm` under the schoolconex.com org.
**Guardrail:** Before any GCP / Workspace setup, run `gcp-probe.mts status` and confirm `signed-in account` matches expectations. If switching accounts in Chrome, restart `browser-launch.mts` so the persistent profile picks up the right session.

### F-005 — Service account has 0 Drive storage quota → Doc creation fails — 2026-05-06 (RESOLVED 2026-05-07)
**Issue:** Drive smoke test failed at `drive.files.create({ mimeType: 'application/vnd.google-apps.document' })` with HTTP 403 `"The user's Drive storage quota has been exceeded"`. Folder creation succeeded (folders don't consume storage); Doc creation didn't.
**Root cause:** Google service accounts have no consumer-grade Drive storage by default. They can read/write files in folders shared with them, and create folders in their own My Drive (free), but Docs/Sheets/Slides created in My Drive count against quota — which is 0 for SAs.
**Resolution:** Took **Option A (Shared Drive)** — see D-027 for full mechanics. Smoke test now passes the full create/delete cycle, with the test file's `driveId` matching the Shared Drive id (so storage is owned by the Drive, not the SA).
**Why we picked A over B:** Shared Drive is one-time setup; Domain-Wide Delegation requires ongoing admin.google.com config and ties contract ownership to a specific human user (impersonation footgun on SA rotation).
**Guardrail:** When the integration design says "service account writes files", default to Shared Drive from day one. Don't try to use SA's My Drive — it's not for that. Always pass `supportsAllDrives: true` on any Drive API call that touches Shared Drive content.

### F-017 — Dialpad cron crashes on empty time windows — 2026-05-26 (RESOLVED same session)
**Issue:** On-demand `/api/cron/dialpad-sync` hits during quiet periods returned HTTP 500 with `{"ok":false,"error":"n.items is not iterable"}` (minified `page.items`). Daily scheduled runs at 07:00 UTC continued to work because the 24-hour lookback always had at least one call.
**Root cause:** Dialpad's `/api/v2/call` returns `{}` (no `items` key) — not `{items:[]}` — when the requested time range contains zero calls. `lib/integrations/dialpad-client.ts:169` did `for (const item of page.items)` which throws TypeError when `page.items` is undefined.
**Fix:** Defensive `for (const item of page.items ?? [])` in `iterateCalls`. One line.
**Guardrail:** Always default-empty when iterating optional API response arrays.

### F-006 — Gmail mailbox pull for Rayan is blocked by missing Gmail authorization — 2026-05-07 (RESOLVED 2026-05-26 by D-036)
**Resolution:** Pivoted from service-account DWD to per-user OAuth (see D-036). Each rep grants `gmail.readonly` via `/api/gmail/connect`; tokens persist in `integration_credentials` (provider='google_gmail'). Daily sync cron at `/api/cron/gmail-sync` walks every connected rep and ingests new messages into the new `email_messages` table. Pre-launch: redirect URI registration + consent-screen scope add still pending (see D-036 "How to apply").
**Issue (historical):** User asked to make sure email pull also covers `rayan@schoolconex.com`. Dialpad payloads do expose `target.email` for Rayan, but actual Gmail mailbox access is not live.
**Evidence:** Service-account impersonation probe using `subject:"rayan@schoolconex.com"` and scope `https://www.googleapis.com/auth/gmail.readonly` returned HTTP 401 `unauthorized_client: Client is unauthorized to retrieve access tokens using this method, or client not authorized for any of the scopes requested.`
**Root cause:** Existing Google setup is Drive/Docs only. The service account is not authorized for Gmail domain-wide delegation, and the app's OAuth flow only asks for Drive scopes (`drive.file`, `userinfo.email`), not Gmail scopes.
**Fix options:** A) Enable Domain-Wide Delegation for the service account, authorize the service account OAuth client ID in Google Workspace Admin with Gmail readonly scope, then implement a cron Gmail sync for Rayan. B) Add a per-user Gmail OAuth connect flow and have Rayan consent directly. A is better for admin-managed CRM ingestion; B is better for least-privilege rep-controlled access.
**Guardrail:** Do not claim Gmail mailbox sync works until `gmail.users.getProfile({ userId:"me" })` returns `rayan@schoolconex.com` and `gmail.users.messages.list` returns or legitimately reports zero messages for the expected query window.

### F-007 — External webhook/Inngest routes were blocked by app auth — 2026-05-08 (RESOLVED 2026-05-08)
**Issue:** Full verification POSTed no-op payloads to `/api/webhooks/*` and got the login HTML instead of route-handler responses. Third-party integrations would not be able to deliver events because they do not have Supabase session cookies.
**Root cause:** `lib/supabase/middleware.ts` only treated `/login`, `/auth/*`, `_next`, favicon, and `/api/health` as public. `proxy.ts` matched API routes too, so unauthenticated webhook/Inngest requests redirected to `/login`.
**Fix:** Added `/api/webhooks` and `/api/inngest` to `PUBLIC_PATHS`. Re-ran no-op webhook smoke: Dialpad and Mailshake return 400 invalid JSON, Stripe returns 400 missing secret/signature, WhatsApp returns 200 unrecognized event; all now reach their route handlers.
**Guardrail:** Any callback endpoint meant for external systems must be public at middleware level and enforce authenticity inside its own route handler.

### F-009 — Mailshake REST API has no per-event endpoints — 2026-05-09 (DOCUMENTED)
**Issue:** Tried polling `/sentEmails/list`, `/opens/list`, `/clicks/list`, `/replies/list`, `/messages/list`, `/campaigns/getStats`, `/recipients/getActivities` to track email events per campaign — all returned 404 from `https://api.mailshake.com/2017-04-01`.
**Root cause:** Mailshake's public REST API surfaces only campaigns / recipients / leads (lead pipeline) / deliverability reports. Real-time event tracking (sent / opened / clicked / replied / bounced) is delivered via webhooks only.
**Workaround:** Use the lead-pipeline `status` field from `/leads/list` as a proxy for "engaged recipient" — it captures recipients who triggered any tracked event. For full per-event timelines, register the webhook URL `https://<deployed-host>/api/webhooks/mailshake` in Mailshake → Account → Webhooks (handler already wired at `app/api/webhooks/mailshake/route.ts` → Inngest `mailshake-process-event` → `email_events` + activity timeline).
**Guardrail:** Any future ask for "track opens / clicks / replies per X" against Mailshake must include webhook activation as a prerequisite — REST polling alone cannot satisfy it.

### F-008 — `/api/inngest` returned 500 in local/prod smoke — 2026-05-08 (RESOLVED 2026-05-08)
**Issue:** After F-007, `GET /api/inngest` returned 500 `internal_server_error`.
**Root cause:** Two local-runtime pieces were missing: the `server-only` package used by the Drive integration import chain, and Inngest local dev mode. In production mode without `INNGEST_SIGNING_KEY`, Inngest requires `INNGEST_DEV=1` for local verification.
**Fix:** Installed `server-only`, set `INNGEST_DEV=1` in `.env.local`, documented it in `.env.example`, and verified `next start -p 3002` returns `GET /api/inngest` metadata with `function_count:6`, `mode:"dev"`.
**Guardrail:** Production deploys must set `INNGEST_SIGNING_KEY` and leave `INNGEST_DEV` unset; local verification can use `INNGEST_DEV=1`.

### F-010 — Mailshake manual sync CLI completed but did not exit — 2026-05-09 (RESOLVED 2026-05-09)
**Issue:** `npm run mailshake:sync` reached the expected final summary (`campaigns upserted: 29`, `leads upserted: 305`, `matched account: 301`) but the process stayed alive until the verification timeout killed it.
**Root cause:** `scripts/mailshake-sync.mts` and `scripts/mailshake-import-accounts.mts` imported the shared Drizzle/Postgres singleton from `lib/db` without closing its underlying `postgres` client in script mode.
**Fix:** Exported `closeDb()` from `lib/db/index.ts` and wrapped both Mailshake CLI entrypoints in `finally { await closeDb(); }`. The Inngest cron path still uses the shared app client and does not close it per invocation.
**Guardrail:** Any future one-shot script that imports `lib/db` must close the shared client before process exit.

### F-013 — Inngest crons not firing locally (silently stale data) — 2026-05-22 (DOCUMENTED)
**Issue:** Last Dialpad call ingested was 2026-05-05; user opened a session on 2026-05-22 — 17 days of calls were missing despite the cron being registered (`/api/inngest` reports `function_count:7, mode:dev`). Same risk applies to `mailshake-sync-campaigns` (last_synced_at also stale).
**Root cause:** Inngest's local dev mode (`INNGEST_DEV=1`) requires the Inngest CLI dev server running on port 8288 (`npx inngest-cli@latest dev`) to actually fire registered cron triggers. Without it, crons are registered but nothing calls them. `curl http://localhost:8288` → connection refused.
**Workaround applied:** `npm run dialpad:backfill -- 20` to pull May 5→May 22 calls (31 new ingested). Same pattern works for Mailshake: `npm run mailshake:sync`.
**Long-term fix:** Either (a) operator runs `npx inngest-cli@latest dev` in another terminal alongside `npm run dev`, or (b) deploy the app + set `INNGEST_SIGNING_KEY` + `INNGEST_EVENT_KEY` so Inngest Cloud fires the crons. Don't trust local dev for ongoing data freshness.
**Guardrail:** Production deployment must set `INNGEST_SIGNING_KEY` and unset `INNGEST_DEV`. Consider adding a heartbeat probe (e.g. dashboard widget "last cron run") so stale syncs are visible to operators.

### F-012 — Dialpad calls produced 0/96 account matches — 2026-05-22 (RESOLVED 2026-05-22)
**Issue:** User flagged "Rayan's call logs aren't being pulled into the accounts he called". Audit confirmed: 0/96 calls matched to accounts despite 277 accounts existing.
**Root cause:** D-032 imported 274 schools as accounts but D-032 alone leaves the schools empty. The Dialpad matcher (`matchPhoneToContact` in `lib/integrations/contact-matcher.ts`) queries the `contacts` table — which only had 4 demo rows. No contacts with real phones → no possible match. The matching mechanism itself was always correct; the data simply wasn't there.
**Fix:** D-033 (`npm run mailshake:import-contacts`) materializes contacts from `mailshake_leads.fields`. Then `scripts/dialpad-rematch-calls.mts` walks every `activities.account_id IS NULL` call, looks up the external number against the now-populated phone index (E.164 + last-7-digits fallback), and updates `account_id` + `contact_id`. After fix + 31-call backfill + rematch: 3/127 calls matched (the 1 historical Baig Academy + 2 newly-ingested calls auto-matched at insert time). The remaining 124 calls are with numbers genuinely NOT in any Mailshake campaign — the matcher is working; the data overlap is just small for now.
**2026-05-23 update:** D-034 supersedes the operator-only workflow. Mailshake cron now pulls all recipients and runs auto-pipeline; Dialpad sync/backfill/webhook are company-wide by default. After full backfill: 3,060/3,095 Mailshake rows link to account/contact; 127 Dialpad calls exist, 23 matched, 47 transcripts.
**Guardrail:** D-032, D-033, and D-034 must stay together — never import schools without recipients/contacts, and only set `DIALPAD_SYNC_SCOPE=user` intentionally.

### F-011 — Mailshake UI default/counts did not fully reflect live snapshot — 2026-05-09 (RESOLVED 2026-05-09)
**Issue:** `/campaigns` defaulted to 28 non-archived campaigns instead of all 29 synced campaigns, and `/settings/integrations` showed campaigns/leads but not the 301/305 account-match count.
**Fix:** Made `/campaigns` default to all campaigns with an active-only toggle, and added `Matched to accounts 301/305` to the Mailshake integration card.

---

## Open Questions / Next Steps

### Drive integration — followups now that F-005 is RESOLVED

1. ✅ ~~Resolve F-005~~ — done via D-027 (Option A, Shared Drive). Smoke test passes full create/delete.
2. **Add at least one real contract template** to `CRM Templates` folder (`1T7ItO_S8O4sGsnftj3kWz04L1R0fJQPo`) + register it in the CRM via `/settings/templates`. Use placeholders `{{account_name}}`, `{{opportunity_name}}`, `{{contract_value}}`, `{{rep_name}}`, `{{rep_email}}`, `{{today}}`.
3. **Wire `lib/integrations/google/drive.ts` (or wherever the contract-generation flow lives) to use the new env vars + always pass `supportsAllDrives: true`.** End-to-end test: trigger "Generate contract" on an opportunity → confirm the new Doc lands in `CRM Generated` (Shared Drive), is owned by the Shared Drive, and is shared with the rep as `writer` so it appears in their "Shared with me".

### Dialpad — followups (low priority)

4. **Re-match unmatched calls** when contacts are added: 96 calls currently in `/inbox` because contacts table doesn't have the real phone numbers yet. Either:
   - Import Dialpad contacts as CRM contacts (by phone) via a one-off script, OR
   - Manually create accounts/contacts for the schools, then run a "rerun-matching" Inngest job (write needed).
5. **Surface phone number on `/inbox` rows.** Started — `/inbox` page copy was updated but the activity-timeline component doesn't pull/show `calls.from_number` / `calls.to_number`. Fix: extend timeline query to JOIN child `calls` row when `channel='call'`, render number in summary line.
6. **Transcripts:** Dialpad's call payloads include `transcription_text` only when the workspace has transcription enabled. Looking at Rayan's calls so far, none had transcript text. Verify whether the SchoolConex Dialpad plan supports it.

### Sign-in / auth

7. **Supabase Google OAuth** — still not configured in Supabase dashboard. Workaround: email/password form on `/login` (D-022). Long-term, configure Google provider in Supabase + use the new schoolconex-crm Web OAuth client (`489266381443-vqdbp0n929pdjlj6tehpba7rtvci0e6n...`) for SSO. Redirect URI in Google: `https://ooanslwrwjexdjwdphes.supabase.co/auth/v1/callback`.
8. **Service-role key** — `.env.local` has `SUPABASE_SERVICE_ROLE_KEY` empty. Needed for any future admin flow that bypasses RLS.

### Phase 1 follow-ups

9. **Pipelines admin editor** — `/settings/pipelines` is read-only; CRUD UI deferred.
10. **Global search** — `⌘K` palette stub exists but doesn't run queries.
11. **Re-match Inngest job** — see #4 above.

### Mailshake — followups

22. **Register webhook URL in Mailshake** to capture real-time per-email events + reply text. URL: `https://<deployed-host>/api/webhooks/mailshake`. Events: `sent`, `open`, `click`, `reply`, `bounce`. Set `MAILSHAKE_WEBHOOK_SECRET` once registered. Without this, the lead-pipeline counts (`open`/`closed`/`ignored`) are the only data we have — see F-009 for full context.
23. **Add reply text on account timeline.** Once webhooks are flowing, replies will populate `email_events` rows linked to activities; the existing `ActivityTimeline` component renders email_events generically. Verify rendering shows subject + snippet for `mailshake_event` channel and add a "View on Mailshake" link.
24. **Surface Mailshake lead status changes as activity rows.** Today the cron only upserts `mailshake_leads`; transitions (open → closed) aren't a timeline event. Consider emitting a `mailshake_event` activity on status change so each "lead converted to closed" shows up in the account history.
25. **Consider auto-import for new schools on every sync run.** Currently `mailshake:import-accounts` is manual. Could be a step inside the cron that runs after `syncAllCampaigns()`.

### Phase 5/6 planning

12. **Gmail sync for Rayan (NEW REQUEST, BLOCKED by F-006).** Recommended path: Domain-Wide Delegation against the SA, poll every 10 min, ingest only threads where at least one external recipient/sender matches a known CRM contact email. Read-only; body+snippet only, no attachments; matches via shared `contact-matcher.matchEmailToContact()`. First unblock authorization: either Workspace DWD for `gmail.readonly` on the service account or per-user Gmail OAuth consent by Rayan.
13. **Stripe** — needs `STRIPE_SECRET_KEY` + webhook secret.
14. **Mailshake** — needs `MAILSHAKE_API_KEY` + webhook secret.
15. **WhatsApp Business API decision (D-012)** — needed before Phase 6 activation.
16. **DocuSign / e-signature volume** — v3 candidate.
17. **Reporting / dashboard requirements** — define before Phase 5.
18. **Compliance confirmation** — CRM does not ingest student records (FERPA out of scope).

### Verification / hygiene follow-ups

19. **Lint config/script is broken.** `npm run lint` calls `next lint`, which Next 16 treats as an invalid project directory. Direct `npx eslint .` also fails with an ESLint 9 circular config error. Fix ESLint config/script before treating lint as a release gate.
20. **Formatting is not clean.** `npm run format:check` reports 137 files with Prettier style issues. This is repo-wide existing churn; run a dedicated formatting pass when ready.
21. **Audit has moderate advisories.** `npm audit --audit-level=high` reports no high/critical blocker but does list 7 moderate advisories (esbuild via drizzle-kit, postcss via next/inngest). `npm audit fix --force` proposes breaking downgrades/upgrades, so handle deliberately.

---

## Context for the Next Agent

- **Codebase exists.** ~25 routes, full data model, Phase 1 (UI), the Dialpad poll-sync, and the Drive integration are all LIVE. Other integrations (Stripe / Mailshake / WhatsApp) are code-complete and inert pending creds.
- **User context:** SchoolConex is an education + tech company on Google Workspace `schoolconex.com`. Primary contact: matthew@schoolconex.com. Sales rep being tested: rayan@schoolconex.com (his Dialpad number `+1 437 523 4132`).
- **GCP project for Drive integration:** `schoolconex-crm` under schoolconex.com Workspace (NOT matthewsefati@gmail.com personal — see F-004 for the wrong-account incident).
- **Local sign-in test creds:** `demo@schoolconex.com / Test1234!` (admin role). Email/password form added to `/login` alongside Google SSO. See D-021/D-022.
- **Dialpad token:** Must be a **company-admin** API key (not user-tier JWT). Personal-tier tokens 401 on `/api/v2/call`. Company-wide sync is default; set `DIALPAD_SYNC_SCOPE=user` plus `DIALPAD_FILTER_USER_ID` only when deliberately narrowing to one user.
- **Dialpad payload quirks:** `duration` is in milliseconds; convert via `Math.round(c.duration / 1000)` before storing in `calls.duration_seconds` (smallint). Recording is at `recording_details[0].url`, not `recording_url[0]`. Page size capped at 50.
- **Drive integration:** LIVE (F-005 resolved via D-027). Shared Drive `0AFnM-2HvmqO2Uk9PVA` ("SchoolConex CRM") hosts both folders. SA `schoolconex-crm-drive@schoolconex-crm.iam.gserviceaccount.com` is `organizer` on the Shared Drive. **All Drive API calls touching CRM content MUST pass `supportsAllDrives: true`** (and for `files.list`, also `includeItemsFromAllDrives:true`, `corpora:"drive"`, `driveId: env.GOOGLE_DRIVE_SHARED_DRIVE_ID`). See `scripts/drive-smoke.mts` for the canonical pattern.
- **External callbacks:** `/api/webhooks/*` and `/api/inngest` are public at middleware level (D-029) and must validate inside route handlers. Local Inngest verification uses `INNGEST_DEV=1`; production uses real Inngest keys (D-030).
- **Gmail mailbox access:** NOT live. Service-account impersonation for `rayan@schoolconex.com` + `gmail.readonly` returns `401 unauthorized_client`; see F-006. This is separate from Dialpad, whose API already returns Rayan's `target.email` in call payloads.
- **Browser automation framework:** `scripts/browser-launch.mts` opens long-running Chrome on port 9222; `scripts/gcp-*.mts` connect via CDP. Caveats in D-023 — Material radios need `radio.check({force:true})`, downloads need `page.waitForEvent('download')` set up BEFORE the click, and selectors that match `[role="combobox"]` will collide with GCP's global search bar; scope to form region.
- **Stack pinning:** Next.js 16 (App Router only — do NOT use Pages Router), Tailwind v4, shadcn/ui, Drizzle ORM 0.45, Inngest SDK, googleapis, stripe, playwright (dev only).
- **RLS first:** every new table MUST have RLS policies before any rows are inserted.
- **The spec is the source of truth** for design decisions. If a decision needs to change, log it as a new D-NNN entry, don't rewrite history.
- **`integration_events_raw`** is sacred: never drop rows, never edit historical payloads. It exists for replay.
- **Activity timeline insertion** must go through `lib/integrations/record-activity.ts` `recordActivity()` for integration code (bypasses RLS via Drizzle/postgres role). UI Server Actions still use the Supabase server client (RLS-enforced). See D-018.
- **Auto mode default.** Treat continuous execution as the default; user will course-correct if needed.
- **Keep updates terse.** Notes get longer fast. Prefer linking to D-NNN / F-NNN entries over re-stating.
