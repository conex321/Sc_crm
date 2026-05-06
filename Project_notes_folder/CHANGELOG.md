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
