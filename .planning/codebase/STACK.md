# Technology Stack

**Analysis Date:** 2026-07-11

## Languages

**Primary:**
- TypeScript 5.7 (`typescript ^5.7.2`, strict Next.js App Router codebase) - all app code in `app/`, `lib/`, `inngest/`, `scripts/`
- SQL (Postgres) - hand-written idempotent migrations in `supabase/migrations/`

**Secondary:**
- Bash - deploy helpers `scripts/deploy-prod.sh`, `scripts/vercel-push-env.sh`

## Runtime

**Environment:**
- Node.js >= 20.11.0 (`package.json` engines field)
- Production host: **Vercel** — production URL `https://sc-crm-sand.vercel.app`
- Deploy command: `npx vercel --prod --yes`

**Package Manager:**
- npm (`package-lock.json` present)
- Script runner for TS scripts: `tsx ^4.21.0` (all `scripts/*.mts`)

## Frameworks

**Core:**
- **Next.js ^16.2.4** (App Router) - full-stack framework; route handlers in `app/api/`, server actions/pages under `app/(auth)/` and `app/(dashboard)/`. Note: Next 16 uses `proxy.ts` (project root) instead of `middleware.ts` for the session-refresh middleware (`lib/supabase/middleware.ts`)
- **React 19.0.0** / **react-dom 19.0.0**
- **Tailwind CSS ^4.0.0** (via `@tailwindcss/postcss`, `postcss.config.mjs`) + `tw-animate-css`
- **shadcn/ui** style components (`components.json`) built on `radix-ui ^1.4.3`, `class-variance-authority`, `clsx`, `tailwind-merge`, `cmdk`, `sonner` (toasts), `lucide-react` (icons), `next-themes`

**Data layer:**
- **Drizzle ORM ^0.45.2** + `drizzle-kit ^0.31.10` (`drizzle.config.ts`) over `postgres ^3.4.5` driver — schema in `lib/db/schema.ts`, client in `lib/db/index.ts`
- **Supabase** (`@supabase/supabase-js ^2.46.2`, `@supabase/ssr ^0.5.2`) — auth + RLS-enforced data access, clients in `lib/supabase/{server,browser,middleware}.ts`

**Background jobs:**
- **Inngest ^4.3.0** (`inngest/client.ts`, `inngest/functions/`, served at `app/api/inngest/route.ts`) — **dev-only in practice: production has no Inngest keys**; Vercel crons are the production scheduler (`vercel.json`)

**Forms/validation:**
- `react-hook-form ^7.75.0` + `@hookform/resolvers` + `zod ^3.25.76`

**Testing:**
- **Playwright ^1.59.1** (`@playwright/test`) - e2e and browser-automation scripts (`scripts/e2e-*.mts`, `scripts/full-app-validate.mts`); no unit test framework detected

**Build/Dev:**
- ESLint 9 (`eslint.config.mjs`, `eslint-config-next`)
- Prettier ^3.4.2 with `prettier-plugin-tailwindcss`

## Key Dependencies

**Critical:**
- `googleapis ^171.4.0` + `google-auth-library ^10.6.2` - Gmail sync, Google Drive/Docs contract generation (`lib/integrations/google/`)
- `stripe ^22.1.0` - webhook verification + customer import (`lib/integrations/stripe.ts`)
- `nodemailer ^9.0.3` - transactional digest mailer over Workspace SMTP (`lib/integrations/mailer.ts`)
- `@dnd-kit/core ^6.3.1` / `@dnd-kit/sortable ^10.0.0` / `@dnd-kit/utilities` - pipeline board drag-and-drop
- `xlsx` (SheetJS 0.20.3, pinned to CDN tarball `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) - CSV/Excel lead import wizard (`lib/import/`)
- `date-fns ^4.1.0`, `server-only`, `dotenv ^17.4.2` (scripts load `.env.local` then `.env`)

## Database

**Supabase Postgres** — project `ooanslwrwjexdjwdphes`.

**CRITICAL — two DB clients with different privileges:**
- **Drizzle `db`** (`lib/db/index.ts`): connects via `DATABASE_URL` (service role), **BYPASSES RLS**. Use ONLY for crons, webhooks, and scripts. Lazy-init Proxy singleton (Next 16 build phase imports it without env vars).
- **Supabase `sb`** (`lib/supabase/server.ts` / `browser.ts`): anon key + user JWT, **ENFORCES RLS**. Use for ALL user-facing pages and server actions. Tightening RLS automatically scopes page reads; it never affects crons.

**Migrations:**
- Live in `supabase/migrations/` (`0001` … `0012`), applied with `tsx scripts/apply-sql.mts supabase/migrations` (`npm run db:apply-migrations`)
- The runner **re-applies every file on each run** — all migrations MUST be idempotent (`create if not exists`, `drop policy if exists` + recreate)
- Keep `lib/db/schema.ts` in lockstep with migrations. **Do NOT rely on `db:push` blindly** — it drops columns not listed in schema.ts, and `accounts.norm_name` is a Postgres **generated column** created by migration `0012_import_batches.sql`
- Seeds: `npm run db:seed` (`supabase/seed/`)

## Configuration

**Environment:**
- `.env.local` (local secrets, never read/committed) + `.env.example` (documented shape); production env vars live in Vercel (`scripts/vercel-push-env.sh`)
- **`NEXT_PUBLIC_*` vars are baked at BUILD time** — changing one in Vercel requires a redeploy or nothing changes
- Key vars: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL` (full list in INTEGRATIONS.md)

**Build:**
- `next.config.ts`, `tsconfig.json` (path alias `@/*`), `postcss.config.mjs`, `drizzle.config.ts`, `components.json`, `vercel.json` (cron schedules)

## Commands

```bash
npm run dev            # next dev
npm run build          # next build
npm run typecheck      # tsc --noEmit
npm run lint           # next lint
npm run format         # prettier --write .
npm run db:apply-migrations   # tsx scripts/apply-sql.mts supabase/migrations
npm run db:studio      # drizzle-kit studio
npx vercel --prod --yes       # deploy to production
```

Integration ops scripts (all `tsx scripts/*.mts`): `mailshake:sync`, `mailshake:import-accounts`, `dialpad:backfill`, `dialpad:rematch-calls`, `quickbooks:import`, `leads:import-hubspot`, `leads:import-sheet`, `status:audit`, `demo:purge` — see `package.json` scripts block.

## Platform Requirements

**Development:**
- Node >= 20.11, npm, `.env.local` populated per `.env.example`; optional Inngest CLI dev server (`INNGEST_DEV`)

**Production:**
- Vercel (crons in `vercel.json`, `CRON_SECRET` auth); Supabase project `ooanslwrwjexdjwdphes` for auth + Postgres

---

*Stack analysis: 2026-07-11*
