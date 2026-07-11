---
phase: 02-deals-parity
plan: 03
subsystem: ui
tags: [deal-detail, pipedrive, radix-ui, supabase, rls, inline-edit, e2e]

# Dependency graph
requires:
  - phase: 02-deals-parity
    plan: 01
    provides: "WonLostDialog, markOpportunityWonLost, moveOpportunityStage, DEAL_LABELS/DealLabelChip, opportunity_next_task view, rot_days on stages, label in opportunitySchema"
provides:
  - "3-panel deal detail per 02-UI-SPEC §9 (320px summary / tabbed center / 288px widgets, stacks below xl)"
  - "updateOpportunityInline whitelist server action in [id]/detail-actions.ts (label, expectedCloseDate, ownerUserId, wonReason, lostReason)"
  - "StageStepper: full-width chevron strip over open stages → moveOpportunityStage"
  - "DealCloseButtons: Won/Lost header buttons sharing plan-01's WonLostDialog + markOpportunityWonLost (single close path)"
  - "DealSummaryPanel: optimistic inline edits with Radix sentinels + revert-on-error"
  - "OpportunityForm six-label Select ('none' sentinel) + label passed through edit-page defaults"
  - "e2e-rayan.mts extended with ?view=list and ?view=forecast checks (21 total)"
affects: [02-deals-parity phase gate, phase 3 leads (Source field placeholder)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline-edit whitelist action per detail page ([id]/detail-actions.ts) — never in shared actions.ts; stage/status writes excluded so stageStatusPatch stays the single source of truth"
    - "Optimistic local-overrides map keyed on opp.updated_at resync (useEffect clear), revert only the touched keys on failure"
    - "Chevron stepper via per-segment clip-path polygon (no extra markup/deps)"

key-files:
  created:
    - app/(dashboard)/opportunities/[id]/detail-actions.ts
    - components/crm/stage-stepper.tsx
    - components/crm/deal-close-buttons.tsx
    - components/crm/deal-summary-panel.tsx
  modified:
    - app/(dashboard)/opportunities/[id]/page.tsx
    - app/(dashboard)/opportunities/[id]/edit/page.tsx
    - components/crm/opportunity-form.tsx
    - scripts/e2e-rayan.mts

key-decisions:
  - "Contact/account/next-task/stages/users fetches inline in [id]/page.tsx Promise.all with the sb client — lib/crm/opportunities.ts untouched (plan-02 fence)"
  - "Won/Lost reason inline editors only render on the matching closed status (DEAL-04 'stored and editable')"
  - "Edit page now passes label into form defaults — required once the form renders a label key, or every edit save would wipe labels"

patterns-established:
  - "Detail-page-scoped server actions live next to the page (detail-actions.ts), keeping shared actions.ts frozen between waves"

requirements-completed: [DEAL-06, DEAL-04 (detail half)]

# Metrics
duration: ~15min
completed: 2026-07-11
---

# Phase 2 Plan 03: 3-panel deal detail + form label + e2e views Summary

**Pipedrive-style 3-panel deal detail (inline-editable summary panel, chevron stage stepper, Won/Lost header buttons reusing plan-01's reason dialog, Notes/Activity/Timeline tabs, Person/Org/Details widgets) plus the six-label Select in the deal form and the two new view-route e2e checks.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-11T16:33:13Z
- **Completed:** 2026-07-11T16:48Z
- **Tasks:** 2/2 (Task 3 phase gate EXCLUDED — deferred to orchestrator per wave-2 split)
- **Files modified:** 8

## Accomplishments

1. **Task 1 — 3-panel deal detail** (`38a77a6`)
   - `[id]/detail-actions.ts`: `updateOpportunityInline` — zod whitelist (six-key label enum nullable, yyyy-MM-dd date, uuid owner, 500-char trimmed reasons), snake_case update built from ONLY provided keys + `updated_by`, `.select("id")` + 0-row throw (D-043 guard), revalidates detail + list paths. Stage/status deliberately excluded.
   - `StageStepper`: h-8 full-width strip of open stages (won/lost filtered out), chevron shapes via clip-path, past+current `bg-primary`, future `bg-secondary`; click → `moveOpportunityStage` → `router.refresh()`; disabled (60% opacity) when deal closed.
   - `DealCloseButtons`: renders only while open — Won (primary) + Lost (outline destructive) → plan-01 `WonLostDialog`; resolves target stage from `is_won`/`is_lost` flags (`toast.error("This pipeline has no won/lost stage")` when absent); exact toasts `Deal marked as won` / `Deal marked as lost`.
   - `DealSummaryPanel`: 21px tabular value + weighted line (stage probability, omitted at 0/closed); inline-editable Label (chip → Select with color dots + `No label`), Expected close date (`<input type="date">`, save on change/blur), Owner (Select + `unassigned` sentinel), Won/Lost reason (Input, only on matching closed status); read-only Probability, Source (`—`), Created/Updated. Optimistic overrides with per-key revert on failure, resync on `opp.updated_at`.
   - Rebuilt `[id]/page.tsx`: header (org line · pipeline, 21px/400 title, won/lost chip with reason tooltip, DealCloseButtons + SendInvoiceButton + Edit), stepper, `grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_288px]`. Center: Notes/Activity/Timeline tabs (composers reused UNCHANGED; task rows with due-state colors + Mark done/Reopen via bound `toggleTaskComplete`), LineItemsEditor below. Right: Person (contact link/mailto/phone, `No contact linked` + `Link contact` empty state), Organization (name/country/type), Details (status, pipeline/stage, currency, next activity with state colors or `AlertTriangle` warning, rotten indicator computed server-side from `rot_days`).

2. **Task 2 — Label select + e2e routes** (`ece6bb3`)
   - `OpportunityForm`: `Label` Select (`name="label"`), `No label` sentinel `none` default + six `DEAL_LABELS` entries with `--pd-label-{key}-bg/fg` color dots; paired with Owner in a 2-col row. Plan-01's schema already handled `label` (verified) — actions.ts untouched.
   - `scripts/e2e-rayan.mts`: appended exactly the two specified ROUTES entries (`?view=list` → `/Next activity/`, `/Expected close/`; `?view=forecast` → `/No close date/`). No existing signal reworded. 17 static + 2 views + 2 discovered account routes = 21 checks.

## Verification

- `npx tsc --noEmit` after each task — clean (exit 0).
- `npm run build` — NOT run per orchestrator instruction (parallel wave-2 executor active); build is part of the deferred phase gate.
- 21/21 e2e walk — NOT run here (requires built app + both wave-2 plans merged); part of the deferred gate.
- Composers/timeline/line-items/send-invoice imported unchanged (git diff shows no edits to them).
- No edits to plan-02-owned files (`opportunities/page.tsx`, `view-actions.ts`, `lib/crm/opportunities.ts`, `pipeline-board.tsx`, deals-filter-bar/deals-list/forecast-board).

## Phase gate — DEFERRED TO ORCHESTRATOR

Task 3 (tsc + build + 21/21 e2e walk + apply-sql idempotency re-proof) was excluded from this execution by the orchestrator and runs after both wave-2 executors finish. Playwright manual checklist for the browser pass, verbatim from the plan:

- [ ] Kanban: drag a card between two open stages persists (REGRESSION — board was refactored)
- [ ] Card activity icon → popover → `Mark as done` → chip changes to warning state after refresh
- [ ] Popover → `Schedule activity` → chip shows the new date
- [ ] Drag a card onto the Lost zone → reason dialog (confirm disabled until reason) → deal leaves board → visible under the Lost chip; Cancel/ESC snaps back
- [ ] Set `rot_days=1` on a stage in /settings/pipelines → a stale seeded deal renders red with `Rotten — no activity for {n} days` tooltip and column shows `{r} rotten`
- [ ] List view: sort headers, gear column picker persists after reload, bulk edit 2 deals' label, pagination at 50
- [ ] Forecast: drag an open deal one month right → toast `Expected close moved to {MMM yyyy}` → survives refresh; won card is green and not draggable
- [ ] Deal detail: stepper click moves stage; Won button → dialog → status badge + reason tooltip; inline label/owner/close-date edits save
- [ ] Dark mode spot-check: label chips, rotten tint, won tint, filter chips
- [ ] RLS spot-check as demo login: board renders; own next-task chips visible (missing chips on other reps' deals is EXPECTED per D-038 — do not flag)

Deploy (`npx vercel --prod --yes`) is explicitly NOT performed — orchestrator step after the checklist passes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Edit page must pass `label` into form defaults**
- **Found during:** Task 2
- **Issue:** Adding the `label` key to `OpportunityForm` means the edit form now always submits a label value. Without the current label in `defaults`, every edit save would default to `none` → null and silently wipe labels set from the board/detail (the exact wipe scenario plan-01's undefined-key guard protected against — that guard only covers forms WITHOUT a label key).
- **Fix:** `app/(dashboard)/opportunities/[id]/edit/page.tsx` passes `label: opp.label ?? ""` into defaults.
- **Files modified:** app/(dashboard)/opportunities/[id]/edit/page.tsx
- **Commit:** ece6bb3

### Observations (no action)

- During Task 1's tsc run, a transient TS2589 appeared in `lib/crm/opportunities.ts` — the parallel plan-02 executor's in-flight edit (their fence). Resolved on re-run; out of scope per fence rules.

## Known Stubs

- **Source field** (`deal-summary-panel.tsx` Source row): intentionally renders `—`. There is no `source` column on opportunities today; it arrives with Phase 3 leads. Explicitly sanctioned by the plan ("render the Source row as `—` per UI-SPEC layout, do not reference a nonexistent field in TS").

## Self-Check: PASSED
