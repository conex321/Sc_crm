---
phase: 02-deals-parity
verified: 2026-07-11T21:30:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 2: Deals Parity Verification Report

**Phase Goal:** Rayan works deals on a Pipedrive-grade board — rotting pressure, activity-driven sorting, reasoned closes, and kanban/list/forecast views
**Verified:** 2026-07-11
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Deal untouched past stage "Rotting in (days)" renders red; timer keys off last activity/update and resets per spec | ✓ VERIFIED | `is_rotten = now - Date.parse(updated_at) > rot_days * 86_400_000` computed in `listOpportunitiesByPipeline` + `listDealsForListView` (lib/crm/opportunities.ts:142-149, 263-270) and server-side on detail ([id]/page.tsx:184-188). Red treatment: `--pd-negative-bg-light` tint + 3px left bar + "Rotten — no activity for {n} days" tooltip (pipeline-board.tsx:344-349). Column header appends "{r} rotten" (pipeline-board.tsx:255-259). Resets: 0013 recreates `create_note`/`create_task`/`toggle_task_complete` with `update opportunities set updated_by = auth.uid()` touches → `touch_updated_at` trigger bumps `updated_at`. Admin editor `RotDaysInput` (1–365, empty=off) wired to `updateStageRotDays` (admin-gated, `.select("id")` 0-row guard). Live browser check: orchestrator-verified. Email-action rot resets: deferred to Phase 5 (recorded, approved) |
| 2 | Cards show title/org/value/label chip/owner avatar; activity icon completes-or-schedules without opening deal; columns sort next-activity overdue-first with working Sort-by dropdown | ✓ VERIFIED | 4-row card in `OpportunityCard` (pipeline-board.tsx:326-375): title Link w/ stopPropagation, account name, fmtMoney value + `DealLabelChip`, `DealActivityPopover` + `OwnerAvatar` initials. Popover has overdue/today/future/none icon states with exact tokens, "Mark as done" via `toggleTaskComplete` and "Schedule next"/"Schedule activity" via `createTask` (deal-activity-popover.tsx:88-123). `compareDeals("next_activity")`: due_at asc (overdue first), no-activity → Infinity (last), tiebreak `created_at` DESC (deal-board-utils.ts:43-49). Sort Select (kanban-only) in `DealsFilterBar` writes `?sort=` → page whitelist-parses → `PipelineBoard sort` prop → `byStage().sort(compareDeals(sort))` |
| 3 | Won/Lost require reason dialog; closed deal leaves board; reachable via won/lost chips; reason stored and editable | ✓ VERIFIED | `WonLostDialog`: won = optional Input, lost = required Select (6 reasons, display-string values, D-043 compliant) + Other→required Comment, confirm disabled until valid. Drag → `dropzone:won/lost` → dialog with NO optimistic move (cancel/ESC = snap-back, pipeline-board.tsx:97-106); confirm → `markOpportunityWonLost` → `stageStatusPatch` stamps status + won_at/lost_at only on transition + writes matching reason column → card filtered out of board + toast. Chips in filter bar write `?status=won|lost` → board `readOnly` mode renders closed deals in final stage. Reasons editable: `DealSummaryPanel` renders Won/Lost reason inline Input only on matching closed status → `updateOpportunityInline` (whitelist, stage/status excluded). Live drag→dialog→DB stamp: orchestrator-verified |
| 4 | Deals page switches Kanban / List (sortable, gear picker, bulk edit) / Forecast (date buckets, won-date override, weighted totals, drag-to-re-date) | ✓ VERIFIED | `?view=` whitelist-parsed in page.tsx; icon switcher preserves pipeline+filters. List: `listDealsForListView` — ONE `.range(0,499)` fetch + count exact, server-JS sort (9 keys, dir invert), 50/page slice, `capped` flag; sortable headers with Arrow icons; gear Popover persists to localStorage `deals-list-columns` (validated on read); D-044 bulk toolbar — Bulk edit dialog with `keep`/`none` sentinels → `bulkUpdateOpportunities` (zod 1-100 ids, open-stage-only targets, won/lost bulk targets rejected server-side), Delete gated `isAdmin` client-side AND `requireRole(["admin"])` server-side; pager `{from}–{to} of {total}`. Forecast: month buckets on `expected_close_date`, won deals bucket on `won_at` (forecast-board.tsx:119-120), leading non-droppable "No close date" column, 3-line headers (Won/Open split + Total/Weighted — won counts full, open probability-weighted), won cards green-left-bar + not draggable, drag → `endOfMonth` ISO → `updateExpectedCloseDate` → toast "Expected close moved to {MMM yyyy}" + rollback on failure. Live render of all three views: orchestrator-verified |
| 5 | Deal detail is 3-panel layout; owner/label/pipeline filter bar works on all deal views | ✓ VERIFIED | `[id]/page.tsx`: header (org·pipeline line, 21px title, won/lost chip w/ reason tooltip, `DealCloseButtons` reusing WonLostDialog + `markOpportunityWonLost` — single close path), `StageStepper` chevron strip (open stages, click → `moveOpportunityStage`, disabled when closed), grid `xl:grid-cols-[320px_minmax(0,1fr)_288px]`. Left: `DealSummaryPanel` optimistic inline edits w/ per-key revert. Center: Notes/Activity/Timeline tabs reusing `NoteComposer`/`TaskComposer`/`ActivityTimeline` unchanged + `LineItemsEditor`. Right: Person/Organization/Details widgets incl. next-activity state colors + rotten indicator. Filter bar: `owner`/`label`/`status` URL params → `DealFilters` applied server-side in ALL three loaders (`listOpportunitiesByPipeline`, `listDealsForListView`, `listWonOpportunitiesSince` all chain `.eq("owner_user_id")`/`.eq("label")`); pipeline switcher hrefs preserve view+filters. 3-panel screenshot: orchestrator-verified |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0013_deals_parity.sql` | rot_days, label, won_at/lost_at, next-task view, RPC rot touches | ✓ VERIFIED | All 4 columns, partial index, backfill (idempotent `is null` guards), `opportunity_next_task` security_invoker view (open deals only, pipeline_id-filterable), 3 RPCs recreated with rot-reset touches. Re-applied idempotently (orchestrator-verified) |
| `lib/db/schema.ts` | lockstep columns | ✓ VERIFIED | `rotDays` (line 163), `label` (197), `wonAt`/`lostAt` (199-200) |
| `lib/crm/opportunities.ts` | BoardOpportunity loaders + filters | ✓ VERIFIED | 346 lines; `listOpportunitiesByPipeline` (view merge, no `.in()` lists), `listDealsForListView` (bounded 500 + sums), `listWonOpportunitiesSince` (filters honored) |
| `lib/crm/deal-board-utils.ts` | compareDeals + sumByCurrency | ✓ VERIFIED | 4 comparators, created-DESC tiebreak, client-safe (`import type` only) |
| `lib/crm/labels.ts` | fixed six-key palette | ✓ VERIFIED | 6 keys + display names, matches UI-SPEC table |
| `components/crm/pipeline-board.tsx` | spec card + rotting + drop zones + readOnly | ✓ VERIFIED | 376 lines; dnd handlers/sensor/stopPropagation intact; wired from page.tsx |
| `components/crm/deals-list.tsx` | paginated sortable table + bulk ops | ✓ VERIFIED | 709 lines; selection clears on row-set change; exact copy contract strings |
| `components/crm/forecast-board.tsx` | month buckets + re-date drag | ✓ VERIFIED | 370 lines; horizon bounded at 24 months; NO_DATE column not droppable |
| `components/crm/deals-filter-bar.tsx` | owner/label/chips/sort/pipeline/gear | ✓ VERIFIED | All 6 controls; `all` sentinels; page reset on every change |
| `components/crm/deal-activity-popover.tsx` | 4 icon states + complete/schedule | ✓ VERIFIED | Exact copy ("Mark as done"/"Schedule next"/"Schedule activity"); dnd pointer guard |
| `components/crm/won-lost-dialog.tsx` | reason dialog per §7 | ✓ VERIFIED | Non-empty SelectItem values (D-043); confirm gating correct |
| `components/crm/deal-label-chip.tsx` | token chip | ✓ VERIFIED | Server-safe; per-key style map over `--pd-label-*` |
| `components/ui/popover.tsx` | Popover primitive | ✓ VERIFIED | Consolidated `radix-ui` import (no new dependency) |
| `components/crm/stage-stepper.tsx` | chevron stepper | ✓ VERIFIED | clip-path segments; open stages only; disabled when closed |
| `components/crm/deal-close-buttons.tsx` | Won/Lost header buttons | ✓ VERIFIED | Renders only while open; reuses dialog + `markOpportunityWonLost` |
| `components/crm/deal-summary-panel.tsx` | inline-edit left panel | ✓ VERIFIED | Optimistic overrides keyed on `opp.updated_at` resync; per-key revert |
| `app/(dashboard)/opportunities/page.tsx` | 3-view URL-driven page | ✓ VERIFIED | Whitelist parsing (UUID regex, enum whitelists); + Deal button; summary line |
| `app/(dashboard)/opportunities/actions.ts` | stageStatusPatch + markOpportunityWonLost | ✓ VERIFIED | Single stamping source; label-wipe guard (`undefined` when key absent) |
| `app/(dashboard)/opportunities/view-actions.ts` | bulk + re-date actions | ✓ VERIFIED | zod max-100 ids; admin delete; open-stage-only bulk targets |
| `app/(dashboard)/opportunities/[id]/page.tsx` | 3-panel detail | ✓ VERIFIED | Promise.all inline fetches (plan-02 fence respected) |
| `app/(dashboard)/opportunities/[id]/detail-actions.ts` | inline whitelist action | ✓ VERIFIED | Stage/status deliberately excluded; D-043 guard |
| `app/(dashboard)/settings/pipelines/*` | rot_days admin editor | ✓ VERIFIED | `RotDaysInput` on non-won/lost stages only; admin-gated action |
| `components/crm/opportunity-form.tsx` + edit page | label Select + defaults | ✓ VERIFIED | `none` sentinel; edit page passes `label: opp.label ?? ""` (wipe guard) |
| `scripts/e2e-rayan.mts` | view-route checks | ✓ VERIFIED | Lines 90-91: `?view=list` + `?view=forecast` route checks present; 21/21 pass orchestrator-verified |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| page.tsx URL params | all 3 loaders | whitelist parse → `DealFilters` | ✓ WIRED | owner/label/status flow to kanban, list, forecast queries server-side |
| PipelineBoard drag | DB status/timestamps | `moveOpportunityStage` → `stageStatusPatch` | ✓ WIRED | `.select("id")` + 0-row RLS throw; rollback to pre-drag snapshot |
| Drop zone → dialog | DB won/lost stamp | `markOpportunityWonLost` | ✓ WIRED | Reason column + won_at/lost_at; live DB stamp orchestrator-verified |
| Activity popover | tasks/activities | `createTask` / `toggleTaskComplete` RPCs | ✓ WIRED | RPCs touch opportunity → rot reset |
| Board card data | live queries | `listOpportunitiesByPipeline` → props | ✓ FLOWING | next_task + is_rotten merged in JS; no `.in()` ID lists |
| List bulk toolbar | DB bulk update/delete | view-actions.ts | ✓ WIRED | `.in("id")` capped at 100 by zod; delete `requireRole(["admin"])` |
| Forecast drag | expected_close_date | `updateExpectedCloseDate` | ✓ WIRED | last-day-of-month ISO; optimistic + rollback |
| Summary panel edits | opportunities row | `updateOpportunityInline` | ✓ WIRED | Only-provided-keys patch; absent key never wipes |
| RotDaysInput | pipeline_stages.rot_days | `updateStageRotDays` | ✓ WIRED | Round-trips into rot computation in both loaders |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Real Data | Status |
|----------|---------------|--------|-----------|--------|
| PipelineBoard | `opportunities` state | `listOpportunitiesByPipeline` (server) → prop, `useEffect` resync | Yes | ✓ FLOWING |
| DealsList | `rows` prop | `listDealsForListView` bounded fetch | Yes | ✓ FLOWING |
| ForecastBoard | `deals` state / `wonDeals` | open loader + `listWonOpportunitiesSince` | Yes | ✓ FLOWING |
| DealActivityPopover | `opp.next_task` | `opportunity_next_task` view merge | Yes | ✓ FLOWING |
| DealSummaryPanel | `opp` + `local` overrides | `getOpportunity` + optimistic resync on `updated_at` | Yes | ✓ FLOWING |
| Detail widgets | contact/account/nextTask | Promise.all inline sb queries | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

Skipped as automated re-runs — orchestrator already verified live per judging rules: kanban drag persisted to DB, Lost drop-zone → reason dialog → status/lost_at/lost_reason stamped in DB, list + forecast render, 3-panel detail screenshot, 21/21 e2e walk, migrations re-applied idempotently.

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| DEAL-01 | 02-PLAN-01 | ✓ SATISFIED | Card fields + activity popover (truth 2) |
| DEAL-02 | 02-PLAN-01 | ✓ SATISFIED | compareDeals overdue-first/created-DESC tiebreak + Sort dropdown (truth 2) |
| DEAL-03 | 02-PLAN-01 | ✓ SATISFIED | rot_days column + editor, red treatment, RPC rot-reset touches (truth 1). Email-action resets → Phase 5 (recorded) |
| DEAL-04 | 02-PLAN-01 + 02-PLAN-03 | ✓ SATISFIED | Reason dialogs, centralized stamping, chips, editable reasons on detail (truth 3) |
| DEAL-05 | 02-PLAN-02 | ✓ SATISFIED | Three views, pagination, bounded sort, gear picker, admin-gated bulk ops (truth 4) |
| DEAL-06 | 02-PLAN-03 | ✓ SATISFIED | 3-panel layout reusing composers/timeline unchanged (truth 5) |
| DEAL-07 | 02-PLAN-02 | ✓ SATISFIED | Filter bar params flow server-side to all views (truth 5) |

No orphaned requirements — REQUIREMENTS.md maps exactly DEAL-01..07 to Phase 2 and all seven are claimed across the three plans. (Housekeeping: REQUIREMENTS.md still shows DEAL-05/06/07 as "Pending" — orchestrator should flip to Complete.)

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| deals-list.tsx:413-415, deal-summary-panel.tsx:289 | Source renders constant `—` | ℹ️ Info | Sanctioned stub — no `source` column until Phase 3 leads; optional column, hidden by default |
| opportunities/page.tsx `viewHref` | `dir` param not carried across view switches | ℹ️ Info | Sort direction resets when switching views; page/sort intentionally reset — cosmetic |

No TODO/FIXME/placeholder comments in any phase-2 component. No Radix `value=""` (line-items-editor matches are native `<option>`, pre-existing, out of scope). No `.in()` list can exceed 100 (zod `.max(100)` on both bulk actions). Every opportunity write carries `.select("id")` + 0-row RLS throw.

### Human Verification Required

None outstanding — all browser-interactive items were verified live by the orchestrator (recorded in judging rules): kanban drag persistence, Lost drop-zone flow with DB stamping, list/forecast rendering, 3-panel detail, 21/21 e2e, idempotent migrations.

### Gaps Summary

No gaps. All five ROADMAP success criteria are implemented and wired in code; recorded deviations (Source `—` until Phase 3, email-action rot resets in Phase 5, forecast horizon extension, non-sortable extra columns) are all approved and documented in the SUMMARYs.

---

_Verified: 2026-07-11T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
