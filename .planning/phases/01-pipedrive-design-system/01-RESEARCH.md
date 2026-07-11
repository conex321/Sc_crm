# Phase 1: Pipedrive design system - Research

**Researched:** 2026-07-11
**Domain:** Tailwind v4 design tokens / shadcn theming / Next.js 16 app-shell restyle
**Confidence:** HIGH (token mechanics verified against tailwindcss.com docs; blast radius verified by grep; palette values MEDIUM pending sampling)

## Summary

The repo is already in the ideal starting position for a token-driven reskin: every `components/ui/*` primitive consumes shadcn CSS variables that are bridged into Tailwind via an existing `@theme inline` block in `app/globals.css`, and almost all feature code uses semantic utilities (`bg-primary`, `text-muted-foreground`, `border`). The Pipedrive three-layer token system (base scales → semantic groups → components) maps directly onto this: add static `pd-*` base scales in a plain `@theme` block, re-point the existing `:root`/`.dark` semantic variables at those scales, and extend the `@theme inline` bridge with a handful of new semantic tokens (`link`, `positive`, `warning`, `info` + tint variants). ~90% of the app re-skins automatically; exactly **6 files** hardcode palette classes (amber/emerald/sky/red/slate banners and status chips) and need manual swaps to the new semantic utilities.

Two surprises matter for planning. First, **dark mode is currently unreachable at runtime**: `next-themes` is installed and a full `.dark` variable block exists, but no `ThemeProvider` wraps the app and nothing ever applies the `.dark` class — every `dark:` utility in the codebase is dead code in the running product. "Dark mode must keep working" therefore means keeping the `.dark` token block coherent, and the cheapest way to make it *verifiable* is to wire the (already-installed) ThemeProvider + a toggle in the user menu. Second, the CAD sweep is bigger than the context states: **six** legacy USD `Intl.NumberFormat` sites exist, not four (add `components/crm/line-items-editor.tsx` and `app/(dashboard)/settings/catalog/packages/[id]/edit/page.tsx`).

**Primary recommendation:** Split into PLAN-01 (tokens + dark-mode wiring + shell: top bar, quick-add, sidebar) and PLAN-02 (hardcoded-color sweep + CAD formatter consolidation into `lib/format.ts` + full regression pass + deploy).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Locked by Matthew (2026-07-11):**
- FULL Pipedrive look — their visual language (white surfaces, Pipedrive-green primary, gray ink hierarchy), SchoolConex logo/name kept.
- Compact data density preserved (14px root, text-xs/sm patterns stay).
- Dark mode must keep working.

**From verified research (docs/research/pipedrive-teardown.md — build to spec):**
- Token architecture: base numeric shade scales (0–800 per color, contrast-matched) → semantic groups Surface / Fill / Divider / Text / Icon / Primary / Secondary / Active / Negative / Warning / Positive / Info → components. $primary-default aliases green-600.
- Exact hex values: sample from Pipedrive's Figma Community files (figma.com/@pipedrive) and/or the live app's CSS custom properties during this phase. If unreachable, derive a faithful palette from public Pipedrive screenshots (their green ≈ #017737 family for primary actions on white) and document the source.

### Claude's Discretion
- Mapping strategy from semantic tokens onto the existing shadcn CSS variables (keep shadcn component API; swap variable values + add pd-* tokens as needed).
- Nav structure details (grouping/order) so long as it reads Pipedrive-fashion and existing routes keep working; new nav slots for Leads/People/Orgs/Mail/Insights may point at existing or placeholder targets ONLY if they don't confuse (prefer adding nav items in the phases that ship those routes).
- Quick-add "+" menu wiring: entries for existing creatables now (Deal/Account/Contact/Activity); Lead/Person/Org entries land with their phases.

### Deferred Ideas (OUT OF SCOPE)
- Leads/People/Orgs/Mail/Insights routes + nav entries — Phases 3-6.
- Stage-colored kanban columns + label chips on cards — Phase 2 (tokens for them land now).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DSGN-01 | Three-layer token system in Tailwind v4 | Finding 1: verified `@theme` vs `@theme inline` semantics; concrete layering recipe below |
| DSGN-02 | Top bar with global search + green "+" quick-add | Finding 3: top-bar.tsx is a 17-line server component; GlobalSearchTrigger field already renders; quick-add via existing dropdown-menu.tsx |
| DSGN-03 | Pipedrive-fashion left nav | Finding 3: app-sidebar.tsx nav arrays are data-driven; keep components/ui/sidebar.tsx primitives (theme via --sidebar* vars) |
| DSGN-04 | Coherent re-skin of all existing screens | Finding 2: 6 files with hardcoded palette classes; everything else re-skins via variables |
| DSGN-05 | CAD formatter sweep | Finding 4: 6 legacy USD sites + shared `lib/format.ts` proposal |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Compact density is intentional and locked: 14px root, `text-xs`/`text-sm`, `size="sm"` buttons — the reskin must not inflate it (CONCERNS.md).
- `NEXT_PUBLIC_*` env vars are baked at build time (footer SHA uses one — keep working).
- Verification gates: `npx tsc --noEmit` + `npm run build` + `npx tsx scripts/e2e-rayan.mts` + Playwright. **`npm run lint` is broken** (Next 16) — never a gate. No unit-test infra.
- No staging — `npx vercel --prod --yes` goes straight to the live domain; verify locally first.
- Commit/push only when Matthew asks (GSD orchestrator handles doc commits per config).
- RLS rule (unlikely to matter here, but hard): Drizzle `db` = crons only; Supabase `sb` = all user-facing code. Any new server action for quick-add account search must use `sb`.
- Radix Select: never `<SelectItem value="">` — sentinel values only.

## Findings

### Finding 1 — Tailwind v4 token strategy (DSGN-01) [HIGH confidence]

**How the repo works today (verified in `app/globals.css`):**
- `@theme inline { --color-primary: var(--primary); ... }` bridges shadcn variables into Tailwind utilities.
- `:root { --primary: oklch(...) }` and `.dark { --primary: oklch(...) }` hold the actual values (currently the stock neutral shadcn palette — near-black primary).
- Dark variant: `@custom-variant dark (&:is(.dark *))` — **class strategy**, requires `.dark` on an ancestor.
- Radius tokens derive from `--radius: 0.5rem`.

**Verified doc semantics (tailwindcss.com/docs/theme, fetched 2026-07-11):**
- Plain `@theme { --color-mint-500: oklch(...) }` with a **literal value** both generates utilities (`bg-mint-500`, `text-mint-500`, …) and emits the CSS variable into the generated stylesheet's `:root`, usable in `var(--color-mint-500)` references.
- `@theme inline` is required **when a theme value references another variable**: "When defining theme variables that reference other variables, use the `inline` option … the utility class will use the theme variable value instead of referencing the actual theme variable" — i.e. `bg-primary` compiles to `background-color: var(--primary)` directly. Without `inline`, the var chain resolves where the theme variable is *defined* (`:root`), which breaks runtime overrides lower in the tree — exactly the failure mode `.dark` switching would hit.
- `@theme` blocks must be top-level (not nested).

**Prescriptive three-layer recipe for `app/globals.css`:**

```css
/* ── Layer 1: BASE SCALES — static literals, same in light & dark ── */
/* Plain @theme (NOT inline): literal values, generates bg-pd-green-600 etc.
   utilities AND emits --color-pd-green-* vars for aliasing below. */
@theme {
  --color-pd-green-0: #f0faf4;   /* sampled — see docs/design/pd-palette.md */
  /* ... 100–500 ... */
  --color-pd-green-600: #017737; /* $primary-default per teardown */
  /* ... 700–800 ... */
  /* pd-gray-0..800 (ink hierarchy + surfaces), pd-blue (links/info),
     pd-red (negative), pd-yellow (warning: $warning-strong = yellow-700) */
}

/* ── Layer 2: SEMANTIC — runtime-switchable, references Layer 1 ── */
:root {
  --background: var(--color-pd-gray-50);   /* light-gray app background */
  --card: #ffffff;                          /* white content surfaces */
  --primary: var(--color-pd-green-600);
  --primary-foreground: #ffffff;
  --link: var(--color-pd-blue-600);
  --positive: var(--color-pd-green-600);
  --warning: var(--color-pd-yellow-700);
  --negative: var(--color-pd-red-600);      /* alias --destructive to this */
  --info: var(--color-pd-blue-600);
  /* keep ALL existing shadcn var names; only re-point values */
}
.dark {
  --primary: var(--color-pd-green-500);     /* brighter shade on dark */
  /* ... re-point the full existing .dark block onto pd scales ... */
}

/* ── Layer 3: BRIDGE — extend the EXISTING @theme inline block ── */
@theme inline {
  /* ...all existing --color-* mappings stay untouched... */
  --color-link: var(--link);
  --color-positive: var(--positive);
  --color-warning: var(--warning);
  --color-info: var(--info);
  --color-negative: var(--negative);
}
```

**Pitfalls (all verified):**
1. **Never put var-referencing values in a plain (non-inline) `@theme`** — resolves at `:root` definition site; `.dark` switching silently breaks (the docs' `#parent`/`#child` font example is precisely this failure).
2. **Never put the semantic layer inside `@theme inline` with literal values** — then `.dark` can't override it. Semantic values live in `:root`/`.dark` plain CSS; only the *bridge* lives in `@theme inline`.
3. **Keep every existing shadcn variable name** (`--primary`, `--card`, `--sidebar-accent`, …). All 21 `components/ui/*` files consume them; renames would require touching every primitive. Only values change.
4. Opacity modifiers (`bg-primary/90` in button.tsx) work with var-based colors in v4 via `color-mix()` — no change needed.
5. Hex vs OKLCH: mixing is fine. Keep sampled Pipedrive hexes verbatim (fidelity is the point); converting to OKLCH is optional polish.
6. Sidebar has its own token family (`--sidebar`, `--sidebar-accent`, …) — restyle the nav chrome purely by re-pointing these; `components/ui/sidebar.tsx` stays untouched.

**CRITICAL dark-mode finding [HIGH — verified by grep + reading `app/layout.tsx`]:**
`next-themes@0.4.6` is in package.json but the **only** usage is `useTheme()` inside `components/ui/sonner.tsx`. There is **no `ThemeProvider`** anywhere, and nothing ever adds the `.dark` class to `<html>` (the `suppressHydrationWarning` on `<html>` suggests it was intended but never wired). Consequence: dark mode is currently **unreachable in the running app** — every `.dark` variable and `dark:` utility is dead at runtime.
**Recommendation:** wire it in PLAN-01 — `components/theme-provider.tsx` (client wrapper, `attribute="class"`, `defaultTheme="system"`, `enableSystem`) around children in `app/layout.tsx`, plus a Light/Dark/System item in `components/layout/user-menu.tsx`. ~2 small files; turns the locked "dark mode must keep working" requirement into something verifiable. Minimum fallback if descoped: keep the `.dark` block coherent and verify by injecting the class in Playwright (see Finding 5).

### Finding 2 — Re-skin blast radius (DSGN-04) [HIGH confidence — grepped `app/` + `components/`]

**Re-skins automatically via variables (no edits needed):** all 21 `components/ui/*` primitives; the dashboard layout shell; 13 of 19 `components/crm/*`; ~22 of 28 pages — they use only semantic utilities (`bg-primary`, `text-muted-foreground`, `bg-muted/50`, `border`).

**Manual class swaps required — exactly 6 files hardcode palette classes:**

| File | Hardcoded classes | Swap to |
|------|-------------------|---------|
| `components/crm/customer-status-badge.tsx` | emerald-100/800/950/300, amber-100/800/950/300, slate-100/600/800/300 | positive/warning/muted tint pattern (semantic chip classes) |
| `components/crm/import-wizard.tsx` (lines 244, 320, 410) | amber banner ×2, `emerald-500` progress bar | warning banner pattern, `bg-positive` |
| `app/(dashboard)/dashboard/page.tsx` (42-43, 59, 67, 184) | sky info banner, red negative banner + `text-red-600`, amber warning banner | info/negative/warning patterns |
| `app/(dashboard)/campaigns/page.tsx` (76, 81) | amber banner + chip | warning pattern |
| `app/(auth)/login/page.tsx` (43) | amber banner | warning pattern |
| `app/(dashboard)/settings/integrations/page.tsx` (60) | emerald "connected" banner | positive pattern |

**Recurring shape** — these are all the same "tinted banner" idiom (`border-amber-300/60 bg-amber-50 text-amber-900 dark:...`). Define once as semantic tint tokens (e.g. `--warning-subtle` / `--warning-border` / `--warning-strong` per the teardown's `$text-warning → $warning-strong` aliasing) or a tiny `<Callout tone="warning|info|positive|negative">` helper, then sweep. Recommend the token route (no new component API) unless the planner prefers the helper.

**Deliberately keep:** `bg-black/50` dialog/sheet overlays; `text-white` on destructive button/badge variants — standard shadcn, correct on Pipedrive red too.

**Chart colors** (`--chart-1..5`) are consumed by the dashboard; re-point them to pd scale shades in the same pass. Stage-color and label-chip *tokens* land now (Phase 2 consumes them) — add `--color-pd-*` scale coverage broad enough for chips (purple/teal optional additions).

### Finding 3 — Shell rebuild approach (DSGN-02, DSGN-03) [HIGH confidence]

**Minimal-risk principle: primitives untouched, composition files edited.**

- **`components/ui/sidebar.tsx` — zero edits.** All Pipedrive-ness comes from `--sidebar*` variable values (dark-ink or white rail per sampled palette) + `app-sidebar.tsx` composition.
- **`components/layout/app-sidebar.tsx`** — the nav is already data-driven (`NAV`/`PERSONAL_NAV`/`ADMIN_NAV` arrays). Reorder/regroup Pipedrive-fashion (Deals-first: Opportunities → Accounts → Campaigns → Dashboard → Unmatched inbox; Personal + Admin groups stay), restyle the header brand block (keep SchoolConex name + GraduationCap logo — locked), keep the "Phase 1 · sha" footer restyled. Do NOT add Leads/People/Orgs/Mail/Insights slots (deferred; CONTEXT prefers adding nav items in the phases that ship the routes).
- **`components/layout/top-bar.tsx`** — 17-line server component; stays a server component. New order: `SidebarTrigger · GlobalSearchTrigger (wider, pill-style per Pipedrive) · QuickAdd (client) · spacer · UserMenu`. `GlobalSearchTrigger` already renders the ⌘K field + stub dialog — restyle only; search wiring is Phase 4.
- **Quick-add "+"** — new `components/layout/quick-add.tsx` (client): solid `bg-primary` green button (Pipedrive's signature) + existing `components/ui/dropdown-menu.tsx`. Entry wiring:
  - **Deal** → `/opportunities/new` (exists, e2e-verified)
  - **Account** → `/accounts/new` (exists, e2e-verified)
  - **Contact** → problem: the only contact-create route is account-scoped (`/accounts/[id]/contacts/new`)
  - **Activity** → problem: `TaskComposer` requires an account/opportunity context (rendered only on `/accounts/[id]` and `/opportunities/[id]`)
  - **Options for Contact/Activity:** (a) *minimal* — menu items navigate to `/accounts` with a "pick an account" affordance; (b) *proper* — a small account-typeahead dialog (server action via `sb` with `ilike` + `limit 10` — **do not** load all ~5.5k accounts into a Select) that then routes to `/accounts/[id]/contacts/new` or opens TaskComposer context. Recommend (b) as its own task in PLAN-01 with (a) as the explicit fallback if it balloons; CONTEXT grants discretion here.
- **`app/(dashboard)/layout.tsx`** — likely near-zero changes (SidebarProvider/Inset/TopBar composition already correct). Main content gets the light-gray `bg-background` with white `bg-card` surfaces automatically from Layer 2.
- **Login page** (`app/(auth)/login/page.tsx`) — inherits tokens; touch only its amber banner (Finding 2).

### Finding 4 — CAD sweep (DSGN-05) [HIGH confidence — grepped]

**Correction to CONTEXT: six legacy USD formatter sites, not four:**

| # | File:line | Formatter |
|---|-----------|-----------|
| 1 | `components/crm/opportunity-list.tsx:8` | `Intl.NumberFormat("en-US", { currency: "USD" })` |
| 2 | `components/crm/document-list.tsx:29` | same |
| 3 | `components/crm/line-items-editor.tsx:15` | same *(not listed in CONTEXT)* |
| 4 | `app/(dashboard)/opportunities/[id]/page.tsx:18` | same |
| 5 | `app/(dashboard)/settings/catalog/page.tsx:10` | same |
| 6 | `app/(dashboard)/settings/catalog/packages/[id]/edit/page.tsx:17` | same *(not listed in CONTEXT)* |

**Proposed `lib/format.ts`** (new file — no `lib/format*` exists today):
```ts
// House currency is CAD (QuickBooks). Per-row currencies format in their own
// currency; locale follows currency (matches pipeline-board behavior).
export function fmtMoney(amount: number, currency = "CAD"): string {
  const locale = currency === "USD" ? "en-US" : "en-CA";
  return new Intl.NumberFormat(locale, {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(amount);
}
export const fmtCad = (n: number) => fmtMoney(n, "CAD");
```
- Lift `fmtMoney` verbatim from `components/crm/pipeline-board.tsx:25-32` (it is already the blessed pattern); update pipeline-board to import it (`sumByCurrency` stays local — it's opportunity-shaped).
- `lib/crm/dashboard.ts:315` `fmtCad`: move the implementation to `lib/format.ts` and re-export from dashboard.ts (`export { fmtCad } from "@/lib/format"`) so `app/(dashboard)/dashboard/page.tsx`'s existing import keeps working — or just update that one import; either is a two-line change.
- Sweep sites 1–6: delete the module-level `formatter`, import `fmtMoney` and pass the row's `currency` where one exists (opportunity-list rows and line items carry `currency`; catalog products carry `currency`), else `fmtCad`.
- **Out of scope, flag for Matthew:** `"USD"` *data defaults* in `opportunity-form.tsx:178`, `product-form.tsx:82`, zod schemas (`opportunities/actions.ts:15`, `catalog/actions.ts:15,81`), `opportunities/new/page.tsx:55`, and DB column defaults (`lib/db/schema.ts:183,471,483`). Changing those alters what gets *written*, not how amounts render — that is a data-behavior decision, not a formatter sweep. See Open Questions.

### Finding 5 — Regression safety [HIGH confidence]

**What `scripts/e2e-rayan.mts` covers:** login (307→/accounts), then 17 routes with status + body-regex checks (runs against `NEXT_PUBLIC_SITE_URL` or `http://localhost:3000`; needs `E2E_LOGIN_PASSWORD` from `.env.local`). It checks **text signals, not styling** — the reskin only breaks it if copy changes. Signals that must survive: `/SchoolConex/i` on `/accounts` (safe — name is locked to stay), "Account name"/"Owner" on `/accounts/new`, "Import leads" on `/accounts/import`, "Pipeline|Stage" on `/opportunities/new`, etc. Rule for the planner: **restyle without rewording** page headings/labels on e2e-checked routes.

**Playwright eyeball list (in priority order):**
1. `/opportunities` kanban — drag a card between stages (dnd-kit `DndContext` in `pipeline-board.tsx`; restyle touches only classNames on cards/columns, never sensors/handlers), confirm optimistic move + persisted stage + toast. This is the highest-risk interactive surface.
2. `/dashboard` — KPI cards, info/negative/warning banners (3 of the 6 hand-swapped files render here), charts with re-pointed `--chart-*`.
3. `/accounts` — 5.5k-row table density unchanged (compact locked), row hover states.
4. `/accounts/[id]` — tabs, TaskComposer, NoteComposer, contact list, customer-status badge (hand-swapped).
5. `/accounts/import` wizard — amber→warning banners, emerald→positive progress.
6. Top bar + sidebar: quick-add menu opens and all entries navigate; sidebar collapse-to-icon mode; footer SHA renders.
7. `/login` — restyled banner.
8. Dialogs/sheets/selects on one form page (overlay + focus rings on new palette).

**Dark-mode verification:** if ThemeProvider is wired (recommended), toggle via the user menu and re-eyeball screens 1–4. If not wired, inject it in Playwright: `await page.evaluate(() => document.documentElement.classList.add("dark"))` then screenshot — this exercises the exact same CSS path the class strategy uses.

**Gate order per plan:** `npx tsc --noEmit` → `npm run build` → dev server + `npx tsx scripts/e2e-rayan.mts` → Playwright pass → (PLAN-02 only) `npx vercel --prod --yes` + re-run e2e against prod.

### Finding 6 — Sizing and plan split [HIGH confidence]

**Files touched (~20-24 total):**
- Tokens: `app/globals.css` (major rewrite of value blocks; `@theme inline` bridge extended) + new `docs/design/pd-palette.md` (sampled values + source)
- Dark wiring (recommended): new `components/theme-provider.tsx`, `app/layout.tsx`, `components/layout/user-menu.tsx`
- Shell: `components/layout/app-sidebar.tsx`, `components/layout/top-bar.tsx`, new `components/layout/quick-add.tsx` (+ optional account-typeahead dialog + one server action file)
- Color sweep: 6 files (Finding 2)
- CAD sweep: new `lib/format.ts`, `lib/crm/dashboard.ts`, `components/crm/pipeline-board.tsx` + 6 formatter files (Finding 4)
- Possible per-screen polish: minor classNames on `pipeline-board.tsx` cards/columns, `global-search.tsx` field restyle

**Recommended split:**
- **PLAN-01 — Tokens + dark mode + shell:** palette sampling/documentation → globals.css three-layer rewrite → ThemeProvider + toggle → sidebar/top-bar/quick-add. Ends with tsc/build/e2e/Playwright gate (light + dark). The app already looks 80% Pipedrive at this gate because variables drive everything.
- **PLAN-02 — Sweeps + regression + deploy:** hardcoded-color swaps (6 files) → `lib/format.ts` + 6-site CAD sweep → full Playwright regression (kanban drag, wizard, dark) → deploy + prod e2e re-run.

Rationale: PLAN-01 is the foundation every later phase consumes and carries the only structural risk (shell + provider); PLAN-02 is mechanical, parallelizable file-by-file, and contains the deploy gate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dark-mode class switching | Custom localStorage/theme script | `next-themes` ThemeProvider (already installed, v0.4.6) | SSR-safe, no-flash, `attribute="class"` matches existing `@custom-variant` |
| Quick-add menu | Custom popover | `components/ui/dropdown-menu.tsx` (already used by UserMenu) | Focus/keyboard/portal handled |
| Money formatting | String concat / manual symbols | `Intl.NumberFormat` per `fmtMoney` pattern | Locale-correct `CA$`/`US$` disambiguation already proven in pipeline-board |
| Color scale utilities | Per-component hex constants | `@theme` pd-* scales | Single source; Phase 2 chips/stage colors consume the same tokens |

## Risks

1. **Dark mode is a mirage today** — no ThemeProvider; if the planner skips wiring it, "dark mode must keep working" can only be verified synthetically (class injection). Recommend wiring it (2 small files). *Mitigation: PLAN-01 task.*
2. **Kanban drag-drop regression** — pipeline-board is the only dnd-kit surface; restyling its card/column classes near `DndContext` invites accidental handler/ref changes. *Mitigation: classNames-only diff rule + mandatory drag test in Playwright.*
3. **Palette fidelity** — exact Pipedrive hexes are unsampled (teardown open gap). If Figma/live-app sampling fails, the fallback (screenshot-derived, `#017737` green family) is locked by Matthew and must be documented in `docs/design/pd-palette.md`. *Not a blocker — fallback is pre-authorized.*
4. **e2e text-signal breakage** — rewording headings on the 17 walked routes fails the walk. *Mitigation: restyle-without-rewording rule; if copy must change, update `scripts/e2e-rayan.mts` regexes in the same task.*
5. **Contrast on the new palette** — Pipedrive's scales are contrast-matched (WCAG AA per teardown); preserve that by using their sampled pairings (e.g. white text only on green-600+), not ad-hoc shades.
6. **`text-white` hardcodes in button/badge destructive variants** — fine on Pipedrive red, but check the new `--destructive` value keeps AA contrast with white.

## Open Questions

1. **Should quick-add Contact/Activity get the account-typeahead dialog (option b) or the minimal `/accounts` link (option a)?** — CONTEXT grants discretion; recommend (b) with (a) as fallback. Planner decides task budget.
2. **Flip `"USD"` data defaults to `"CAD"`?** (forms, zod schemas, DB column defaults — 9 sites). CAD is the house currency, so defaults writing USD look wrong, but this changes written data, not rendering — outside the DSGN-05 formatter sweep. Recommend asking Matthew; safe to defer.
3. **Exact pd hex values** — sampled during PLAN-01 execution from figma.com/@pipedrive or live-app CSS custom properties; fallback pre-authorized. Not blocking planning.
4. **Sidebar tone** — Pipedrive has used both dark-ink and light rails across Classic/Modern themes; pick whichever the sampled reference screenshots show and record in pd-palette.md (discretion).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| tailwindcss v4 (`@tailwindcss/postcss`) | tokens | ✓ | in package.json, `@theme` already in use | — |
| next-themes | dark toggle | ✓ | ^0.4.6 (installed, unused) | class injection for verification only |
| radix-ui / dropdown-menu | quick-add | ✓ | ^1.4.3 + `components/ui/dropdown-menu.tsx` | — |
| @dnd-kit/core | kanban (restyle only) | ✓ | imported in pipeline-board | — |
| Playwright MCP | visual verification | ✓ | `.playwright-mcp/` present in repo | manual browser check |
| `E2E_LOGIN_PASSWORD` in `.env.local` | e2e walk | assumed ✓ (post-D-044 rotation) | — | walk fails fast with clear error |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | none (no unit-test infra — CONCERNS.md); gates are compiler + build + scripted route walk + Playwright |
| Config file | none |
| Quick run command | `npx tsc --noEmit` |
| Full suite command | `npm run build && npx tsx scripts/e2e-rayan.mts` (dev/prod server running; `E2E_LOGIN_PASSWORD` set) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DSGN-01 | Tokens compile; utilities resolve | build | `npm run build` | ✅ |
| DSGN-02 | Top bar renders; routes reachable | smoke | `npx tsx scripts/e2e-rayan.mts` (walks all shell-wrapped routes) | ✅ |
| DSGN-03 | Nav links work post-restructure | smoke | e2e walk (17 routes) + Playwright click-through | ✅ / manual |
| DSGN-04 | Screens render on new palette, light+dark | manual-only | Playwright eyeball list (Finding 5) — visual fidelity is not assertable without screenshot baselines (none exist) | manual |
| DSGN-05 | CAD rendering | unit-less | `npx tsc --noEmit` + spot-check `CA$` strings in Playwright on /opportunities, /settings/catalog | manual |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit`
- **Per wave/plan merge:** `npm run build` + e2e walk
- **Phase gate:** build + e2e walk green, Playwright eyeball list complete (light + dark), then deploy + prod e2e re-run

### Wave 0 Gaps
None — no unit framework exists and standing one up for a visual reskin is out of proportion; the existing tsc/build/e2e/Playwright stack covers the phase's regression surface. (The e2e walk's body regexes act as the automated regression net.)

## Sources

### Primary (HIGH confidence)
- `tailwindcss.com/docs/theme` (fetched 2026-07-11) — `@theme` vs `@theme inline` semantics, var-reference resolution pitfall, top-level requirement
- Repo code (read/grepped 2026-07-11): `app/globals.css`, `app/layout.tsx`, `app/(dashboard)/layout.tsx`, `components/layout/*`, `components/ui/{button,badge,table,card,sidebar}.tsx`, `components/crm/pipeline-board.tsx`, `lib/crm/dashboard.ts:315`, `scripts/e2e-rayan.mts`, `package.json`, full color/formatter greps of `app/` + `components/`
- `.planning/codebase/CONVENTIONS.md`, `CONCERNS.md` (2026-07-11)

### Secondary (MEDIUM confidence)
- `docs/research/pipedrive-teardown.md` (D-045, adversarially verified) — token architecture ($primary-default = green-600, semantic groups), palette-sampling instruction; single-primary-source caveat noted in the teardown itself

### Tertiary (LOW confidence)
- Exact Pipedrive hex values beyond the `#017737` green family — unsampled; flagged as PLAN-01 execution task with pre-authorized fallback

## Metadata

**Confidence breakdown:**
- Tailwind token mechanics: HIGH — verified against official docs fetched today; matches existing repo usage
- Blast radius / CAD sites / shell: HIGH — exhaustive grep + file reads
- Dark-mode finding (no ThemeProvider): HIGH — grep shows sole next-themes usage is sonner.tsx
- Palette values: MEDIUM — architecture verified, hexes pending sampling (fallback locked)

**Research date:** 2026-07-11
**Valid until:** ~2026-08-11 (stable stack; re-verify only if Tailwind or shadcn majors land)
