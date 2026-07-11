---
phase: 02-deals-parity
plan: 01
subsystem: ui
tags: [kanban, dnd-kit, radix-ui, supabase, postgres, rls, drizzle, pipedrive]

# Dependency graph
requires:
  - phase: 01-pipedrive-design-system
    provides: "CSS-variable token contract (--pd-* colors, elevations, label palette), re-skinned shadcn kit"
provides:
  - "Migration 0013: pipeline_stages.rot_days, opportunities.label/won_at/lost_at, opportunity_next_task security_invoker view, rot-reset touches in create_note/create_task/toggle_task_complete RPCs"
  - "stageStatusPatch: single source of status + won_at/lost_at derivation (fixes updateOpportunity status bug)"
  - "markOpportunityWonLost server action (reason + timestamps + UPDATE guard)"
  - "listOpportunitiesByPipeline returns BoardOpportunity[] (next_task + is_rotten merged in JS, no .in() lists)"
  - "Shared components: DealActivityPopover, WonLostDialog, DealLabelChip, components/ui/popover.tsx"
  - "Shared utils: sumByCurrency + compareDeals/DealSort in lib/crm/deal-board-utils.ts"
  - "Rebuilt PipelineBoard: spec card, rotting treatment, sort control, Won/Lost drop zones, prop resync"
  - "Admin per-stage rot_days editor at /settings/pipelines"
affects: [02-deals-parity plan 02 (list/forecast views), 02-deals-parity plan 03 (deal detail), any consumer of listOpportunitiesByPipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Popover primitive over consolidated radix-ui package (same convention as dialog.tsx) — no @radix-ui/react-popover dependency added"
    - "stageStatusPatch pattern: read current status first, only re-stamp won_at/lost_at on actual transition"
    - "Board resync: useEffect(setState, [serverProp]) + router.refresh() after every client-side mutation"

key-files:
  created:
    - supabase/migrations/0013_deals_parity.sql
    - lib/crm/labels.ts
    - lib/crm/deal-board-utils.ts
    - components/ui/popover.tsx
    - components/crm/deal-label-chip.tsx
    - components/crm/deal-activity-popover.tsx
    - components/crm/won-lost-dialog.tsx
    - app/(dashboard)/settings/pipelines/actions.ts
    - app/(dashboard)/settings/pipelines/rot-days-input.tsx
  modified:
    - lib/db/schema.ts
    - lib/crm/opportunities.ts
    - app/(dashboard)/opportunities/actions.ts
    - app/(dashboard)/settings/pipelines/page.tsx
    - components/crm/pipeline-board.tsx

key-decisions:
  - "Won/Lost drop zones render as a fixed bottom-anchored bar visible only while dragging (implementer's layout call per plan)"
  - "activities_opportunity_idx already existed from 0001 as (opportunity_id, occurred_at desc); schema.ts mirrors the ACTUAL 0001 definition, 0013's create-if-not-exists kept as fresh-DB safety no-op"
  - "label omitted from update payload when the form has no label key — today's edit form can never wipe an existing label"
  - "Undated open task renders as the gray 'Scheduled' state with no date suffix"

patterns-established:
  - "stageStatusPatch: every stage write (edit/drag/close) derives status + timestamps from stage flags in one helper"
  - "Board next-task fetch: filter the security_invoker view by pipeline_id only — never .in() ID lists"

requirements-completed: [DEAL-01, DEAL-02, DEAL-03, DEAL-04]

# Metrics
duration: ~25min
completed: 2026-07-11
---

# Phase 2 Plan 01: Data foundation + Pipedrive-grade kanban board Summary

**Migration 0013 (rotting, labels, won/lost timestamps, next-task view) + rebuilt kanban with spec cards, activity popover, rotting treatment, next-activity sort, and drag-to-won/lost reason dialogs — all on a single stageStatusPatch source of truth that fixes the updateOpportunity status bug.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-11T16:12:19Z
- **Completed:** 2026-07-11T16:37Z
- **Tasks:** 4/4
- **Files modified:** 14

## Accomplishments

1. **Task 1 — Migration 0013 + schema lockstep** (`2fff1ae`)
   - `rot_days` on pipeline_stages; `label`, `won_at`, `lost_at` on opportunities; partial index on expected_close_date; won_at/lost_at backfill from updated_at.
   - `opportunity_next_task` security_invoker view (earliest open task per open deal, pipeline_id-filterable).
   - `create_note`/`create_task`/`toggle_task_complete` recreated with rot-reset touches (updated_by write → touch_updated_at trigger bumps updated_at).
   - **Idempotency proven:** `npx tsx scripts/apply-sql.mts supabase/migrations` ran twice back-to-back, both clean (notices only). View + all 4 columns verified present via direct pg query.

2. **Task 2 — Centralized status stamping + loaders + labels + rot_days editor** (`2e32c7b`)
   - `stageStatusPatch(sb, stageId, opportunityId)`: derives status from stage flags, preserves timestamps when status unchanged, stamps/clears on transition. Used by `updateOpportunity` (BUG FIX), `moveOpportunityStage` (now with 0-row RLS guard), and new `markOpportunityWonLost`.
   - `listOpportunitiesByPipeline` → `BoardOpportunity[]`: Promise.all over opportunities + view (pipeline_id filter, limit 1000) + stages; `next_task` and `is_rotten` merged in JS.
   - `lib/crm/labels.ts`: fixed six-key palette (Hot/Warm/Cold/Qualified/Priority/On hold).
   - Admin inline "Rotting in (days)" number input per non-won/lost stage at /settings/pipelines (save on blur/Enter, empty → off).

3. **Task 3 — Popover primitive + shared components** (`427701a`)
   - `components/ui/popover.tsx` over consolidated `radix-ui` (compiled clean — no new dependency).
   - `DealActivityPopover`: overdue/today/scheduled/none icon states with exact tokens + aria-labels; Mark as done / Schedule next / Schedule activity (exact copy) via existing `toggleTaskComplete`/`createTask`.
   - `WonLostDialog` per UI-SPEC §7 (won: optional Input; lost: required Select with display-string values + Other→Comment; confirm gated).
   - `deal-board-utils`: `sumByCurrency` moved out of the board verbatim (stage param generalized), `compareDeals` with 4 comparators (no-activity last, created_at DESC tiebreak).

4. **Task 4 — Rebuilt PipelineBoard** (`c8ed778`)
   - 4-row spec card (title link stopPropagation KEPT, org, value + label chip, activity popover + owner-initials avatar).
   - Rotten cards: `--pd-negative-bg-light` tint + 3px left bar + tooltip "Rotten — no activity for {n} days"; column headers append "{r} rotten".
   - Columns = open stages only; two-line headers; "No deals" empty state.
   - Fixed bottom Won/Lost drop zones appear while dragging → reason dialog → `markOpportunityWonLost` → deal leaves board + toast; cancel/ESC snaps back (no optimistic move ever happens).
   - Resync fix: `useEffect` on `initialOpportunities`, `router.refresh()` after popover/dialog mutations, rollback to pre-drag snapshot.
   - dnd handlers, `PointerSensor` `distance: 4`, `DragOverlay` untouched.

## Verification

- `npx tsx scripts/apply-sql.mts supabase/migrations` × 2 — zero errors (idempotency gate passed).
- `npx tsc --noEmit` after every task — clean.
- `npm run build` after Task 4 — clean, all routes compiled.
- **NOT run:** browser drag-regression walk (Playwright MCP not available to the executor). The dnd handler structure, sensor config, and title-link stopPropagation are byte-identical to the verified-working version, but a human/verifier pass on /opportunities (drag between open stages, drag to Lost → cancel → snap back, activity popover) is still recommended.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Label-wipe guard in update payload**
- **Found during:** Task 2
- **Issue:** Plan's instruction to add `label` to both payloads would make today's edit form (which renders no label control) write `label: null` on every save, silently wiping labels set from the board/list later.
- **Fix:** `fromForm` returns `undefined` when the form has no `label` key; insert/update spread the column only when defined.
- **Files modified:** app/(dashboard)/opportunities/actions.ts
- **Commit:** 2e32c7b

**2. [Rule 1 - Plan-assumption correction] activities_opportunity_idx already existed**
- **Found during:** Task 1 (first migration run)
- **Issue:** Plan claimed "activities.opportunity_id has no index today"; 0001 already creates `activities_opportunity_idx (opportunity_id, occurred_at desc)`, which covers the view join. 0013's `create index if not exists` is a no-op on any DB that ran 0001.
- **Fix:** schema.ts mirrors the ACTUAL 0001 composite index (not 0013's partial variant) so db:push never fights the real database; 0013 statement kept with an explanatory comment for fresh-DB robustness.
- **Files modified:** lib/db/schema.ts, supabase/migrations/0013_deals_parity.sql
- **Commit:** 2fff1ae

**3. [Sanctioned by plan] New file rot-days-input.tsx**
- Plan's Task 2 explicitly allowed "a tiny client component in the same folder" for the rot_days editor; `app/(dashboard)/settings/pipelines/rot-days-input.tsx` was created (not in the frontmatter files list).

## Notes for Wave 2 (plans 02 & 03)

Exact exports to consume:

| Export | From |
|---|---|
| `BoardOpportunity`, `NextTask`, `listOpportunitiesByPipeline` | `lib/crm/opportunities.ts` (types safe via `import type` in client files) |
| `DealSort`, `compareDeals`, `sumByCurrency` | `lib/crm/deal-board-utils.ts` (client-safe) |
| `WonLostDialog` | `components/crm/won-lost-dialog.tsx` |
| `DealActivityPopover` (props: `opp`, `redirectTo?`, `onDone?`) | `components/crm/deal-activity-popover.tsx` |
| `DealLabelChip` | `components/crm/deal-label-chip.tsx` (server-safe) |
| `markOpportunityWonLost(opportunityId, stageId, reason)` | `app/(dashboard)/opportunities/actions.ts` |
| `DEAL_LABELS`, `labelName`, `DealLabel` | `lib/crm/labels.ts` (client-safe) |
| `Popover/PopoverTrigger/PopoverContent/PopoverAnchor` | `components/ui/popover.tsx` |

- `PipelineBoard` accepts optional `sort?: DealSort` — when provided, the internal Sort select hides (plan 02 moves it to the filter bar). Mine-only toggle intentionally kept this plan; plan 02 replaces it with the owner filter.
- Won/Lost drop zones use droppable ids `dropzone:won` / `dropzone:lost`.
- Rep visibility caveat (expected, per D-038 — do not flag as bug): reps don't see other reps' next-task chips through the security_invoker view; those cards render the yellow "no activity" warning state.

## Known Stubs

None — no placeholder data paths; all card data is wired to live queries.

## Self-Check: PASSED
