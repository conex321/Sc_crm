---
phase: 01-pipedrive-design-system
plan: 01
status: complete
completed: 2026-07-11
requirements: [DSGN-01, DSGN-02, DSGN-03]
commits:
  - 1957a17 feat(01-01): three-layer Pipedrive token system + Inter font
  - 04c8fbd feat(01-01): mount ThemeProvider + Light/Dark/System toggle in user menu
  - 04758e4 feat(01-01): 48px top bar with pill search + green quick-add, Pipedrive sidebar restyle
---

# Phase 1 Plan 01: Pipedrive tokens + app shell — Execution Summary

**One-liner:** Three-layer Pipedrive token system (pd-* base scales in plain `@theme`, switchable semantics in `:root`/`.dark`, var-bridge in `@theme inline`) + Inter, runtime dark mode via mounted next-themes, and the rebuilt 48px white top bar / green quick-add / restyled labeled sidebar — 19/19 e2e routes green, zero `components/ui/*` edits.

## Tasks completed

### Task 1 — Three-layer token system + Inter font (`1957a17`)
- `app/globals.css` rewritten:
  - **Layer 1** (plain `@theme`, literals only): full UI-SPEC Section 1 scales — `--color-pd-{green|blue|red|yellow|purple|neutral}-{100..1000}` (+ `neutral-0 #ffffff`) and `--color-pd-dark-*` twins (+ `dark-neutral-0 #0e1017`). 132 declarations; generates `bg-pd-green-600` etc. for Phase 2 chips/stages.
  - **Layer 2** (`:root`/`.dark`): all shadcn variable NAMES kept, OKLCH values replaced with UI-SPEC Section 3 hex verbatim (`--radius: 8px`, charts, sidebar vars included). New `--pd-*` semantics: status (positive/warning/negative/info + `-strong`/`-bg`/`-bg-light`), link/link-hover, text-secondary/text-muted, six label bg/fg pairs, five elevations, plus `--pd-primary-hover/-active` and `--pd-nav-active-bg/-fg/-icon`. **Parity verified: every `--pd-*` var exists in both `:root` and `.dark`.**
  - **Layer 3** (`@theme inline`): existing mappings untouched; appended `--color-pd-*` bridges (20 status/text/link + 12 label), `--shadow-pd-{button,raised,raised-hover,floating,overlay}`, and `--font-sans: var(--font-inter), ...`.
- `app/layout.tsx`: Inter via `next/font/google` (`variable: "--font-inter"`), body `cn(inter.variable, "font-sans antialiased")`. 14px root and `font-feature-settings` untouched.
- Verified: no `var(` inside the plain `@theme` block (the dark-switch failure mode).

### Task 2 — ThemeProvider + theme toggle (`04c8fbd`)
- New `components/theme-provider.tsx` client wrapper around next-themes.
- `app/layout.tsx`: `<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>` wraps TooltipProvider AND Toaster (sonner calls `useTheme()`); `suppressHydrationWarning` already present.
- `components/layout/user-menu.tsx`: now `"use client"`; Theme section (11px muted label + Light/Dark/System items with 16px icons, check on active) between user label and sign-out; sign-out form unchanged.

### Task 3 — Top bar + quick-add + sidebar restyle (`04758e4`)
- `top-bar.tsx` (server component): `h-[48px] ... border-b bg-card` (backdrop-blur removed); order SidebarTrigger · Separator · GlobalSearchTrigger · QuickAdd · spacer · UserMenu.
- New `components/layout/quick-add.tsx`: round green `size-8 rounded-full bg-primary` button, hover/active via `--pd-primary-hover/-active`; shadcn DropdownMenu with exact copy — `New deal` → `/opportunities/new`, `New account` → `/accounts/new`, `New contact` → `/accounts` (account-scoped creation; list = picker, locked option a), `New activity` → `/dashboard` (My-day queue entry point).
- `global-search.tsx`: trigger restyled to pill (`h-8 w-64 md:w-80 rounded-full bg-secondary`, 13px, copy `Search`, 11px `⌘K` kbd); ⌘K listener + CommandDialog stub untouched.
- `app-sidebar.tsx`: shared `NAV_BTN` class on every SidebarMenuButton (green-tinted active via `--pd-nav-active-*`, `rounded-[4px]`); group labels 11px/600 uppercase `text-pd-text-muted`; brand tile `rounded-[4px] bg-primary`; "CRM" and footer `Phase 1 · {sha}` restyled to 11px `text-pd-text-muted`. Groups, items, routes, `collapsible="icon"`, role gate all unchanged. `components/ui/sidebar.tsx`: zero edits.

## Verification results

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | green (after every task) |
| `npm run build` | green (after every task, final run post-formatting) |
| `npx tsx scripts/e2e-rayan.mts` (local dev :3100) | **19/19 routes ok** (login 307 → /accounts, all body regexes intact) |
| Token invariants | `--color-pd-green-600: #2d8647` present; 0 `var(` in plain `@theme`; `--pd-positive` in both `:root` (L275-era) and `.dark` |
| Compiled CSS spot-check (authenticated fetch) | pd-green-600 literal, `--background:#f5f5f6` light / `#0e1017` dark, `--color-pd-positive: var(--pd-positive)` bridge, nav-active-bg both themes, `--radius: 8px`, `--font-sans: var(--font-inter)` — all present in served stylesheet |
| SSR markup spot-check (authenticated fetch of /accounts) | 48px bg-card header, quick-add aria-label + round green button, pill search + `Search` copy + ⌘K kbd, group-label style, `data-[active=true]` green-tint classes, active item present, brand tile, footer `Phase 1 ·`, Inter variable class on body — all present |

## Deviations from plan

**No code/spec deviations — all hex values, sizes, and copy strings match UI-SPEC verbatim.** Execution notes:

1. **[Env flake, not app] Turbopack dev-cache corruption produced transient e2e failures.** First walk: 8 routes 500 ("Cannot find module 'zod'/'lucide-react'", lstat UNKNOWN on `.next/dev` chunks; Next warned "Slow filesystem detected"). Clean `.next` + dev restart → 19/19. A later walk run concurrently with `npm run build` flaked once more (route-discovery picked a uuid `57f48f42…` that is not RLS-visible to demo and does not appear in the current list HTML → correct 404). Final clean run: 19/19. Lesson for wave 2: **do not run `npm run build` while the dev server used by e2e is serving.**
2. **[Convention] Prettier class-order formatting** applied to all touched files per CONVENTIONS.md ("format only files you touch"); this added a formatting-only diff to `user-menu.tsx` inside the Task 3 commit.
3. **[Verification scope] Interactive browser checks approximated, not clicked.** This executor has no Playwright; dark-toggle click, quick-add click-through, and collapse-to-icon were verified by equivalents: compiled `.dark` CSS values served, all four quick-add target routes 200 in the e2e walk, standard Radix DropdownMenu / next-themes wiring, SSR markup classes present. Recommend a human/Playwright visual spot-check (light + dark on /accounts, /opportunities, /dashboard) at the Phase 1 checkpoint.

## Known stubs (pre-existing, intentional)

- Global search CommandDialog: "Search isn't wired yet" — Phase 4 wiring, per plan ("the CommandDialog stub stays as-is").
- Quick-add `New contact` / `New activity` route to list/dashboard pages rather than dedicated composers — locked minimal option (a) per RESEARCH Finding 3.

## Notes for wave 2 (PLAN-02 sweep)

- Utilities now available for component deltas: `bg-pd-*`/`text-pd-*` base scales, `text-pd-positive-strong`, `bg-pd-warning-bg`, `text-pd-link`, `text-pd-text-secondary/-muted`, label pairs `bg-pd-label-{color}-bg` / `text-pd-label-{color}-fg`, shadows `shadow-pd-button/raised/raised-hover/floating/overlay`.
- Button hover/pressed vars ready: `--pd-primary-hover`, `--pd-primary-active` (use arbitrary `hover:bg-[var(--pd-primary-hover)]` as in quick-add, or add bridges if utility form preferred).
- `--radius: 8px` shifted `rounded-lg` to 8px and `rounded-md` to 6px globally — spec wants 4px on buttons/inputs/menu items; component sweep must apply `rounded-[4px]` (pattern already used in NAV_BTN, kbd, brand tile).
- `--input` is now a solid `#d7d7d9` in light (was matching `--border`); inputs will look slightly stronger-bordered — matches spec Section 5.
- Sidebar active styling lives entirely in `components/layout/app-sidebar.tsx` `NAV_BTN`; `components/ui/sidebar.tsx` still ships its default `data-[active=true]` classes (overridden via cn merge) — keep overriding at composition layer.
- Dev-server e2e: use a port free of other projects (3000 is occupied by toddle-app on this machine); export `NEXT_PUBLIC_SITE_URL=http://localhost:<port>` when invoking `scripts/e2e-rayan.mts`.

## Self-Check: PASSED

- Files exist: `app/globals.css`, `app/layout.tsx`, `components/theme-provider.tsx`, `components/layout/{top-bar,quick-add,global-search,app-sidebar,user-menu}.tsx` — all present.
- Commits exist on `feat/mailshake-activation`: `1957a17`, `04c8fbd`, `04758e4` — verified via `git log`.
- Working tree contains no stray artifacts from this plan (only pre-existing unrelated modifications/untracked files left untouched).
