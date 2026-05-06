# Project Notes — SchoolConex CRM

**Last updated:** 2026-05-06
**Last agent:** Claude
**Session summary:** Brainstorm session for in-house CRM design. Twelve architectural decisions captured. Spec written + tightened with four implementation constraints (D-013 through D-016). Phase 1 execution started — scaffolding next.
**Notes mode:** single-file

---

## Current State

Greenfield project at `e:\Claude\SchoolConex\SchoolConex_CRM` (no git, empty as of session start). Brainstorm complete — tech stack, data model, integration architecture, auth model, and phased roadmap all approved by the user. About to write the design spec to `e:\Claude\SchoolConex\SchoolConex_CRM\docs\superpowers\specs\2026-05-06-schoolconex-crm-design.md`. After user reviews the spec, the `superpowers:writing-plans` skill will produce the implementation plan.

No code written. No project scaffolded. No git repo initialized.

The persistent-notes system (this folder + the `update-project-notes` skill) is now live in single-file mode.

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

---

## Failures & Resolutions

None this session.

---

## Open Questions / Next Steps

1. **Write the design spec** to `e:\Claude\SchoolConex\SchoolConex_CRM\docs\superpowers\specs\2026-05-06-schoolconex-crm-design.md`. Spec self-review pass after writing.
2. **User reviews the written spec** before plan-writing.
3. **Invoke `superpowers:writing-plans` skill** to produce the implementation plan once spec is approved.
4. **WhatsApp Business API decision** — needs answering before Phase 6 build. Options: Meta Cloud API direct, Twilio (or another BSP), or scope WhatsApp out of v3.
5. **Reporting / dashboard requirements** — left vague in the design; revisit during Phase 5 planning.
6. **DocuSign / e-signature integration** — flagged as a v3 candidate for real signed-status tracking. Confirm volume / urgency.
7. **Compliance check** — confirm CRM does not ingest student records. If it does, FERPA enters scope and tables holding student data need encryption-at-rest + access logging.
8. **Git initialization** — project root is not a git repo yet. Initialize before any code is written.
9. **Supabase project** — the user (`ai@schoolconex.com`) controls the Supabase org. Get project name + company SSO domain at scaffold time.

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
