# SchoolConex CRM — Design Spec

**Date:** 2026-05-06
**Status:** Approved
**Owner:** ai@schoolconex.com

---

## Context

SchoolConex is an education + tech company selling Principal Service, an LMS, and 70+ courses (with packaged pricing) primarily to schools and aspiring school founders. Today, customer-facing data is fragmented across five tools:

- **Dialpad** — phone calls
- **WhatsApp** — client messaging
- **Stripe** — payments
- **Google Drive** — contracts (PDFs, Word docs)
- **Mailshake** — email campaigns

Reps cannot see the full history of an account in one place. Pipelines are tracked manually (likely in spreadsheets). There is no single record that ties calls, emails, contracts, payments, and pipeline stage to an Account → Contacts hierarchy.

This spec describes an in-house CRM that becomes the canonical record for accounts, contacts, opportunities, and quotes; ingests events from all five vendors into a unified per-account timeline; and selectively writes back high-value actions (generate contract, log call note, push to campaign, trigger invoice). Rep workflows in the existing tools stay intact — the CRM is additive, not a replacement for Dialpad / WhatsApp / Mailshake.

The intended outcome: a rep opens any account and sees, in one view, every call, every message, every email engagement, every contract, every payment, and the current pipeline stage — without tab-switching.

---

## Locked decisions (full list in `Project_notes_folder/PROJECT_NOTES.md`)

- **D-001** — Hybrid integration model (sync everything in, selective send for high-value outbound).
- **D-002** — Drive remains the source of truth for contracts; CRM stores file references + metadata.
- **D-003** — Multiple admin-configurable pipelines per service line; one account can have multiple open opportunities.
- **D-004** — Stack: Next.js 15 (App Router) + Supabase (Postgres / Auth / Storage) + Vercel + Inngest.
- **D-005** — Catalog model: products + packages + line-item quotes (mid-complexity, not full CPQ).
- **D-006** — MVP v1 = Foundation + Drive + Dialpad. Defer WhatsApp, Mailshake, Stripe, full catalog/quoting.
- **D-007** — Auth: Google Workspace SSO (domain-restricted) via Supabase Auth.
- **D-008** — Three-tier RBAC (rep / manager / admin) enforced by Postgres RLS.
- **D-009** — Drive uses dual auth: per-user OAuth (`drive.file` scope) + service account.
- **D-010** — Webhooks: signature-verify → raw event log → Inngest job → typed activity rows.
- **D-011** — Polymorphic activity timeline (parent `activities` + per-channel child tables).
- **D-012** — WhatsApp ingestion gated on Business API decision (Meta Cloud API or BSP like Twilio).
- **D-013** — Phase 1 execution lock-in: build only Foundation; no Drive, Dialpad, Stripe, Mailshake, WhatsApp, quoting, or AI work until Phase 1 is stable.
- **D-014** — `activities.account_id` is nullable; unmatched inbound events route to an explicit "Unmatched inbox" view.
- **D-015** — Standardized audit columns on every table: `created_at`, `updated_at`, `created_by`, `updated_by`, plus `deleted_at` on customer-facing entities for soft delete.
- **D-016** — UI direction: sidebar-first navigation, top utility bar, compact typography, CRM/dashboard information density (not a marketing-style layout).

---

## Implementation constraints (locked for Phase 1 execution)

These are non-negotiable until Phase 1 ships and is stable in real use:

1. **Single workspace only.** No multi-tenant abstractions. No `org_id` columns, no tenant routing.
2. **Phase 1 only.** Tables and features built: `users`, `accounts`, `contacts`, `pipelines`, `pipeline_stages`, `opportunities`, `activities`, `notes`, `tasks`, `audit_log`. Auth, roles, RLS. Account list / account-360 / opportunity board / opportunity detail / contacts / settings/user-roles. Server Actions for CRUD. Seeded default pipelines.
3. **Phase 2 (Google Drive) only after Phase 1 is stable.** Stable = two reps using it daily for a full week without blocker bugs.
4. **Phase 3 (Dialpad) only after Phase 2 is stable.**
5. **Do not touch WhatsApp, Mailshake, Stripe, quoting (`products` / `packages` / `opportunity_line_items`), or any AI feature in Phase 1.** Those tables are described in this spec for design coherence; they are not built yet.

**RLS-first rule.** Every table gets RLS policies before any rows are inserted. Retrofitting permissions after UI and queries are already written creates exactly the kind of mess we're avoiding by building this in-house.

**Account-360 v1 = 4 panels only.** Account summary, contacts, opportunities, activities. Anything beyond that is Phase 2+ work.

---

## 1. System overview

**One sentence:** A Next.js + Supabase internal application that becomes the canonical record for accounts, contacts, opportunities, and quotes — and ingests events from Dialpad, WhatsApp, Stripe, Mailshake, and Drive into a unified per-account timeline, while keeping the source-of-truth UIs (Dialpad app, WhatsApp, Drive) intact for actual work.

### 1.1 Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend + server | Next.js 15 (App Router, RSC, Server Actions, Route Handlers) | One codebase for UI + webhooks + cron handlers |
| Database | Supabase Postgres | Already in use; great DX; Row Level Security |
| Auth | Supabase Auth + Google Workspace SSO | Reps already have Google accounts |
| Authorization | Postgres RLS + role enum | DB-enforced, can't be bypassed by a buggy route |
| Object storage | Supabase Storage (small — non-contract uploads only) | Drive remains the contract store |
| Background jobs | Inngest (managed) | Retries, scheduled syncs, fan-out |
| Webhook ingress | Next.js Route Handlers under `/api/webhooks/{vendor}` | Co-located with app code |
| Observability | Vercel logs to start; Axiom or Logtail when integration volume warrants | Cheap, evolve later |
| Deploy | Vercel + Supabase + Inngest (all managed) | No infra team needed |
| UI primitives | Tailwind v4 + shadcn/ui | Standard, fast |

### 1.2 Architectural shape

```
                    ┌─────────────────────────┐
  Reps' browsers ──▶│   Next.js (Vercel)      │──▶ Supabase Postgres
                    │   - UI / RSC            │    + Storage + Auth
                    │   - Server Actions      │
                    │   - /api/webhooks/*     │◀── Vendor webhooks
                    │   - /api/drive/*        │       (Dialpad, etc.)
                    └─────────┬───────────────┘
                              │
                              ▼
                       ┌──────────────┐
                       │   Inngest    │──▶ Drive API, Dialpad API,
                       │   (jobs)     │    Stripe API, Mailshake API
                       └──────────────┘
```

Webhooks land in Next.js, do minimal validation + persistence, then enqueue Inngest jobs for any heavy processing. Outbound actions from the UI go through Server Actions → Inngest where they need retries.

---

## 2. Data model

Twelve tables. Names use Postgres conventions (snake_case, plural).

### 2.0 Audit columns convention (D-015)

Every table includes:
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()` (touched by trigger on UPDATE)
- `created_by uuid references users(id)` (nullable for system-inserted rows)
- `updated_by uuid references users(id)` (nullable)

Customer-facing entities (`accounts`, `contacts`, `opportunities`, `documents`) additionally include:
- `deleted_at timestamptz` (NULL = live row; non-null = soft-deleted, hidden by RLS predicate)

These columns are omitted from the per-table sketches below to reduce noise — assume they're present everywhere.

### 2.1 Customer-facing entities

```
accounts
  ├─ id (uuid)
  ├─ name (text)              ─── "Lincoln Elementary School District"
  ├─ type (enum)              ─── 'school' | 'aspiring_founder' | 'district' | 'other'
  ├─ website, address, phone, country
  ├─ owner_user_id            ─── the rep
  ├─ source                   ─── 'mailshake' | 'referral' | 'inbound' | ...
  ├─ created_at, updated_at, deleted_at

contacts
  ├─ id, account_id (fk)
  ├─ first_name, last_name, role  ─── 'principal', 'superintendent', 'teacher'
  ├─ email, phone (e164), whatsapp_phone
  ├─ is_primary (bool)
  └─ external_ids (jsonb)     ─── { dialpad_contact_id, mailshake_lead_id, ... }
```

### 2.2 Sales structure

```
pipelines              pipeline_stages
  ├─ id                  ├─ id, pipeline_id (fk)
  ├─ name                ├─ name, position (int)
  ├─ slug                ├─ probability (0-100)
  ├─ is_active           └─ is_won, is_lost (bool, only on terminal stages)
  └─ service_line        ─── 'principal_service' | 'lms' | 'courses'

opportunities
  ├─ id, account_id (fk)
  ├─ pipeline_id, stage_id (fk)
  ├─ name                ─── "Lincoln ES — LMS pilot Q3"
  ├─ amount (computed from line items, or manual override flag)
  ├─ currency, expected_close_date
  ├─ owner_user_id, primary_contact_id
  ├─ status              ─── 'open' | 'won' | 'lost'
  └─ won_reason, lost_reason
```

One account can have many open opportunities across pipelines.

### 2.3 Catalog & quoting

```
products                   packages              package_items
  ├─ id                      ├─ id                  ├─ package_id (fk)
  ├─ sku, name               ├─ name                ├─ product_id (fk)
  ├─ category                ├─ list_price          ├─ quantity
  │   'course' | 'lms' |     ├─ description         └─ position
  │   'principal_service'    └─ is_active
  ├─ list_price, currency
  ├─ billing_period          ─── 'one_time' | 'monthly' | 'annual'
  ├─ description, metadata
  └─ is_active

opportunity_line_items
  ├─ id, opportunity_id (fk)
  ├─ product_id OR package_id (one of)
  ├─ quantity, unit_price (override allowed), discount_pct
  ├─ subtotal (computed)
  └─ position
```

Opportunity total = sum of line item subtotals (with manual-override flag for off-spec deals).

### 2.4 Activity timeline — the centerpiece

One row per event, polymorphic via channel-specific child tables. A SQL view unions everything into a single feed for the account-360 page.

```
activities                              ── parent table
  ├─ id
  ├─ account_id (fk, NULLABLE — D-014 unmatched inbox)
  ├─ contact_id (fk, nullable), opportunity_id (fk, nullable)
  ├─ user_id (the rep, if applicable)
  ├─ channel        ─── 'call' | 'whatsapp' | 'email_outbound' | 'email_inbound' |
  │                     'mailshake_event' | 'note' | 'task' | 'contract_event' | 'payment'
  ├─ direction      ─── 'inbound' | 'outbound' | 'system'
  ├─ occurred_at    ─── the actual event time (NOT created_at)
  └─ summary        ─── one-line denormalized text for list rendering

# Inbound events from Dialpad / WhatsApp / Mailshake whose contact lookup
# fails are inserted with account_id=NULL and surfaced in an "Unmatched
# inbox" view (Phase 3+). Reps can manually associate them to an account.

calls                          ─── 1:1 with activities WHERE channel='call'
  ├─ activity_id (fk, pk)
  ├─ dialpad_call_id (unique)
  ├─ from_number, to_number, duration_seconds
  ├─ recording_url             ─── link only, audio stays in Dialpad
  ├─ transcript_text (nullable, future)
  └─ disposition

messages                       ─── WhatsApp + future SMS
  ├─ activity_id (fk, pk)
  ├─ provider_message_id, thread_id
  ├─ from_number, to_number, body, media_urls (jsonb)

email_events                   ─── Mailshake + manual sends
  ├─ activity_id (fk, pk)
  ├─ provider                  ─── 'mailshake' | 'gmail' | ...
  ├─ provider_event_id, campaign_id, subject, snippet
  └─ event_type                ─── 'sent' | 'opened' | 'clicked' | 'replied' | 'bounced'

notes                          ─── manual rep notes
  ├─ activity_id (fk, pk), body (markdown)

tasks                          ─── follow-ups, due dates
  ├─ activity_id (fk, pk)
  ├─ title, due_at, completed_at, assigned_user_id

contract_events                ─── from Drive + future e-sign
  ├─ activity_id (fk, pk), document_id (fk)
  ├─ event_type                ─── 'sent' | 'opened' | 'signed' | 'declined'

payments                       ─── from Stripe (later phase)
  ├─ activity_id (fk, pk), stripe_payment_intent_id
  ├─ amount, currency, status
```

### 2.5 Documents (Drive references)

```
documents
  ├─ id, account_id (fk), opportunity_id (fk, nullable)
  ├─ drive_file_id (unique)        ─── the truth lives in Drive
  ├─ drive_link, mime_type, name
  ├─ doc_kind                       ─── 'contract' | 'proposal' | 'sow' | 'misc'
  ├─ status                         ─── 'draft' | 'sent' | 'signed' | 'archived'
  ├─ generated_from_template_id (nullable, fk → drive template)
  ├─ contract_value (numeric, manually entered for reporting)
  └─ created_by_user_id, created_at
```

### 2.6 Plumbing

```
users                            ─── wraps auth.users
  ├─ id (= auth.users.id)
  ├─ full_name, role (enum: admin | manager | rep)
  ├─ google_email
  └─ is_active

integration_credentials          ─── per-user OAuth tokens
  ├─ user_id, provider             ─── 'google_drive', later 'dialpad', etc.
  ├─ access_token (encrypted), refresh_token (encrypted)
  └─ scopes (text[]), expires_at

integration_events_raw           ─── append-only audit log of inbound webhooks
  ├─ id, provider, event_id (unique per provider)
  ├─ payload (jsonb), received_at, processed_at, error
```

`integration_events_raw` is critical — every webhook payload is stored verbatim before parsing, giving you replay capability when a parser bug eats data.

---

## 3. Integration architecture

Same pattern for every vendor: **inbound webhooks → raw event log → parser → typed activity rows.** Outbound: **Server Action → Inngest → vendor API → write back results.** Per-user OAuth where the user's identity matters; service account where the system acts on its own.

### 3.1 Google Drive (v1)

**Auth model:** Two parallel mechanisms.

| Use case | Auth | Why |
|---|---|---|
| Rep attaches a file to an account / generates a contract from a template | **Per-user OAuth (`drive.file` scope)** | Files owned by the rep's Google account, sharing uses their identity |
| System reads template folder, periodic status reconciliation | **Service account** with shared access to "CRM Templates" + "CRM Generated" folders | No user dependency, can run from cron |

**Scopes:** `drive.file` only (least privilege — the app can only see/modify files it created or files the user explicitly opens via Picker). NOT `drive.readonly` over the full Drive.

**Flows:**

1. **Attach existing file to account:** Rep clicks "Attach from Drive" → Google Drive Picker → picked file_id stored in `documents`. App receives `drive.file` scope on that one file automatically.
2. **Generate contract from template:** Rep selects opportunity → "Generate contract" → picks template → Server Action calls `drive.files.copy` (service account) → `docs.documents.batchUpdate` to fill placeholders (`{{account_name}}`, `{{contract_value}}`, line items) → moves copy into rep's Drive → returns `documents` row + opens the new doc in a new tab.
3. **Status reconciliation:** Inngest scheduled job (every 30 min) checks Drive `revisions` + permission changes for `documents` rows where `status != 'archived'` → emits `contract_event` activities. Heuristics for v1:
   - File shared with an external email = `sent`
   - Comment by external user = potential `opened`
   - File renamed with "SIGNED" prefix = `signed` (manual rep convention)

For real signed-status tracking, integrate DocuSign or PandaDoc in v3 — Drive alone cannot reliably tell us "the client signed."

### 3.2 Dialpad (v1)

**Auth:** API key in env (one workspace key, server-side only).

**Inbound:** Configure Dialpad webhook → `POST /api/webhooks/dialpad`.

```
1. Verify signature (HMAC, Dialpad signs payloads)
2. INSERT into integration_events_raw (idempotent on event_id)
3. Enqueue Inngest job: dialpad.process_event
4. Return 200 fast
```

Inngest job:

```
1. Match phone number → contacts.phone OR contacts.whatsapp_phone
   (E.164 normalize; fall back to last-7-digits match)
2. If no contact match: create activity with channel='call', account_id=null,
   surface in an "Unmatched calls" inbox for manual association
3. If matched: insert activities row + calls row
4. Set summary = "{direction} call, {duration_human}, {disposition}"
```

**Outbound (deferred to v2):** Click-to-call from a contact's phone number — Dialpad has a click-to-call endpoint that triggers the rep's Dialpad app to dial.

### 3.3 v2+ integrations (designed now, built later)

Patterns enumerated so v1 doesn't paint us into a corner.

| Vendor | Inbound | Outbound (later) | Auth |
|---|---|---|---|
| **Stripe** | Webhook → `payment_intent.succeeded`, `invoice.paid`, `customer.subscription.*` → `payments` activities | Create checkout session / invoice from opportunity line items | App-level API key |
| **Mailshake** | Webhook → recipient events (`open`, `click`, `reply`, `bounce`) → `email_events` activities. Match recipient email → contact | Add contact to campaign (Server Action → Mailshake API) | App-level API key |
| **WhatsApp** | Requires WhatsApp Business API (Meta Cloud API or BSP like Twilio). Inbound webhooks → `messages` activities | Send template messages | Per-app token |

**Open question (D-012):** WhatsApp ingestion only works on the Business API. If reps use personal WhatsApp / standalone WhatsApp Business app, options are: (a) migrate to a BSP like Twilio, (b) skip WhatsApp ingestion entirely, (c) shared-device approach (fragile, not recommended). Decision must be made before Phase 6.

### 3.4 Common patterns enforced across all integrations

1. **Idempotency** — every webhook handler dedupes on `(provider, event_id)` via a unique index on `integration_events_raw`.
2. **Raw-then-parsed** — never lose the original payload.
3. **Failure isolation** — a single bad event cannot block the queue (Inngest retries with backoff; permanent failures park to a dead-letter view).
4. **Contact-matching helper** — single utility used by all parsers (phone normalize + email normalize + fuzzy fallback). One source of truth for "given this phone/email, who is it?"
5. **Activity write helper** — single `recordActivity({ account_id, contact_id, opportunity_id, channel, ... })` function enforces summary generation + RLS-safe inserts. Direct INSERT into child tables is forbidden.

---

## 4. Auth, authorization, security, file handling

### 4.1 Authentication

- Supabase Auth with Google Workspace SSO restricted to the company domain via the `hd` parameter on Google OAuth + a server-side check on the `email` domain at sign-in.
- No password auth, no signup flow, no random Google accounts.
- First sign-in for a recognized domain creates a `users` row with `role = 'rep'` by default. Admins promote via a settings page.
- Sessions managed by Supabase Auth (refresh-token rotation, httpOnly cookies via `@supabase/ssr` for Next.js).

### 4.2 Authorization — three-tier RBAC

| Role | Can do |
|---|---|
| **rep** | CRUD their own accounts, contacts, opportunities. Read accounts owned by others. Cannot edit catalog, pipelines, or other reps' records. |
| **manager** | Everything `rep` can do + reassign ownership, edit any account/opportunity, view team-wide reports. Cannot edit catalog or pipelines. |
| **admin** | Everything + edit catalog (products, packages, prices), pipelines + stages, user roles, integration credentials. |

**Enforcement: Postgres RLS.** Example pattern for `opportunities`:

```sql
create policy "all authenticated read"
  on opportunities for select using (auth.role() = 'authenticated');

create policy "reps edit own; managers/admins edit all"
  on opportunities for update using (
    owner_user_id = auth.uid()
    OR exists (select 1 from users where id = auth.uid() and role in ('manager','admin'))
  );
```

App code never makes an authorization decision alone — RLS is the floor. Server Actions also re-check role for write operations as defense-in-depth.

### 4.3 Secrets & credentials

- All API keys (Dialpad, Mailshake, Stripe later) in **Vercel environment variables**, server-side only. Never sent to the browser.
- Per-user OAuth tokens stored in `integration_credentials` with column-level encryption using Supabase's `pgsodium` (or a Vault entry per user). Decrypted only inside Server Actions / Inngest jobs.
- Webhook signatures verified before any DB write — reject on mismatch with 401, do not log to `integration_events_raw` (signed payloads only).

### 4.4 File handling — the Drive boundary

- The CRM never copies contract bytes into Supabase Storage. It stores `drive_file_id`, `drive_link`, `name`, `mime_type`, `status`.
- To preview a Drive file in the CRM UI, the server calls `drive.files.export` (Docs) or `drive.files.get` with `alt=media` (binary), then streams the response to the browser. The Drive `file_id` is never sent directly to the client. Drive thumbnails (also via API) can be used for fast previews.
- File actions that need rep identity (sharing a contract with a client) use the rep's per-user OAuth tokens. System actions (template copy, placeholder fill) use the service account.
- One narrow exception: Supabase Storage is used for non-contract uploads — avatars, ad-hoc files attached to activities (e.g., a rep drags a screenshot into a note). Bucket policies mirror RLS.

### 4.5 Data retention, PII, audit

- Schools/principals → emails, names, phone numbers — standard B2B PII, **not** student records. The CRM does **not** ingest student data; LMS data stays in the LMS. If that ever changes, FERPA enters scope and the affected tables get encryption-at-rest + access logging.
- `deleted_at` soft-delete on accounts/contacts/opportunities. Hard delete only via admin action with audit log entry.
- Call recordings: link only, not stored. Honors Dialpad's retention policy automatically — when Dialpad deletes, our link 404s, and we keep the call metadata.
- An `audit_log` table records every write to `users`, `integration_credentials`, `pipelines`, and `products` (admin-touchable config).

### 4.6 Logging & observability

- Vercel logs to start. Add Axiom or Logtail when integration volume warrants.
- Inngest dashboard provides per-job status, retries, dead-letter — primary integration health view.
- Sentry (or equivalent) for client + server errors.

---

## 5. Phased roadmap

Six phases. v1 (Phases 1–3) is the MVP: foundation + Drive + Dialpad. Each phase ends in something a rep actually uses, not a half-finished feature.

### 5.1 Phase 1 — Foundation (≈2 weeks)

**Goal:** A rep can sign in, create an account, add contacts, move an opportunity through a pipeline, and leave a note.

**UI direction (D-016):** Sidebar-first navigation (collapsible, primary entities live there: Accounts, Opportunities, Settings). Top utility bar for global search, quick-create, user menu. Compact typography (small base font, dense tables, low-padding cards). Information density of a CRM/dashboard, not a marketing page. shadcn/ui defaults adjusted for compactness (smaller paddings, tighter rows).

**Build order (locked):**

1. Initialize repo (`git init`) + scaffold Next.js 15 App Router + Tailwind v4 + shadcn/ui
2. Supabase project setup + schema migrations (Drizzle ORM)
3. Auth: Google Workspace SSO via Supabase Auth + `users` table + profile-sync trigger + role model (`admin` / `manager` / `rep`)
4. RLS policies on every table — authored before any UI queries
5. Dashboard shell (sidebar + top bar layout)
6. Core CRM pages: accounts list → account-360 (4 panels: summary, contacts, opportunities, activities) → opportunities kanban → opportunity detail → settings/user roles (admin only)
7. Manual activities: `notes` + `tasks`
8. Seed: 2 default pipelines (Principal Service, LMS) with sample stages + demo accounts/contacts/opportunities
9. Audit log table + admin write-events recording

**Tables in Phase 1:** `users`, `accounts`, `contacts`, `pipelines`, `pipeline_stages`, `opportunities`, `activities`, `notes`, `tasks`, `audit_log`. Nothing else. (`documents`, `calls`, `messages`, `email_events`, `contract_events`, `payments`, `products`, `packages`, `package_items`, `opportunity_line_items`, `integration_credentials`, `integration_events_raw` — all deferred.)

**Definition of done:** Two reps use it for a week without integrations and don't feel handicapped relative to a spreadsheet. RLS enforced at the DB level. Account-360 renders 4 panels only.

### 5.2 Phase 2 — Google Drive (≈2 weeks)

**Goal:** Contracts live in Drive but get tracked from the opportunity record.

- Per-user OAuth (`drive.file` scope) + service account setup
- `documents` table + UI (attach via Drive Picker, server-side preview)
- Template management (admin selects which Drive templates are available)
- Generate-from-template flow: pick template → fill placeholders → copy into rep's Drive → returns linked `documents` row
- Inngest scheduled job: status reconciliation (heuristic v1 — file-rename + permissions)
- `contract_events` activities feeding the timeline

**Definition of done:** A rep generates a contract from a template, sends it to a school admin, and the timeline reflects that a document exists and was shared.

### 5.3 Phase 3 — Dialpad (≈1.5 weeks)

**Goal:** Every call shows up on the right account automatically.

- `/api/webhooks/dialpad` endpoint with signature verification
- `integration_events_raw` ingestion + Inngest job to parse
- Phone-number normalization utility (E.164) + contact-matching helper
- `calls` activity rendering in the timeline
- "Unmatched calls" inbox for missed matches
- "Associate to contact" UI for unmatched calls

**Definition of done:** A rep finishes a Dialpad call. Within 60 seconds, the call appears on the matched contact's account timeline. If unmatched, it lands in the inbox.

**v1 launch — end of Phase 3 (≈5.5 weeks total).**

### 5.4 Phase 4 — Catalog & quoting (≈2 weeks)

- `products`, `packages`, `package_items`, `opportunity_line_items` tables
- Admin catalog editor (CRUD + bulk import from CSV for the 70+ courses)
- Line-item editor on opportunity detail page (add product / package, override price, discount)
- Auto-compute opportunity amount from line items (with manual override flag)
- Contract template variables for line items (used by the existing Drive template flow — `{{line_items_table}}`)

**Definition of done:** A rep builds a quote with mixed courses + a package on an opportunity, generates the contract, and the line items appear correctly in the contract.

### 5.5 Phase 5 — Stripe + Mailshake (≈2.5 weeks)

- Stripe webhooks → `payments` activities; opportunity → "send invoice" Server Action that creates a Stripe invoice from line items
- Mailshake webhooks → `email_events` activities (opens, clicks, replies)
- "Add to Mailshake campaign" Server Action on contact list
- Reporting page v1: pipeline value, win rate by pipeline, MRR (from Stripe), email engagement

**Definition of done:** Closed-won opportunity → invoice fires from Stripe → payment lands → activity appears. A Mailshake campaign click on a tracked contact shows up in the timeline.

### 5.6 Phase 6 — WhatsApp + polish (≈3 weeks, gated)

- **Decision gate (D-012):** confirm migration path to WhatsApp Business API (Twilio or direct Meta) — without this, WhatsApp ingestion is impossible
- WhatsApp BSP webhooks → `messages` activities
- Saved views, advanced filters, bulk actions
- Audit log UI for admins
- Per-rep dashboard (my pipeline, my activities this week)
- Sentry / Axiom hookup

**Definition of done:** WhatsApp threads with school contacts surface in the account timeline. Reps have personal dashboards. Audit log is queryable.

### 5.7 Total timeline

≈12 weeks for everything. v1 in ≈5.5 weeks. Calendar weeks for one focused engineer; a 2-engineer pair compresses 30–40%.

---

## 6. Out of scope (YAGNI)

Called out so we don't drift:

- Mobile app
- Multi-tenant / multi-org (single SchoolConex workspace only)
- Customer portal (clients logging in to see their contracts)
- Marketing automation beyond Mailshake (drip flows, nurture)
- Full CPQ — discount approval workflows, complex pricing rules
- E-signature ourselves — link to Drive; integrate DocuSign in v3+ if real signed-status is needed
- Real-time collaborative editing inside the CRM
- AI features (transcription, summarization, suggested next actions) — natural v3 candidates, unprioritized for now

---

## 7. Verification

End-to-end checks that prove v1 works.

### 7.1 Functional

1. Sign-in with a `@schoolconex.com` Google account succeeds. Sign-in with a non-domain Google account is rejected.
2. Create an account → add two contacts → create an opportunity in the LMS pipeline → drag through three stages → mark won. The opportunity shows on the account-360 timeline.
3. Generate a contract from a template (with placeholders filled) → copy lands in the rep's Drive → `documents` row exists with a working `drive_link` → preview renders inside the CRM without exposing the raw `file_id` to the browser.
4. Place a real test call from Dialpad to a phone number that matches a contact → within 60 seconds the call shows on the contact's account timeline with correct duration and direction.
5. Place a real test call from Dialpad to an unrecognized number → the call appears in the "Unmatched calls" inbox, and "Associate to contact" successfully links it to the right account.

### 7.2 Authorization (RLS)

6. Rep A cannot UPDATE an opportunity owned by Rep B (verify via direct SQL against Supabase with Rep A's JWT).
7. Rep A CAN SELECT an opportunity owned by Rep B (read access is shared).
8. Manager B can UPDATE any opportunity. Rep A cannot.
9. Admin C can INSERT a new product. Manager B and Rep A cannot.
10. A user with no row in `users` (i.e., not yet authorized) gets 0 rows from every protected table.

### 7.3 Integration robustness

11. Replay a stored payload from `integration_events_raw` and verify it produces the same activity rows (idempotency).
12. POST a Dialpad webhook with an invalid HMAC signature → response is 401 and nothing is written to `integration_events_raw`.
13. POST the same Dialpad event twice → only one `calls` row exists; the second insert is a no-op via the unique index.
14. Force a Drive API failure during contract generation (e.g., revoke OAuth token) → Inngest job retries with backoff, then surfaces a clear error in the UI; no half-state `documents` row is left behind.

### 7.4 Performance & ops

15. Account-360 page with 200 activities loads in < 500ms (server time, p95).
16. Webhook handler returns 200 within 200ms (p95) — heavy work is in Inngest.
17. Inngest dashboard shows zero stuck jobs across all integrations after 24h of synthetic traffic.

---

## 8. Open questions for follow-up

Tracked in `Project_notes_folder/PROJECT_NOTES.md` Open Questions / Next Steps. Highlights:

1. WhatsApp Business API decision (D-012) — must resolve before Phase 6.
2. Reporting / dashboard requirements — left vague; revisit during Phase 5 planning.
3. DocuSign / e-signature volume + urgency — v3 candidate.
4. Compliance confirmation — CRM does not ingest student records (FERPA scope).
5. Git initialization for the project root.
6. Supabase project name + company SSO domain — needed at scaffold time.
