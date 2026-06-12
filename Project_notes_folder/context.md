## Context for the Next Agent

- **Codebase exists.** ~25 routes, full data model, Phase 1 (UI), the Dialpad poll-sync, and the Drive integration are all LIVE. Other integrations (Stripe / Mailshake / WhatsApp) are code-complete and inert pending creds.
- **User context:** SchoolConex is an education + tech company on Google Workspace `schoolconex.com`. Primary contact: matthew@schoolconex.com. Sales rep being tested: rayan@schoolconex.com (his Dialpad number `+1 437 523 4132`).
- **GCP project for Drive integration:** `schoolconex-crm` under schoolconex.com Workspace (NOT matthewsefati@gmail.com personal — see F-004 for the wrong-account incident).
- **Local sign-in test creds:** `demo@schoolconex.com / Test1234!` (admin role). Email/password form added to `/login` alongside Google SSO. See D-021/D-022.
- **Dialpad token:** Must be a **company-admin** API key (not user-tier JWT). Personal-tier tokens 401 on `/api/v2/call`. Company-wide sync is default; set `DIALPAD_SYNC_SCOPE=user` plus `DIALPAD_FILTER_USER_ID` only when deliberately narrowing to one user.
- **Dialpad payload quirks:** `duration` is in milliseconds; convert via `Math.round(c.duration / 1000)` before storing in `calls.duration_seconds` (smallint). Recording is at `recording_details[0].url`, not `recording_url[0]`. Page size capped at 50.
- **Drive integration:** LIVE (F-005 resolved via D-027). Shared Drive `0AFnM-2HvmqO2Uk9PVA` ("SchoolConex CRM") hosts both folders. SA `schoolconex-crm-drive@schoolconex-crm.iam.gserviceaccount.com` is `organizer` on the Shared Drive. **All Drive API calls touching CRM content MUST pass `supportsAllDrives: true`** (and for `files.list`, also `includeItemsFromAllDrives:true`, `corpora:"drive"`, `driveId: env.GOOGLE_DRIVE_SHARED_DRIVE_ID`). See `scripts/drive-smoke.mts` for the canonical pattern.
- **External callbacks:** `/api/webhooks/*` and `/api/inngest` are public at middleware level (D-029) and must validate inside route handlers. Local Inngest verification uses `INNGEST_DEV=1`; production uses real Inngest keys (D-030).
- **Gmail mailbox access:** NOT live. Service-account impersonation for `rayan@schoolconex.com` + `gmail.readonly` returns `401 unauthorized_client`; see F-006. This is separate from Dialpad, whose API already returns Rayan's `target.email` in call payloads.
- **Browser automation framework:** `scripts/browser-launch.mts` opens long-running Chrome on port 9222; `scripts/gcp-*.mts` connect via CDP. Caveats in D-023 — Material radios need `radio.check({force:true})`, downloads need `page.waitForEvent('download')` set up BEFORE the click, and selectors that match `[role="combobox"]` will collide with GCP's global search bar; scope to form region.
- **Stack pinning:** Next.js 16 (App Router only — do NOT use Pages Router), Tailwind v4, shadcn/ui, Drizzle ORM 0.45, Inngest SDK, googleapis, stripe, playwright (dev only).
- **RLS first:** every new table MUST have RLS policies before any rows are inserted.
- **The spec is the source of truth** for design decisions. If a decision needs to change, log it as a new D-NNN entry, don't rewrite history.
- **`integration_events_raw`** is sacred: never drop rows, never edit historical payloads. It exists for replay.
- **Activity timeline insertion** must go through `lib/integrations/record-activity.ts` `recordActivity()` for integration code (bypasses RLS via Drizzle/postgres role). UI Server Actions still use the Supabase server client (RLS-enforced). See D-018.
- **Auto mode default.** Treat continuous execution as the default; user will course-correct if needed.
- **Keep updates terse.** Notes get longer fast. Prefer linking to D-NNN / F-NNN entries over re-stating.
