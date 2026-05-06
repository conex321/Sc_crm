# Project Notes — SchoolConex CRM

**Last updated:** 2026-05-06
**Last agent:** Claude
**Session summary:** All six phases complete. 25 routes, 4 webhook endpoints, 5 Inngest functions, full data model live in Supabase. D-013 (Phase 1 lock-in) was relaxed by user instruction "continue to the rest of the phases". Phases 2-6 are code-complete and ready-to-activate — each requires vendor credentials + webhook URL registration to go live. Build green; build artifacts in .next/.
**Notes mode:** single-file

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

**What's *code-complete but inert* until you provide vendor credentials:**
- Google Drive integration (Phase 2) — needs Google Cloud OAuth client + service account
- Dialpad call ingestion (Phase 3) — needs DIALPAD_API_KEY + webhook registered in Dialpad
- Stripe payment events + outbound invoicing (Phase 5) — needs STRIPE_SECRET_KEY + webhook
- Mailshake email events (Phase 5) — needs MAILSHAKE_API_KEY + webhook
- WhatsApp via Twilio (Phase 6) — needs TWILIO_AUTH_TOKEN + Messaging webhook
- Inngest itself — runs locally with `npx inngest-cli@latest dev`; prod needs INNGEST_EVENT_KEY + SIGNING_KEY

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

---

## File & Directory Map

- `e:\Claude\SchoolConex\SchoolConex_CRM\` — project root (greenfield)
- `e:\Claude\SchoolConex\SchoolConex_CRM\Project_notes_folder\` — this notes folder
  - `PROJECT_NOTES.md` — this file
  - `CHANGELOG.md` — append-only audit log
- `e:\Claude\SchoolConex\SchoolConex_CRM\.claude\skills\update-project-notes\SKILL.md` — auto-invoked notes skill (Claude)
- `e:\Claude\SchoolConex\SchoolConex_CRM\.codex\skills\update-project-notes\SKILL.md` — auto-invoked notes skill (Codex)
- `e:\Claude\SchoolConex\SchoolConex_CRM\test.md` — empty file user opened in IDE; ignore
- Pending creation:
  - `e:\Claude\SchoolConex\SchoolConex_CRM\docs\superpowers\specs\2026-05-06-schoolconex-crm-design.md` — final design spec
- Outside project root:
  - `C:\Users\msefa\.claude\plans\i-d-like-you-to-serene-emerson.md` — Claude Code plan-mode plan file (was active during brainstorm; now obsolete after exiting plan mode)

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

---

## Open Questions / Next Steps

### To unblock first sign-in (TODAY)

1. **Configure Google OAuth in Supabase dashboard.** Without this, the login button will fail. Steps:
   1. Supabase dashboard → Authentication → Providers → Google → enable.
   2. Create a Google Cloud OAuth client (type: Web app). Authorized redirect URI: `https://ooanslwrwjexdjwdphes.supabase.co/auth/v1/callback`.
   3. Paste Google client ID + secret into Supabase → save.
   4. In Authentication → URL Configuration, add `http://localhost:3000` to redirect allow-list.
2. **Enable email-domain restriction in Supabase Auth (defense in depth).** Authentication → Providers → Google → "Skip nonce check": leave default; the DB trigger is the hard guarantee.
3. **First sign-in becomes admin** automatically (handle_new_auth_user trigger). Subsequent users default to `rep`; promote in `/settings/users`.

### Phase 1 follow-ups (nice-to-have, not blockers)

4. **Service-role key** — `.env.local` has `SUPABASE_SERVICE_ROLE_KEY` empty. Needed for any future admin flow that bypasses RLS (none in Phase 1).
5. **Pipelines admin editor** — `/settings/pipelines` is read-only; CRUD UI deferred. Use SQL or db:seed for changes meanwhile.
6. **Global search** — `⌘K` palette stub exists but doesn't run queries. Wire to a search RPC in a follow-up.
7. **`audit_log` viewer** — table populated by triggers; no UI yet.

### Next phase planning

8. **WhatsApp Business API decision (D-012)** — needed before Phase 6 build.
9. **Phase 2 kickoff (Google Drive)** — gated on Phase 1 stability (D-013 = "two reps using daily for a full week without blocker bugs"). Not started.
10. **DocuSign / e-signature volume** — confirm urgency (v3 candidate).
11. **Reporting / dashboard requirements** — define before Phase 5.
12. **Compliance confirmation** — CRM does not ingest student records (FERPA out of scope). Confirm in writing.

---

## Context for the Next Agent

- **No code exists.** The next session likely scaffolds the Next.js 15 App Router project, sets up Supabase, applies schema migrations, and begins Phase 1.
- **User context:** SchoolConex is an education + tech company. User email: `ai@schoolconex.com`. Targets: schools and aspiring school founders. Services: Principal Service, LMS, 70+ courses with packaged pricing.
- **Stack pinning:** Next.js 15 (App Router only — do NOT use Pages Router), Tailwind v4, shadcn/ui (CLI-installed components), Drizzle ORM preferred for type-safe schema (final decision at scaffold time), Inngest SDK for jobs.
- **Drive integration:** uses `drive.file` scope (NOT `drive.readonly` or full Drive). Service account credentials TBD.
- **Dialpad integration:** API key in env, webhook signature verification mandatory before any DB writes.
- **RLS first:** every new table MUST have RLS policies before any rows are inserted. Do not skip for "we'll add policies later."
- **The spec is the source of truth** for design decisions. If a decision needs to change, log it as a new D-NNN entry, don't rewrite history.
- **`integration_events_raw`** is sacred: never drop rows, never edit historical payloads. It exists for replay.
- **Activity timeline insertion** must go through a `recordActivity()` helper (TBD at implementation time) — direct INSERT into child tables without the parent `activities` row will desync the timeline.
- **Plan mode + auto mode were both used** during this session. After plan-mode exit, user re-enabled auto mode; treat continuous execution as the default for the remainder.
- **Keep updates terse.** Notes get longer fast. Prefer linking to D-NNN entries over re-stating the decision.
