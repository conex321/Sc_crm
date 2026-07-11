# Phase 2: Deals parity - Research

**Researched:** 2026-07-11
**Domain:** Pipedrive-grade deals board on existing Next.js 16 + Supabase (PostgREST/RLS) + dnd-kit stack
**Confidence:** HIGH (nearly all findings verified directly in this codebase; external claims limited to Postgres/Supabase view semantics)

## Summary

Phase 2 upgrades the existing, working kanban (`components/crm/pipeline-board.tsx` + `lib/crm/opportunities.ts`) to Pipedrive parity: richer cards with an activity popover, next-activity sorting, per-stage rotting, won/lost dialogs, three views (Kanban/List/Forecast), and a 3-panel deal detail. Everything builds on infrastructure that already exists: `tasks` are 1:1 children of `activities` (with a partial index `tasks_due_idx` on `due_at where completed_at is null` already in place), `toggleTaskComplete`/`createTask` server actions already exist in `app/(dashboard)/activities/actions.ts`, `won_reason`/`lost_reason` columns already exist, and the `touch_updated_at` trigger already bumps `opportunities.updated_at` on every UPDATE — which makes `updated_at` the natural single-column rot clock.

The two structural decisions that keep this cheap and PostgREST-safe: (1) a **`security_invoker` Postgres view `opportunity_next_task`** (DISTINCT ON per deal, carrying `pipeline_id`) so the board fetches all next-activities in ONE query filtered by `.eq("pipeline_id", …)` — no `.in()` ID lists (URL limit ~100), no N+1, bounded under the 1,000-row cap because open deals are capped at 500; (2) **rot resets are implemented by making the existing activity RPCs touch the parent opportunity row**, so rotting is a zero-join boolean computed from `opportunities.updated_at` vs `pipeline_stages.rot_days`.

Biggest hazard: the board is a client component holding `initialOpportunities` in `useState` and never resyncing on server refresh — every new mutation surfaced on the card (complete task, schedule, won/lost dialog) must trigger `router.refresh()` AND the board must resync state from props, without regressing the verified drag behavior.

**Primary recommendation:** One idempotent migration (0013) with columns + view + `create or replace` RPC extensions; merge next-task + rot flags server-side in `listOpportunitiesByPipeline`; split into 3 plans (data+board, views, detail+polish).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**From verified teardown (docs/research/pipedrive-teardown.md — build to spec)**
- Card fields: title, contact/org, value, label, owner + activity icon (complete/schedule without opening deal).
- Column sort default: next activity (overdue first), tiebreak newest-created; Sort-by dropdown (value, expected close, owner).
- Rotting: per-stage "Rotting in (days)"; red tile when last-update exceeds threshold; reset on activity done/notes/files/email actions; healthy on new scheduled activity or any deal edit.
- Forecast view: date-bucket columns on expected_close_date (won → won date); header shows open/won/combined; weighted values when probabilities set; gear = Show by/Arrange by; drag to another column rewrites expected close date.
- Won/Lost leave board, reachable via won/lost filters; reasons captured via dialog (won_reason/lost_reason columns already exist).

**Schema decisions (migration 0013, idempotent + schema.ts lockstep)**
- pipeline_stages.rot_days int null; opportunities.label text null (color key from a fixed Pipedrive label palette), opportunities.won_at timestamptz, lost_at timestamptz; index on opportunities(expected_close_date).
- next-activity per deal computed via a query join on activities/tasks (no new column; use scheduled tasks with due_at as "next activity").

### Claude's Discretion
List-view column set, exact popover composition, empty states — per UI-SPEC patterns from Phase 1 tokens.

### Deferred Ideas (OUT OF SCOPE)
Full labels system + saved filters (Phase 4); leads convert flow (Phase 3).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEAL-01 | Card layout: title/org/value/label chip/owner avatar + clickable activity icon w/ complete-or-schedule popover | §Card & popover — `toggleTaskComplete`/`createTask` actions exist; popover needs `@radix-ui/react-popover` (not installed); stopPropagation pattern already proven on card title link |
| DEAL-02 | Next-activity column sort + Sort-by dropdown | §Next-activity computation — `opportunity_next_task` view + comparator; `components/ui/dropdown-menu.tsx` exists |
| DEAL-03 | Per-stage rotting (red cards) | §Rotting — `rot_days` column + `updated_at` clock + RPC touch; pd-negative tokens from Phase 1 |
| DEAL-04 | Won/lost reason dialogs + filter chips | §Won/lost — `won_reason`/`lost_reason` columns exist; new `markWonLost` action stamps `won_at`/`lost_at`; `components/ui/dialog.tsx` exists |
| DEAL-05 | Three views: Kanban / List / Forecast (drag-to-re-date) | §View architecture — `?view=` param, paginated server List, client Forecast reusing dnd-kit patterns |
| DEAL-06 | 3-panel deal detail | §Deal detail — restructure `[id]/page.tsx` reusing NoteComposer/TaskComposer/ActivityTimeline |
| DEAL-07 | Filter bar (owner picker/label/pipeline) | §View architecture — URL-param filter state; users query pattern in `lib/crm/dashboard.ts:223` |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Two DB clients: Drizzle `db` bypasses RLS (crons only); Supabase `sb` enforces RLS (ALL user-facing pages/actions). Everything in this phase is user-facing → `sb` only.
- Migrations in `supabase/migrations/`, applied with `tsx scripts/apply-sql.mts` which **re-runs ALL files every run** → 0013 must be strictly idempotent (guards on backfills, `create or replace` / `drop … if exists`).
- `lib/db/schema.ts` must stay in lockstep — `db:push` drops unlisted columns (including generated columns).
- Commit/push only when Matthew asks; never force-push. Deploy = `npx vercel --prod --yes` straight to prod — verify locally first (tsc + build + e2e walk + Playwright).
- Radix Select: never `value=""` — use sentinel values mapped to null server-side.
- Compact density is intentional (14px root, text-xs/sm) — don't inflate.
- Run `update-project-notes` skill after material changes (executor responsibility).

## Standard Stack

No new runtime dependencies except one Radix primitive. Everything else is already installed and proven in this repo.

### Core
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| @dnd-kit/core | ^6.3.1 | Board drag + Forecast drag-to-re-date | Installed, drag verified post-reskin |
| @radix-ui/react-popover | latest | Card activity-icon popover | **NOT installed — `components/ui/popover.tsx` does not exist**; add via `npx shadcn@latest add popover` (dialog/dropdown-menu/avatar/tabs already exist) |
| date-fns | ^4.1.0 | Due-date math, month buckets (`startOfMonth`, `addMonths`, `isBefore`) | Installed |
| @supabase/supabase-js | ^2.46.2 | All reads/writes (RLS path) | Installed |
| zod | (installed) | Action schemas | Installed |

### Don't Hand-Roll
| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-deal next activity | N+1 per-card fetches or `.in()` with 500 IDs | `opportunity_next_task` Postgres view filtered by `pipeline_id` | `.in()` breaks at ~100 values (URL limit, hit live in D-044); one query, RLS-safe |
| Rot clock | New `last_activity_at` column + sync logic everywhere | `opportunities.updated_at` (existing `touch_updated_at` trigger) + RPC touch | Zero new state to keep consistent; matches Pipedrive "last-update timer" semantics |
| Popover primitive | Custom absolutely-positioned div | Radix Popover (shadcn wrapper) | Focus trap, dismiss, collision handled; matches existing ui/ kit |
| Currency display | New formatters | `fmtMoney` from `lib/format.ts` | House pattern (CAD default, per-currency locale) |
| Task complete / schedule | New RPCs | Existing `toggle_task_complete` / `create_task` RPCs + actions in `app/(dashboard)/activities/actions.ts` | Already atomic (parent activity + child row), already RLS-tested |

## 1. Migration 0013 design (idempotent)

Pattern source: `supabase/migrations/0012_import_batches.sql` (add column if not exists, create index if not exists, drop-policy-then-create) and `0002_activity_rpcs.sql` (`create or replace function`).

```sql
-- =============================================================================
-- 0013_deals_parity.sql
-- Phase 2: rotting config, deal labels, won/lost timestamps, next-task view,
-- rot-reset touches on activity RPCs. Idempotent (apply-sql re-runs all files).
-- =============================================================================

alter table public.pipeline_stages add column if not exists rot_days integer;
alter table public.opportunities   add column if not exists label   text;
alter table public.opportunities   add column if not exists won_at  timestamptz;
alter table public.opportunities   add column if not exists lost_at timestamptz;

-- Forecast bucketing + list sorting
create index if not exists opportunities_expected_close_idx
  on public.opportunities (expected_close_date) where deleted_at is null;
-- Next-task view join path (activities.opportunity_id has no index today)
create index if not exists activities_opportunity_idx
  on public.activities (opportunity_id) where opportunity_id is not null;
-- (tasks_due_idx on tasks(due_at) where completed_at is null ALREADY EXISTS — 0001:387)

-- Backfill won_at/lost_at from updated_at (best available approximation).
-- Idempotent: the `is null` guard makes re-runs no-ops.
update public.opportunities set won_at  = updated_at where status = 'won'  and won_at  is null;
update public.opportunities set lost_at = updated_at where status = 'lost' and lost_at is null;

-- Next scheduled task per deal. security_invoker so activities RLS applies.
drop view if exists public.opportunity_next_task;
create view public.opportunity_next_task
with (security_invoker = true) as
select distinct on (a.opportunity_id)
  a.opportunity_id,
  o.pipeline_id,
  a.id as activity_id,
  t.title,
  t.due_at
from public.activities a
join public.tasks t on t.activity_id = a.id
join public.opportunities o on o.id = a.opportunity_id
where t.completed_at is null
  and o.deleted_at is null
  and o.status = 'open'
order by a.opportunity_id, t.due_at asc nulls last;
```

**Also in 0013:** `create or replace` the three RPCs from 0002 (see §3 Rotting) with an appended opportunity-touch. `create or replace function` is idempotent by construction. Use `drop view if exists` + `create view` (not `create or replace view`) because `create or replace view` fails if the column list ever changes — apply-sql re-runs make this a real hazard.

**won_at/lost_at stamping (app layer):**
- `moveOpportunityStage` (app/(dashboard)/opportunities/actions.ts:99) already derives `status` from `stage.is_won/is_lost`. Extend the update payload: `won_at: status==='won' ? now : null`, `lost_at: status==='lost' ? now : null` (clearing on reopen keeps re-open → re-win timestamps honest).
- **Existing bug to fix in the same task:** `updateOpportunity` (actions.ts:69) writes `stage_id` WITHOUT recomputing `status` — editing a deal into a won stage leaves status `open`. Centralize a helper (e.g. `stageStatusPatch(sb, stageId)` returning `{ status, won_at, lost_at }`) used by `moveOpportunityStage`, `updateOpportunity`, and the new won/lost dialog action. Without this, won_at stamping will be inconsistent.
- New action `markOpportunityWonLost(id, stageId, reason)` for the dialog path: sets stage, status, won_at/lost_at, and `won_reason`/`lost_reason` (columns exist since 0001-era schema).

**schema.ts lockstep (lib/db/schema.ts — MANDATORY, db:push drops unlisted columns):**
```ts
// pipelineStages (line ~150): add
rotDays: integer("rot_days"),            // import { integer } from "drizzle-orm/pg-core"
// opportunities (line ~170): add
label: text("label"),
wonAt: timestamp("won_at", { withTimezone: true }),
lostAt: timestamp("lost_at", { withTimezone: true }),
```
Mirror the two new indexes in the table callbacks as well (same reasoning as `accounts.norm_name` precedent — keep push from fighting migrations). The view needs no schema.ts entry (Drizzle push ignores views).

## 2. Next-activity computation

**Query shape (one grouped query, no N+1, no `.in()`):** `distinct on (opportunity_id) … order by opportunity_id, due_at asc nulls last` in the view above; the loader filters by pipeline:

```ts
// lib/crm/opportunities.ts
export type NextTask = { opportunity_id: string; activity_id: string; title: string; due_at: string | null };

const { data } = await sb
  .from("opportunity_next_task")
  .select("opportunity_id, activity_id, title, due_at")
  .eq("pipeline_id", pipelineId)
  .limit(1000); // open deals capped at 500 → ≤500 rows, under PostgREST cap
```

**Why this dodges the CONCERNS footguns:** filtering by `pipeline_id` (a column baked into the view) means no ID list in the URL (`.in()` breaks >~100 values); row count is bounded by `listOpportunitiesByPipeline`'s own 500-deal cap so the 1,000-row response cap can't silently truncate.

**Where it plugs in:** extend `listOpportunitiesByPipeline` to run both queries via `Promise.all`, then merge in JS onto a widened type:

```ts
export type BoardOpportunity = OpportunityWithRefs & {
  next_task: { activity_id: string; title: string; due_at: string | null } | null;
  is_rotten: boolean;
};
```
Keep the existing `SELECT` string untouched (it is shared with `listOpportunitiesForAccount`/`getOpportunity`); add `label, won_at, lost_at` to it once (all callers tolerate extra fields).

**RLS reality (document, don't fight):** `activities_select` (0008_per_rep_ownership.sql:74) restricts reps to their own activities or activities on accounts they own. Since the view is `security_invoker`, a rep viewing another rep's deal sees no next-task chip (renders as Pipedrive's "no activity scheduled" warning state). Admin sees everything. This is acceptable per D-038's visibility model — note it in the plan so verification doesn't flag it as a bug.

**Sorting comparator (client-side, in the board — column arrays are small):**

```ts
// Default: next activity — overdue first → soonest → no-activity last; tiebreak newest-created
function byNextActivity(a: BoardOpportunity, b: BoardOpportunity): number {
  const ad = a.next_task?.due_at ? Date.parse(a.next_task.due_at) : Infinity;
  const bd = b.next_task?.due_at ? Date.parse(b.next_task.due_at) : Infinity;
  if (ad !== bd) return ad - bd;                                   // earliest due (most overdue) first
  return Date.parse(b.created_at) - Date.parse(a.created_at);      // newest created first (verified Pipedrive tiebreak)
}
```
Deals with an undated open task get `Infinity` too (chip without a date, sorted with no-activity group — the view's `nulls last` already prefers dated tasks when a deal has both). Sort-by dropdown (existing `components/ui/dropdown-menu.tsx`): `value` (amount desc, nulls last), `expected close` (asc, nulls last), `owner` (full_name asc). Pure client state in `PipelineBoard`.

## 3. Rotting computation

**Decision: `opportunities.updated_at` is the single rot clock.** Rationale against the alternative (`greatest(updated_at, max(activities.occurred_at))`):
- The `touch_updated_at` trigger (0001:19–36) already bumps `opportunities.updated_at` on ANY deal edit and stage move → covers the "editing any deal detail restores healthy" spec for free.
- Marking a task done updates only `public.tasks` — it would touch NEITHER `activities.updated_at` NOR any `occurred_at`, so the max-of-activities approach fails the spec's primary reset action anyway. Some write-path change is unavoidable; touching the opportunity is the cheapest one.
- Single column = zero extra query cost: rot state computes from data the board already loads.

**Reset wiring — 0013 `create or replace`s the three RPCs from 0002 with an appended touch:**

```sql
-- appended inside create_note / create_task (they already receive p_opportunity_id):
if p_opportunity_id is not null then
  update public.opportunities set updated_by = auth.uid() where id = p_opportunity_id;
end if;
-- inside toggle_task_complete (look up the parent activity's opportunity):
update public.opportunities o set updated_by = auth.uid()
from public.activities a
where a.id = p_activity_id and o.id = a.opportunity_id;
```
The trigger converts the touch into `updated_at = now()`. RLS passes: opportunities UPDATE is rep-open (migration 0011), RPCs are `security invoker`. Coverage vs teardown spec: task done ✓, note added ✓, new scheduled activity ✓ (create_task), any deal edit ✓ (trigger), stage move ✓. Email actions/files: email-sync activities arrive via the Drizzle service-role path and rarely carry `opportunity_id` — accept as a gap for now (flag in plan; can be added to sync writers later without schema change).

**Server-computed flag (in the loader merge, not the client):**

```ts
const rotDaysByStage = new Map(stages.map(s => [s.id, s.rot_days]));  // add rot_days to listStagesForPipeline SELECT
const now = Date.now();
const is_rotten = o.status === "open"
  && rotDaysByStage.get(o.stage_id) != null
  && now - Date.parse(o.updated_at) > rotDaysByStage.get(o.stage_id)! * 86_400_000;
```
Card renders `is_rotten` with pd-negative tokens (red tile per Phase 1 palette). **Config UI:** the stage editor under `/settings/pipelines` needs a small "Rotting in (days)" number input per stage (nullable) — include as a task in plan 1.

**Caution:** this decision semantically repurposes `updated_at` as "last meaningful touch" — the deal-detail "Updated {date}" line ([id]/page.tsx:98) becomes "last activity" in effect. Acceptable (matches Pipedrive), but note it.

## 4. View architecture

**Routing:** single route `/opportunities?view=kanban|list|forecast&pipeline=…&owner=…&label=…&status=…&sort=…&page=…`. `page.tsx` (server component) branches on `view` (default `kanban`). Filters live ONLY in the URL → shareable, and all three views inherit them. A client `DealsFilterBar` (owner Select — sentinel `"all"`, never `""`; label chip Select from the fixed palette; status chips open/won/lost/all; pipeline switcher stays as-is) writes params via `router.replace(pathname + "?" + params)`. View switcher = 3-segment control identical in style to the existing pipeline switcher.

Owner options query: `sb.from("users").select("id, full_name").eq("is_active", true)` (existing pattern, `lib/crm/dashboard.ts:223`).

**Kanban:** existing `PipelineBoard` with additions. Apply owner/label filters server-side in `listOpportunitiesByPipeline` (new optional args) so column counts/sums stay truthful. Status filter: `open` renders the board; `won`/`lost` render a filtered list (won/lost deals leave the board per spec — today the board draws `is_won`/`is_lost` stage columns that are ALWAYS empty because the loader filters `status=open`; replace those columns with drag-to-won/lost drop zones that open the reason dialog).

**List:** NEW server component (do not grow `components/crm/opportunity-list.tsx` — it's the account-detail widget). Table columns (discretion): title, account, stage, label, value, next activity, expected close, owner, status. **Pagination is mandatory** (CONCERNS: /accounts renders all rows — do not repeat): `.range(from, from + PAGE - 1)` with PAGE=50, `{ count: "exact" }` for the pager, `?page=N` in URL. Sortable headers = links rewriting `?sort=`. Next-activity column: reuse the view, `.in("opportunity_id", pageIds)` is safe here (≤50 IDs, under the ~100 limit).

**Forecast:** client component, same dnd-kit pattern as the board (`useDroppable` per month column, `useDraggable` per card — copy the verified `PointerSensor` + `distance: 4` + stopPropagation-on-title setup exactly). Server page fetches: open deals for the pipeline (existing loader) + won deals where `won_at >= startOfMonth(now)`. Buckets: current month + next 5 (6 columns), plus a leading "Earlier/No date" catch-all for open deals with past or null expected_close_date (discretion). Bucket key: open → `expected_close_date`, won → `won_at` (spec). Column header: open total, won total, combined — weighted by `stage.probability/100` when any stage probability > 0 (reuse `sumByCurrency(…, weighted, stages)` from pipeline-board.tsx — extract to shared module). Drop → optimistic move + server action `updateExpectedCloseDate(oppId, iso)` setting `expected_close_date` to the same day-of-month in the target month (clamped to month end), `revalidatePath("/opportunities")`. Gear menu (Show by / Arrange by): defer "Show by" to a single option (expected close) — no other date fields exist until Phase 4 custom fields; "Arrange by" = same three comparators as the board.

## 5. Activity icon popover (complete-or-schedule)

**What already exists (verified):**
- `toggleTaskComplete(activityId, redirectTo)` — app/(dashboard)/activities/actions.ts:76, calls RPC `toggle_task_complete` (0002:85, flips `completed_at`, RLS-checked). Reusable as-is.
- `createTask(form)` — same file, RPC `create_task` accepts `opportunityId`/`accountId`/`dueAt`/`assignedUserId`. The quick-schedule form posts to this unchanged.
- `TaskComposer` (components/crm/task-composer.tsx) shows the exact form fields needed — the popover embeds a slimmed copy (title + datetime-local + submit), not the Card-wrapped composer.

**What's missing:** `components/ui/popover.tsx` (add shadcn popover + `@radix-ui/react-popover` dep — only new dependency of the phase). New client component `components/crm/deal-activity-popover.tsx`: icon button on the card (calendar/alert glyph; red-tinted when overdue, warning state when no `next_task`); content = if `next_task`: title + due + [Mark done] (calls `toggleTaskComplete(next_task.activity_id, "/opportunities")`) + [Schedule new] toggle; else: quick-schedule form. Must `onPointerDown={e => e.stopPropagation()}` on the trigger (same trick as the card title link, pipeline-board.tsx:210) or dnd-kit will start a drag.

**Integration gotcha (the real work):** `PipelineBoard` seeds `useState(initialOpportunities)` and never resyncs, so after a popover action the server data revalidates but the board shows stale chips. Fix in plan 1: derive board state with a resync (`useEffect(() => setOpportunities(initialOpportunities), [initialOpportunities])` or key the board on a data hash) + call `router.refresh()` after popover actions. Test drag immediately after — this touches the verified-working drag component.

## 6. 3-panel deal detail ([id]/page.tsx restructure)

Teardown verified only the LEAD panel layout (deal detail is an open gap) — mirror the lead spec: left record sections, right Composer/Focus/History. Proposed grid: `lg:grid-cols-[300px_minmax(0,1fr)]`, header spanning full width.

- **Header (full width):** account link · pipeline, deal title, **clickable stage progression bar** (chips for each non-won/lost stage → `moveOpportunityStage`; current stage highlighted), Won/Lost buttons (open the same reason dialog as the board), Edit, SendInvoiceButton.
- **Left panel:** Details section (value `fmtMoney`, label chip, owner, expected close, created/updated, won/lost reason when closed), Contact section (primary contact), Organization section (account), then `LineItemsEditor` (existing component, moves here or stays as a center card — discretion).
- **Right panel (stacked):** Composer — `components/ui/tabs.tsx` (exists) with Note / Task tabs wrapping the existing `NoteComposer` + `TaskComposer` unchanged; Focus — open tasks for this deal (filter the already-fetched `listActivitiesForOpportunity` result: `channel==='task' && !task.completed_at`, with Mark-done via `toggleTaskComplete(id, '/opportunities/'+oppId)`); History — existing `ActivityTimeline` unchanged.

**Blast radius (verified by reading every consumer):** `[id]/page.tsx` is a full rewrite but is a leaf route. Reused components (`NoteComposer`, `TaskComposer`, `ActivityTimeline`, `LineItemsEditor`, `SendInvoiceButton`) need zero changes. `components/crm/opportunity-list.tsx` (account detail tab) untouched. `getOpportunity`/`listActivitiesForOpportunity` untouched apart from the shared SELECT gaining `label, won_at, lost_at`. New shared pieces: won/lost reason dialog (used by board + detail), label chip component (used by card + list + detail). `[id]/edit` gains a Label select (fixed palette, sentinel `"none"`).

## 7. Verification & e2e additions

No unit-test infra; gates are tsc + `next build` + route-walk + Playwright MCP (CONCERNS). Additions:

- **scripts/e2e-rayan.mts** (forged-cookie route walk): add `/opportunities?view=list`, `/opportunities?view=forecast`, `/opportunities?view=kanban&status=won`, one deal detail URL; assert HTML signals (e.g. "Forecast", table headers, stage bar).
- **Playwright MCP manual walk (pre-deploy):** drag card between stages (regression — board state refactor), popover → Mark done → chip clears, popover → schedule → chip appears, drag to Lost zone → reason dialog → deal leaves board → visible under lost filter, forecast drag → expected_close_date changes month, rotting red card (set `rot_days=1` on a stage via settings UI, verify a stale seeded deal turns red).
- **Migration gate:** `tsx scripts/apply-sql.mts` runs twice back-to-back with zero errors (idempotency proof — it re-applies all files every run anyway).
- **RLS spot-check:** as the demo/rep login, confirm board renders and next-task chips appear for own tasks (activities RLS).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | none (no unit-test infra; lint broken under Next 16 — per CONCERNS) |
| Config file | none — validation via scripts, not a test framework (no Wave 0 framework install; matches project's established gates) |
| Quick run command | `npx tsc --noEmit` |
| Full suite command | `npm run build && tsx scripts/e2e-rayan.mts` (dev server or built server running) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEAL-01 | Card popover complete/schedule | manual (Playwright MCP) — needs authenticated pointer interaction | — | manual-only |
| DEAL-02 | Next-activity sort + Sort-by | unit-ish: comparator is a pure function; verify via tsc + manual board check | `npx tsc --noEmit` | ✅ |
| DEAL-03 | Rotting red cards | smoke: seed rot_days, walk board | `tsx scripts/e2e-rayan.mts` (extended) + manual | ❌ extend walk |
| DEAL-04 | Won/lost dialog + filters | e2e walk: `?status=won` route renders | `tsx scripts/e2e-rayan.mts` (extended) | ❌ extend walk |
| DEAL-05 | Three views render | e2e walk: `?view=list`, `?view=forecast` return 200 + signals | `tsx scripts/e2e-rayan.mts` (extended) | ❌ extend walk |
| DEAL-06 | 3-panel detail renders | e2e walk: deal detail URL + panel signals | `tsx scripts/e2e-rayan.mts` (extended) | ❌ extend walk |
| DEAL-07 | Filter bar params | e2e walk: filtered URLs return 200 | `tsx scripts/e2e-rayan.mts` (extended) | ❌ extend walk |
| — | Migration idempotency | integration: apply twice | `tsx scripts/apply-sql.mts` (x2) | ✅ |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit`
- **Per wave merge:** `npm run build` + `tsx scripts/e2e-rayan.mts`
- **Phase gate:** full build + extended route walk + Playwright MCP drag/popover/dialog walk before `/gsd:verify-work` (and before any prod deploy — no staging exists)

### Wave 0 Gaps
- [ ] Extend `scripts/e2e-rayan.mts` route list with the new view/filter/detail URLs (small edit, can land in plan 1 or 3)

## Plan split recommendation (3 plans)

1. **02-01 Data layer + board parity (kanban):** migration 0013 (columns, indexes, backfill, view, RPC touches) + schema.ts lockstep + `stageStatusPatch` centralization (fixes updateOpportunity status bug) + won_at/lost_at stamping + loader merge (`BoardOpportunity`: next_task + is_rotten) + card redesign (label chip, owner avatar, activity popover w/ shadcn popover install, rotten red) + next-activity sort + Sort-by dropdown + won/lost drop zones + reason dialog + board state-resync refactor + stage `rot_days` input in settings/pipelines. *Biggest plan; everything downstream depends on it.*
2. **02-02 Views:** `?view=` routing + `DealsFilterBar` (owner/label/status/pipeline in URL) + List view (new paginated server table, `.range()` 50/page) + Forecast view (month buckets, weighted headers, drag-to-re-date + `updateExpectedCloseDate` action) + extract shared `sumByCurrency`.
3. **02-03 Deal detail + polish:** 3-panel `[id]/page.tsx` (stage bar, left record panel, Composer/Focus/History), label in edit form, empty states, e2e walk extension, Playwright verification pass.

Dependency chain is strictly 1 → 2 and 1 → 3 (2 and 3 are parallelizable after 1).

## Common Pitfalls

1. **Board state desync (HIGH risk):** `PipelineBoard` never resyncs `useState(initialOpportunities)` from props. Popover/dialog actions + `revalidatePath` will silently show stale data without a resync + `router.refresh()`. Re-verify drag after the refactor — this is the one verified-working component being touched.
2. **`create or replace view` trap:** fails when the column list changes; apply-sql re-runs all files forever. Use `drop view if exists` + `create view` in 0013.
3. **`.in()` URL limit / 1,000-row cap:** solved by pipeline_id-in-view for the board; List view `.in()` is safe only because page size is 50 — keep it ≤100.
4. **`updateOpportunity` doesn't derive status from stage (existing bug):** must be fixed with the won_at work or timestamps drift from reality.
5. **Radix Select empty-string crash:** label filter "any", owner "all" need sentinels (D-043 outage precedent).
6. **Rep next-task blindness:** activities RLS hides other reps' tasks → missing chips on shared-visibility deals for reps. Expected behavior; document in plan so verification doesn't chase it.
7. **`revalidatePath` alone doesn't update client-held state** — pair every board-adjacent action with `router.refresh()` on the client side.
8. **Won/lost stage columns:** currently rendered but always empty (loader filters status=open). Removing them for drop zones is a fix, but Settings→Pipelines must still allow is_won/is_lost stages to exist (the status derivation depends on them).

## Open Questions

1. **Label palette values** — CONTEXT locks "fixed Pipedrive label palette" but teardown's open gap = exact hex values. Recommendation: use Phase 1 token palette equivalents (green/blue/red/yellow/purple/gray) with a `DEAL_LABELS` const in `lib/crm/labels.ts`; exact hexes are Claude's discretion per Phase 1 tokens.
2. **Forecast "Earlier/No date" bucket** — spec says current + next 5; deals with past/null close dates must live somewhere. Recommendation: one leading catch-all column (discretion, matches Pipedrive's behavior of showing overdue deals).
3. **Email-action rot resets** — service-role sync writers don't touch opportunities. Recommendation: accept gap now; note follow-up for the email phase.

## Sources

### Primary (HIGH confidence — read directly this session)
- `lib/crm/opportunities.ts`, `lib/crm/activities.ts`, `lib/crm/dashboard.ts` (loader patterns, SELECT strings, 500-cap)
- `components/crm/pipeline-board.tsx` (drag setup, stopPropagation, sumByCurrency, state seeding)
- `app/(dashboard)/opportunities/{page.tsx,actions.ts,[id]/page.tsx}` (routing, moveOpportunityStage, status derivation, detail layout)
- `app/(dashboard)/activities/actions.ts` + `supabase/migrations/0002_activity_rpcs.sql` (createTask/toggleTaskComplete + RPC bodies)
- `supabase/migrations/0001_rls_and_triggers.sql` (touch_updated_at trigger table list, tasks policies, `tasks_due_idx`), `0008_per_rep_ownership.sql` (activities SELECT policy), `0012_import_batches.sql` (idempotency pattern)
- `lib/db/schema.ts` (opportunities/pipeline_stages/activities/tasks definitions), `package.json` (dep versions), `components/ui/*` glob (popover missing; dialog/dropdown/avatar/tabs present)
- `.planning/codebase/CONCERNS.md`, `docs/research/pipedrive-teardown.md` (verified behavioral spec), `scripts/e2e-rayan.mts`

### Secondary (MEDIUM confidence)
- `security_invoker = true` on views (Postgres 15+, supported on Supabase; standard mechanism for RLS-respecting views) — training-data knowledge consistent with Supabase docs; verify trivially at migration time (apply-sql will error instantly if unsupported).

## Metadata

**Confidence breakdown:**
- Migration/schema design: HIGH — patterns copied from working migrations in-repo
- Next-activity/rotting queries: HIGH — indexes and RLS policies verified in-repo; view mechanism MEDIUM-HIGH (single external claim)
- View architecture / detail layout: HIGH for mechanics (all reused components read), MEDIUM for deal-detail layout fidelity (teardown open gap — mirroring lead panel per CONTEXT)

**Research date:** 2026-07-11
**Valid until:** ~2026-08-11 (internal codebase facts stable until Phase 2 executes)
