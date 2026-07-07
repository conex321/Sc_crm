# Session 2026-07-06 — crm-visibility-upgrade

**Agent:** Claude
**Duration / scope:** Audit the CRM's connections + visibility; fix what stops it working as a CRM and get Rayan actually integrated. Follow-on to the same-day D-041 import.
**Related decisions:** D-042 (builds on D-038 per-rep RLS, D-041 customer import).

## What was done

Audited the live prod DB + code (3 explore/plan agents + direct queries). Found: Rayan idle 24 days, 0 Gmail/Drive connections, 87% of calls unmatched, Mailshake events never processed, dashboard showing fake demo pipeline. Root cause of the unmatched calls: the contact matcher ran on the RLS Supabase client from session-less crons → matched nothing. Then shipped a connections + visibility upgrade (D-042):

- **Matcher rewrite** onto Drizzle service-role (`lib/integrations/contact-matcher.ts`) — fixes matching across Dialpad/Gmail/all event processors at once.
- **Identity matching** (`matchIdentityToContact` phone→email→name + containment) + phone backfill; wired into the live Dialpad cron + Inngest fns; `auto-pipeline.ts` rematch extended to raw payloads (both JSON shapes). Backfill script `dialpad-rematch-identity.mts` → unmatched 191→185.
- **Real dashboard** (`lib/crm/dashboard.ts` + `dashboard/page.tsx`): per-rep "my day" KPIs, follow-up queue, weighted pipeline, admin CAD revenue tiles + rep leaderboard, Connect-Gmail banner.
- **Follow-up queue** view (migration `0010_followup_view.sql`, `security_invoker`) — open leads with no touch in 7+ days.
- **Kanban** (`pipeline-board.tsx`): CAD-aware money, stage probability, Mine toggle, weighted forecast.
- **Mailshake real-time** (`lib/integrations/mailshake-events.ts`): inline webhook processing + cron sweeper (prod has no Inngest keys); reply → Slack.
- **Notifications**: in-app + `slack-notify.ts` (dep-free) + daily digest (`digest.ts` + `mailer.ts` nodemailer + `cron/daily-digest`). All inert until env set.
- **Website lead capture** (`api/leads/website/route.ts` + `docs/website-lead-form.md`): public token-gated endpoint → account+contact+task(Rayan)+Slack.
- **Ops**: all 72 QB/Stripe customers → Rayan; demo data purged (dashboard now honest).

## Files touched

- New: `lib/crm/dashboard.ts`, `lib/integrations/mailshake-events.ts`, `lib/integrations/slack-notify.ts`, `lib/integrations/digest.ts`, `lib/integrations/mailer.ts`, `app/api/cron/daily-digest/route.ts`, `app/api/leads/website/route.ts`, `supabase/migrations/0010_followup_view.sql`, `scripts/dialpad-rematch-identity.mts`, `scripts/assign-customer-owners.mts`, `scripts/purge-demo-data.mts`, `docs/website-lead-form.md`.
- Modified: `lib/integrations/contact-matcher.ts` (Drizzle rewrite), `lib/integrations/auto-pipeline.ts`, `lib/integrations/dialpad.ts`, `app/api/cron/dialpad-sync/route.ts`, `app/api/cron/mailshake-sync/route.ts`, `app/api/webhooks/mailshake/route.ts`, `inngest/functions/{dialpad-process-event,dialpad-sync-rayan,mailshake-process-event}.ts`, `app/(dashboard)/dashboard/page.tsx`, `app/(dashboard)/opportunities/page.tsx`, `components/crm/pipeline-board.tsx`, `app/(dashboard)/settings/integrations/page.tsx`, `app/(dashboard)/campaigns/page.tsx`, `lib/supabase/middleware.ts`, `vercel.json`, `package.json` (+nodemailer, +3 scripts).
- Data (prod DB, via scripts): 72 customer accounts → Rayan; 3 demo opps + 3 accounts + 4 contacts soft-deleted, 2 demo activities hard-deleted; 6 calls re-matched; migration 0010 applied.

## Decisions made

- D-042 — CRM connections & visibility upgrade (see decisions.md for full detail + open ops steps).

## Failures encountered

- None persistent. Two subagents initially returned garbled output (0 tool calls) — relaunched with tighter prompts. `dialpad-rematch-identity` first pass matched 0 (payload "names" are freeform labels like "Janki (Veritas International School)"); added a segment-containment pass → 6 matched.

## Handoff notes

- **Code complete, verified (tsc + build + e2e + endpoint smokes), NOT committed/deployed.** Deploy with `npx vercel --prod --yes` when Matthew approves (migration 0010 already applied to shared prod DB, so deploy is code-only).
- **Activation env (all features ship inert until set):** `MAILSHAKE_WEBHOOK_SECRET` (+ register webhook in Mailshake), `SLACK_WEBHOOK_URL`, `SMTP_USER`/`SMTP_PASS` (+ optional `SMTP_FROM`, `SMTP_HOST`, `SMTP_PORT`) for the digest, `WEBSITE_LEAD_TOKEN` (+ hand web team `docs/website-lead-form.md`), optional `WEBSITE_LEAD_OWNER_EMAIL` (default Rayan).
- **Still pending (prior):** Matthew + Rayan connect Gmail at `/settings/integrations`; then trigger `/api/cron/gmail-sync` with `CRON_SECRET` to verify ingestion.
- Website analytics (GA4) intentionally out of scope — Matthew chose lead-capture over an analytics tile.
