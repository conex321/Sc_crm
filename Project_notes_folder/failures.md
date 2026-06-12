## Failures & Resolutions

### F-001 — Next.js 15.1.6 ships with security vulnerability (CVE-2025-66478) — 2026-05-06
**Issue:** Initial scaffold pinned `next@15.1.6`. `npm install` reported a critical-severity advisory (CVE-2025-66478).
**Root cause:** Older Next.js patch shipped with a known issue patched in later releases.
**Fix:** `npm install next@latest eslint-config-next@latest` — resolved to Next 16.2.4. Build still passes.
**Guardrail:** When pinning Next.js (or any major dep), use the latest stable patch at the time of writing rather than a hand-picked older version. Run `npm audit` immediately after `npm install` and address `high`/`critical` severities before committing.

### F-002 — Supabase blocks `ALTER DATABASE ... SET ...` from regular roles — 2026-05-06
**Issue:** First migration attempt set the allowed-email-domain via `alter database postgres set app.allowed_email_domain = 'schoolconex.com'` so the post-signup trigger could read it as a GUC. Failed with "permission denied to set parameter".
**Root cause:** Managed Supabase doesn't expose the `postgres` superuser; the role used for migrations cannot mutate database-level GUCs.
**Fix:** Hardcoded the allowed domain in `handle_new_auth_user()` directly. Documented in the function body that to change it, edit the function and re-run the migration.
**Guardrail:** For Supabase, prefer hardcoded values, RPC parameters, or a dedicated `app_config` table over Postgres GUCs. Any setting that needs to vary per-environment goes in env vars and is read in app code, not DB.

### F-003 — Next.js 16 renamed `middleware.ts` → `proxy.ts` and changed config conventions — 2026-05-06
**Issue:** First build under Next 16 emitted a deprecation warning ("middleware file convention is deprecated, use proxy") and a separate type error (implicit `any` on Supabase `setAll` cookie param under stricter TS settings).
**Root cause:** Next.js 16 release renamed the routing helper from `middleware` to `proxy`; also tightened TS expectations for cookie callback shapes.
**Fix:** Renamed `middleware.ts` → `proxy.ts`, exported function `proxy` instead of `middleware`. Added explicit `CookieToSet[]` type to both `lib/supabase/server.ts` and `lib/supabase/middleware.ts` to satisfy strict TS. Also moved `experimental.typedRoutes` to top-level `typedRoutes` in `next.config.ts`.
**Guardrail:** When upgrading Next majors, scan the build output for deprecation warnings before assuming a green build means we're on supported APIs.

### F-004 — Initial GCP work was done in the wrong Google account — 2026-05-06
**Issue:** The first Drive integration setup (Web OAuth client, test users, exploration) was done while the headed Chrome was logged into `matthewsefati@gmail.com` (personal) under project `gmail-mcp-personal-495520`. User course-corrected mid-session: "I want connected is the SchoolConex drive, which is matthew@schoolconex.com".
**Root cause:** Browser-launch script just opened the GCP console without specifying which Google account to use; the user had been logged into their personal Gmail in this Chrome profile. I should have asked which account up front.
**Fix:** Discarded everything in `gmail-mcp-personal`. Cleared `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` from `.env.local`. Re-did all setup under `matthew@schoolconex.com` in a brand-new project `schoolconex-crm` under the schoolconex.com org.
**Guardrail:** Before any GCP / Workspace setup, run `gcp-probe.mts status` and confirm `signed-in account` matches expectations. If switching accounts in Chrome, restart `browser-launch.mts` so the persistent profile picks up the right session.

### F-005 — Service account has 0 Drive storage quota → Doc creation fails — 2026-05-06 (RESOLVED 2026-05-07)
**Issue:** Drive smoke test failed at `drive.files.create({ mimeType: 'application/vnd.google-apps.document' })` with HTTP 403 `"The user's Drive storage quota has been exceeded"`. Folder creation succeeded (folders don't consume storage); Doc creation didn't.
**Root cause:** Google service accounts have no consumer-grade Drive storage by default. They can read/write files in folders shared with them, and create folders in their own My Drive (free), but Docs/Sheets/Slides created in My Drive count against quota — which is 0 for SAs.
**Resolution:** Took **Option A (Shared Drive)** — see D-027 for full mechanics. Smoke test now passes the full create/delete cycle, with the test file's `driveId` matching the Shared Drive id (so storage is owned by the Drive, not the SA).
**Why we picked A over B:** Shared Drive is one-time setup; Domain-Wide Delegation requires ongoing admin.google.com config and ties contract ownership to a specific human user (impersonation footgun on SA rotation).
**Guardrail:** When the integration design says "service account writes files", default to Shared Drive from day one. Don't try to use SA's My Drive — it's not for that. Always pass `supportsAllDrives: true` on any Drive API call that touches Shared Drive content.

### F-017 — Dialpad cron crashes on empty time windows — 2026-05-26 (RESOLVED same session)
**Issue:** On-demand `/api/cron/dialpad-sync` hits during quiet periods returned HTTP 500 with `{"ok":false,"error":"n.items is not iterable"}` (minified `page.items`). Daily scheduled runs at 07:00 UTC continued to work because the 24-hour lookback always had at least one call.
**Root cause:** Dialpad's `/api/v2/call` returns `{}` (no `items` key) — not `{items:[]}` — when the requested time range contains zero calls. `lib/integrations/dialpad-client.ts:169` did `for (const item of page.items)` which throws TypeError when `page.items` is undefined.
**Fix:** Defensive `for (const item of page.items ?? [])` in `iterateCalls`. One line.
**Guardrail:** Always default-empty when iterating optional API response arrays.

### F-006 — Gmail mailbox pull for Rayan is blocked by missing Gmail authorization — 2026-05-07 (RESOLVED 2026-05-26 by D-036)
**Resolution:** Pivoted from service-account DWD to per-user OAuth (see D-036). Each rep grants `gmail.readonly` via `/api/gmail/connect`; tokens persist in `integration_credentials` (provider='google_gmail'). Daily sync cron at `/api/cron/gmail-sync` walks every connected rep and ingests new messages into the new `email_messages` table. Pre-launch: redirect URI registration + consent-screen scope add still pending (see D-036 "How to apply").
**Issue (historical):** User asked to make sure email pull also covers `rayan@schoolconex.com`. Dialpad payloads do expose `target.email` for Rayan, but actual Gmail mailbox access is not live.
**Evidence:** Service-account impersonation probe using `subject:"rayan@schoolconex.com"` and scope `https://www.googleapis.com/auth/gmail.readonly` returned HTTP 401 `unauthorized_client: Client is unauthorized to retrieve access tokens using this method, or client not authorized for any of the scopes requested.`
**Root cause:** Existing Google setup is Drive/Docs only. The service account is not authorized for Gmail domain-wide delegation, and the app's OAuth flow only asks for Drive scopes (`drive.file`, `userinfo.email`), not Gmail scopes.
**Fix options:** A) Enable Domain-Wide Delegation for the service account, authorize the service account OAuth client ID in Google Workspace Admin with Gmail readonly scope, then implement a cron Gmail sync for Rayan. B) Add a per-user Gmail OAuth connect flow and have Rayan consent directly. A is better for admin-managed CRM ingestion; B is better for least-privilege rep-controlled access.
**Guardrail:** Do not claim Gmail mailbox sync works until `gmail.users.getProfile({ userId:"me" })` returns `rayan@schoolconex.com` and `gmail.users.messages.list` returns or legitimately reports zero messages for the expected query window.

### F-007 — External webhook/Inngest routes were blocked by app auth — 2026-05-08 (RESOLVED 2026-05-08)
**Issue:** Full verification POSTed no-op payloads to `/api/webhooks/*` and got the login HTML instead of route-handler responses. Third-party integrations would not be able to deliver events because they do not have Supabase session cookies.
**Root cause:** `lib/supabase/middleware.ts` only treated `/login`, `/auth/*`, `_next`, favicon, and `/api/health` as public. `proxy.ts` matched API routes too, so unauthenticated webhook/Inngest requests redirected to `/login`.
**Fix:** Added `/api/webhooks` and `/api/inngest` to `PUBLIC_PATHS`. Re-ran no-op webhook smoke: Dialpad and Mailshake return 400 invalid JSON, Stripe returns 400 missing secret/signature, WhatsApp returns 200 unrecognized event; all now reach their route handlers.
**Guardrail:** Any callback endpoint meant for external systems must be public at middleware level and enforce authenticity inside its own route handler.

### F-009 — Mailshake REST API has no per-event endpoints — 2026-05-09 (DOCUMENTED)
**Issue:** Tried polling `/sentEmails/list`, `/opens/list`, `/clicks/list`, `/replies/list`, `/messages/list`, `/campaigns/getStats`, `/recipients/getActivities` to track email events per campaign — all returned 404 from `https://api.mailshake.com/2017-04-01`.
**Root cause:** Mailshake's public REST API surfaces only campaigns / recipients / leads (lead pipeline) / deliverability reports. Real-time event tracking (sent / opened / clicked / replied / bounced) is delivered via webhooks only.
**Workaround:** Use the lead-pipeline `status` field from `/leads/list` as a proxy for "engaged recipient" — it captures recipients who triggered any tracked event. For full per-event timelines, register the webhook URL `https://<deployed-host>/api/webhooks/mailshake` in Mailshake → Account → Webhooks (handler already wired at `app/api/webhooks/mailshake/route.ts` → Inngest `mailshake-process-event` → `email_events` + activity timeline).
**Guardrail:** Any future ask for "track opens / clicks / replies per X" against Mailshake must include webhook activation as a prerequisite — REST polling alone cannot satisfy it.

### F-008 — `/api/inngest` returned 500 in local/prod smoke — 2026-05-08 (RESOLVED 2026-05-08)
**Issue:** After F-007, `GET /api/inngest` returned 500 `internal_server_error`.
**Root cause:** Two local-runtime pieces were missing: the `server-only` package used by the Drive integration import chain, and Inngest local dev mode. In production mode without `INNGEST_SIGNING_KEY`, Inngest requires `INNGEST_DEV=1` for local verification.
**Fix:** Installed `server-only`, set `INNGEST_DEV=1` in `.env.local`, documented it in `.env.example`, and verified `next start -p 3002` returns `GET /api/inngest` metadata with `function_count:6`, `mode:"dev"`.
**Guardrail:** Production deploys must set `INNGEST_SIGNING_KEY` and leave `INNGEST_DEV` unset; local verification can use `INNGEST_DEV=1`.

### F-010 — Mailshake manual sync CLI completed but did not exit — 2026-05-09 (RESOLVED 2026-05-09)
**Issue:** `npm run mailshake:sync` reached the expected final summary (`campaigns upserted: 29`, `leads upserted: 305`, `matched account: 301`) but the process stayed alive until the verification timeout killed it.
**Root cause:** `scripts/mailshake-sync.mts` and `scripts/mailshake-import-accounts.mts` imported the shared Drizzle/Postgres singleton from `lib/db` without closing its underlying `postgres` client in script mode.
**Fix:** Exported `closeDb()` from `lib/db/index.ts` and wrapped both Mailshake CLI entrypoints in `finally { await closeDb(); }`. The Inngest cron path still uses the shared app client and does not close it per invocation.
**Guardrail:** Any future one-shot script that imports `lib/db` must close the shared client before process exit.

### F-013 — Inngest crons not firing locally (silently stale data) — 2026-05-22 (DOCUMENTED)
**Issue:** Last Dialpad call ingested was 2026-05-05; user opened a session on 2026-05-22 — 17 days of calls were missing despite the cron being registered (`/api/inngest` reports `function_count:7, mode:dev`). Same risk applies to `mailshake-sync-campaigns` (last_synced_at also stale).
**Root cause:** Inngest's local dev mode (`INNGEST_DEV=1`) requires the Inngest CLI dev server running on port 8288 (`npx inngest-cli@latest dev`) to actually fire registered cron triggers. Without it, crons are registered but nothing calls them. `curl http://localhost:8288` → connection refused.
**Workaround applied:** `npm run dialpad:backfill -- 20` to pull May 5→May 22 calls (31 new ingested). Same pattern works for Mailshake: `npm run mailshake:sync`.
**Long-term fix:** Either (a) operator runs `npx inngest-cli@latest dev` in another terminal alongside `npm run dev`, or (b) deploy the app + set `INNGEST_SIGNING_KEY` + `INNGEST_EVENT_KEY` so Inngest Cloud fires the crons. Don't trust local dev for ongoing data freshness.
**Guardrail:** Production deployment must set `INNGEST_SIGNING_KEY` and unset `INNGEST_DEV`. Consider adding a heartbeat probe (e.g. dashboard widget "last cron run") so stale syncs are visible to operators.

### F-012 — Dialpad calls produced 0/96 account matches — 2026-05-22 (RESOLVED 2026-05-22)
**Issue:** User flagged "Rayan's call logs aren't being pulled into the accounts he called". Audit confirmed: 0/96 calls matched to accounts despite 277 accounts existing.
**Root cause:** D-032 imported 274 schools as accounts but D-032 alone leaves the schools empty. The Dialpad matcher (`matchPhoneToContact` in `lib/integrations/contact-matcher.ts`) queries the `contacts` table — which only had 4 demo rows. No contacts with real phones → no possible match. The matching mechanism itself was always correct; the data simply wasn't there.
**Fix:** D-033 (`npm run mailshake:import-contacts`) materializes contacts from `mailshake_leads.fields`. Then `scripts/dialpad-rematch-calls.mts` walks every `activities.account_id IS NULL` call, looks up the external number against the now-populated phone index (E.164 + last-7-digits fallback), and updates `account_id` + `contact_id`. After fix + 31-call backfill + rematch: 3/127 calls matched (the 1 historical Baig Academy + 2 newly-ingested calls auto-matched at insert time). The remaining 124 calls are with numbers genuinely NOT in any Mailshake campaign — the matcher is working; the data overlap is just small for now.
**2026-05-23 update:** D-034 supersedes the operator-only workflow. Mailshake cron now pulls all recipients and runs auto-pipeline; Dialpad sync/backfill/webhook are company-wide by default. After full backfill: 3,060/3,095 Mailshake rows link to account/contact; 127 Dialpad calls exist, 23 matched, 47 transcripts.
**Guardrail:** D-032, D-033, and D-034 must stay together — never import schools without recipients/contacts, and only set `DIALPAD_SYNC_SCOPE=user` intentionally.

### F-011 — Mailshake UI default/counts did not fully reflect live snapshot — 2026-05-09 (RESOLVED 2026-05-09)
**Issue:** `/campaigns` defaulted to 28 non-archived campaigns instead of all 29 synced campaigns, and `/settings/integrations` showed campaigns/leads but not the 301/305 account-match count.
**Fix:** Made `/campaigns` default to all campaigns with an active-only toggle, and added `Matched to accounts 301/305` to the Mailshake integration card.

### F-018 — `sc-crm-sand` cron endpoints returned 500 after deployment/env drift — 2026-05-28 (RESOLVED 2026-05-28)
**Issue:** Manual calls to `/api/cron/mailshake-sync` and `/api/cron/dialpad-sync` on `https://sc-crm-sand.vercel.app` returned HTTP 500.
**Root cause:** Vercel runtime logs showed Supabase client creation failing because URL/key env values were missing from the served deployment. Production env names existed, but the alias/deployment state had drifted through old/preview deployments that did not carry the Production env at runtime.
**Resolution:** Added `.claude/` and `.codex/` to `.vercelignore`, ran a fresh production Vercel deploy from commit `72163ad`, verified `sc-crm-sand.vercel.app` pointed at the new production deployment, and reran both cron endpoints. Both returned HTTP 200 and follow-up Vercel 500-log query returned no logs.

---


### F-019 — Production Google SSO broken + roles inverted (RESOLVED 2026-06-12)

**Symptom:** "I still cannot oauth into the app" — Google sign-in on `https://sc-crm-sand.vercel.app/login` never returned to the app. Separately, after login was fixed, `matthew@schoolconex.com` had role='rep' and `rayan@schoolconex.com` role='admin' (inverted).

**Root causes:** (1) `NEXT_PUBLIC_SITE_URL` in Vercel production was `http://localhost:3000`, so `signInWithGoogle` built a localhost `redirectTo` — Supabase redirected the browser to localhost after Google auth. Found by tracing the live OAuth URL with Playwright (`redirect_to=http%3A%2F%2Flocalhost%3A3000...` visible in the accounts.google.com URL). (2) `scripts/create-rayan-user.sql` promoted Rayan to admin on every re-run (written when Rayan was the admin-page test user) and a later run demoted the intent.

**Fix:** (1) `vercel env rm/add NEXT_PUBLIC_SITE_URL=https://sc-crm-sand.vercel.app` + redeploy (NEXT_PUBLIC_* is baked at build time — a redeploy is mandatory). Re-traced: redirect_to now points at prod. (2) One-transaction role swap in prod + both scripts fixed to re-assert correct roles (D-039).

**Lesson:** Any `NEXT_PUBLIC_*` change requires a rebuild, not just an env update. Probe OAuth redirect registration cheaply by fetching Google's authorize URL unauthenticated — `redirect_uri_mismatch` shows in the response body before any sign-in.
