# Coding Conventions

**Analysis Date:** 2026-07-11

## Naming Patterns

**Files:**
- kebab-case for all source files: `pipeline-board.tsx`, `import-wizard.tsx`, `attach-to-account-dialog.tsx`
- Next.js reserved names for routes: `page.tsx`, `layout.tsx`, `actions.ts` (server actions co-located per route directory, e.g. `app/(dashboard)/accounts/actions.ts`)
- Standalone scripts: `scripts/*.mts` (kebab-case, run with `tsx`), named `<domain>-<verb>.mts` (e.g. `mailshake-sync.mts`, `dialpad-backfill.mts`)
- SQL migrations: `supabase/migrations/NNNN_*.sql`

**Functions:**
- camelCase: `createAccount`, `updateAccount`, `softDeleteAccount`, `fmtMoney`, `sumByCurrency`, `ownerOrNull`
- Server actions are verbs on the entity: `create<Entity>`, `update<Entity>`, `softDelete<Entity>`, `move<Entity><Thing>` (e.g. `moveOpportunityStage`)
- React components are PascalCase named exports: `export function PipelineBoard(...)` in `components/crm/pipeline-board.tsx`

**Variables:**
- camelCase in TypeScript. Drizzle schema fields are camelCase mirroring snake_case DB columns: `ownerUserId: uuid("owner_user_id")`, `createdAt: timestamp("created_at", ...)` (`lib/db/schema.ts`)
- Supabase (`sb`) query results keep raw snake_case column names (`owner_user_id`, `stage_id`, `deleted_at`) — do NOT camelCase data coming through the Supabase client
- Module-level constants SCREAMING_SNAKE only in scripts (`SITE`, `ROUTES` in `scripts/e2e-rayan.mts`); in app code, module-level formatters are lowercase (`const formatter = new Intl.NumberFormat(...)`)

**Types:**
- PascalCase types, defined inline near use: `type Stage = {...}` in `components/crm/pipeline-board.tsx`, `type RouteCheck` in scripts
- Shared row types exported from `lib/crm/*`: `OpportunityWithRefs` (`lib/crm/opportunities.ts`), `DocumentRow` (`lib/crm/documents.ts`)
- Postgres enums declared in `lib/db/schema.ts` via `pgEnum` (e.g. `userRoleEnum`, `accountTypeEnum`) and mirrored as zod `z.enum([...])` in action schemas

## Code Style

**Formatting:**
- Prettier, config in `.prettierrc.json`: semicolons, double quotes (`singleQuote: false`), trailing commas `all`, printWidth 100, 2-space indent
- `prettier-plugin-tailwindcss` sorts classes; `tailwindFunctions: ["cn", "clsx", "cva", "twMerge"]`
- Run: `npm run format` / `npm run format:check` (repo has churn — a full `format:check` may report pre-existing diffs; format only files you touch)

**Linting:**
- `eslint.config.mjs` extends `next/core-web-vitals` + `next/typescript` via FlatCompat; ignores `.next/`, `node_modules/`, `supabase/migrations/`
- **`npm run lint` is BROKEN** (`next lint` was removed in Next 16). Do not treat lint as a gate; rely on `npx tsc --noEmit` and `npm run build`

## UI Component Conventions

**Component library:**
- shadcn/ui components live in `components/ui/*` (button, card, dialog, select, table, tabs, sonner, sidebar, etc.) built on the consolidated `radix-ui` package
- Feature components live in `components/crm/*`; layout chrome in `components/layout/*` (`app-sidebar.tsx`, `global-search.tsx`)
- Icons: `lucide-react` only (e.g. `import { Plus } from "lucide-react"`)
- Toasts: `sonner` — `import { toast } from "sonner"; toast.error(...)` / `toast.success(...)` (see `components/crm/account-form.tsx:44`, `components/crm/import-wizard.tsx`)

**Density (compact CRM look):**
- Page wrapper: `<div className="px-6 py-5">` (every page in `app/(dashboard)/*/page.tsx`)
- Text sizes: `text-xs` / `text-sm` throughout; buttons default to `size="sm"`
- Keep new pages consistent with this compact density — no large paddings or `text-lg` body copy

**Radix Select gotcha (D-043):**
- NEVER render `<SelectItem value="">` — Radix throws at runtime ("A <Select.Item /> must have a value prop that is not an empty string")
- Use sentinel values instead: `"unassigned"` for owner selects, `"none"` for optional refs. Pattern in `components/crm/account-form.tsx:79-84`:
  ```tsx
  <Select name="ownerUserId" defaultValue={defaultValues?.ownerUserId || "unassigned"}>
    ...
    <SelectItem value="unassigned">Unassigned</SelectItem>
  ```
- Map the sentinel back to `null` server-side (see `ownerOrNull()` in `app/(dashboard)/accounts/actions.ts:22-24` and the zod schema comment at line 17-19)

**Server vs client components:**
- Server components by default. Pages (`app/(dashboard)/**/page.tsx`) fetch data server-side with the RLS-enforcing Supabase client and pass plain data down
- `"use client"` only on small interactive leaf components (33 files total, e.g. `components/crm/pipeline-board.tsx`, `components/crm/import-wizard.tsx`, `components/crm/account-form.tsx`)
- Client components call server actions via `useTransition` + `startTransition`, doing optimistic local state updates and `toast.error` on failure (`pipeline-board.tsx`)

## Server Action Pattern (canonical)

`app/(dashboard)/accounts/actions.ts` is the reference implementation. Every action file follows:

1. `"use server"` at top
2. zod schema at module level (`accountSchema`) — `.trim()`, length caps, `z.enum` mirroring pg enums; empty-string-or-sentinel handling for optional selects
3. `fromForm(form: FormData)` helper converting FormData to a plain object with `String(form.get("x") ?? "")` defaults
4. `const user = await requireUser()` (`lib/auth/session.ts`) — first line of every action
5. `const sb = await getSupabaseServerClient()` (`lib/supabase/server.ts`) — the RLS-enforcing client. NEVER use the Drizzle `db` (`lib/db/index.ts`, service role, bypasses RLS) in user-facing actions
6. Empty optional strings coerced to `null` on write: `website: parsed.website || null`
7. Stamp `created_by`/`updated_by` (and `owner_user_id` on insert, defaulting to `user.id`)
8. **UPDATE guard:** always `.select("id")` after `.update()` and throw if 0 rows returned — RLS silently filtering the row would otherwise look like a successful save (`actions.ts:85-91`)
9. Deletes are soft: `update({ deleted_at: new Date().toISOString(), updated_by: user.id })`
10. `revalidatePath(...)` for every affected route, then `redirect(...)`
11. Errors: `if (error) throw new Error(error.message)` — client form catches and shows `toast.error`

## Import Organization

**Order (observed, not enforced):**
1. React / Next.js (`next/cache`, `next/navigation`, `next/link`)
2. Third-party (`zod`, `date-fns`, `sonner`, `@dnd-kit/*`)
3. Internal via `@/` alias: `@/components/ui/*`, `@/lib/*`, `@/app/...`
4. `import type { ... }` used for type-only imports

**Path Aliases:**
- `@/*` → project root (tsconfig). Always use `@/lib/...`, `@/components/...` — no relative `../../` climbs

## Currency Formatting

- **CAD is the house currency** (QuickBooks); default/fallback everywhere. Format with `Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })` (`lib/crm/dashboard.ts:316`)
- Opportunities carry per-row `currency`; format each amount in its own currency and choose locale by currency — see `fmtMoney()` in `components/crm/pipeline-board.tsx:25-32` and multi-currency summing in `sumByCurrency()` (renders `CA$X + US$Y`)
- Note: several older files still hardcode `en-US`/`USD` (`components/crm/opportunity-list.tsx:8`, `app/(dashboard)/settings/catalog/page.tsx:10`, `app/(dashboard)/opportunities/[id]/page.tsx:18`, `components/crm/document-list.tsx:29`) — new code should follow the CAD-default pattern, not these

## Styling / Theming

- Tailwind v4 (`@tailwindcss/postcss`), no `tailwind.config` — design tokens in `app/globals.css` via `@theme inline` mapping `--color-*` to shadcn CSS vars
- Colors defined in OKLCH in `:root` and `.dark` blocks of `app/globals.css`
- Dark mode: `next-themes` with `@custom-variant dark (&:is(.dark *))`
- Class merging: `cn()` helper (clsx + tailwind-merge) from `lib/utils`

## Error Handling

- Server actions: throw `Error(error.message)`; never swallow Supabase errors
- Guard against RLS no-op updates (see Server Action Pattern #8)
- Client: try/catch around action calls inside `startTransition`, surface via `toast.error(err instanceof Error ? err.message : "Failed to save")`

## Logging

**Framework:** `console` only (scripts log progress lines with ✓/✗ markers; app code logs sparingly)

## Comments

- Comment the WHY, especially around gotchas — e.g. the Radix sentinel comment in `accounts/actions.ts:17-19` and the RLS 0-row comment at line 88
- Section dividers in large files use `// ─── Section ───...` (see `lib/db/schema.ts`)
- No JSDoc requirement; occasional `/** ... */` on non-obvious helpers (`sumByCurrency`)

## Module Design

**Exports:** Named exports everywhere (components and helpers); no default exports except Next.js `page.tsx`/`layout.tsx`
**Barrel Files:** Not used — import from the specific file

## Database Access Rules (bite hard)

- Drizzle `db` (`lib/db/index.ts`): `DATABASE_URL` service role, **bypasses RLS** — crons/sync scripts ONLY
- Supabase `sb` (`lib/supabase/server.ts` and friends): anon key + user JWT, **enforces RLS** — ALL user-facing pages and server actions
- Migrations: hand-written SQL in `supabase/migrations/`, applied via `tsx scripts/apply-sql.mts`; keep `lib/db/schema.ts` in lockstep with every migration

---

*Convention analysis: 2026-07-11*
