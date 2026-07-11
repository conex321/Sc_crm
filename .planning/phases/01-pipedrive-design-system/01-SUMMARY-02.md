---
phase: 01-pipedrive-design-system
plan: 02
status: complete
completed: 2026-07-11
requirements: [DSGN-04, DSGN-05]
commits:
  - e61345b feat(01-02): Pipedrive component deltas on the shadcn kit
  - 546cc50 feat(01-02): sweep hardcoded palette classes onto pd-* semantic tokens
  - 1923089 feat(01-02): shared CAD-default money formatter in lib/format.ts
key-files:
  created:
    - lib/format.ts
  modified:
    - components/ui/{button,badge,card,table,tabs,input,select,textarea,dropdown-menu,dialog}.tsx
    - components/crm/{customer-status-badge,import-wizard,pipeline-board,opportunity-list,document-list,line-items-editor}.tsx
    - app/(dashboard)/{dashboard,campaigns}/page.tsx
    - app/(auth)/login/page.tsx
    - app/(dashboard)/settings/{integrations,catalog}/page.tsx
    - app/(dashboard)/settings/catalog/packages/[id]/edit/page.tsx
    - app/(dashboard)/opportunities/[id]/page.tsx
    - lib/crm/dashboard.ts
---

# Phase 1 Plan 02: Component sweep + CAD formatter + verification gate — Execution Summary

**One-liner:** Shadcn kit restyled to UI-SPEC Section 5 (4px controls, pill badges, gray table headers, underline tabs, shadowless cards), all six hardcoded-palette files swept onto `pd-*` semantic tokens (dark parity free via vars), and money rendering consolidated into `lib/format.ts` (CAD default, per-row currency, all six legacy USD sites deleted) — tsc/build green, 19/19 e2e routes, zero palette-class and zero out-of-lib `en-US` greps.

## Tasks completed

### Task 1 — Component styling deltas on the shadcn kit (`e61345b`)

ClassNames-only inside existing variant strings; zero API/prop/structure changes; all consumers compile untouched.

- **button.tsx**: base `rounded-[4px]` (also in xs/sm/lg/icon-xs sizes), `font-semibold`, focus ring `ring-ring/40`. `default`: `shadow-pd-button hover:bg-[var(--pd-primary-hover)] active:bg-[var(--pd-primary-active)]`. `destructive`: `hover:bg-[#c82627] active:bg-[#b21019]` (spec'd literal exception — pd vars not exposed; solid `--destructive` in dark, `dark:bg-destructive/60` removed). `outline`: `bg-card border-[var(--input)] hover:bg-secondary active:bg-accent`. `ghost`: `hover:bg-accent`. Heights untouched (h-9 default / h-8 sm).
- **badge.tsx**: pill base `h-5 px-2 text-xs font-semibold` (py-0.5 dropped); `outline` variant text → `text-pd-text-secondary` with `border-border` (no `--pd-divider-strong` var exists — plan's sanctioned fallback).
- **card.tsx**: `rounded-lg` (8px) border bg-card, default `shadow-sm` removed.
- **table.tsx**: TableHeader `bg-secondary`; TableHead `text-xs font-semibold text-pd-text-secondary` (sentence case kept); TableRow hover `bg-secondary`, selected `bg-pd-info-bg-light`; `py-2 text-sm` density untouched.
- **tabs.tsx**: default variant now underline style — list `gap-4 rounded-none border-b border-border bg-transparent p-0`; trigger `border-b-2 border-transparent px-0 pb-2 text-sm font-semibold text-pd-text-secondary`, active `border-primary text-foreground shadow-none`.
- **input/select/textarea**: `bg-card border-input rounded-[4px] h-8` (textarea auto-height; select trigger both sizes h-8), `placeholder:text-pd-text-muted`, focus `border-pd-info + ring-[3px] ring-ring/25`, `shadow-xs` and `dark:bg-input/*` dropped (vars flip).
- **Overlays** (plan-invited trivial swap): dropdown/select menus → `shadow-pd-floating`; dialog content → `bg-popover shadow-pd-overlay`. Sonner restyle skipped — `richColors` acceptable per spec tolerance.

### Task 2 — Hardcoded-color sweep, six files (`546cc50`)

Banner pattern used consistently: `border-pd-{tone}-bg bg-pd-{tone}-bg-light text-pd-{tone}-strong`; all paired `dark:` palette classes deleted (tokens flip automatically).

| File | Swap |
|---|---|
| `customer-status-badge.tsx` | emerald/amber/slate → `bg-pd-label-{green,yellow,gray}-bg/fg` pairs |
| `import-wizard.tsx` | amber banner + amber text → warning pattern; emerald check icon → `text-pd-positive` |
| `dashboard/page.tsx` | sky banner → info; red chip → negative; amber chip → warning (+`hover:bg-pd-warning-bg`); overdue text → `text-pd-negative-strong` |
| `campaigns/page.tsx` | amber banner → warning; code chip → `bg-pd-warning-bg` |
| `login/page.tsx` | amber "deactivated" banner → warning pattern |
| `settings/integrations/page.tsx` | emerald "Connected" banner → positive pattern |
| `pipeline-board.tsx` | classNames ONLY: kanban cards `shadow-pd-raised hover:shadow-pd-raised-hover` (drag state on raised-hover), columns `bg-secondary` / drag-over `bg-accent`. DndContext/sensors/handlers untouched |

`grep -rE "(amber|emerald|sky|slate)-[0-9]" app components` → **zero hits**; `red-[0-9]` also zero.

### Task 3 — Shared CAD formatter (`1923089`)

- New `lib/format.ts`: `fmtMoney(amount, currency = "CAD")` (locale follows currency, `maximumFractionDigits: 0`, lifted verbatim from pipeline-board) + `fmtCad`.
- `pipeline-board.tsx`: local `fmtMoney` deleted → `import { fmtMoney } from "@/lib/format"` (`sumByCurrency` stays local).
- `lib/crm/dashboard.ts`: local `fmtCad` replaced with `export { fmtCad } from "@/lib/format"` — dashboard page import unchanged.
- All SIX legacy `en-US`/USD sites swept:

| Site | Call now |
|---|---|
| `components/crm/opportunity-list.tsx` | `fmtMoney(amount, o.currency)` |
| `components/crm/document-list.tsx` | `fmtCad` (DocumentRow has no currency) |
| `components/crm/line-items-editor.tsx` | `fmtCad` (LineItem carries no currency; adding a prop = API change, out of scope) |
| `app/(dashboard)/opportunities/[id]/page.tsx` | `fmtMoney(amount, opp.currency)` — kept the existing " · {CUR}" suffix (see deviation 5) |
| `app/(dashboard)/settings/catalog/page.tsx` | `fmtMoney(price, p.currency)` / `fmtMoney(price, pkg.currency)` |
| `.../catalog/packages/[id]/edit/page.tsx` | `fmtCad` (queries don't select currency) |

- `tabular-nums` added to all money cells touched. `grep -rn "en-US" app components lib` → only `lib/format.ts`. USD **data defaults** (opportunity-form, product-form, zod schemas, DB columns) untouched.

### Task 4 — Verification gate (local)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | green (after every task) |
| `npm run build` | green (run BEFORE dev server, per wave-1 Turbopack lesson) |
| `npx tsx scripts/e2e-rayan.mts` (dev :3117) | **19/19 routes ok** — no copy reworded, all body regexes intact |
| Palette grep | zero `(amber|emerald|sky|slate|red)-N` class hits in app/ + components/ |
| Formatter grep | `en-US` only in lib/format.ts |
| Compiled CSS (served, dev) | `.rounded-\[4px\]`, `.shadow-pd-{raised,floating,overlay}`, `.bg-pd-label-*`, `.bg-pd-*-bg-light`, `.text-pd-*`, `.tabular-nums` all present; `--pd-*` vars in both `:root` and `.dark` |
| SSR markup (authenticated fetch) | /accounts: gray header + hover + compact rows; /accounts/new: 4px h-8 inputs + `focus-visible:border-pd-info`; /dashboard: info banner on tokens; /login?reason=inactive: warning banner on tokens; no legacy palette classes anywhere |

Dev server killed after the walk.

## Deviations from plan

1. **[Spec-driven] Button `link` variant** `text-primary` (green) → `text-pd-link hover:text-pd-link-hover` — UI-SPEC hard rule "never green links"; not in the plan's Task 1 list.
2. **[Spec-driven] Dialog content** `bg-background` → `bg-popover` (UI-SPEC Section 5 overlay surface) alongside the plan-invited shadow swap; light dialogs were about to render gray (#f5f5f6) instead of white.
3. **[Implementation choice] Tabs underline** uses always-on `border-b-2 border-transparent` with active `border-primary` instead of active-only `border-b-2` — same look, no 2px layout shift between states. The unused `line` variant's `after:`-indicator machinery was removed (variant prop/API kept; zero consumers — only `accounts/[id]` uses default).
4. **[Stale research] import-wizard progress bar** was already `bg-primary` — no `bg-emerald-500` bar exists (RESEARCH Finding 2 stale); only the emerald check icon needed sweeping.
5. **[Behavior note] CAD renders as plain `$`, not `CA$`.** `Intl.NumberFormat("en-CA", { currency: "CAD" })` outputs `$1,234` (CA$ only appears when formatting CAD under en-US). The plan's verify text ("show CA$") doesn't match the blessed pipeline-board formatter the same plan mandates lifting verbatim — formatter behavior kept identical per the harder rule. Consequence: CAD and USD both show bare `$` in lists (pre-existing pipeline-board behavior); the opportunity detail page therefore KEEPS its ` · {currency}` suffix as the disambiguator.
6. **[Banner border choice]** `border-pd-{tone}-bg` (medium tint) used consistently across all six banner/chip surfaces (recorded per plan instruction).
7. **[Env constraint] Data-empty surfaces:** this environment's DB has zero open opportunities (kanban renders empty columns; `$0 open · $0 weighted` header confirmed) and zero catalog products — so kanban-card elevation, money cells, and drag-drop could not be visually confirmed here. Moved to the orchestrator checklist below.

## Orchestrator visual checklist (Playwright items not clickable by this executor)

Light theme, then re-eyeball (a)–(d) + one banner in Dark via the user-menu toggle:

- [ ] a. `/opportunities` kanban — **create a test opportunity first (board is currently empty)**, then DRAG it between stages; confirm optimistic move + persisted stage after reload + toast; card shows `shadow-pd-raised`, lifts on hover. Highest-risk check (dnd-kit untouched, but verify).
- [ ] b. `/dashboard` — KPI cards, info (Connect Gmail) / negative (overdue) / warning (unmatched) surfaces on tokens, charts on `--chart-*`.
- [ ] c. `/accounts` — 5.5k-row table density unchanged, gray header, row hover, status filter.
- [ ] d. `/accounts/[id]` — tabs now underline-style (Activity/Contacts/Opportunities/Documents), TaskComposer/NoteComposer, customer-status badge (open one of the 72 customer-book accounts via the status filter — page-1 leads have no status).
- [ ] e. `/accounts/import` — warning banners, progress bar (bg-primary green).
- [ ] f. Top bar: quick-add all four entries navigate; search opens ⌘K; sidebar collapse; footer `Phase 1 · {sha}`.
- [ ] g. `/login?reason=inactive` — warning banner on tokens.
- [ ] h. One form page (`/accounts/new`) — dialog/select overlays (`shadow-pd-floating`/`shadow-pd-overlay`, white in light), blue focus borders + rings, 4px radius, h-8 controls.
- [ ] i. Dark toggle: no white flashes, chips legible, nav active tint visible; toggle back.
- [ ] Deploy: `npx vercel --prod --yes`, then re-run e2e against `https://sc-crm-sand.vercel.app`.

## Roadmap-wording deviations to record (per UI-SPEC — intentional, not gaps)

1. **Quick-add lacks Lead / Person / Organization entries until Phases 3–4.** Current entries are New deal / New account / New contact / New activity (existing creatables only, per CONTEXT discretion).
2. **Nav gains Leads / People / Orgs / Mail / Insights entries in their own phases (3–6).** UI-SPEC explicitly forbids placeholder nav items this phase ("Do NOT add Leads/People/Orgs/Mail/Insights placeholders").

## Flag for Matthew (RESEARCH Open Question 2)

**USD data defaults still write USD.** `opportunity-form.tsx:178`, `product-form.tsx:82`, zod schemas (`opportunities/actions.ts`, `catalog/actions.ts`), `opportunities/new/page.tsx`, and DB column defaults (`lib/db/schema.ts:183,471,483`) all default new records to `"USD"`. CAD is the house currency, so new deals/products created without touching the currency field will be USD-labeled. Flipping these changes written data (not rendering) and was explicitly out of scope — decision needed: flip form/schema/DB defaults to CAD?

## Known stubs (pre-existing, intentional)

- Global search CommandDialog: "Search isn't wired yet" — Phase 4.
- Quick-add New contact / New activity route to `/accounts` / `/dashboard` (locked minimal option a).
- No new stubs introduced by this plan; no hardcoded-empty values or placeholder copy added.

## Self-Check: PASSED

- Files exist: `lib/format.ts` present; all 10 `components/ui/*` + 6 swept feature files + 6 formatter call sites modified on disk.
- Commits exist on `feat/mailshake-activation`: `e61345b`, `546cc50`, `1923089` — verified via `git log`.
- Working tree: no stray artifacts from this plan (temp spot-check scripts deleted; only pre-existing unrelated modifications remain).
