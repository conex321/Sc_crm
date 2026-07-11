# Research Summary — pipedrive-parity-v1

**One-liner:** Clone Pipedrive's workflow + look onto the existing Next.js 16 / Supabase CRM; every behavioral spec below is already verified against primary sources.

## Sources (already produced — do NOT re-research)

- **Pipedrive product teardown** (verified, 104-agent deep-research, 2026-07-11): `docs/research/pipedrive-teardown.md` — kanban card/sort mechanics, deal-rotting rules, forecast-view spec, Leads Inbox list + side-panel spec, plan-tier gating (build-order signal), and the three-layer semantic token architecture (base 0–800 scales → Surface/Fill/Divider/Text/Icon/Primary/Negative/Warning/Positive/Info groups; $primary-default = $green-600).
- **Codebase map** (2026-07-11): `.planning/codebase/` — STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS, TESTING, INTEGRATIONS, CONCERNS.

## Stack additions needed (phase-level research to confirm exact usage)

- **recharts** for Insights charts (no chart lib present; chart-1..5 tokens already exist in globals.css).
- **Gmail send**: upgrade OAuth scope `gmail.readonly` → `+ gmail.send`; re-consent both reps; messages.send API via existing googleapis dep.
- Everything else builds on existing deps (dnd-kit, xlsx, radix/shadcn, drizzle, supabase-js).

## Table stakes vs differentiators (from teardown)

- Pipedrive all-tier baseline = pipelines/kanban/rotting/leads inbox/contacts/activities/custom fields/labels/import-export/insights/saved filters — this is wave 1.
- Growth-tier gated = email suite, forecast view — also wave 1 per Matthew.
- Premium add-ons (web forms, Smart Docs, Projects, Chatbot) + Automations/Sequences = wave 2 backlog.

## Critical pitfalls (full list in .planning/codebase/CONCERNS.md)

1. PostgREST: `.in()` >~100 values breaks (sub-batch); responses cap at 1000 rows (paginate with .range).
2. Reps cannot soft-delete under RLS — deletes go through service-role actions gated in app code.
3. Radix `<SelectItem value="">` throws — sentinel values only.
4. Inngest is dead in prod — prod logic must be inline or Vercel cron.
5. Migrations idempotent + schema.ts lockstep (generated column norm_name!).
6. New list views MUST paginate (~5.5k accounts).
7. No staging; verify locally before `npx vercel --prod --yes`.
8. Public repo — no hardcoded secrets; e2e creds via E2E_LOGIN_* env.

## Open gap

Exact Pipedrive hex values/typography: sample from Pipedrive Figma Community files (figma.com/@pipedrive) + live-app CSS during the design phase; semantic structure is already verified.
