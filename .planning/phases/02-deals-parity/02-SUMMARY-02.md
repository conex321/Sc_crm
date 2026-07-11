---
phase: 02-deals-parity
plan: 02
subsystem: ui
tags: [kanban, list-view, forecast, dnd-kit, radix-ui, url-params, pagination, supabase, rls]

# Dependency graph
requires:
  - phase: 02-deals-parity plan 01
    provides: "BoardOpportunity loader, opportunity_next_task view, stageStatusPatch, compareDeals/sumByCurrency, DealLabelChip/DealActivityPopover/WonLostDialog, rebuilt PipelineBoard"
provides:
  - "?view=kanban|list|forecast segmented routing on /opportunities with all filters in URL params"
  - "DealsFilterBar: owner/label Selects, won-lost chips, kanban sort, pipeline switcher, forecast gear (?arrange=)"
  - "listOpportunitiesByPipeline(pipelineId, DealFilters) — server-side owner/label/status filters"
  - "listDealsForListView: bounded 500-fetch + server-JS sort (9 ListSort keys) + 50/page slice + exact count + open/weighted sums"
  - "listWonOpportunitiesSince(pipelineId, sinceIso, filters) for forecast won buckets"
  - "view-actions.ts: bulkUpdateOpportunities, bulkSoftDeleteOpportunities (admin), updateExpectedCloseDate"
  - "DealsList: paginated sortable table, localStorage column picker, D-044 bulk toolbar"
  - "ForecastBoard: month buckets, 3-line weighted headers, drag-to-re-date (last day of target month)"
  - "PipelineBoard readOnly closed-board mode ('won' | 'lost')"
affects: [02-deals-parity plan 03 (deal detail — walks ?view=list / ?view=forecast in its gate), phase 3 leads (Source column placeholder)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "URL-as-state: every filter/sort/page/view lives in searchParams; client bar writes router.replace, server page whitelist-parses"
    - "Bounded list pagination: ONE .range(0,499) fetch, server-JS sort, slice 50 — correct pagination for sort keys PostgREST can't order by"
    - "Bulk actions: current-page Set (≤50 ids), zod max-100 id guard, only-changed-fields patch with 'keep' sentinels"

key-files:
  created:
    - components/crm/deals-filter-bar.tsx
    - components/crm/deals-list.tsx
    - components/crm/forecast-board.tsx
    - app/(dashboard)/opportunities/view-actions.ts
  modified:
    - app/(dashboard)/opportunities/page.tsx
    - lib/crm/opportunities.ts
    - components/crm/pipeline-board.tsx

key-decisions:
  - "List sort: 500-cap bounded fetch + server-JS sort + page slice (documented in loader comment — do not 'optimize' into .in() traps); capped flag surfaces '(first 500 shown)'"
  - "PipelineBoard readOnly prop typed 'won' | 'lost' (not boolean) so an empty closed board still renders the right final-stage column(s)"
  - "Read-only board keeps DndContext wrapper with droppables disabled + plain (non-draggable) cards — zero diff to open-board drag mechanics"
  - "Forecast horizon extends past 6 months (bounded at 24) when open deals close later — no deal silently disappears; spec's '6 columns visible' rides on horizontal scroll"
  - "listWonOpportunitiesSince accepts owner/label filters (plan signature had none) so ALL views honor the shared filter bar"
  - "Forecast + status chips: won → won portion only; lost → empty buckets (lost deals have no forecast bucket concept)"

requirements-completed: [DEAL-05, DEAL-07]

# Metrics
duration: ~35min
completed: 2026-07-11
---

# Phase 2 Plan 02: List + Forecast views Summary

**Three deal views on one URL-driven surface: `?view=` segmented icon switcher + shared owner/label/won-lost filter bar (all server-side), a paginated 50/page list with sortable headers, localStorage column picker and D-044 bulk edit/admin delete, and a month-bucket forecast with weighted 3-line headers and drag-to-re-date writing last-day-of-month.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-11T16:34:28Z
- **Completed:** 2026-07-11T17:08Z
- **Tasks:** 3/3
- **Files modified:** 7 (4 created, 3 modified)

## Task Commits

| Task | Name | Commit |
|---|---|---|
| 1 | ?view= routing, header (+ Deal / switcher / summary), DealsFilterBar, server-side filters, board diff | `27eca07` |
| 2 | List view — bounded server sort, column picker, bulk edit + admin delete | `bf06a96` |
| 3 | Forecast view — month buckets, weighted headers, drag-to-re-date | `9a5d462` |

## Accomplishments

1. **Task 1 — Routing + filters + header** (`27eca07`)
   - `listOpportunitiesByPipeline` gains `DealFilters` (ownerId/label/status) applied server-side, so kanban column counts/sums stay truthful; closed-status mode skips the next-task view merge (`next_task: null`, `is_rotten: false`). Existing single-arg callers unchanged via default param.
   - `DealsFilterBar` (client): Owner (`all` sentinel → Everyone) and Label (color-dot options) Selects, mutually-exclusive Won/Lost pills writing `?status=`, kanban-only `Sort:` Select, pipeline switcher JSX moved in unchanged (hrefs preserve view + filters), forecast-only `Settings2` gear → DropdownMenu with `Show by` / `Arrange by` radio groups writing `?arrange=`. Every change deletes `page`.
   - `page.tsx`: whitelist-parsed searchParams (UUID regex for owner, enum whitelists elsewhere, garbage ignored), `+ Deal` primary button far left → `/opportunities/new?pipeline={slug}` (old right-side "New opportunity" removed), icon view switcher (`Columns3`/`List`/`ChartNoAxesColumn`, aria-labels, param-preserving Links), `Deals` h1 with 12px `{open} open · {weighted} weighted forecast` summary line.
   - `PipelineBoard`: Mine-only toggle, internal Sort Select, and toolbar summary removed; `sort` prop defaults `next_activity`; `readOnly` closed-board mode (columns = flagged final stages + any stage actually holding closed deals; droppables `disabled`, cards render plain). **Open-board dnd handlers, sensor config, and stopPropagation untouched.**

2. **Task 2 — List view** (`bf06a96`)
   - `listDealsForListView`: one `.range(0,499)` fetch with `count: "exact"`, pipeline-filtered next-task view merge (open status only — never per-row), server-JS sort via 9 ascending comparators (`dir=desc` inverts argument order; NaN-safe Infinity handling), 50-row slice, `capped` flag, and open/weighted sums for the header line.
   - `view-actions.ts` (new "use server" file — actions.ts untouched per plan-03 fence): `bulkUpdateOpportunities` (requireUser, zod 1–100 id guard, only-changed-fields, stage targets restricted server-side to open stages with `status: "open"` + cleared timestamps), `bulkSoftDeleteOpportunities` (`requireRole(["admin"])`), `updateExpectedCloseDate` (zod yyyy-MM-dd). All writes carry `.select("id")` + 0-row RLS throw + `revalidatePath("/opportunities")`.
   - `DealsList`: 15-column set (8 defaults per spec), sortable headers with Arrow icons on `?sort=&dir=`, gear Popover column picker persisted at localStorage `deals-list-columns` (defaults rendered on SSR, storage read post-mount), D-044 bulk toolbar (`{n} selected`, Bulk edit dialog with `— Keep current —` sentinels for Owner/Label/Stage, admin-only `Delete selected` confirm Dialog with exact copy `Delete {n} deals` / `This can't be undone from the list view.`, Clear), `{from}–{to} of {total}` pager with Previous/Next Links, `No deals yet` empty state with `+ Deal` button. Selection clears on row-set change (stale cross-page ids can never enter a bulk call).

3. **Task 3 — Forecast view** (`9a5d462`)
   - `listWonOpportunitiesSince`: bounded won fetch (`won_at >= startOfMonth`), owner/label filters honored.
   - `ForecastBoard`: leading `No close date` column (null or pre-current-month; NOT droppable), current + ≥5 next months, 3-line headers (`MMMM yyyy` + `· this month`, `Won` positive-strong · `Open` secondary, `Total`/`Weighted` where the won portion counts full and open is probability-weighted). Cards rebuilt from shared pieces (no PipelineBoard export — zero board-regression risk); won cards `--pd-positive-bg-light` + 3px `--pd-positive` left bar, not draggable; rotten treatment absent.
   - Drag-to-re-date: verified dnd-kit setup copied exactly; drop → optimistic re-bucket → `updateExpectedCloseDate(id, endOfMonth)` → toast `Expected close moved to {MMM yyyy}` → `router.refresh()`; rollback + `toast.error` on failure.

## Verification

- `npx tsc --noEmit` after every task — clean (3/3).
- `npm run build` **NOT run** — orchestrator gates the build (parallel executor active).
- Browser route smoke **NOT run** (no dev server in executor context) — see orchestrator checklist.
- `/Opportunit/i` e2e signal: still satisfied — rendered HTML contains `/opportunities/new?pipeline=` (+ Deal button) and `/opportunities?...` hrefs (view switcher, title links, pagination).

## Deviations from Plan

### Auto-fixed / judgment calls

**1. [Rule 3 - Blocking] Generic filter helper hit TS2589**
- **Found during:** Task 1 — a generic `applyDealFilters<Q extends { eq(): Q }>` helper exploded PostgREST's recursive builder generics ("Type instantiation is excessively deep").
- **Fix:** inlined the conditional `.eq()` chaining per query (also `.eq()` must precede `.limit()` in the builder API).
- **Commit:** 27eca07

**2. [Rule 2 - Correctness] `readOnly` prop is `"won" | "lost"`, not `boolean`**
- Plan said `readOnly?: boolean`; a bare boolean can't tell an EMPTY closed board which final-stage column(s) to render. The union is still truthy-checked everywhere, so behavior matches the plan.

**3. [Rule 2 - Correctness] `listWonOpportunitiesSince` gained a filters param**
- Plan signature had no filters, but the must-have truth says owner/label filter ALL three views. Optional `Pick<DealFilters, "ownerId" | "label">` param added (default `{}` — plan-signature calls still compile).

**4. [Documented choice] Forecast horizon extends beyond 6 months when needed**
- Open deals with `expected_close_date` past month +5 would silently vanish from a fixed 6-column board. Horizon extends (bounded at 24 columns) to cover the latest close date; UI-SPEC §6's "6 columns **visible**, horizontal scroll" is preserved.

**5. [Documented choice] Optional list columns without a `ListSort` key are not sortable**
- Spec says "every column except ☑ and Label" sorts, but the plan's fixed `ListSort` union has no keys for Status/Reason/Currency/Probability/Source. Plan contract wins: those five render plain headers. (All 8 default columns + Created/Updated sort.)

**6. [Documented choice] `listDealsForListView` returns two extra fields**
- `openSum`/`weightedOpenSum` added to the plan's declared return shape so the page's summary line comes from the same single bounded fetch (no second query).

**7. [Documented choice] Won/Lost chips in forecast**
- `won` → won portion only (open fetch skipped); `lost` → empty buckets (lost deals have no forecast bucket). Plan's forecast branch only specified open+won fetches; this is the minimal reading that still "filters rows" per the must-have truth.

### Not done (deliberate, per execution rules)

- `npm run build` and deploy — orchestrator's step.
- STATE.md/ROADMAP updates — left to the orchestrator (parallel executor shares .planning/).

## Known Stubs

- **List view `Source` column renders a constant `—`** (components/crm/deals-list.tsx) — `opportunities` has no `source` column until Phase 3 leads land. Sanctioned by the plan ("do not reference a nonexistent field in TS"); optional column, hidden by default.

## Orchestrator checklist (gate walk)

1. `npm run build` (executor did not run it — tsc clean per task).
2. Route smoke on dev/prod: `/opportunities`, `/opportunities?view=list`, `/opportunities?view=forecast`, `/opportunities?status=won`, `/opportunities?view=list&owner={uuid}&label=green&page=2` — all 200 and visibly filtered.
3. Kanban drag regression (board diff removed only toolbar/mine-only — handlers untouched): drag between open stages, drag to Lost → cancel → snap back, activity popover.
4. List: sort toggle on Title/Value/Next activity, gear picker persists across reload, bulk edit (owner change) on 2 rows, delete visible only as admin.
5. Forecast: drag a deal to next month → toast `Expected close moved to {MMM yyyy}` → survives refresh; won card green + not draggable.
6. `/Opportunit/i` still matches rendered /opportunities HTML (hrefs guarantee it).
7. Render signals for plan 03's gate: `?view=list` → `No deals yet` or table with `Organization` header; `?view=forecast` → `No close date` column header.

## Self-Check: PASSED

- components/crm/deals-filter-bar.tsx — FOUND
- components/crm/deals-list.tsx — FOUND
- components/crm/forecast-board.tsx — FOUND
- app/(dashboard)/opportunities/view-actions.ts — FOUND
- Commits 27eca07, bf06a96, 9a5d462 — FOUND on feat/mailshake-activation
