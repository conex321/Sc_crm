# Requirements: SchoolConex CRM — Pipedrive Parity v1

**Defined:** 2026-07-11
**Core Value:** Rayan can run his entire sales day inside the app — triage leads, work deals on a Pipedrive-grade kanban, email prospects, and see what needs attention.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases. Behavior details come from the verified teardown (`docs/research/pipedrive-teardown.md`).

### Design System (DSGN)

- [ ] **DSGN-01**: App renders in Pipedrive's visual language — white surfaces, Pipedrive-green primary actions, their gray text/divider hierarchy — via a three-layer token system (base 0–800 shade scales → semantic groups Surface/Fill/Divider/Text/Icon/Primary/Negative/Warning/Positive/Info → components) in Tailwind v4 `@theme`
- [ ] **DSGN-02**: Top bar has a persistent global search field and a green "+" quick-add menu (Lead / Deal / Person / Organization / Activity) reachable from every page
- [ ] **DSGN-03**: Left nav restyled Pipedrive-fashion (icon + label items covering Leads, Deals, People, Organizations, Mail, Insights, Activities-todo, Settings) with SchoolConex branding
- [ ] **DSGN-04**: Existing screens (accounts, kanban, imports, dashboard, settings) re-skin coherently with no functional regression, dark mode still works, compact density preserved
- [ ] **DSGN-05**: All money renders CAD via one shared formatter (legacy USD hardcodes swept)

### Deals (DEAL)

- [ ] **DEAL-01**: Deal cards show title, org/person, value, colored label chip, owner avatar, and a clickable activity icon that completes or schedules an activity without opening the deal
- [ ] **DEAL-02**: Kanban columns sort by next activity (overdue first, newest-created tiebreak) with a "Sort by" dropdown (value, expected close date, owner)
- [ ] **DEAL-03**: Per-stage deal rotting — "Rotting in (days)" setting per stage; rotten deals render red; timer keys off last activity/update and resets per the Pipedrive spec
- [ ] **DEAL-04**: Won/Lost require a reason dialog (reason stored, editable); closed deals leave the board and are reachable via won/lost filter chips
- [ ] **DEAL-05**: Deals page offers three views — Kanban, List (sortable columns, gear column-picker, multi-select bulk edit), and Forecast (date-bucketed columns on expected close date, won-date override, weighted totals per column, drag card to re-date)
- [ ] **DEAL-06**: Deal detail page uses Pipedrive's 3-panel layout — summary/fields left, tabbed composer + timeline center, linked person/org/activity widgets right
- [ ] **DEAL-07**: Filter bar on all deal views: owner picker, label, pipeline switcher

### Leads Inbox (LEAD)

- [ ] **LEAD-01**: Leads are first-class records (linked person/org required, value/label/source optional) held separately from deals, fed by Mailshake engagement, the website endpoint, imports ("import as leads"), and a manual "+ Lead" button
- [ ] **LEAD-02**: Leads Inbox is a customizable list — sortable headers, gear column-picker (lead/person/org fields), label and saved filters (star-able favorites), export of filtered results
- [ ] **LEAD-03**: Clicking a lead opens a side panel — left: Lead details / Person / Organization sections with archive + convert actions; right: Composer (note/activity/email) and History
- [ ] **LEAD-04**: Convert-to-deal picks pipeline/stage/value and carries person/org/history; deals can convert back to leads; archived leads are recoverable

### Contacts (CONT)

- [ ] **CONT-01**: Standalone People and Organizations routes with Pipedrive-style list views (sortable, gear columns, pagination for 5k+ rows)
- [ ] **CONT-02**: Colored labels (multi-select) on people, orgs, deals, and leads, manageable inline
- [ ] **CONT-03**: Admin-defined custom fields (text/number/date/select) storable on people/orgs/deals and renderable in lists, filters, and detail pages
- [ ] **CONT-04**: Saved filters — build a filter, name it, star favorites; shared across list pages and reusable per entity
- [ ] **CONT-05**: List bulk edit (owner/label/fields) and CSV export of the filtered result set on People/Organizations lists
- [ ] **CONT-06**: Person and Organization detail pages use the 3-panel layout with full activity timeline
- [ ] **CONT-07**: ⌘K global search actually searches people, organizations, deals, and leads with grouped results

### Email (MAIL)

- [ ] **MAIL-01**: Unified Mail page shows synced Gmail threads (read state, thread grouping) for the signed-in rep
- [ ] **MAIL-02**: Compose and send email from the CRM via the rep's Gmail (scope upgraded to include send; re-consent flow)
- [ ] **MAIL-03**: Email templates with merge fields (contact/org/deal placeholders) usable from composer and detail pages
- [ ] **MAIL-04**: Open tracking — per-message pixel; opens logged and visible on the message and timeline
- [ ] **MAIL-05**: Threads link to their deal/lead/person and appear on those timelines (existing matcher reused)

### Insights (INSG)

- [ ] **INSG-01**: Insights page with chart reports: deals won/lost over time, funnel conversion by stage, activity counts by rep/type, forecast vs won, lead sources
- [ ] **INSG-02**: Reports are saved entities placeable as cards on a dashboard grid alongside the existing "My day" queue
- [ ] **INSG-03**: Revenue-bearing reports remain admin-only per the established gate

## v2 Requirements

Deferred to wave 2. Tracked but not in current roadmap.

### Automations
- **AUTO-01**: User-configurable automation builder (trigger → condition → action) over the existing event stream
- **AUTO-02**: Email sequences

### Capture & Docs
- **CAPT-01**: Web-forms builder; **CAPT-02**: Chatbot/live chat; **DOCS-01**: Quote/proposal PDF builder

### Other
- **PROJ-01**: Projects module; **CAL-01**: Calendar view + meeting scheduler; **AI-01**: AI summaries (calls/emails); **MOBL-01**: Mobile PWA; **MISC-01**: Contacts map; **MISC-02**: Merge-duplicates UI

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-tenant, additional roles | Two-person team; rep/admin suffices |
| Replacing Mailshake outbound | Mailshake stays the campaign engine; CRM ingests + will send 1:1 email only |
| Real-time collaboration/presence | No need at this team size |

## Traceability

<!-- Filled by roadmap: REQ-ID → Phase -->
