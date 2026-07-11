# Phase 2: Deals parity - Context

**Gathered:** 2026-07-11
**Status:** Ready for planning
**Mode:** Auto-generated (skip_discuss; specs pre-verified)

<domain>
## Phase Boundary

Rayan works deals on a Pipedrive-grade board — DEAL-01..07: card layout (title/org/value/label chip/owner avatar + clickable activity icon with complete-or-schedule popover), next-activity column sort + Sort-by dropdown, per-stage rotting (red cards), won/lost reason dialogs + filter chips, three views (Kanban | List | Forecast per verified spec incl. drag-to-re-date), 3-panel deal detail, filter bar (owner picker/label/pipeline). NOT in scope: leads (Phase 3), labels management UI beyond deal labels (full label system lands Phase 4 — deals get a minimal label field now), custom fields (Phase 4).

</domain>

<decisions>
## Implementation Decisions

### From verified teardown (docs/research/pipedrive-teardown.md — build to spec)
- Card fields: title, contact/org, value, label, owner + activity icon (complete/schedule without opening deal).
- Column sort default: next activity (overdue first), tiebreak newest-created; Sort-by dropdown (value, expected close, owner).
- Rotting: per-stage "Rotting in (days)"; red tile when last-update exceeds threshold; reset on activity done/notes/files/email actions; healthy on new scheduled activity or any deal edit.
- Forecast view: date-bucket columns on expected_close_date (won → won date); header shows open/won/combined; weighted values when probabilities set; gear = Show by/Arrange by; drag to another column rewrites expected close date.
- Won/Lost leave board, reachable via won/lost filters; reasons captured via dialog (won_reason/lost_reason columns already exist).

### Schema decisions (migration 0013, idempotent + schema.ts lockstep)
- pipeline_stages.rot_days int null; opportunities.label text null (color key from a fixed Pipedrive label palette), opportunities.won_at timestamptz, lost_at timestamptz; index on opportunities(expected_close_date).
- next-activity per deal computed via a query join on activities/tasks (no new column; use scheduled tasks with due_at as "next activity").

### Claude's Discretion
List-view column set, exact popover composition, empty states — per UI-SPEC patterns from Phase 1 tokens.

</decisions>

<code_context>
## Existing Code Insights

- components/crm/pipeline-board.tsx (dnd-kit; drag verified working post-reskin; card title link stopPropagations — keep), lib/crm/opportunities.ts (SELECT string, listOpportunitiesByPipeline), app/(dashboard)/opportunities/* (page + actions with won/lost status via stage flags), lib/format.ts fmtMoney, components/layout/quick-add.tsx.
- CONCERNS: paginate any list view; Radix Select sentinels; RLS soft-delete quirk (won/lost are status updates, fine); e2e walk must gain new-view coverage.

</code_context>

<specifics>
## Specific Ideas
Pipedrive look per Phase 1 tokens: red rotten cards (pd-negative), label chips from pd label palette, stage-colored subtle accents.
</specifics>

<deferred>
## Deferred Ideas
Full labels system + saved filters (Phase 4); leads convert flow (Phase 3).
</deferred>
