---
phase: 2
slug: deals-parity
status: draft
shadcn_initialized: true
preset: none (inherits Phase 1 token contract — no re-init)
created: 2026-07-11
---

# Phase 2 — UI Design Contract: Deals parity

> Visual and interaction contract for DEAL-01..07. Executor implements from this file without taste decisions.
> **Token rule: this phase introduces ZERO new color values.** Every color below references a Phase 1 token by
> NAME (`.planning/phases/01-pipedrive-design-system/01-UI-SPEC.md`, Sections 1–3). The Pipedrive label palette
> is already defined there (`--pd-label-{green|blue|red|yellow|purple|gray}-bg/fg`) — reuse, do not re-derive.
> Behavioral mechanics per verified teardown `docs/research/pipedrive-teardown.md` (rotting, kanban, forecast).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui (existing kit, Phase 1 re-skin applied) |
| Preset | not applicable — Phase 1 CSS-variable contract in `app/globals.css` |
| Component library | radix (consolidated `radix-ui`) |
| Icon library | lucide-react |
| Font | Inter (Phase 1), 14px root |

**Inherited wholesale from Phase 1 (do not restate in code):** spacing scale, type scale, radius (4px controls / 8px surfaces / full chips), elevation (`--pd-elevation-*`), table/badge/button/input/tabs/dialog styling deltas, dark-mode parity rule, color-role rule (green = primary/positive only, blue = links/selection/info, red = destructive/negative, yellow = warning).

**Spacing exceptions this phase:** none. Kanban column width `w-72` (288px) and detail side panels (320px / 288px) are layout widths, not spacing tokens.

---

## 1. Deal card (kanban) — replaces `OpportunityCard` in `components/crm/pipeline-board.tsx`

Card chrome per Phase 1: `bg-card`, 1px divider-medium border, radius 8px, `--pd-elevation-raised`, hover `--pd-elevation-raised-hover`. Drag state kept (`rotate-1 ring-1 ring-primary/40`, overlay). Padding `p-3`, vertical gap `space-y-1`.

Layout grid (4 rows):

| Row | Content | Spec |
|-----|---------|------|
| 1 | **Title link** | 14px / 600 / ink, `line-clamp-2`, hover underline. `<Link href={/opportunities/{id}}>` with `onPointerDown={e => e.stopPropagation()}` — KEEP (verified working with dnd-kit) |
| 2 | **Org line** | `{account.name}` 12px `text-[--pd-text-secondary]`, truncate; `—` if none |
| 3 | **Value + label chip** | Value 12px / 600 / ink, `tabular-nums`, `fmtMoney(amount, currency)`; label chip right-aligned on same row: pill `rounded-full h-5 px-2` 11px/600 using `--pd-label-{color}-bg` / `--pd-label-{color}-fg`. No chip when label null. (Expected-close date is REMOVED from the card — the activity icon carries scheduling state now) |
| 4 | **Bottom row** | Activity icon button LEFT, owner avatar RIGHT, `flex items-center justify-between`, `pt-1` |

**Owner avatar (bottom-right):** 20px circle (`size-5 rounded-full`), `bg-accent` fill, initials 10px/600 `text-[--pd-text-secondary]` (first letters of first+last name); `title={owner.full_name}` tooltip. Unassigned: dashed 1px divider-strong circle, `User` icon 12px `text-[--pd-text-muted]`.

**Activity icon states (bottom-left)** — 16px lucide icon inside a 24×24 hit target (`size-6 rounded-[4px] hover:bg-accent`), `aria-label` per state. Next activity = earliest open scheduled task (`due_at`) joined per deal (CONTEXT: no new column):

| State | Condition | Icon | Color token |
|-------|-----------|------|-------------|
| Overdue | next activity `due_at` < today | `CalendarClock` | `--pd-negative` |
| Today | due today | `Calendar` | `--pd-positive` |
| Scheduled | due in future | `Calendar` | `--pd-text-secondary` (gray) |
| None | no open activity | `AlertTriangle` | `--pd-warning` (Pipedrive's yellow warning) |

Icon shows a 11px date suffix next to it (`text-[--pd-text-muted]`, e.g. `Jul 14`; overdue dates render `text-[--pd-negative-strong]`). No suffix in the "none" state.

**Activity popover (click icon, complete-or-schedule without opening deal):** shadcn Popover, `--pd-elevation-floating`, radius 8px, `w-72`, `onPointerDown` stopPropagation on trigger.
- Has next activity → header: activity subject 14px/600 + due date 12px (state color); buttons row: `Mark as done` (primary, h-8) + `Schedule next` (outline, h-8).
- No activity → inline schedule form: subject Input, date picker, `Schedule activity` primary button. Submits via existing task-create action.
- Completing/scheduling refreshes card state optimistically; errors via `toast.error` (existing pattern).

---

## 2. Rotten card treatment

Per verified rotting spec (per-stage `rot_days`, red tile). Applied when stage `rot_days` set AND `now - last-update > rot_days` (reset/heal rules per CONTEXT — not a UI concern beyond rendering):

| Property | Spec |
|----------|------|
| Background | `--pd-negative-bg-light` (`#fef2f0` light / `#4c0000` dark — via token only) |
| Left bar | 3px inset bar `--pd-negative` (implement as `border-l-[3px] border-l-[--pd-negative]`; keep 8px radius) |
| Border (other 3 sides) | stays divider-medium — the tint + left bar carry the signal, per Pipedrive's subtle red tile |
| Text | unchanged (ink/secondary tokens pass AA on the pale tint) |
| Tooltip | on card hover, `title="Rotten — no activity for {n} days"` |
| Drag state | rotting treatment persists while dragging |

Rotten styling composes with everything above (label chip, activity icon states unchanged).

---

## 3. Kanban column header

Container: column stays `w-72 shrink-0 bg-secondary rounded-lg border` (divider-medium); header `px-3 py-2 border-b`, two lines:

| Line | Content | Spec |
|------|---------|------|
| 1 | Stage name + probability | Name 14px/600 ink, truncate; probability suffix 12px `text-[--pd-text-muted]` (`40%`) — hidden when 0/100 or won/lost flags |
| 2 | Count · sum (+ rotting) | `{n} deals · {sumByCurrency}` 12px `text-[--pd-text-secondary]`, `tabular-nums`; **if any rotten in stage**, append ` · ` + rotting segment: `AlertTriangle` 12px + `{r} rotten`, both `text-[--pd-negative-strong]` |

Drop-target highlight kept: `border-primary/50 bg-accent`. Empty column: dashed placeholder box, copy `No deals` 11px `text-[--pd-text-muted]`. Won/lost stages no longer render as board columns (closed deals leave the board — Section 8 chips reach them).

**In-column ordering:** default = next activity ascending, overdue first, no-activity last; tiebreak `created_at` DESC (newest first). Overridden by Sort-by (Section 8).

---

## 4. View switcher (Kanban | List | Forecast)

Placement: **page header row, left cluster** — order left→right: `+ Deal` button (Section 10), then view switcher, then page title context; filter bar occupies the right side (Section 8). Driven by URL param `?view=kanban|list|forecast` (default `kanban`), preserved alongside `?pipeline=`.

Segmented control (icon-only, Pipedrive style):

| Property | Spec |
|----------|------|
| Container | `inline-flex rounded-[4px] border` (divider-medium), `bg-card`, segments separated by 1px divider-light |
| Segment | `h-8 w-9 grid place-items-center`, icon 16px |
| Icons | Kanban `Columns3` · List `List` · Forecast `ChartNoAxesColumn` |
| Active | `bg-accent`, icon ink (`--foreground`) |
| Inactive | icon `--pd-text-secondary`, hover `bg-secondary` |
| A11y | `aria-label="Kanban view" / "List view" / "Forecast view"`; tooltip with same text |

---

## 5. List view (table)

Table styling per Phase 1 (header `bg-secondary` 12px/600 sentence-case, white rows, row `border-b` divider-medium, hover `bg-secondary`, selected `bg-[--pd-info-bg-light]`, `py-2 text-sm` density). Wrapped in card surface (`rounded-md border overflow-hidden`).

**Default columns (left→right):**

| Column | Cell spec |
|--------|-----------|
| ☑ (w-8) | row checkbox |
| Title | link 14px/600 → `/opportunities/{id}`, hover underline |
| Organization | 14px, link to account, `text-[--pd-link]` colors |
| Value | 14px `tabular-nums`, right-aligned, `fmtMoney` |
| Label | chip per Section 1 (`--pd-label-*` pair) or `—` |
| Stage | stage name 12px `text-[--pd-text-secondary]` |
| Next activity | date 12px, colored per Section 1 state table (overdue `--pd-negative-strong`, today `--pd-positive-strong`, future secondary, none = `AlertTriangle` 14px `--pd-warning`) |
| Expected close | date 12px secondary, `MMM d, yyyy` |
| Owner | full name 12px secondary |

Optional columns (via gear picker): Status, Created, Updated, Won/Lost reason, Currency, Probability, Source.

**Sortable headers:** every column except ☑ and Label; click toggles asc→desc→asc; active sort shows `ArrowUp`/`ArrowDown` 12px next to header text (icon `--pd-text-secondary`). Default sort: Next activity asc (parity with board).

**Gear column picker:** `Settings2` 16px ghost icon-button pinned at the far right of the header row; opens Popover (`--pd-elevation-floating`, `w-56`): checkbox list of all columns (14px rows, h-8), footer `Reset to default` as 12px link (`--pd-link`). Selection persists in `localStorage` (per-user, this phase).

**Bulk-select toolbar (D-044 pattern — `components/crm/import-batch-rows-table.tsx`):** header checkbox selects all rows on current page. When `selected.size > 0`, a toolbar row renders above the table: left `"{n} selected"` 12px `text-[--pd-text-muted]`; right buttons — `Bulk edit` (outline sm, `Pencil` 14px → dialog with only-changed-fields-apply pattern: Owner Select / Label Select / Stage Select, `— Keep current —` sentinels per D-043 Radix rule), `Delete selected` (outline sm, `text-destructive`, `Trash2` 14px, confirm dialog per copy contract), `Clear` (ghost sm). Actions disabled while pending.

**Pagination (CONTEXT concern):** 50 rows/page; footer row `px-3 py-2`: left `"{from}–{to} of {total}"` 12px muted, right `Previous`/`Next` outline sm buttons.

---

## 6. Forecast view

Kanban-of-date-buckets on `expected_close_date`; WON deals bucket on `won_at` instead. Default: monthly buckets, current month first, 6 columns visible, horizontal scroll (`flex gap-3 overflow-x-auto`). Deals with no expected close date collect in a leading `No close date` column (not draggable-into).

**Column:** same chrome as Section 3 (`w-72 bg-secondary rounded-lg border`). Header `px-3 py-2 border-b`, **3-line totals**:

| Line | Content | Spec |
|------|---------|------|
| 1 | Bucket label | `July 2026` 14px/600 ink (current month suffixed `· this month` 11px muted) |
| 2 | Won / Open split | `Won {sum}` `text-[--pd-positive-strong]` · `Open {sum}` `text-[--pd-text-secondary]` — both 12px `tabular-nums` |
| 3 | Combined | `Total {sum}` 12px/600 ink, `tabular-nums` — when stage probabilities set, open portion is weighted and line 3 reads `Weighted {sum}` |

**Cards:** identical to Section 1 deal card. Won deals additionally get `--pd-positive-bg-light` background + 3px left bar `--pd-positive` (mirror of rotten treatment in green) and are **not draggable**. Rotten treatment does not apply in forecast view.

**Gear menu (view-level, right end of filter bar, only in forecast view):** `Settings2` ghost icon-button → DropdownMenu (`--pd-elevation-floating`) with two radio groups:
- `Show by` — `Expected close date` (only option this phase; custom date fields arrive Phase 4, render group anyway)
- `Arrange by` — `Next activity` (default) / `Deal value` / `Expected close date` / `Owner`
Group labels 11px/600 uppercase `text-[--pd-text-muted]` (Phase 1 caption style).

**Drag-to-re-date:** dropping an open deal on another bucket rewrites `expected_close_date` to the **last day of the target month**, optimistic update + `toast.success("Expected close moved to {MMM yyyy}")`, rollback + `toast.error` on failure (same pattern as `moveOpportunityStage`).

---

## 7. Won / Lost reason dialog

Triggered by: dragging a card onto a won/lost stage, or the `Won` / `Lost` buttons on deal detail (Section 9). shadcn Dialog, radius 8px, `--pd-elevation-overlay`, `max-w-md`.

| Variant | Spec |
|---------|------|
| **Won** | Title `Mark as won`; description = deal name 13px secondary. Optional field: `Won reason` Input (free text, placeholder `e.g. Best fit for their program`). Footer: `Cancel` ghost + `Mark as won` **primary green** |
| **Lost** | Title `Mark as lost`; description = deal name. Required field: `Lost reason` Select — options: `No budget` / `Lost to competitor` / `Went cold — no response` / `Bad timing` / `Not a fit` / `Other`; when `Other`, a `Comment` Textarea appears (required). Footer: `Cancel` ghost + `Mark as lost` **destructive red**; confirm disabled until reason chosen |

Writes `won_reason`/`lost_reason` + `won_at`/`lost_at` (migration 0013). **Cancel/ESC on a drag-triggered dialog snaps the card back to its original stage** (no partial state). Closed deal leaves the board; toast `Deal marked as won` / `Deal marked as lost`.

---

## 8. Filter bar

Placement: page header row, **right cluster** (wraps below on narrow screens: `flex flex-wrap gap-2`). Order left→right:

| Control | Spec |
|---------|------|
| **Owner Select** | h-8 w-40, value `all` sentinel = `Everyone` (default); options: `Everyone`, then each user's full name. Replaces the old `Mine only` toggle (delete it) |
| **Label Select** | h-8 w-36, sentinel `all` = `All labels`; each option renders 8px color dot (`bg-[--pd-label-{color}-bg]` ring 1px `--pd-label-{color}-fg`) + label name |
| **Won / Lost chips** | two toggle pills `rounded-full h-7 px-3` 12px/600. Off: transparent bg, divider-strong border, `--pd-text-secondary`. `Won` active: `--pd-positive-bg` bg / `--pd-positive-strong` text. `Lost` active: `--pd-negative-bg` bg / `--pd-negative-strong` text. Active chip switches the view to closed deals of that status (board columns show them in their final stage; list/forecast filter rows). Mutually exclusive; clicking active chip returns to open deals |
| **Sort by Select** | h-8 w-44, kanban view only; prefix label inside trigger `Sort:`; options `Next activity` (default) / `Deal value` / `Expected close date` / `Owner` |
| **Pipeline switcher** | KEEP existing segmented link control exactly as-is (`?pipeline=` links), restyled only by Phase 1 tokens |
| **Forecast gear** | Section 6, forecast view only |

The open/weighted summary line (`{sum} open · {sum} weighted forecast`) moves to a 12px muted line directly under the page title.

---

## 9. Deal detail — 3-panel layout (`app/(dashboard)/opportunities/[id]/page.tsx`)

Page header (full width, above panels): org line (account link · pipeline, 12px secondary) → title 21px/400 (Phase 1 Title XL) → right-aligned actions: `Won` button (primary green, only while open), `Lost` button (outline, `text-destructive`, only while open) — both open Section 7 dialog — plus existing `Send invoice` and `Edit` (outline). Status badge next to title when closed (won = `--pd-positive-bg`/`--pd-positive-strong` chip incl. reason tooltip; lost = negative pair).

Below header: **stage stepper** — full-width chevron strip of the pipeline's open stages, h-8; past+current segments filled `--primary` white text, future `bg-secondary` `text-[--pd-text-secondary]`; segments clickable → `moveOpportunityStage` (won/lost stages excluded; use header buttons). 12px/600 labels, truncate.

Grid: `grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_288px]` — stacks to single column below `xl` (left, center, right order).

| Panel | Content |
|-------|---------|
| **Left — Summary/fields (320px)** | Card `bg-card border rounded-lg`. Top block: value 21px/400 `tabular-nums` + weighted value 12px muted underneath. Field list (rows: label 11px/600 uppercase `--pd-text-muted`, value 14px ink): Label (chip), Probability, Expected close date, Owner, Source, Created / Updated (12px muted). Section divider (divider-light) between blocks |
| **Center — Tabs + composer** | Tabs (Phase 1 underline style): `Notes` / `Activity` / `Timeline`. Notes tab → `NoteComposer` card + past notes; Activity tab → `TaskComposer` + open/done activities; Timeline tab → existing `ActivityTimeline` (everything merged). Composer always at top of its tab. `LineItemsEditor` card renders below the tab area (unchanged component) |
| **Right — Widgets (288px)** | Three stacked cards, each: header 14px/600 (Title M) + optional header action. **Person**: primary contact name (link), email (`--pd-link`), phone; empty → `No contact linked` 12px muted + `Link contact` 12px link. **Organization**: account name (link), country, type. **Details**: status, pipeline/stage, currency, next activity (state-colored per Section 1), rotten indicator if rotting (`AlertTriangle` + `Rotten for {n} days` 12px `--pd-negative-strong`) |

---

## 10. "+ Deal" button

| Property | Spec |
|----------|------|
| Placement | deals page header, **far left** (before view switcher) — Pipedrive position |
| Style | Phase 1 primary button: `bg-primary` (green-600 token) white text, h-8, radius 4px, 14px/600, `--pd-elevation-button`, hover/active per Phase 1 (`#077838`/`#00672a` via tokens) |
| Label | `Plus` icon 16px + `Deal` → renders as **`+ Deal`** (deliberate Pipedrive-parity exception to the verb+noun CTA pattern; recorded in copy contract) |
| Action | routes to existing `/opportunities/new?pipeline={slug}` — replaces the current right-side `New opportunity` button (remove it) |

---

## Label palette (reference — Phase 1 tokens, by name)

Fixed six-label set for `opportunities.label` (stores the color key; display names mapped in `lib/crm/labels.ts` — Claude's-discretion naming):

| Stored key | Display name | Chip tokens |
|-----------|--------------|-------------|
| `red` | Hot | `--pd-label-red-bg` / `--pd-label-red-fg` |
| `yellow` | Warm | `--pd-label-yellow-bg` / `--pd-label-yellow-fg` |
| `blue` | Cold | `--pd-label-blue-bg` / `--pd-label-blue-fg` |
| `green` | Qualified | `--pd-label-green-bg` / `--pd-label-green-fg` |
| `purple` | Priority | `--pd-label-purple-bg` / `--pd-label-purple-fg` |
| `gray` | On hold | `--pd-label-gray-bg` / `--pd-label-gray-fg` |

Dark-mode pairs already covered by Phase 1 (`dark-{color}-200` bg / `dark-{color}-800` fg). Full label management UI is Phase 4 — this set is fixed for now.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA (deals page) | `+ Deal` (Pipedrive-parity exception; all other CTAs stay verb+noun) |
| Activity popover actions | `Mark as done` / `Schedule next` / `Schedule activity` |
| Won dialog | title `Mark as won`, confirm `Mark as won`, optional field label `Won reason` |
| Lost dialog | title `Mark as lost`, confirm `Mark as lost`, required field label `Lost reason` |
| Won/lost toasts | `Deal marked as won` / `Deal marked as lost` |
| Forecast re-date toast | `Expected close moved to {MMM yyyy}` |
| Empty column (kanban/forecast) | `No deals` |
| Empty list view | heading `No deals yet`, body `Create your first deal to start tracking your pipeline.` + `+ Deal` button |
| Bulk delete confirm | title `Delete {n} deals`, body `This can't be undone from the list view.`, confirm `Delete {n} deals` on `--destructive` |
| Rotten tooltip | `Rotten — no activity for {n} days` |
| Filter defaults | `Everyone` / `All labels` / `Sort: Next activity` |

Errors: existing `toast.error(message)` pattern; optimistic UI rolls back on failure (board pattern kept).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official (existing kit) | Popover, DropdownMenu, Dialog, Select, Table, Tabs, Checkbox — all already in `components/ui/*` | not required (no new installs) |
| third-party | none | not applicable |

---

## Reviewer quality checklist (6 pillars)

1. **Hierarchy** — one green element per view (`+ Deal`; primary dialog confirms excepted); card title > org > meta; column headers 2-line, forecast 3-line with combined total emphasized.
2. **Contrast** — all state colors use `-strong` variants for text (`--pd-negative-strong` etc. ≥ AA); rotten/won tints keep ink text; muted 11–12px meta only.
3. **Consistency** — zero hardcoded hexes (tokens by name); activity states red/green/gray/yellow identical across card, list column, and detail widget; rotten (red) and forecast-won (green) use mirrored left-bar + bg-light treatment.
4. **Density** — 14px root, h-8 controls, `py-2` rows, `p-3` cards, `w-72` columns preserved.
5. **Dark mode** — no new vars needed; verify label chips, rotten tint, won tint, chip toggles in `.dark`.
6. **No-regression** — dnd-kit drag + title-link stopPropagation intact; pipeline switcher URLs unchanged; list view paginates at 50; Radix Selects use sentinels (D-043); e2e walk gains kanban/list/forecast + won-lost dialog coverage.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
