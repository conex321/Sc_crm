# Changelog

Append-only audit trail. Newest entries at the bottom. Never rewrite past entries.

---

## 2026-05-06T00:00Z — Claude
- session: 2026-05-06 brainstorm + design (single-file mode; no `sessions/` folder yet — will be created on split)
- decisions_added: [D-001, D-002, D-003, D-004, D-005, D-006, D-007, D-008, D-009, D-010, D-011, D-012]
- failures_added: []
- files_changed: [Project_notes_folder/PROJECT_NOTES.md, Project_notes_folder/CHANGELOG.md, .claude/skills/update-project-notes/SKILL.md, .codex/skills/update-project-notes/SKILL.md]
- next: write design spec to docs/superpowers/specs/2026-05-06-schoolconex-crm-design.md, user reviews spec, then invoke superpowers:writing-plans

## 2026-05-06T00:30Z — Claude
- session: 2026-05-06 spec write + tightening (still single-file mode)
- decisions_added: [D-013, D-014, D-015, D-016]
- failures_added: []
- files_changed: [docs/superpowers/specs/2026-05-06-schoolconex-crm-design.md, Project_notes_folder/PROJECT_NOTES.md, Project_notes_folder/CHANGELOG.md, .claude/skills/update-project-notes/SKILL.md, .codex/skills/update-project-notes/SKILL.md]
- next: begin Phase 1 step 1 — initialize project structure (git init, scaffold Next.js 15 + Tailwind v4 + shadcn/ui, create folder shape)

## 2026-05-06T01:00Z — Claude
- session: 2026-05-06 Phase 1 step 1 (scaffold)
- decisions_added: []
- failures_added: [F-001]
- files_changed: [.gitignore, package.json, package-lock.json, tsconfig.json, next.config.ts, postcss.config.mjs, eslint.config.mjs, .prettierrc.json, components.json, .env.example, README.md, app/layout.tsx, app/page.tsx, app/globals.css, lib/utils.ts, plus .gitkeep markers in app/(auth), app/(dashboard)/{accounts,opportunities,settings}, components/{crm,layout,ui}, lib/{supabase,db,auth,crm}, supabase/{migrations,seed}, inngest]
- commit: a47f81a "Phase 1 step 1: scaffold Next.js 15 + Tailwind v4 + Supabase + Drizzle"
- verified: npm run build passes (Turbopack, 6s compile, 3 static routes); npm audit shows 0 high vulns (6 moderate remain in Next-bundled postcss/esbuild — npm cannot fix without breakage)
- stack-actual: Next.js 16.2.4 (auto-upgraded from 15.1.6 due to CVE-2025-66478), React 19.0.0, Tailwind v4.0, Drizzle 0.45.2 (latest patched), TypeScript 5.7
- next: Phase 1 step 2 — Supabase schema + migrations (lib/db/schema.ts, drizzle.config.ts, supabase/migrations/0001_initial.sql with RLS scaffolding)

## 2026-05-06T02:00Z — Claude
- session: 2026-05-06 Phase 1 steps 2-4 (schema + RLS + auth + dashboard shell)
- decisions_added: []
- failures_added: [F-002, F-003]
- files_changed: [lib/db/schema.ts, lib/db/index.ts, drizzle.config.ts, supabase/migrations/0001_rls_and_triggers.sql, supabase/seed/0001_default_pipelines.sql, scripts/apply-sql.mts, lib/supabase/{server,browser,middleware}.ts, lib/auth/session.ts, proxy.ts (renamed from middleware.ts per Next 16), app/(auth)/login/{page.tsx,actions.ts}, app/auth/callback/route.ts, app/auth/sign-out/route.ts, app/(dashboard)/layout.tsx, components/layout/{app-sidebar,top-bar,user-menu,global-search}.tsx, app/layout.tsx (TooltipProvider+Toaster), 19 shadcn/ui components, .env.local (local-only)]
- commit: (squash with previous step in next commit) — scaffolding done, db live in Supabase project ooanslwrwjexdjwdphes
- credentials supplied by user via chat (live in `.env.local`, never committed)
- next: Phase 1 steps 5-8 — CRM pages + notes/tasks + settings + demo seed

## 2026-05-06T03:00Z — Claude
- session: 2026-05-06 Phase 1 steps 5-8 (CRM pages + notes/tasks + settings + demo seed)
- decisions_added: []
- failures_added: []
- files_changed: [lib/crm/{accounts,contacts,opportunities,activities}.ts, app/(dashboard)/accounts/{page.tsx,actions.ts,new/page.tsx,[id]/page.tsx,[id]/edit/page.tsx,[id]/contacts/{actions.ts,new/page.tsx,[contactId]/edit/page.tsx}}, app/(dashboard)/opportunities/{page.tsx,actions.ts,new/page.tsx,[id]/page.tsx,[id]/edit/page.tsx}, app/(dashboard)/inbox/page.tsx, app/(dashboard)/settings/{page.tsx,users/{page.tsx,actions.ts,role-controls.tsx},pipelines/page.tsx}, app/(dashboard)/activities/actions.ts, components/crm/{account-form,contact-form,contact-list,opportunity-form,opportunity-list,pipeline-board,activity-timeline,note-composer,task-composer}.tsx, supabase/migrations/0002_activity_rpcs.sql, supabase/seed/0002_demo_data.sql]
- commits: "Phase 1 steps 2-4: schema + RLS + auth + dashboard shell" + "Phase 1 steps 5-8: CRM pages, notes/tasks, settings, demo seed"
- verified: npm run build → 18 routes, TypeScript clean; npm run dev → ready in 1.2s; all migrations + seeds applied to Supabase
- next: user signs in → Supabase Google OAuth must be configured in dashboard first (see Open Questions #1). Then real-world Phase 1 stability bake-in begins (D-013).

## 2026-05-06T04:00Z — Claude
- session: 2026-05-06 Phases 2-6 code-complete push (after user override of D-013)
- decisions_added: [D-017, D-018]
- failures_added: []
- files_changed:
    Phase 2 (Drive): supabase/migrations/0003_phase2_to_6_rls.sql,
      lib/integrations/google/{oauth,drive}.ts,
      app/api/google-drive/connect/route.ts,
      app/auth/google-drive-callback/route.ts,
      lib/crm/documents.ts,
      app/(dashboard)/documents/actions.ts,
      components/crm/{document-list,drive-attach-button,generate-contract-dialog}.tsx,
      app/(dashboard)/settings/{integrations,templates}/page.tsx,
      app/(dashboard)/dashboard/page.tsx,
      app/(dashboard)/settings/{catalog,audit}/page.tsx,
      inngest/{client.ts,functions/{index,drive-status-reconcile}.ts},
      app/api/inngest/route.ts
    Phase 3 (Dialpad): lib/integrations/{contact-matcher,record-activity,dialpad}.ts,
      app/api/webhooks/dialpad/route.ts,
      inngest/functions/dialpad-process-event.ts
    Phase 4 (Catalog): app/(dashboard)/settings/catalog/{actions.ts,
      products/{new,[id]/edit}/page.tsx, packages/{new,[id]/edit}/page.tsx},
      components/crm/{product-form,line-items-editor}.tsx,
      app/(dashboard)/opportunities/[id]/{page.tsx,line-items/actions.ts}
    Phase 5 (Stripe + Mailshake): lib/integrations/{stripe,mailshake}.ts,
      app/api/webhooks/{stripe,mailshake}/route.ts,
      inngest/functions/{stripe-process-event,mailshake-process-event}.ts,
      app/(dashboard)/opportunities/[id]/invoice/actions.ts,
      components/crm/send-invoice-button.tsx
    Phase 6 (WhatsApp via Twilio): lib/integrations/twilio.ts,
      app/api/webhooks/whatsapp/route.ts,
      inngest/functions/whatsapp-process-event.ts
    Schema additions: lib/db/schema.ts grew documents, contract_templates,
      integration_credentials, integration_events_raw, calls, messages,
      email_events, contract_events, payments, products, packages,
      package_items, opportunity_line_items + 5 enums
- commits:
    "Phase 2: Google Drive integration (code-complete)"
    "Phase 3: Dialpad webhook + call ingestion (code-complete)"
    "Phase 4: Catalog & line-item quoting"
    "Phase 5: Stripe + Mailshake integrations (code-complete)"
    "Phase 6: WhatsApp via Twilio + final wiring"
- verified: npm run build passes after each phase commit; 25 routes total;
  4 webhook endpoints (dialpad, mailshake, stripe, whatsapp);
  5 Inngest functions registered
- next: vendor credential setup per .env.example, then end-to-end testing
  with a sandboxed integration of each vendor (Stripe test mode, Twilio
  sandbox, Mailshake test campaign, Dialpad test webhook). The activation
  checklist for each integration is in the corresponding commit message.

## 2026-05-06T05:00Z — Claude
- session: 2026-05-06 Dialpad activation + demo user + e2e tests
- decisions_added: [D-019, D-020, D-021, D-022]
- failures_added: []
- files_changed:
    Dialpad: lib/integrations/dialpad-client.ts (new),
      inngest/functions/dialpad-sync-rayan.ts (new + registered in index),
      inngest/functions/dialpad-process-event.ts (added user_id filter),
      scripts/dialpad-{lookup-user,list-calls,backfill}.mts (new),
      scripts/check-calls.mts (new diagnostic),
      package.json (added dialpad:* npm scripts)
    Sign-in: scripts/{create-demo-user.sql, run-demo-user.mts, create-rayan-user.sql, run-rayan-user.mts, remove-rayan-user.mts} (new),
      app/(auth)/login/{actions.ts, page.tsx} (added signInWithEmailPassword + form)
    E2E: scripts/{e2e-rayan.mts, e2e-inbox-check.mts} (new)
    UI tweak: app/(dashboard)/inbox/page.tsx (stale "Phase 3+" copy fixed)
    Env: .env.local DIALPAD_API_KEY (admin), DIALPAD_FILTER_USER_ID=6598548464648192,
      DIALPAD_FILTER_USER_EMAIL=Rayan@schoolconex.com,
      DIALPAD_FILTER_USER_PHONE=+14375234132
- data: 96 rows ingested into public.activities + public.calls (72 inbound / 24 outbound; 0 matched contacts because demo data has fake phones)
- verified: e2e route walk passes 11/13 (2 are correct redirects); /inbox renders all 96 with correct durations + internal tags
- next: address Drive integration + design Gmail sync per user request

## 2026-05-06T07:00Z — Claude
- session: 2026-05-06 Google Drive provisioning via Playwright browser automation
- decisions_added: [D-023, D-024, D-025, D-026]
- failures_added: [F-004, F-005]
- files_changed:
    Playwright + browser ops: package.json (playwright, @playwright/test devDeps),
      scripts/browser-launch.mts + ~15 scripts/gcp-*.mts (probe, dismiss, action, find-and-fix, edit-client, click-download-by-row, debug-secret-buttons, list-projects, create-project, find-schoolconex-project, enable-apis, consent-screen, consent-wizard, finish-consent, finish-consent2, finish-consent3, pick-internal, radio-internal, finish-wizard-final, fill-contact-email, consent-allinone, save-and-verify-test-users, add-test-users, create-web-client, download-oauth-json, grab-secret, grab-web-client-secret, create-service-account, create-another-key, create-drive-folders, drive-smoke)
    Env: GOOGLE_OAUTH_CLIENT_ID=489266381443-vqdbp0n929pdjlj6tehpba7rtvci0e6n.apps.googleusercontent.com,
      GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-... (in .env.local, NOT logged here),
      GOOGLE_SERVICE_ACCOUNT_KEY={...} (single-line JSON),
      GOOGLE_DRIVE_TEMPLATES_FOLDER_ID=1i0H2W1FZAvaxaOq0BXWGGQryRGpgCakZ,
      GOOGLE_DRIVE_GENERATED_FOLDER_ID=1ZkPo1ApnIBqZhZzwm9LkEaMNG3aeHaaz,
      GOOGLE_CLOUD_PROJECT_ID=schoolconex-crm
    .secrets/service-account.json (gitignored)
    .gitignore (added .playwright-profile, .playwright-shots, .secrets)
- gcp-resources: project schoolconex-crm (#489266381443) under schoolconex.com org;
    Drive API + Docs API enabled; OAuth consent (Internal); Web OAuth client + secret;
    service account schoolconex-crm-drive@schoolconex-crm.iam.gserviceaccount.com;
    two Drive folders shared with matthew@schoolconex.com as writer
- verified: drive-smoke.mts passes for auth + folder read; Doc creation fails F-005
- BLOCKED: F-005 (SA 0 Drive quota) before generate-from-template works end-to-end
- next: resolve F-005 via Shared Drive (recommended) OR Domain-Wide Delegation; then re-run smoke + register a real template; then design Gmail sync

## 2026-05-06T08:00Z — Claude
- session: 2026-05-06 notes update (no code changes)
- decisions_added: []
- failures_added: []
- files_changed: [Project_notes_folder/PROJECT_NOTES.md, Project_notes_folder/CHANGELOG.md, .claude/skills/update-project-notes/SKILL.md, .codex/skills/update-project-notes/SKILL.md]
- next: same as previous entry

## 2026-05-07T11:55Z — Claude
- session: 2026-05-07 F-005 fix via Shared Drive (Option A)
- decisions_added: [D-027]
- failures_resolved: [F-005]
- files_changed:
    .env.local (GOOGLE_DRIVE_SHARED_DRIVE_ID=0AFnM-2HvmqO2Uk9PVA,
      GOOGLE_DRIVE_TEMPLATES_FOLDER_ID=1T7ItO_S8O4sGsnftj3kWz04L1R0fJQPo,
      GOOGLE_DRIVE_GENERATED_FOLDER_ID=1NR8wyn013tPE2NLWl4ke5OSc4UDJiXZj,
      legacy My-Drive folder IDs preserved as *_LEGACY comments)
    scripts/drive-smoke.mts (re-enabled full create+delete cycle with supportsAllDrives:true)
    scripts/drive-create-shared-drive.mts (NEW, browser-driven Shared Drive creation)
    scripts/drive-add-sa-member.mts (NEW, browser-driven attempt — superseded by OAuth flow)
    scripts/drive-finish-add-sa.mts (NEW, browser-driven attempt — superseded by OAuth flow)
    scripts/drive-oauth-add-sa.mts (NEW, OAuth loopback flow that adds SA via Drive REST API)
    scripts/drive-create-folders-in-sd.mts (NEW, idempotent folder bootstrap inside Shared Drive)
    scripts/drive-wait-signin.mts / drive-wait-cloud-console.mts (NEW, CDP wait helpers)
    scripts/drive-snap.mts / cdp-probe.mts (NEW, debug utilities)
    scripts/gcp-add-redirect-uri-do.mts / gcp-add-redirect-v2.mts / gcp-verify-redirect.mts (NEW, register loopback redirect URI on OAuth client)
    Project_notes_folder/PROJECT_NOTES.md
    Project_notes_folder/CHANGELOG.md
    .claude/skills/update-project-notes/SKILL.md (next D-028)
    .codex/skills/update-project-notes/SKILL.md (next D-028)
- gcp-resources: Shared Drive id=0AFnM-2HvmqO2Uk9PVA name="SchoolConex CRM";
    SA added as organizer (Content Manager) via Drive REST permissions.create;
    OAuth Web client now has redirect URIs:
      http://localhost:3000/auth/google-drive-callback (pre-existing),
      http://localhost:53682/oauth/callback (new, for admin tasks)
- verified: drive-smoke passes full auth + read + Google-Doc create + driveId verification + delete
- next: register a real contract template at /settings/templates; wire lib/integrations/google/drive.ts to use new env vars + supportsAllDrives:true; end-to-end test the generate-contract flow on a real opportunity

## 2026-05-07T22:29:25Z — Codex
- session: 2026-05-07 validation + Rayan email probe
- decisions_added: [D-028]
- failures_added: [F-006]
- files_changed:
    .env.local (normalized DIALPAD_FILTER_USER_EMAIL to rayan@schoolconex.com)
    .env.example (documented GOOGLE_DRIVE_SHARED_DRIVE_ID and Dialpad Rayan filter vars)
    scripts/dialpad-list-calls.mts (prints target/contact email + phone fields)
    scripts/e2e-inbox-check.mts (updated smoke expectations for current inbox card rendering)
    scripts/e2e-rayan.mts (updated authenticated redirect expectations)
    Project_notes_folder/PROJECT_NOTES.md
    Project_notes_folder/CHANGELOG.md
- verified:
    npm run typecheck
    npx tsx scripts/dialpad-lookup-user.mts rayan@schoolconex.com
    npx tsx scripts/dialpad-list-calls.mts 3 (pulled 3 records via Rayan user_id; outbound samples show target_email=rayan@schoolconex.com)
    npx tsx scripts/e2e-inbox-check.mts
    npx tsx scripts/e2e-rayan.mts (13/13 routes ok)
    npx tsx scripts/drive-smoke.mts (Shared Drive create/delete; driveId=0AFnM-2HvmqO2Uk9PVA)
- blocked: Gmail mailbox pull for rayan@schoolconex.com is not authorized yet; service-account impersonation with gmail.readonly returns 401 unauthorized_client (F-006)
- next: choose Gmail auth path (Workspace Domain-Wide Delegation recommended for admin-managed ingestion, or per-user Gmail OAuth if Rayan should consent directly)

## 2026-05-08T04:32:57Z — Codex
- session: 2026-05-08 full verification sweep
- decisions_added: [D-029, D-030]
- failures_added: [F-007, F-008]
- failures_resolved: [F-007, F-008]
- files_changed:
    lib/supabase/middleware.ts (public allowlist now includes /api/webhooks and /api/inngest)
    package.json / package-lock.json (added server-only)
    .env.local (added INNGEST_DEV=1 for local verification)
    .env.example (documented INNGEST_DEV local-vs-prod behavior)
    Project_notes_folder/PROJECT_NOTES.md
    Project_notes_folder/CHANGELOG.md
- verified:
    npm run typecheck
    npm run build
    scripts/e2e-rayan.mts (13/13 routes ok)
    scripts/e2e-inbox-check.mts
    dynamic route smoke using real DB IDs (10/10 routes ok)
    webhook no-op smoke (Dialpad/Mailshake/Stripe/WhatsApp hit route handlers, no login redirect)
    production-server smoke on port 3002: GET /api/inngest returned metadata with function_count=6 and mode=dev
    scripts/drive-smoke.mts (Shared Drive create/delete)
    scripts/dialpad-lookup-user.mts rayan@schoolconex.com
    scripts/dialpad-list-calls.mts 5
    scripts/check-calls.mts
    Gmail probe still returns 401 unauthorized_client (F-006 remains open)
- blockers:
    Gmail mailbox sync for Rayan still needs Workspace DWD or per-user Gmail OAuth
    catalog/products/packages/contract_templates tables are empty, so contract generation/catalog UX cannot be fully exercised with real data
    npm run lint is broken under Next 16; direct eslint also errors on config
    npm run format:check reports 137 files needing Prettier
    npm audit reports 7 moderate advisories, no high/critical release blocker observed

## 2026-05-09T06:55Z — Claude
- session: 2026-05-09 Mailshake activation (single-file mode)
- decisions_added: [D-031, D-032]
- failures_added: [F-009]
- files_changed: [.env.local (MAILSHAKE_API_KEY + MAILSHAKE_WEBHOOK_SECRET), lib/db/schema.ts, supabase/migrations/0004_mailshake_campaigns_rls.sql, lib/integrations/mailshake.ts, lib/integrations/mailshake-sync.ts, lib/crm/mailshake.ts, inngest/functions/mailshake-sync-campaigns.ts, inngest/functions/index.ts, components/layout/app-sidebar.tsx, app/(dashboard)/campaigns/page.tsx, app/(dashboard)/campaigns/[id]/page.tsx, app/(dashboard)/accounts/[id]/page.tsx, app/(dashboard)/settings/integrations/page.tsx, scripts/mailshake-list-campaigns.mts, scripts/mailshake-probe.mts, scripts/mailshake-probe2.mts, scripts/mailshake-probe3.mts, scripts/mailshake-sync.mts, scripts/mailshake-stats.mts, scripts/mailshake-status-distribution.mts, scripts/mailshake-import-accounts.mts, scripts/mailshake-e2e-validate.mts, package.json]
- next: Register webhook URL in Mailshake dashboard to activate real-time event tracking + reply text on activity timeline (open question #22).

## 2026-05-09T14:50Z — Codex
- session: 2026-05-09 Mailshake full verification
- decisions_added: []
- failures_added: [F-010]
- files_changed: [lib/db/index.ts, scripts/mailshake-sync.mts, scripts/mailshake-import-accounts.mts, Project_notes_folder/PROJECT_NOTES.md, Project_notes_folder/CHANGELOG.md]
- verified: Pre-fix sync log reached final Mailshake counts but the CLI process did not exit before timeout; root cause identified as an unclosed shared Postgres client.
- next: Re-run Mailshake CLI, typecheck/build, route smoke, and Playwright validation after the script shutdown fix.

## 2026-05-09T15:05Z — Codex
- session: 2026-05-09 Mailshake UI verification fixes
- decisions_added: []
- failures_added: [F-011]
- files_changed: [app/(dashboard)/campaigns/page.tsx, app/(dashboard)/settings/integrations/page.tsx, Project_notes_folder/PROJECT_NOTES.md, Project_notes_folder/CHANGELOG.md]
- verified: Strict browser probe identified `/campaigns` defaulting to 28 non-archived campaigns and the Mailshake integration card omitting matched-account count before the fix.
- next: Re-run strict authenticated Mailshake UI assertions, typecheck, and build.

## 2026-05-09T15:15Z — Codex
- session: 2026-05-09 Mailshake full verification closeout
- decisions_added: []
- failures_added: []
- failures_resolved: [F-010, F-011]
- files_changed: [Project_notes_folder/PROJECT_NOTES.md, Project_notes_folder/CHANGELOG.md]
- verified:
    npm run mailshake:sync -- --rematch (exit 0, scanned 305)
    npm run mailshake:sync (exit 0, 29 campaigns, 305 leads, 301 matched accounts)
    npm run mailshake:stats (29 campaigns, 305 leads, 301 matched, last sync 2026-05-09 10:53 EDT)
    DB relationship audit (288 open / 13 ignored / 4 closed, 274 accounts with leads, 0 blank emails, 0 orphan campaign/account links, campaign 930352 = 110 leads / 107 schools)
    strict authenticated Playwright probe (15/15 checks passed for /campaigns, /campaigns/930352, account Campaigns tab, /settings/integrations)
    scripts/mailshake-e2e-validate.mts (exit 0, screenshots refreshed, campaign detail rows 107)
    npm run typecheck
    npm run build
    GET /api/inngest (200, function_count=7, mode=dev)
    POST /api/webhooks/mailshake invalid JSON (400 invalid JSON, route handler reached)
    scripts/e2e-rayan.mts (13/13 core routes ok)
    scripts/e2e-inbox-check.mts (Rayan Dialpad calls render on /inbox)
- blockers: Gmail mailbox ingestion for rayan@schoolconex.com still blocked by F-006; Mailshake per-email events/reply body still require external webhook registration + `MAILSHAKE_WEBHOOK_SECRET`.
