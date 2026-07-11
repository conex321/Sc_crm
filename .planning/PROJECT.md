# SchoolConex CRM — Pipedrive Parity (pipedrive-parity-v1)

## What This Is

An internal sales CRM for SchoolConex (education company selling OSSD programs, LMS, and principal services to schools worldwide), used by Matthew (admin) and Rayan (rep). This milestone rebuilds the app to **simulate Pipedrive's feature set and match its visual design** — the team wants Pipedrive's workflow (leads inbox → pipeline kanban → won deals, with email and reporting inside the CRM) on top of the data and integrations already live.

## Core Value

Rayan can run his entire sales day inside the app — triage leads, work deals on a Pipedrive-grade kanban, email prospects, and see what needs attention — without opening Mailshake, Gmail, or a spreadsheet.

## Requirements

### Validated

<!-- Already shipped and in daily use (see .planning/codebase/). -->

- ✓ Accounts/contacts/opportunities data model with multi-pipeline kanban (drag-drop, stage probabilities, weighted forecast) — existing
- ✓ Integration ingestion: Mailshake campaigns+leads, Dialpad calls with identity matching, Gmail read-sync, QuickBooks/Stripe customer book, website lead endpoint — existing
- ✓ CSV/Excel lead import wizard with template, auto-mapping, dedupe engine, batch history, bulk edit/delete/revert (D-044) — existing
- ✓ Per-rep dashboard with follow-up queue + KPIs; per-rep RLS visibility (D-038/0008); rep edit access (D-043/0011) — existing
- ✓ Drive contract generation (Smart-Docs equivalent), product catalog + line items — existing

### Active

<!-- Wave 1, approved by Matthew 2026-07-11. Details in ROADMAP phases. -->

- [ ] Pipedrive visual language across the app (three-layer token system, green primary, top bar + quick-add, their card/table/badge styling)
- [ ] Deals parity: rotting, won/lost reasons, activity icon on cards, kanban/list/forecast views, 3-panel deal detail
- [ ] Leads Inbox: first-class leads separate from deals, convert-to-deal flow, side-panel detail
- [ ] Contacts parity: standalone People + Organizations, labels, custom fields, saved filters, bulk edit, CSV export, working global search
- [ ] Email in the CRM: unified sales inbox, compose/send via Gmail, templates, open tracking, thread↔deal linking
- [ ] Insights: chartable reports (won/lost, funnel, activity, forecast, lead sources) + dashboard report cards

### Out of Scope

- Automation builder UI, Sequences — wave 2 (Pipedrive gates these to higher tiers too; Inngest/cron automations stay code-only for now)
- Web-forms builder, Chatbot/Live chat, Prospector — wave 2 (endpoint-based capture already works)
- Projects module, calendar view + meeting scheduler, quotes/proposal PDFs, AI assistant, mobile PWA, contacts map, merge-duplicates UI — wave 2 backlog
- Multi-tenant / more roles — two-person team; rep/admin model is enough

## Context

- **Research**: verified Pipedrive teardown at `docs/research/pipedrive-teardown.md` (104-agent deep-research; kanban mechanics, rotting spec, forecast view, Leads Inbox layout, and Pipedrive's semantic token architecture — all 3-0 verified against primary sources). Exact palette hexes to be sampled from Pipedrive's Figma Community files during the design phase (known gap).
- **Codebase map**: `.planning/codebase/` (7 docs). CONCERNS.md lists hard constraints (PostgREST caps, RLS soft-delete quirk, Radix Select empty-value crash, Inngest dead in prod, no service-role key, no pagination on big lists).
- **Agent memory**: `Project_notes_folder/` (decisions D-001…D-044) — update via the update-project-notes skill after every phase.
- Production: https://sc-crm-sand.vercel.app (Vercel, no staging). Supabase project `ooanslwrwjexdjwdphes`. ~5.5k accounts, ~6.8k contacts live.

## Constraints

- **Tech stack**: Next.js 16 App Router + React 19 + Tailwind v4 + shadcn/ui + Supabase + Drizzle — extend, don't replace.
- **Data safety**: live production data; migrations must be idempotent (`tsx scripts/apply-sql.mts supabase/migrations` re-runs all); `lib/db/schema.ts` in lockstep; `integration_events_raw` append-only.
- **Security**: RLS-first (new tables get policies before rows); revenue figures admin-only; public GitHub repo — never hardcode secrets; reps cannot soft-delete (service-role actions gated in app code).
- **Process**: per-phase — tsc + build + e2e walk + Playwright verification, deploy `npx vercel --prod --yes`, report to Matthew, update Project_notes_folder. Commit per phase; push at milestone or on request.
- **Density**: keep the compact data density (14px root) while adopting Pipedrive's look.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Full Pipedrive visual language (not inspired-by) | Matthew: "design of it too should match Pipedrive" | — Pending |
| Wave 1 = Deals+Leads, Contacts, Email, Insights | Matthew's pillar selection 2026-07-11 | — Pending |
| GSD autonomous, deploy + report per phase | Matthew's chosen execution mode | — Pending |
| Three-layer token system mirroring Pipedrive's (base 0–800 scales → semantic groups → application) | Verified as Pipedrive's actual architecture; maps cleanly onto Tailwind v4 @theme + shadcn vars | — Pending |
| Leads = new first-class table (not a mailshake_leads view) | Pipedrive semantics: person/org-linked, convertible, source-agnostic (mailshake/website/import/manual) | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-11 after initialization*
