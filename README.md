# SchoolConex CRM

In-house CRM for SchoolConex — Phase 1 (Foundation).

**Status:** Scaffolding (Phase 1 step 1 of 8). See `docs/superpowers/specs/2026-05-06-schoolconex-crm-design.md` for the full design.

## Stack

- **Framework:** Next.js 15 (App Router, RSC, Server Actions)
- **DB / Auth / Storage:** Supabase (Postgres + Auth + Storage)
- **ORM:** Drizzle
- **Background jobs:** Inngest (Phase 3+)
- **UI:** Tailwind v4 + shadcn/ui (compact CRM density)
- **Hosting:** Vercel

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in Supabase project values
cp .env.example .env.local

# 3. Run migrations against your Supabase project (Phase 1 step 2 onward)
npm run db:push

# 4. Start the dev server
npm run dev
```

App runs at http://localhost:3000.

## Project structure

```
app/
  (auth)/                Sign-in, callback (Phase 1 step 3)
  (dashboard)/
    accounts/            Accounts list + detail
    opportunities/       Pipeline kanban + opportunity detail
    settings/            User roles, pipelines (admin)
components/
  crm/                   Domain components (account card, pipeline column, …)
  layout/                Sidebar, top bar, page shell
  ui/                    shadcn primitives
lib/
  supabase/              Server / browser / middleware clients
  db/                    Drizzle schema + queries
  auth/                  Session + role helpers
  crm/                   Domain helpers (recordActivity, etc.)
supabase/
  migrations/            SQL migrations (RLS-first)
  seed/                  Demo data scripts
inngest/                 Background jobs (Phase 3+)
docs/superpowers/
  specs/                 Design specs (source of truth)
Project_notes_folder/    Persistent project notes (read me first if joining mid-project)
```

## Important reading order for new contributors

1. `docs/superpowers/specs/2026-05-06-schoolconex-crm-design.md`
2. `Project_notes_folder/PROJECT_NOTES.md`
3. `Project_notes_folder/CHANGELOG.md`

## Phase 1 scope (locked — D-013)

Tables: `users`, `accounts`, `contacts`, `pipelines`, `pipeline_stages`, `opportunities`, `activities`, `notes`, `tasks`, `audit_log`.

Pages: accounts list, account-360 (4 panels: summary, contacts, opportunities, activities), opportunity board, opportunity detail, contacts management, settings (user roles + pipelines).

**Not in Phase 1:** Google Drive, Dialpad, Stripe, Mailshake, WhatsApp, quoting (`products`/`packages`/`opportunity_line_items`), AI features.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check (no emit) |
| `npm run format` | Prettier write |
| `npm run db:generate` | Generate Drizzle migrations from `lib/db/schema.ts` |
| `npm run db:push` | Push schema to Supabase (dev) |
| `npm run db:migrate` | Apply migrations (production) |
| `npm run db:studio` | Drizzle Studio |
