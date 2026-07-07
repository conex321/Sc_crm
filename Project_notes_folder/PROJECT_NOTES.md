# Project Notes — SchoolConex CRM

**Last updated:** 2026-07-06
**Last agent:** Claude
**Session summary:** CRM connections + visibility upgrade (D-042): fixed the dead RLS contact-matcher (root cause of 87% unmatched Dialpad calls), added identity-based call matching + backfill, a real per-rep dashboard + follow-up queue (migration 0010 `followup_leads` view), CAD/weighted-forecast kanban, inline Mailshake webhook processing (prod has no Inngest), Slack + daily-email-digest + in-app notifications, and a public website lead-capture endpoint. Assigned all 72 QuickBooks/Stripe customers to Rayan; purged demo data (dashboard now shows only real numbers). Verified (tsc/build/e2e/endpoint smokes); NOT committed/deployed. Prior same day: customer import (D-041); before: notes wiring (D-040), prod OAuth + per-rep RLS (D-038/D-039).
**Notes mode:** split
**Total sessions logged:** 4 (split-mode sessions; earlier history inline in accomplishments.md)

---

## Current State

**All six phases code-complete.** Project at `e:\Claude\SchoolConex\SchoolConex_CRM` is the in-house CRM:

- Commits on `main` (8 commits, all phases):
  1. Scaffold (Next.js 16 + Tailwind v4 + Supabase + Drizzle)
  2. Schema/auth/shell
  3. CRM pages + notes/tasks + demo seed (Phase 1 done)
  4. Notes update
  5. **Phase 2** Google Drive (OAuth, attach, generate-from-template, status reconcile)
  6. **Phase 3** Dialpad (webhook, contact match, calls timeline)
  7. **Phase 4** Catalog & line-item quoting
  8. **Phase 5** Stripe + Mailshake (webhooks + send-invoice + email events)
  9. **Phase 6** WhatsApp via Twilio
- Stack: Next.js 16.2.4 (Turbopack), React 19, Tailwind v4, shadcn/ui, Drizzle 0.45, @dnd-kit, googleapis, stripe, inngest
- Supabase project `ooanslwrwjexdjwdphes`: full schema live (~22 tables) with RLS on every one, default pipelines + demo data seeded
- 25 routes building cleanly; 4 webhook endpoints registered; 5 Inngest functions registered
- Auth works against Supabase Google SSO **in production** (verified 2026-06-06): root cause of the prod login failure was `NEXT_PUBLIC_SITE_URL=http://localhost:3000` in Vercel prod env — fixed to `https://sc-crm-sand.vercel.app` + redeploy. All GCP redirect URIs verified registered 2026-06-12 (Supabase callback, Gmail prod/local callbacks, Drive callback).
- First @schoolconex.com sign-in is auto-promoted to admin. **Roles asserted per D-039 (2026-06-12): matthew@schoolconex.com = admin, rayan@schoolconex.com = rep.** Both create-user scripts re-assert these roles on re-run.
- **Per-rep visibility live (D-038, migration 0008, 2026-06-12):** reps see only their own activities/calls/emails + activities on accounts they own; admin sees all. `mailshake_campaigns.owner_user_id` / `mailshake_leads.assigned_user_id` added; all 29 campaigns + 3,095 leads backfilled to Rayan; new syncs stamp owner from `MAILSHAKE_SYNC_USER_EMAIL` (set in Vercel prod). `/inbox` has an "Attach to account" dialog for manual reconciliation. RLS verified 2026-06-12 via simulated JWTs: admin 178/178 activities, Rayan exactly his 74.

- **Customer book imported from QuickBooks + Stripe (D-041, migration 0009, 2026-07-06):** 72 customer accounts (34 active / 7 inactive / 31 prospect) + 45 contacts, tagged `customer_status` with `billing_summary` rollups ($1.34M invoiced / $291k outstanding) and `external_ids` (quickbooks_id/stripe_ids). Pulled server-side over SSH from the prod finance server (token owner). Re-runnable via `npm run quickbooks:build-canonical` then `quickbooks:import` (source JSON git-ignored under `.quickbooks/`). Accounts list has a status filter + Status badge; revenue figures are **admin-only**. All 72 now owned by Rayan (D-042). NOT committed/deployed yet.

- **Connections & visibility upgrade (D-042, migration 0010, 2026-07-06):** NOT committed/deployed. (a) **Fixed the dead contact-matcher** — it ran on the RLS client from session-less crons and matched nothing; rewritten on Drizzle service-role, fixing matching for Dialpad/Gmail/all processors. (b) **Identity call-matching** (phone→email→name+containment) + phone backfill + `dialpad-rematch-identity` script; unmatched calls 191→185 (rest are genuine unknown numbers). (c) **Real dashboard** (`lib/crm/dashboard.ts`): per-rep "my day" (follow-ups due, open leads, calls, emails), follow-up queue, weighted pipeline, admin CAD revenue tiles + rep leaderboard, Connect-Gmail banner. (d) **Follow-up queue** = `followup_leads` `security_invoker` view (open leads, no touch 7+ days). (e) **Kanban**: CAD-aware money, stage %, Mine toggle, weighted forecast. (f) **Mailshake real-time**: webhook now processes **inline** (+ cron sweeper) since prod has no Inngest keys; reply→Slack. (g) **Notifications**: in-app + `slack-notify` (dep-free) + daily email digest (`cron/daily-digest`, nodemailer, 11:30 UTC) — all inert until env set. (h) **Website lead capture**: `POST /api/leads/website` (token-gated, honeypot) → account+contact+task(Rayan)+Slack; web-team docs at `docs/website-lead-form.md`. (i) **Demo data purged** — dashboard pipeline is now honestly empty, not $70.7k fake.

**What's *live* today (Phase 1 functional UI):**
- Sign in → Accounts list / detail-360 (Activity, Contacts, Opportunities, Documents tabs)
- Opportunities kanban (drag-and-drop) + detail with line-item editor
- Notes + tasks + activity timeline
- Settings: Users & roles, Pipelines (read-only), Catalog, Contract templates, Audit log, Integrations
- Per-rep dashboard with KPI tiles + open tasks
- Demo data seeded (3 accounts, 4 contacts, 3 opportunities, 1 note + task)

**Integration activation status:**
- **2026-05-28 production validation** — `sc-crm-sand.vercel.app` was redeployed as a real Production build after cron routes returned 500 from a deployment missing Supabase URL/key at runtime (F-018). Post-fix `/api/cron/mailshake-sync` returned 200 in 102s (`campaigns:29`, `leads:3095`, `matchedAccount:3060`, `matchedContact:3060`); `/api/cron/dialpad-sync` returned 200 in company scope (`knownReps:2`, no new calls after watermark). Dialpad storage integrity: 140 `integration_events_raw` rows, 140 processed, 140 `activities(channel='call')`, 140 `calls`, 0 duplicate IDs, 0 missing raw/activity links, 54 calls with transcripts, 62 with recording URLs.
- **Dialpad call ingestion** — ✅ ACTIVATED, per-rep attribution as of 2026-05-26 (D-035 + F-017 fix; awaits migration 0005 + reattribute script). Company-admin API key in `DIALPAD_API_KEY`. Cron/backfill/webhook are company-wide by default. Each ingested call's `activities.user_id` is now resolved from the call's `user_id` (outbound) or `target.id` (inbound) via `users.dialpad_user_id`. Rayan's mapping seeded in migration 0005 (`6598548464648192`); add more reps by setting their `users.dialpad_user_id` (resolve via `npm run dialpad:lookup-user <email>`). Verification on 2026-05-26 audit: DB shows 134 calls (23 matched), watermark advanced 2026-05-26T07:58Z meaning today's scheduled cron ingested 7 new calls successfully. On-demand re-hits during quiet windows previously crashed with "page.items is not iterable"; fixed via `page.items ?? []` guard in `iterateCalls`.
- **Google Drive integration** — ✅ LIVE end-to-end. Project `schoolconex-crm` under schoolconex.com org. OAuth Web client + service account credentials in `.env.local`. Shared Drive "SchoolConex CRM" (id `0AFnM-2HvmqO2Uk9PVA`) hosts both folders: `CRM Templates` (`1T7ItO_S8O4sGsnftj3kWz04L1R0fJQPo`) + `CRM Generated` (`1NR8wyn013tPE2NLWl4ke5OSc4UDJiXZj`). SA `schoolconex-crm-drive@schoolconex-crm.iam.gserviceaccount.com` is organizer (Content Manager) on the Shared Drive — added via OAuth loopback flow as matthew@schoolconex.com. Smoke test passes full create/delete cycle. F-005 resolved via D-027.
- **Gmail mailbox ingestion** — ⏳ READY, awaiting first rep consent (verified 2026-06-12: redirect URIs `https://sc-crm-sand.vercel.app/auth/gmail-callback` + localhost are REGISTERED on the OAuth client; probe of Google's authorize endpoint returned no `redirect_uri_mismatch`). Per-user OAuth flow implemented (D-036): `/api/gmail/connect` → Google consent (`gmail.readonly`) → `/auth/gmail-callback` → token persisted in `integration_credentials` (provider='google_gmail'). Daily sync at 09:00 UTC walks every connected rep, watermarks per-rep on `integration_events_raw`, matches threads to CRM contacts by external email, and persists headers + body into `email_messages`. NEXT STEP: Matthew and Rayan each sign in → `/settings/integrations` → Connect Gmail. As of 2026-06-12 neither rep has connected (0 `google_gmail` credential rows, 0 emails ingested). F-006 closed by D-036.
- **Stripe** — code-complete, needs `STRIPE_SECRET_KEY` + webhook secret
- **Mailshake** — ✅ LIVE for recipient + lead-pipeline polling. `MAILSHAKE_API_KEY` set in `.env.local`. Vercel cron `/api/cron/mailshake-sync` pulls all campaigns, every active campaign recipient (`/recipients/list`), then overlays engaged lead status from `/leads/list`. Verified/backfilled 2026-05-23: 29 campaigns, 3,095 active recipient rows, 3,060/3,095 matched to CRM accounts and contacts. The 35 unmatched rows have no matched school/account. UI: `/campaigns` defaults to all campaigns, `/campaigns/[id]`, Campaigns tab on account detail, Mailshake card on `/settings/integrations` with Live + matched-count display. ⚠️ Real-time email events (sent/opened/clicked/replied/bounced) and reply text still require webhook registration in Mailshake → Account → Webhooks (handler wired at `/api/webhooks/mailshake` and is public per D-029). `MAILSHAKE_WEBHOOK_SECRET` currently empty — handler accepts unsigned events until set.
- **WhatsApp via Twilio** — code-complete, needs `TWILIO_AUTH_TOKEN` + WhatsApp number
- **Inngest** — ✅ local endpoint verified in dev mode. `.env.local` has `INNGEST_DEV=1`; production must unset that and use `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`. `GET /api/inngest` returned metadata with `function_count:6`, `mode:"dev"` on a production-server smoke.

**Sign-in for testing (local):**
- `demo@schoolconex.com` / `Test1234!` — admin role, was the very first row in `public.users`. Created via direct SQL into `auth.users` + `auth.identities` with `crypt(... , gen_salt('bf'))` + `email_confirmed_at` set so no email confirmation needed.
- Email/password fallback was added to `/login` (alongside Google SSO) to enable local testing without configuring Supabase's Google provider. Also reads `?error=credentials|missing|domain` query param.
- Rayan@schoolconex.com auth user was created earlier and then deleted (user clarified demo was the only sign-in identity needed).

**Browser automation infrastructure:**
- Playwright + persistent Chrome profile at `.playwright-profile/` (gitignored).
- Long-running Chrome over CDP (`scripts/browser-launch.mts`, port 9222) lets dozens of small `scripts/gcp-*.mts` scripts navigate / probe / click without re-authenticating.
- Screenshot library at `.playwright-shots/` for verification (gitignored).

The persistent-notes system is live in split mode (since 2026-06-12). The skill auto-runs after every material change.

---

## Open Questions / Next Steps

### Drive integration — followups now that F-005 is RESOLVED

1. ✅ ~~Resolve F-005~~ — done via D-027 (Option A, Shared Drive). Smoke test passes full create/delete.
2. **Add at least one real contract template** to `CRM Templates` folder (`1T7ItO_S8O4sGsnftj3kWz04L1R0fJQPo`) + register it in the CRM via `/settings/templates`. Use placeholders `{{account_name}}`, `{{opportunity_name}}`, `{{contract_value}}`, `{{rep_name}}`, `{{rep_email}}`, `{{today}}`.
3. **Wire `lib/integrations/google/drive.ts` (or wherever the contract-generation flow lives) to use the new env vars + always pass `supportsAllDrives: true`.** End-to-end test: trigger "Generate contract" on an opportunity → confirm the new Doc lands in `CRM Generated` (Shared Drive), is owned by the Shared Drive, and is shared with the rep as `writer` so it appears in their "Shared with me".

### Dialpad — followups (low priority)

4. **Re-match unmatched calls** when contacts are added: 96 calls currently in `/inbox` because contacts table doesn't have the real phone numbers yet. Either:
   - Import Dialpad contacts as CRM contacts (by phone) via a one-off script, OR
   - Manually create accounts/contacts for the schools, then run a "rerun-matching" Inngest job (write needed).
5. **Surface phone number on `/inbox` rows.** Started — `/inbox` page copy was updated but the activity-timeline component doesn't pull/show `calls.from_number` / `calls.to_number`. Fix: extend timeline query to JOIN child `calls` row when `channel='call'`, render number in summary line.
6. **Transcripts:** Dialpad's call payloads include `transcription_text` only when the workspace has transcription enabled. Looking at Rayan's calls so far, none had transcript text. Verify whether the SchoolConex Dialpad plan supports it.

### Sign-in / auth

7. ✅ ~~Supabase Google OAuth~~ — RESOLVED 2026-06-06. Google provider works in prod; the blocker was `NEXT_PUBLIC_SITE_URL` pointing at localhost in Vercel (F-019 root-cause chain). Email/password form remains as fallback.
8. **Service-role key** — `.env.local` has `SUPABASE_SERVICE_ROLE_KEY` empty. Needed for any future admin flow that bypasses RLS.

### Phase 1 follow-ups

9. **Pipelines admin editor** — `/settings/pipelines` is read-only; CRUD UI deferred.
10. **Global search** — `⌘K` palette stub exists but doesn't run queries.
11. **Re-match Inngest job** — see #4 above.

### Mailshake — followups

22. **Register webhook URL in Mailshake** to capture real-time per-email events + reply text. URL: `https://sc-crm-sand.vercel.app/api/webhooks/mailshake`. Events: `sent`, `open`, `click`, `reply`, `bounce`. Set `MAILSHAKE_WEBHOOK_SECRET` once registered. **Processing is now wired end-to-end (D-042):** the handler processes events **inline** (prod has no Inngest keys) and the daily sync cron sweeps any that slipped through; a reply also fires a Slack ping. So once the webhook is registered, replies/opens will land on account timelines + the follow-up queue + digest automatically. Without registration, the lead-pipeline counts (`open`/`closed`/`ignored`) remain the only data — see F-009.
23. **Add reply text on account timeline.** Once webhooks are flowing, replies will populate `email_events` rows linked to activities; the existing `ActivityTimeline` component renders email_events generically. Verify rendering shows subject + snippet for `mailshake_event` channel and add a "View on Mailshake" link.
24. **Surface Mailshake lead status changes as activity rows.** Today the cron only upserts `mailshake_leads`; transitions (open → closed) aren't a timeline event. Consider emitting a `mailshake_event` activity on status change so each "lead converted to closed" shows up in the account history.
25. **Consider auto-import for new schools on every sync run.** Currently `mailshake:import-accounts` is manual. Could be a step inside the cron that runs after `syncAllCampaigns()`.

### Phase 5/6 planning

12. **Gmail sync — UNBLOCKED, awaiting consent (2026-06-12).** Per-user OAuth shipped (D-036), redirect URIs verified registered. A **Connect-Gmail banner now shows on the dashboard** when the signed-in user has no `google_gmail` credential (D-042), so the prompt is unmissable. Remaining: Matthew + Rayan each click Connect Gmail. After first connect, verify the 09:00 UTC cron ingests (or trigger `/api/cron/gmail-sync` manually with `CRON_SECRET`). NOTE (D-042): the contact-matcher was rewritten onto the service-role client — Gmail email→contact matching (previously dead in the session-less cron) now works.
13. **Stripe** — needs `STRIPE_SECRET_KEY` + webhook secret.
14. **Mailshake** — needs `MAILSHAKE_API_KEY` + webhook secret.
15. **WhatsApp Business API decision (D-012)** — needed before Phase 6 activation.
16. **DocuSign / e-signature volume** — v3 candidate.
17. **Reporting / dashboard requirements** — define before Phase 5.
18. **Compliance confirmation** — CRM does not ingest student records (FERPA out of scope).

### Verification / hygiene follow-ups

19. **Lint config/script is broken.** `npm run lint` calls `next lint`, which Next 16 treats as an invalid project directory. Direct `npx eslint .` also fails with an ESLint 9 circular config error. Fix ESLint config/script before treating lint as a release gate.
20. **Formatting is not clean.** `npm run format:check` reports 137 files with Prettier style issues. This is repo-wide existing churn; run a dedicated formatting pass when ready.
21. **Audit has moderate advisories.** `npm audit --audit-level=high` reports no high/critical blocker but does list 7 moderate advisories (esbuild via drizzle-kit, postcss via next/inngest). `npm audit fix --force` proposes breaking downgrades/upgrades, so handle deliberately.

---


---

## Index
- Decisions → `decisions.md`
- File map → `file-map.md`
- Failures & resolutions → `failures.md`
- Conventions & gotchas → `context.md`
- Accomplishments history (pre-split) → `accomplishments.md`
- Session history → `sessions/INDEX.md`
- Raw change log → `CHANGELOG.md`

## How to read this folder
1. Read this file end-to-end.
2. Read `context.md` before touching code.
3. Check `sessions/INDEX.md` for the last 3 sessions.
4. Load other files on demand.
