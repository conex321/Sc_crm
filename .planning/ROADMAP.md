# Roadmap: SchoolConex CRM — Pipedrive Parity (pipedrive-parity-v1)

## Overview

Rebuild the existing CRM's surface to match Pipedrive's workflow and visual design on top of the live data and integrations. Phase 1 lays the Pipedrive design system (tokens, shell, quick-add) that every later phase renders in. Phases 2–4 deliver the core workflow parity — deals kanban with rotting, a first-class Leads Inbox, and standalone People/Organizations with labels, custom fields, and saved filters. Phase 5 brings email fully inside the CRM (unified inbox, Gmail send, templates, open tracking), and Phase 6 closes with chartable Insights reports on a dashboard grid. End state: Rayan runs his entire sales day in the app without opening Mailshake, Gmail, or a spreadsheet.

**Per-phase verification gate (applies to every phase):** `tsc` + `next build` + e2e route walk + Playwright browser pass locally, then deploy `npx vercel --prod --yes`, report to Matthew, and update `Project_notes_folder/` via the update-project-notes skill. Lint is broken (Next 16) — these are the actual gates. No staging; verify before deploy.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Pipedrive design system** - Three-layer token system, top bar + quick-add, restyled nav, coherent reskin, CAD sweep
- [ ] **Phase 2: Deals parity** - Rotting, won/lost reasons, activity-icon cards, kanban/list/forecast views, 3-panel deal detail
- [ ] **Phase 3: Leads inbox** - First-class leads separate from deals, customizable inbox list, side panel, convert-to-deal flow
- [ ] **Phase 4: Contacts & organizations** - Standalone People/Orgs, labels, custom fields, saved filters, bulk edit, working ⌘K search
- [ ] **Phase 5: Email sales inbox** - Unified Mail page, Gmail send, templates, open tracking, thread↔deal linking
- [ ] **Phase 6: Insights & reports** - Chart reports, saved report cards on dashboard grid, admin-only revenue gate

## Phase Details

### Phase 1: Pipedrive design system
**Goal**: The whole app renders in Pipedrive's visual language on a token foundation every later phase builds on, with no functional regression
**Depends on**: Nothing (first phase)
**Requirements**: DSGN-01, DSGN-02, DSGN-03, DSGN-04, DSGN-05
**Success Criteria** (what must be TRUE):
  1. Every page renders in Pipedrive's visual language — white surfaces, Pipedrive-green primary actions, their gray text/divider hierarchy — driven by the three-layer token system (base 0–800 scales → semantic groups → components) in Tailwind v4 `@theme`
  2. From any page, the user can open the green "+" quick-add menu and start creating a Lead, Deal, Person, Organization, or Activity, and the top bar carries a persistent global search field
  3. Left nav shows Pipedrive-style icon + label items (Leads, Deals, People, Organizations, Mail, Insights, Activities, Settings) with SchoolConex branding
  4. Existing screens (accounts, kanban, imports, dashboard, settings) work exactly as before under the reskin — dark mode intact, 14px compact density preserved
  5. Every money value in the app displays CAD via the one shared formatter (legacy USD hardcodes in opportunity-list, document-list, catalog, opportunity detail are swept)
**Plans**: TBD
**UI hint**: yes
**Verification**: tsc + build + e2e route walk + Playwright pass + `npx vercel --prod --yes` + report + notes update
**Notes**: Sample exact Pipedrive hexes/typography from Figma Community files + live-app CSS (known gap); semantic token structure already verified in `docs/research/pipedrive-teardown.md`. Nav items for Leads/Mail/Insights may point at placeholder routes until their phases land.

### Phase 2: Deals parity
**Goal**: Rayan works deals on a Pipedrive-grade board — rotting pressure, activity-driven sorting, reasoned closes, and kanban/list/forecast views
**Depends on**: Phase 1
**Requirements**: DEAL-01, DEAL-02, DEAL-03, DEAL-04, DEAL-05, DEAL-06, DEAL-07
**Success Criteria** (what must be TRUE):
  1. A deal untouched past its stage's "Rotting in (days)" threshold renders red on the kanban; the timer keys off last activity/update and resets per the Pipedrive spec
  2. Kanban cards show title, org/person, value, colored label chip, and owner avatar, and the user can complete or schedule an activity from the card's activity icon without opening the deal; columns sort by next activity (overdue first) with a working Sort-by dropdown (value, expected close, owner)
  3. Marking a deal Won or Lost requires a reason in a dialog; the closed deal leaves the board and is reachable via won/lost filter chips, with the reason stored and editable
  4. The user can switch the Deals page between Kanban, List (sortable columns, gear column-picker, multi-select bulk edit), and Forecast (date-bucketed columns on expected close, won-date override, weighted totals, drag a card to re-date)
  5. Deal detail opens in the 3-panel layout (summary/fields left, tabbed composer + timeline center, linked person/org/activity widgets right), and the owner/label/pipeline filter bar works on all deal views
**Plans**: TBD
**UI hint**: yes
**Verification**: tsc + build + e2e route walk + Playwright pass + `npx vercel --prod --yes` + report + notes update
**Notes**: Deals list must paginate (CONCERNS: 1,000-row PostgREST cap, no-pagination footgun). Radix Select — sentinel values only, never `value=""`.

### Phase 3: Leads inbox
**Goal**: Rayan triages every inbound lead — Mailshake, website, import, manual — in one Pipedrive-style inbox and converts winners to deals
**Depends on**: Phase 2
**Requirements**: LEAD-01, LEAD-02, LEAD-03, LEAD-04
**Success Criteria** (what must be TRUE):
  1. Leads from Mailshake engagement, the website endpoint, "import as leads", and the manual "+ Lead" button all appear as first-class records (linked person/org, optional value/label/source) in a Leads Inbox held separately from deals
  2. The inbox list is customizable — sortable headers, gear column-picker across lead/person/org fields, label and saved filters with star-able favorites, and export of the filtered results
  3. Clicking a lead opens a side panel with Lead details / Person / Organization sections plus archive and convert actions on the left, and Composer (note/activity/email) + History on the right
  4. Converting a lead prompts for pipeline/stage/value and carries person/org/history onto the new deal; deals can convert back to leads; archived leads are recoverable
**Plans**: TBD
**UI hint**: yes
**Verification**: tsc + build + e2e route walk + Playwright pass + `npx vercel --prod --yes` + report + notes update
**Notes**: New `leads` table (D: first-class, not a mailshake_leads view) — RLS policies before rows, idempotent migration, `lib/db/schema.ts` lockstep. Inbox list must paginate.

### Phase 4: Contacts & organizations
**Goal**: People and Organizations are first-class Pipedrive-style workspaces — findable, filterable, labelable, bulk-editable at 5k+ scale
**Depends on**: Phase 3
**Requirements**: CONT-01, CONT-02, CONT-03, CONT-04, CONT-05, CONT-06, CONT-07
**Success Criteria** (what must be TRUE):
  1. Standalone People and Organizations routes render Pipedrive-style list views — sortable, gear column-picker, paginated smoothly over the live ~6.8k contacts / ~5.5k accounts
  2. The user can apply colored multi-select labels inline on people, organizations, deals, and leads
  3. Admin can define custom fields (text/number/date/select) on people/orgs/deals, and those fields render in lists, filters, and detail pages
  4. The user can build a filter, name it, star it as a favorite, and reuse it per entity across list pages; bulk edit (owner/label/fields) and CSV export operate on the filtered result set
  5. ⌘K global search returns grouped results across people, organizations, deals, and leads; person and organization detail pages use the 3-panel layout with full activity timeline
**Plans**: TBD
**UI hint**: yes
**Verification**: tsc + build + e2e route walk + Playwright pass + `npx vercel --prod --yes` + report + notes update
**Notes**: Replaces the ⌘K stub (`components/layout/global-search.tsx`). Sub-batch `.in()` at 100 values; `.range()` pagination everywhere (CONCERNS). Custom-field tables get RLS before rows.

### Phase 5: Email sales inbox
**Goal**: Rayan handles prospect email entirely inside the CRM — reads threads, sends via his Gmail, uses templates, sees opens
**Depends on**: Phase 4
**Requirements**: MAIL-01, MAIL-02, MAIL-03, MAIL-04, MAIL-05
**Success Criteria** (what must be TRUE):
  1. The signed-in rep sees their synced Gmail threads on a unified Mail page with thread grouping and read state
  2. The rep can compose and send an email from the CRM through their own Gmail after completing the send-scope re-consent flow
  3. Email templates with merge fields (contact/org/deal placeholders) are usable from the composer and from detail pages
  4. Opens are tracked via a per-message pixel and are visible on the message and on the linked timeline
  5. Threads link to their deal/lead/person and appear on those records' timelines (existing matcher reused)
**Plans**: TBD
**UI hint**: yes
**Verification**: tsc + build + e2e route walk + Playwright pass + `npx vercel --prod --yes` + report + notes update
**Notes**: **Human dependency** — as of 2026-07-06 neither rep has connected Gmail (`integration_credentials` empty); Matthew and Rayan must connect Gmail AND re-consent for the upgraded `gmail.send` scope before send criteria are verifiable in prod. Build + verify with the test account locally; flag the human step in the phase report. Send path must run inline/cron (Inngest dead in prod). Per-rep email privacy RLS (migration 0008) applies to the Mail page.

### Phase 6: Insights & reports
**Goal**: Matthew and Rayan see what's working — won/lost, funnel, activity, forecast, and lead-source reports as saved dashboard cards
**Depends on**: Phase 5
**Requirements**: INSG-01, INSG-02, INSG-03
**Success Criteria** (what must be TRUE):
  1. The Insights page renders chart reports: deals won/lost over time, funnel conversion by stage, activity counts by rep/type, forecast vs won, and lead sources
  2. The user can save a report as a named entity and place it as a card on a dashboard grid alongside the existing "My day" queue
  3. A rep signing in cannot see revenue-bearing reports; admin can (established gate re-applied on every new surface)
**Plans**: TBD
**UI hint**: yes
**Verification**: tsc + build + e2e route walk + Playwright pass + `npx vercel --prod --yes` + report + notes update
**Notes**: Add recharts (chart-1..5 tokens already exist in globals.css). Lead-sources report depends on Phase 3's source field.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Pipedrive design system | 0/TBD | Not started | - |
| 2. Deals parity | 0/TBD | Not started | - |
| 3. Leads inbox | 0/TBD | Not started | - |
| 4. Contacts & organizations | 0/TBD | Not started | - |
| 5. Email sales inbox | 0/TBD | Not started | - |
| 6. Insights & reports | 0/TBD | Not started | - |

## Coverage

31/31 v1 requirements mapped — no orphans, no duplicates.

| Category | Requirements | Phase |
|----------|--------------|-------|
| DSGN | DSGN-01..05 (5) | Phase 1 |
| DEAL | DEAL-01..07 (7) | Phase 2 |
| LEAD | LEAD-01..04 (4) | Phase 3 |
| CONT | CONT-01..07 (7) | Phase 4 |
| MAIL | MAIL-01..05 (5) | Phase 5 |
| INSG | INSG-01..03 (3) | Phase 6 |
