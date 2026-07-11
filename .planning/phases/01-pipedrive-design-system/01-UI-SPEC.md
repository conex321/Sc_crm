---
phase: 1
slug: pipedrive-design-system
status: draft
shadcn_initialized: true
preset: none (manual token swap — existing shadcn kit re-skinned via CSS variables)
created: 2026-07-11
---

# Phase 1 — UI Design Contract: Pipedrive design system

> Visual and interaction contract. The executor implements from this file without taste decisions.
> Every color below is marked **[V] verified** (extracted 2026-07-11 from Pipedrive's live design-token CSS,
> `https://cdn.yul-1.pipedriveassets.com/auth/assets/root-CUCSsIpx.css`, loaded by `app.pipedrive.com/auth/login` —
> these are Pipedrive's real `--pd-global-color-*` / `--pd-color-*` custom properties) or **[D] derived**
> (inferred from screenshots/structure where the auth bundle didn't expose an in-app value).
> Token architecture cross-confirmed by docs/research/pipedrive-teardown.md (priitkaru.com/semantic-design-system).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui (existing kit in `components/ui/*`) — re-skin via CSS variables only |
| Preset | not applicable (no re-init; swap values in `app/globals.css`) |
| Component library | radix (consolidated `radix-ui` package) |
| Icon library | lucide-react (unchanged) |
| Font | **Inter** — verified as Pipedrive's actual UI font (`--pd-font-body-font-family: "Inter", sans-serif`). Load via `next/font/google` (variable), fallback `system-ui, sans-serif`. Inter is OFL-licensed — no licensing issue. |

**Scope guard:** functional no-regression. Only `app/globals.css`, `components/layout/*`, targeted class changes in `components/ui/*` variants, and the CAD formatter sweep. No route or data changes beyond quick-add menu wiring to existing create flows.

---

## 1. Base palette (Layer 1)

All values **[V] verified** — these are Pipedrive's literal `--pd-global-color-{light|dark}-{color}-{shade}` values. Shade levels are contrast-matched across colors (Pipedrive's Modern palette is WCAG 2.0 AA contrast-based per their design-system lead). The dark scales are pre-inverted: **the same shade index is correct in both themes** (e.g. `green-100` is a pale tint in light, a deep tint in dark).

Define in `app/globals.css` `:root` (they are theme-independent lookup tables):

### Light scales (`--pd-light-*`)

| Shade | green | blue | red | yellow | purple | neutral (gray) |
|------:|-------|------|-----|--------|--------|----------------|
| 0     | —       | —       | —       | —       | —       | `#ffffff` |
| 100   | `#e9fbe7` | `#eff6ff` | `#fef2f0` | `#fff6d6` | `#f6f4fe` | `#f5f5f6` |
| 200   | `#ddf4db` | `#e1eeff` | `#fde7e4` | `#ffedac` | `#eeeafb` | `#ececed` |
| 300   | `#bedfbd` | `#bcdaff` | `#fdc9c2` | `#ffd24a` | `#d9d1f8` | `#d7d7d9` |
| 400   | `#82b886` | `#72adff` | `#fb8b80` | `#e69b00` | `#ab9ffb` | `#a9abaf` |
| 500   | `#61a36b` | `#5195f6` | `#f16a60` | `#cf8501` | `#9086fc` | `#93949a` |
| 600   | `#2d8647` | `#2b74da` | `#d83c38` | `#a76800` | `#6962f2` | `#73767c` |
| 700   | `#077838` | `#0d68c5` | `#c82627` | `#945b00` | `#6150e1` | `#65686f` |
| 800   | `#00672a` | `#0157ae` | `#b21019` | `#804d00` | `#5345bf` | `#565961` |
| 900   | `#004d25` | `#013f88` | `#8a0007` | `#603900` | `#3d348e` | `#3f424a` |
| 1000  | `#012a12` | `#002252` | `#510000` | `#371e00` | `#211c52` | `#21232c` |

### Dark scales (`--pd-dark-*`)

| Shade | green | blue | red | yellow | purple | neutral (gray) |
|------:|-------|------|-----|--------|--------|----------------|
| 0     | —       | —       | —       | —       | —       | `#0e1017` |
| 100   | `#012710` | `#001f4b` | `#4c0000` | `#331c00` | `#1a1a4e` | `#1e2029` |
| 200   | `#013417` | `#012a60` | `#620000` | `#432600` | `#242464` | `#2a2c35` |
| 300   | `#013e1d` | `#023372` | `#720002` | `#4f2e00` | `#2c2b75` | `#33353e` |
| 400   | `#0b5b2e` | `#244d92` | `#9a1b21` | `#6e4618` | `#45449b` | `#4c4f55` |
| 500   | `#2a7742` | `#3768ba` | `#c03737` | `#915e24` | `#5e59d2` | `#686970` |
| 600   | `#3c824e` | `#4073c8` | `#cc4543` | `#9f6829` | `#6a64de` | `#72747a` |
| 700   | `#5d9867` | `#588adf` | `#e0645e` | `#bc7e33` | `#857ee9` | `#898b90` |
| 800   | `#76a97c` | `#6e9dec` | `#ec7c75` | `#d18f3b` | `#9c92ed` | `#9c9da1` |
| 900   | `#a0c6a1` | `#9abefa` | `#f9a7a0` | `#eeb245` | `#c0b5f0` | `#bcbcbf` |
| 1000  | `#d1e8cf` | `#d3e3fe` | `#fedad7` | `#ffdf8c` | `#e5dff7` | `#e2e2e4` |

**Brand accents [V]** (logo/marketing only — NOT for UI chrome): brand deep-green `#014722` / `#012710`; the public logo green `#017737` ≈ in-app `green-700 #077838`. Our brand mark stays SchoolConex; do not use Pipedrive brand tokens.

**Contrast checkpoints (light):** white text on `green-600 #2d8647` = 4.6:1 (AA normal text) — primary button OK. `blue-700 #0d68c5` links on white = 5.5:1 — AA. Ink `#21232c` on white > 15:1. `neutral-500 #93949a` on white ≈ 3.0:1 — **muted text only for 12px+ non-essential meta, never body copy** (use `neutral-700 #65686f` ≈ 5.7:1 for secondary text).

---

## 2. Semantic layer (Layer 2)

All light-theme aliases **[V] verified** (Pipedrive's literal `--pd-color-*` → base aliases). Dark-theme values **[D] derived** by applying the identical alias table to the dark scales (Pipedrive designed the dark scales pre-inverted for exactly this; verified structure, inferred application).

| Semantic token | Alias | Light value | Dark value |
|---|---|---|---|
| **Surface** app-background | neutral-100 | `#f5f5f6` | `#0e1017` (neutral-0 dark) [D] |
| Surface foreground (cards, panels, tables) | neutral-0 | `#ffffff` | `#1e2029` [D] |
| Surface foreground-secondary | neutral-100 | `#f5f5f6` | `#2a2c35` [D] |
| Surface overlay (popover/dialog) | neutral-0 | `#ffffff` | `#2a2c35` [D] |
| **Divider** light | ink 8% | `rgba(33,35,44,.08)` | `rgba(226,226,228,.08)` [D] |
| Divider medium (default borders) | ink 12% | `rgba(33,35,44,.12)` | `rgba(226,226,228,.12)` [D] |
| Divider strong | ink 24% | `rgba(33,35,44,.24)` | `rgba(226,226,228,.24)` [D] |
| **Fill** base-secondary (table headers, wells) | neutral-100 | `#f5f5f6` | `#1e2029` [D] |
| Fill light (hover fills) | neutral-200 | `#ececed` | `#2a2c35` [D] |
| Fill medium (pressed fills, scrollbars) | neutral-300 | `#d7d7d9` | `#33353e` [D] |
| **Text** primary | neutral-1000 | `#21232c` | `#e2e2e4` [D] |
| Text secondary | neutral-700 | `#65686f` | `#898b90` [D] |
| Text muted (meta only) | neutral-500 | `#93949a` | `#686970` [D] |
| Text link | blue-700 | `#0d68c5` | `#588adf` [D] |
| **Icon** primary | neutral-1000 | `#21232c` | `#e2e2e4` [D] |
| Icon secondary | neutral-700 | `#65686f` | `#898b90` [D] |
| Icon muted | neutral-500 | `#93949a` | `#686970` [D] |
| **Primary** default (buttons, active brand) | green-600 | `#2d8647` | `#3c824e` [D] |
| Primary hover / strong | green-700 | `#077838` | `#5d9867` [D] |
| Primary extra-strong (pressed) | green-800 | `#00672a` | `#76a97c` [D] |
| Primary background (tints) | green-200 | `#ddf4db` | `#013417` [D] |
| Primary background-light | green-100 | `#e9fbe7` | `#012710` [D] |
| Primary border/muted | green-400 | `#82b886` | `#0b5b2e` [D] |
| **Secondary** default (Pipedrive uses purple; we reserve for future "learn/AI" accents) | purple-600 | `#6962f2` | `#6a64de` [D] |
| **Active/Info** default (selection, focus, links family) | blue-600 | `#2b74da` | `#4073c8` [D] |
| Active hover / strong | blue-700 | `#0d68c5` | `#588adf` [D] |
| Active background | blue-200 | `#e1eeff` | `#012a60` [D] |
| Active background-light | blue-100 | `#eff6ff` | `#001f4b` [D] |
| **Negative** default | red-600 | `#d83c38` | `#cc4543` [D] |
| Negative strong (text-negative) | red-700 | `#c82627` | `#e0645e` [D] |
| Negative background | red-200 | `#fde7e4` | `#620000` [D] |
| **Warning** default | yellow-600 | `#a76800` | `#9f6829` [D] |
| Warning strong (text-warning) | yellow-700 | `#945b00` | `#bc7e33` [D] |
| Warning background | yellow-200 | `#ffedac` | `#432600` [D] |
| **Positive** default | green-600 | `#2d8647` | `#3c824e` [D] |
| Positive strong (text-positive) | green-700 | `#077838` | `#5d9867` [D] |
| Positive background | green-200 | `#ddf4db` | `#013417` [D] |

**[V] note:** Pipedrive's real in-app navigation tokens are dark purple (`navigation-background = purple-1000 #211c52`, active `purple-700`, hover `purple-600`, white icons). We are **deliberately using their light labeled-nav style instead** (locked by orchestrator) — the dark-rail tokens are recorded here in case a later phase wants the authentic dark rail.

---

## 3. shadcn CSS-variable mapping (Layer 3)

Replace the current OKLCH values in `app/globals.css` with these (hex is fine in Tailwind v4; keep the existing `@theme inline` block as-is). Keep variable names — every shadcn component re-skins wholesale.

### `:root` (light)

```css
--radius: 8px;                                   /* Pipedrive radius-l [V]; was 0.5rem=7px at 14px root */
--background: #f5f5f6;          /* app background — pages sit on gray  [V] */
--foreground: #21232c;          /* ink                                  [V] */
--card: #ffffff;                /* white content surfaces               [V] */
--card-foreground: #21232c;
--popover: #ffffff;
--popover-foreground: #21232c;
--primary: #2d8647;             /* Pipedrive green-600                  [V] */
--primary-foreground: #ffffff;
--secondary: #f5f5f6;           /* subtle gray fills                    [V] */
--secondary-foreground: #21232c;
--muted: #f5f5f6;
--muted-foreground: #65686f;    /* text-secondary — AA at small sizes   [V] */
--accent: #ececed;              /* hover fills (menus, ghost)           [V] */
--accent-foreground: #21232c;
--destructive: #d83c38;         /* red-600                              [V] */
--destructive-foreground: #ffffff;
--border: rgba(33,35,44,.12);   /* divider-medium                       [V] */
--input: #d7d7d9;               /* input borders — neutral-300          [D] */
--ring: #5195f6;                /* focus ring — blue-500                [D] */
--chart-1: #2d8647;  --chart-2: #2b74da;  --chart-3: #6962f2;
--chart-4: #e69b00;  --chart-5: #d83c38;                       /* [D] from base scales */
--sidebar: #ffffff;
--sidebar-foreground: #21232c;
--sidebar-primary: #2d8647;
--sidebar-primary-foreground: #ffffff;
--sidebar-accent: #ececed;              /* hover */
--sidebar-accent-foreground: #21232c;
--sidebar-border: rgba(33,35,44,.12);
--sidebar-ring: #5195f6;
```

### `.dark`

```css
--background: #0e1017;          --foreground: #e2e2e4;
--card: #1e2029;                --card-foreground: #e2e2e4;
--popover: #2a2c35;             --popover-foreground: #e2e2e4;
--primary: #3c824e;             --primary-foreground: #ffffff;
--secondary: #2a2c35;           --secondary-foreground: #e2e2e4;
--muted: #2a2c35;               --muted-foreground: #898b90;
--accent: #2a2c35;              --accent-foreground: #e2e2e4;
--destructive: #cc4543;         --destructive-foreground: #ffffff;
--border: rgba(226,226,228,.12);
--input: rgba(226,226,228,.20);
--ring: #3768ba;
--chart-1: #5d9867;  --chart-2: #588adf;  --chart-3: #857ee9;
--chart-4: #d18f3b;  --chart-5: #e0645e;
--sidebar: #1e2029;             --sidebar-foreground: #e2e2e4;
--sidebar-primary: #3c824e;     --sidebar-primary-foreground: #ffffff;
--sidebar-accent: #2a2c35;      --sidebar-accent-foreground: #e2e2e4;
--sidebar-border: rgba(226,226,228,.12);
--sidebar-ring: #3768ba;
```

(All dark values [D] — structural application of verified dark scales.)

### New `--pd-*` variables (concepts shadcn lacks)

Define per-theme in `:root` / `.dark`, and expose as utilities in `@theme inline` (`--color-pd-warning: var(--pd-warning);` etc. so `bg-pd-warning-bg`, `text-pd-positive` work):

```css
/* semantic status (light / dark) */
--pd-positive: #2d8647 / #3c824e;        --pd-positive-strong: #077838 / #5d9867;
--pd-positive-bg: #ddf4db / #013417;     --pd-positive-bg-light: #e9fbe7 / #012710;
--pd-warning:  #a76800 / #9f6829;        --pd-warning-strong:  #945b00 / #bc7e33;
--pd-warning-bg: #ffedac / #432600;      --pd-warning-bg-light: #fff6d6 / #331c00;
--pd-negative: #d83c38 / #cc4543;        --pd-negative-strong: #c82627 / #e0645e;
--pd-negative-bg: #fde7e4 / #620000;     --pd-negative-bg-light: #fef2f0 / #4c0000;
--pd-info: #2b74da / #4073c8;            --pd-info-strong: #0d68c5 / #588adf;
--pd-info-bg: #e1eeff / #012a60;         --pd-info-bg-light: #eff6ff / #001f4b;
--pd-link: #0d68c5 / #588adf;            --pd-link-hover: #0157ae / #6e9dec;
--pd-text-secondary: #65686f / #898b90;  --pd-text-muted: #93949a / #686970;
/* label chip pairs (bg / fg), light theme; dark theme = same shade indices on dark scales */
--pd-label-green-bg: #ddf4db;   --pd-label-green-fg: #00672a;
--pd-label-blue-bg:  #e1eeff;   --pd-label-blue-fg:  #0157ae;
--pd-label-red-bg:   #fde7e4;   --pd-label-red-fg:   #b21019;
--pd-label-yellow-bg:#ffedac;   --pd-label-yellow-fg:#804d00;
--pd-label-purple-bg:#eeeafb;   --pd-label-purple-fg:#5345bf;
--pd-label-gray-bg:  #ececed;   --pd-label-gray-fg:  #3f424a;
/* elevation [V] — Pipedrive's literal shadows */
--pd-elevation-button: 0 1px 2px rgb(42 54 71/5%);
--pd-elevation-raised: 0 1px 3px rgb(0 0 0/7%), 0 1px 2px rgb(0 0 0/6%), 0 0 1px rgb(0 0 0/5%);
--pd-elevation-raised-hover: 0 0 4px rgba(0,0,0,.12), 0 3px 5px rgb(0 0 0/8%);
--pd-elevation-floating: 0 1px 8px rgba(0,0,0,.1), 0 3px 3px rgb(0 0 0/6%), 0 3px 4px rgb(0 0 0/5%), 0 0 2px rgba(0,0,0,.16);
--pd-elevation-overlay: 0 8px 10px rgba(0,0,0,.1), 0 6px 30px rgb(0 0 0/6%), 0 16px 24px rgb(0 0 0/5%), 0 0 2px rgba(0,0,0,.24);
```

Label chips in dark mode: bg = dark-{color}-200, fg = dark-{color}-800 (e.g. green `#013417`/`#76a97c`).

---

## 4. Shell spec

### Top bar (`components/layout/top-bar.tsx`)

| Property | Spec |
|---|---|
| Height | **48px** (`h-[48px]`) — Pipedrive top-bar scale; note Tailwind `h-12` renders 42px at our 14px root, so use the arbitrary value |
| Background | solid `bg-card` (white / `#1e2029` dark) — remove `bg-background/80 backdrop-blur` |
| Border | `border-b` (divider-medium via `--border`); no shadow (`--pd-elevation-navbar` is none [V]) |
| Left | `SidebarTrigger` (kept) + vertical separator (kept). Brand mark stays in the sidebar header, which occupies Pipedrive's brand position — do not duplicate it in the top bar |
| Center-left | **Global search field** (renders now; wiring is Phase 4): `h-8 w-64 md:w-80 rounded-full bg-secondary hover:bg-accent` with `Search` icon 16px `text-[--pd-text-secondary]`, placeholder text `Search` (13px), right-aligned `⌘K` kbd hint (11px, `text-[--pd-text-muted]`, border divider-medium, rounded 4px, px-1). Clicking opens the existing ⌘K stub (`global-search.tsx`) |
| Right of search | **Quick-add "+"**: `size-8 rounded-full bg-primary text-primary-foreground hover:bg-[#077838] active:bg-[#00672a]` (dark: hover `#5d9867`), `Plus` icon 16px, `aria-label="Quick add"`. Opens a shadcn `DropdownMenu` (see copy contract) with items: New deal / New account / New contact / New activity, each with its lucide icon (`KanbanSquare`, `Building2`, `User`, `CalendarPlus`) at 16px `text-[--pd-text-secondary]`. Each item routes to the EXISTING create flow for that entity (page or dialog — planner wires exact targets; no new routes) |
| Far right | `UserMenu` (kept), avatar ring on focus uses `--ring` |

### Left nav (`components/layout/app-sidebar.tsx`) — light labeled nav

| Property | Spec |
|---|---|
| Background | `--sidebar` white (dark `#1e2029`); `border-r` sidebar-border |
| Brand header | keep SchoolConex mark; logo tile `bg-primary` (now green-600), `rounded-[4px]`; name 14px/600 ink; "CRM" 11px `--pd-text-muted` |
| Group labels | 11px / 600 / uppercase / `text-[--pd-text-muted]` (Pipedrive caption-s [V]) |
| Item (rest) | icon+label row (existing structure kept): label 14px/450–400 `text-sidebar-foreground`, icon 16px `text-[--pd-text-secondary]`, `rounded-[4px]` |
| Item hover | `bg-sidebar-accent` (`#ececed` / `#2a2c35`) |
| Item active | **green-tinted**: bg `#e9fbe7`, text `#00672a`, icon `#077838` (dark: bg `#012710`, text `#a0c6a1`, icon `#5d9867`). No left indicator bar |
| Nav content | keep existing groups/items (Sales / Personal / Admin) and routes unchanged. Do NOT add Leads/People/Orgs/Mail/Insights placeholders (deferred to their phases) |
| Footer | keep "Phase 1 · {sha}", restyle 11px `text-[--pd-text-muted]` |

### Page conventions

- Page wrapper stays `px-6 py-5`; the page sits on `bg-background` (`#f5f5f6`) with content in white `bg-card` blocks — every table/list/form gets a card surface (border divider-medium, radius 8px, no shadow or `--pd-elevation-raised` for kanban cards only).
- Page title: **21px / weight 400 / leading-8** (Pipedrive title-xl [V]) in ink; optional right-aligned action buttons on the same row.
- Section/card titles: 16px/600 (title-l); sub-sections 14px/600 (title-m).

---

## 5. Component styling deltas (existing shadcn kit)

| Component | Spec (light; dark flips per Section 3) |
|---|---|
| **Button primary** | `bg-primary text-white`, hover `#077838`, active `#00672a`, radius **4px**, height `h-8` (`size="sm"` default kept), 14px/600 label, shadow `--pd-elevation-button`. Focus: 3px ring `--ring` at 40% |
| **Button secondary/outline** | white bg (`bg-card`), `border` `#d7d7d9`, ink text, hover `bg-secondary` (`#f5f5f6`), active `bg-accent` (`#ececed`), radius 4px [D] |
| **Button ghost** | transparent, ink text, hover `bg-accent` |
| **Button destructive** | `bg-destructive text-white`, hover `#c82627`, active `#b21019` |
| **Link** | `text-[--pd-link]` (`#0d68c5`), hover `#0157ae` + underline; never green links |
| **Badge / label chip** | pill (`rounded-full`), `h-5 px-2`, 12px/600; colored via `--pd-label-{color}-bg/fg` pairs (Section 3); default/neutral = gray pair. Outline badge: transparent bg, divider-strong border, `--pd-text-secondary` text [D styling, V colors] |
| **Table** | header row `bg-secondary` (`#f5f5f6`), header text 12px/600 `text-[--pd-text-secondary]` (sentence case, not uppercase); body rows `bg-card` white, `border-b` divider-medium (1px) each row; hover `bg-secondary`; selected `bg-[--pd-info-bg-light]` (`#eff6ff`); keep current compact row padding (`py-2`, `text-sm`) |
| **Card** | `bg-card`, 1px border divider-medium, radius **8px**, no default shadow; interactive/kanban cards get `--pd-elevation-raised`, hover `--pd-elevation-raised-hover` |
| **Input / Select / Textarea** | `bg-card` white, border `--input` (`#d7d7d9`), radius 4px, `h-8`, 14px text, placeholder `--pd-text-muted`; focus: border `#2b74da` + 3px ring `--ring`/24%; error: border `--pd-negative` + message 12px `text-[--pd-negative-strong]` |
| **Tabs** | underline style: list has `border-b` divider-medium, transparent bg (drop the pill-style `bg-muted` look); trigger 14px/600 `text-[--pd-text-secondary]` `pb-2`; active: ink text + 2px bottom border `--primary`; hover (inactive): ink text |
| **Toasts (sonner)** | `bg-card`, border divider-medium, radius 8px, `--pd-elevation-floating`; success icon `--pd-positive`, error icon `--pd-negative`, info icon `--pd-info`; title 14px/600 ink, description 13px `--pd-text-secondary` |
| **Dialog / Popover / Dropdown** | `bg-popover`, radius 8px, `--pd-elevation-overlay` (dialog) / `--pd-elevation-floating` (popover/menu); menu item hover `bg-accent`; menu item height `h-8`, 14px |
| **Kbd / meta text** | 11px `--pd-text-muted` |

**Rule:** green is reserved for primary actions, positive status, and nav-active tint. Selection/focus/links are blue. Destructive is red. Never mix (no green links, no blue primary buttons).

---

## 6. Typography & spacing

Font: **Inter** (verified as Pipedrive's font), `next/font/google` variable, `font-feature-settings` kept. Keep **14px root** (`html { font-size: 14px }`) and all existing `text-xs`/`text-sm` density conventions.

Type scale (Pipedrive tokens [V], mapped to our root):

| Role | Size / line-height | Weight | Usage |
|------|------|--------|-------|
| Body | 14px / 21px | 400 (Pipedrive uses 450; 400 acceptable, 450 preferred if the variable axis loads) | default text, inputs, table cells |
| Body strong | 14px / 21px | 600 | emphasized cells, labels-in-forms |
| Body small | 12px / 18px | 400 | secondary/meta rows (`text-xs`) |
| Caption | 11px / 16px | 600 uppercase | sidebar group labels, column-group captions |
| Button | 14px / 20px (small: 12px/16px) | 600 | all buttons |
| Title M | 14px / 21px | 600 | sub-section headers |
| Title L | 16px / 24px | 600 | card/section titles |
| Title XL | 21px / 32px | 400 | page titles |
| Title XXL | 25px / 38px | 400 | dashboard hero numbers/screens (rare) |
| Badge | 10–12px | 600 | chips, counts |

Spacing (Pipedrive scale [V] — matches Tailwind steps; keep current paddings): 1, 2, 4, 6, 8, 12, 16, 24, 32, 40, 48, 56, 64px. Exceptions: none — the existing `px-6 py-5` page wrapper (24/20px) stays.

Radius [V]: xs 2px, sm 4px (buttons, inputs, menu items, nav items), lg 8px (cards, dialogs, toasts), full (chips, search field, quick-add, avatars).

---

## 7. Dark mode

Mechanism unchanged: `next-themes` + `.dark` class + `@custom-variant dark`. Contract:

- Every semantic group flips by re-pointing to the **dark base scale at the same shade index** (Section 1–2 tables). No component may hardcode a light hex — always vars/utilities.
- Surfaces invert around the same hierarchy: app bg `#0e1017` → cards `#1e2029` → overlays `#2a2c35` (elevation = lighter, Pipedrive dark-neutral ladder [V values, D application]).
- Dividers/fills switch from ink-alpha to white-alpha at the same opacities (.08/.12/.24).
- Status tints flip to deep tints (e.g. positive-bg `#ddf4db` → `#013417`) with light text (`-800`/`-900` dark shades) — chips stay readable without changing markup.
- Primary buttons: `#3c824e`, hover `#5d9867`; links `#588adf`; focus ring `#3768ba`.
- Parity rule: any new `--pd-*` var MUST be declared in both `:root` and `.dark` in the same commit.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Quick-add menu items | `New deal` / `New account` / `New contact` / `New activity` (sentence case, exactly these) |
| Global search placeholder | `Search` (+ `⌘K` kbd hint) |
| Primary CTA pattern | verb + noun, sentence case: `Save changes`, `Add deal`, `Create account` |
| Empty state heading | `No {items} yet` (e.g. `No opportunities yet`) |
| Empty state body | one line + the create action, e.g. `Create your first deal to start tracking your pipeline.` + primary button |
| Error state | existing `toast.error(message)` pattern kept; message = what failed + `Try again` where retryable |
| Destructive confirmation | existing dialogs kept; button label = `Delete {entity}` on `--destructive`, cancel is secondary |
| Existing page copy | unchanged this phase (re-skin only) |

## Money formatting (phase scope)

CAD is the house currency. Extend `fmtCad` (`lib/crm/dashboard.ts`) into a shared formatter (`Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })`, per-row currency respected per `fmtMoney` in `pipeline-board.tsx`) and sweep the four `en-US`/USD hardcodes: `components/crm/opportunity-list.tsx:8`, `components/crm/document-list.tsx:29`, `app/(dashboard)/settings/catalog/page.tsx:10`, `app/(dashboard)/opportunities/[id]/page.tsx:18`. Money values in tables render `tabular-nums`.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official (existing kit) | none new — restyle only | not required |
| third-party | none | not applicable |

---

## 8. Reviewer quality checklist (6 pillars)

1. **Hierarchy** — Page title (21px/400) > section titles (16px/600) > body (14px); gray app background with white cards makes content zones obvious; primary action is the single green element per view; secondary actions are white/bordered.
2. **Contrast** — All body text ≥ AA: ink `#21232c` on white/`#f5f5f6`; secondary `#65686f` ≥ 4.5:1; `#93949a` only at 12px+ meta; white on `#2d8647` and `#d83c38` ≥ 4.5:1; links `#0d68c5` ≥ 4.5:1. Spot-check dark equivalents (`#e2e2e4` on `#1e2029`, white on `#3c824e`).
3. **Consistency** — Zero hardcoded hexes in components (vars/utilities only); green=primary/positive, blue=links/selection/info, red=destructive/negative, yellow=warning everywhere; radius: 4px controls / 8px surfaces / full chips, no strays.
4. **Density preserved** — 14px root untouched; `px-6 py-5` wrappers, `h-8` controls, `py-2` table rows, `text-xs/sm` patterns all intact; no component grew beyond current height except top bar (42→48px).
5. **Dark-mode parity** — Toggle every screen: no white flashes, no unreadable chips, every new `--pd-*` var present in `.dark`, status tints legible, sidebar active-state visible.
6. **No-regression** — tsc + build + `scripts/e2e-rayan.mts` + Playwright walk pass; all existing routes render; quick-add targets resolve to existing create flows; CAD sweep changes formatting only; "Phase 1 · sha" footer intact.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending

---

### Source appendix

- **Primary [V]:** `https://cdn.yul-1.pipedriveassets.com/auth/assets/root-CUCSsIpx.css` (Pipedrive live design-token bundle, fetched 2026-07-11): all `--pd-global-color-*` base scales (light+dark, 6 colors × 11 shades), semantic `--pd-color-*` aliases (light), typography `--pd-font-*`, spacing `--pd-spacing-*`, radius `--pd-radius-*`, elevation `--pd-elevation-*`.
- **Architecture [V]:** priitkaru.com/semantic-design-system (Pipedrive Design Systems Manager 2022-24) via docs/research/pipedrive-teardown.md — confirms `$primary-default = $green-600`, `$warning-strong = $yellow-700`, contrast-matched shade levels.
- **[D] items:** dark-theme semantic application (auth bundle ships light-only; dark scales are verified, mapping is structural), input border/focus specifics, secondary-button border, table/chip micro-styling (from public screenshots), chart colors.
- Verified:derived ≈ **9:1** by token count; the entire base palette and light semantic layer are verified.
