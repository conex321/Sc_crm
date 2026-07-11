# External Integrations

**Analysis Date:** 2026-07-11

## APIs & External Services

**Email outreach — Mailshake:**
- Daily campaign sync: Vercel cron `/api/cron/mailshake-sync` (08:00 UTC, `app/api/cron/mailshake-sync/route.ts`) calls `syncAllCampaigns()` in `lib/integrations/mailshake-sync.ts`, then `runAutoPipeline()` (`lib/integrations/auto-pipeline.ts`) and `sweepUnprocessedMailshakeEvents()` (`lib/integrations/mailshake-events.ts`) which self-heals any webhook events that failed inline processing
- Webhook: `app/api/webhooks/mailshake/route.ts` — HMAC verify (`MAILSHAKE_WEBHOOK_SECRET`, verification in `lib/integrations/mailshake.ts`), dedupe-insert into `integration_events_raw`, then **processes inline** via `processMailshakeRawEvent()` because production has no Inngest keys; the Inngest emit only fires when `INNGEST_DEV` is set
- Sync owner stamping: `MAILSHAKE_SYNC_USER_EMAIL` / `MAILSHAKE_SYNC_USER_ID` env; owner columns stamped on INSERT only so admin reassignments survive re-syncs (D-038)
- Ops scripts: `scripts/mailshake-sync.mts`, `scripts/mailshake-import-accounts.mts`, `scripts/mailshake-list-campaigns.mts`, `scripts/mailshake-stats.mts`
- Auth: `MAILSHAKE_API_KEY`

**Telephony — Dialpad:**
- Daily cron `/api/cron/dialpad-sync` (07:00 UTC, `app/api/cron/dialpad-sync/route.ts`): iterates calls via `lib/integrations/dialpad-client.ts` (recordings, transcripts), matches caller identity to contacts via `lib/integrations/contact-matcher.ts` (`matchIdentityToContact`, `stampContactPhoneIfEmpty`), records activities (`lib/integrations/record-activity.ts`), runs auto-pipeline. Scope controlled by `DIALPAD_SYNC_SCOPE` (default `company`) and `DIALPAD_FILTER_USER_ID/PHONE/EMAIL`
- Webhook: `app/api/webhooks/dialpad/route.ts` (signature via `DIALPAD_WEBHOOK_SECRET`, emits Inngest event — dev path)
- Backfill/repair scripts: `scripts/dialpad-backfill.mts`, `scripts/dialpad-rematch-calls.mts`, `scripts/dialpad-rematch-identity.mts`, `scripts/dialpad-reattribute-*.mts`
- Auth: `DIALPAD_API_KEY`

**Gmail (per-user email logging):**
- Per-user OAuth connect flow: `app/api/gmail/connect/route.ts` → `lib/integrations/google/gmail.ts` (scope: `gmail.readonly` only) → callback `app/auth/gmail-callback/`; tokens stored in `integration_credentials` table
- Daily cron `/api/cron/gmail-sync` (09:00 UTC, `app/api/cron/gmail-sync/route.ts`): for each connected user, lists messages since last sync (7-day default lookback), skips internal `@schoolconex.com` traffic, matches to contacts via `matchEmailToContact()` and records activities + `email_messages` rows

**Google Drive / Docs (contract generation):**
- Dual auth in `lib/integrations/google/drive.ts`: per-user OAuth (`drive.file` scope, `lib/integrations/google/oauth.ts`, connect at `app/api/google-drive/connect/route.ts`, callback `app/auth/google-drive-callback/`) AND a service account (`GOOGLE_SERVICE_ACCOUNT_KEY` JSON) for template copy/Docs merge (`getDriveAsService()`, `getDocsAsService()`)
- Folder config: `GOOGLE_DRIVE_SHARED_DRIVE_ID`, `GOOGLE_DRIVE_TEMPLATES_FOLDER_ID`, `GOOGLE_DRIVE_GENERATED_FOLDER_ID`; document CRM logic in `lib/crm/documents.ts`
- OAuth app: `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` (GCP project `GOOGLE_CLOUD_PROJECT_ID`; setup automated by `scripts/gcp-*.mts`)

**Billing imports — QuickBooks + Stripe (one-off scripts):**
- `scripts/quickbooks-build-canonical.mts` builds `.quickbooks/qbo-canonical.json`; `scripts/quickbooks-import-customers.mts` imports into accounts/contacts (D-041). Idempotent match ladder: `external_ids->>'quickbooks_id'` → overlapping `external_ids->'stripe_ids'` → case-insensitive name → insert. Enriches, never clobbers curated fields
- Stripe webhook (event capture only): `app/api/webhooks/stripe/route.ts`, verification in `lib/integrations/stripe.ts` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`); processing function `inngest/functions/stripe-process-event.ts` (dev-only path)

**HubSpot (import script — awaits token):**
- `scripts/hubspot-import.mts` (`npm run leads:import-hubspot`, D-044): pages companies/contacts through the shared `lib/import/engine.ts`, produces a revertable import batch owned by Rayan, stamps `external_ids.hubspot_id`. Requires `HUBSPOT_ACCESS_TOKEN` (Private App, `crm.objects.companies.read` + `crm.objects.contacts.read`)

**Website lead capture:**
- Public endpoint `app/api/leads/website/route.ts`: schoolconex.com contact form POSTs with shared secret `WEBSITE_LEAD_TOKEN`; match-or-create account+contact (`source='website'`), inbound activity, follow-up task for `WEBSITE_LEAD_OWNER_EMAIL` (default rayan@schoolconex.com), Slack ping

**Slack (notify only):**
- `lib/integrations/slack-notify.ts` — plain fetch to `SLACK_WEBHOOK_URL` incoming webhook, no SDK. Env-gated: silently no-ops when unset, never throws. Used for reply-detected + new-website-lead notifications

**WhatsApp via Twilio (webhook scaffold):**
- `app/api/webhooks/whatsapp/route.ts` + `lib/integrations/twilio.ts` (signature check via `TWILIO_AUTH_TOKEN`, skipped in dev); processing in `inngest/functions/whatsapp-process-event.ts` (dev-only path)

**Daily digest (SMTP email):**
- Cron `/api/cron/daily-digest` (11:30 UTC = 07:30 ET, `app/api/cron/daily-digest/route.ts`): builds per-rep digest (`lib/integrations/digest.ts`) and sends via nodemailer over Google Workspace SMTP (`lib/integrations/mailer.ts`). Env-gated on `SMTP_USER`/`SMTP_PASS` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`); `?dry=1` previews without sending

## Data Storage

**Databases:**
- Supabase Postgres, project `ooanslwrwjexdjwdphes`
  - Service-role connection: `DATABASE_URL` → Drizzle `db` (`lib/db/index.ts`) — **bypasses RLS**, crons/webhooks/scripts only
  - RLS-enforced: `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + user JWT → `lib/supabase/server.ts` / `browser.ts` — all user-facing pages/actions
- Raw event landing table: `integration_events_raw` (provider + eventId unique) — every webhook/cron writes here first
- Cross-system identity: `accounts.external_ids` / `contacts.external_ids` jsonb (`quickbooks_id`, `stripe_ids`, `hubspot_id`)

**File Storage:**
- Google Drive (shared drive) for generated contracts; no app-level blob storage

**Caching:**
- None

## Authentication & Identity

**Auth Provider:**
- Supabase Auth with **Google SSO**, domain-restricted: `app/(auth)/login/actions.ts` passes `hd: ALLOWED_EMAIL_DOMAIN` (default `schoolconex.com`); callback at `app/auth/callback/`
- Session refresh middleware: `proxy.ts` → `lib/supabase/middleware.ts` (`updateSession`)
- Session helpers: `lib/auth/session.ts` — `getCurrentUser()`, `requireUser()`, `requireRole()`; roles enum `rep | manager | admin` (`lib/db/schema.ts` `userRoleEnum`)
- Role assignments (D-039): matthew@schoolconex.com = **admin**, rayan@schoolconex.com = **rep**; re-asserted by `scripts/create-matthew-user.sql` / `scripts/create-rayan-user.sql` on every run — keep it that way

**RLS model (migrations `supabase/migrations/`):**
- `0008_per_rep_ownership.sql`: reps SELECT only their own `activities`, `email_messages`, `calls`, `mailshake_campaigns`/`mailshake_leads` (or activities on accounts they own); admin sees everything. Adds `mailshake_campaigns.owner_user_id`, `mailshake_leads.assigned_user_id`
- `0011_rep_edit_access.sql` (D-043): any authenticated user may UPDATE `accounts`/`contacts`/`opportunities` (matching open INSERT); DELETE stays admin-only; billing figures admin-gated in UI
- `0012_import_batches.sql` (D-044): `import_batches` + `import_batch_rows` (owner-scoped, revertable imports); adds `accounts.norm_name` **stored generated column** — never let `db:push` drop it
- All migrations idempotent; runner `tsx scripts/apply-sql.mts supabase/migrations` re-applies every file

## Monitoring & Observability

**Error Tracking:** None (Vercel function logs only)
**Logs:** console logging in route handlers; raw payload audit trail in `integration_events_raw`

## CI/CD & Deployment

**Hosting:**
- Vercel — production `https://sc-crm-sand.vercel.app`; deploy `npx vercel --prod --yes` (helpers: `scripts/deploy-prod.sh`, `scripts/vercel-push-env.sh`, `scripts/vercel-smoke-prod.mts`)
- **`NEXT_PUBLIC_*` env vars are baked at build time** — changing one in Vercel requires a redeploy

**CI Pipeline:** None detected (no `.github/workflows`)

**Scheduled jobs — Vercel crons (`vercel.json`), the PRODUCTION scheduler:**
| Path | Schedule (UTC) | Purpose |
|------|----------------|---------|
| `/api/cron/dialpad-sync` | 0 7 * * * | Pull calls/transcripts, match, record activities |
| `/api/cron/mailshake-sync` | 0 8 * * * | Campaign sync + auto-pipeline + event sweeper |
| `/api/cron/gmail-sync` | 0 9 * * * | Per-user Gmail readonly sync |
| `/api/cron/daily-digest` | 30 11 * * * | Per-rep morning email digest |

All crons authenticate via `Authorization: Bearer ${CRON_SECRET}` (Vercel injects it).

**Inngest (`inngest/client.ts`, served at `app/api/inngest/route.ts`) — DEV-ONLY in practice:**
- **No Inngest keys in production**; webhooks process inline and Vercel crons drive scheduling. Inngest emits are gated on `INNGEST_DEV`
- Functions (`inngest/functions/index.ts`): `mailshakeProcessEvent`, `mailshakeSyncCampaigns`, `dialpadProcessEvent`, `dialpadSyncRayan`, `stripeProcessEvent`, `whatsappProcessEvent`, `driveStatusReconcile`

## Environment Configuration

**Required env vars (see `.env.example` for full shape; values live in `.env.local` locally and Vercel in prod — never commit or quote values):**
- Core: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, `ALLOWED_EMAIL_DOMAIN`
- Mailshake: `MAILSHAKE_API_KEY`, `MAILSHAKE_WEBHOOK_SECRET`, `MAILSHAKE_SYNC_USER_EMAIL`, `MAILSHAKE_SYNC_USER_ID`
- Dialpad: `DIALPAD_API_KEY`, `DIALPAD_WEBHOOK_SECRET`, `DIALPAD_SYNC_SCOPE`, `DIALPAD_FILTER_USER_{ID,PHONE,EMAIL}`
- Google: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_DRIVE_{SHARED_DRIVE_ID,TEMPLATES_FOLDER_ID,GENERATED_FOLDER_ID}`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; Twilio: `TWILIO_AUTH_TOKEN`
- Notify: `SLACK_WEBHOOK_URL`, `SMTP_{HOST,PORT,USER,PASS,FROM}`
- Leads: `WEBSITE_LEAD_TOKEN`, `WEBSITE_LEAD_OWNER_EMAIL`, `HUBSPOT_ACCESS_TOKEN` (pending)

**Secrets location:** `.env.local` (gitignored, exists) locally; Vercel project env in production

## Webhooks & Callbacks

**Incoming:**
- `POST /api/webhooks/mailshake` — HMAC-verified, inline processing + sweeper self-heal
- `POST /api/webhooks/dialpad` — signature-verified (dev-skipped when secret unset)
- `POST /api/webhooks/stripe` — `stripe-signature` verified
- `POST /api/webhooks/whatsapp` — Twilio signature (dev-skipped)
- `POST /api/leads/website` — shared-secret token
- OAuth callbacks: `app/auth/callback/` (Supabase SSO), `app/auth/gmail-callback/`, `app/auth/google-drive-callback/`

**Outgoing:**
- Slack incoming webhook (`SLACK_WEBHOOK_URL`), SMTP digest mail, Google/Mailshake/Dialpad/Stripe API calls listed above

---

*Integration audit: 2026-07-11*
