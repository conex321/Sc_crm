# Changelog

Archived history:
- `changelog/2026-05-06--2026-07-11.md` — original append-only log through the GTM research session boundary.



## 2026-07-11T21:10Z — Codex
- session: sessions/2026-07-11-current-gtm-stack-and-operating-plan.md
- decisions_added: []
- failures_added: []
- files_changed: [docs/research/2026-07-11-schoolconex-current-gtm-stack-overview.md, docs/research/2026-07-11-schoolconex-repeatable-gtm-operating-plan.md, Project_notes_folder/PROJECT_NOTES.md, Project_notes_folder/sessions/INDEX.md, Project_notes_folder/sessions/2026-07-11-current-gtm-stack-and-operating-plan.md, Project_notes_folder/CHANGELOG.md]
- next: complete the one-week vendor-account inventory before implementing the phased plan; first priority is Klaviyo/Resend ownership and universal suppression.
## 2026-07-11T20:31Z — Codex
- session: in progress; final session file will be added with the companion operating plan
- decisions_added: []
- failures_added: []
- files_changed: [docs/research/2026-07-11-schoolconex-current-gtm-stack-overview.md, Project_notes_folder/PROJECT_NOTES.md, Project_notes_folder/CHANGELOG.md]
- next: complete the repeatable GTM operating plan with explicit Klaviyo, Resend, Mailshake, and Google Workspace ownership boundaries.
## 2026-07-11T18:55Z — Codex
- session: sessions/2026-07-11-gtm-crm-blueprint.md
- decisions_added: []
- failures_added: []
- files_changed: [docs/research/2026-07-11-schoolconex-gtm-crm-blueprint.md, Project_notes_folder/PROJECT_NOTES.md, Project_notes_folder/file-map.md, Project_notes_folder/sessions/INDEX.md, Project_notes_folder/sessions/2026-07-11-gtm-crm-blueprint.md, Project_notes_folder/CHANGELOG.md, Project_notes_folder/changelog/2026-05-06--2026-07-11.md]
- next: review and approve the proposed blueprint before converting its 30/60/90 roadmap into implementation plans; no GTM integration was activated and no outreach was sent.
## 2026-07-11T22:00Z — Claude
- session: GSD phase 02 (deals-parity)
- decisions_added: [] (D-047 expanded to full phase)
- files_changed: [supabase/migrations/0013_*, lib/db/schema.ts, app/(dashboard)/opportunities/{page,actions,view-actions,[id]/page,[id]/detail-actions}, lib/crm/{opportunities,labels,deal-board-utils}, components/crm/{pipeline-board,deals-list,forecast-board,deals-filter-bar,stage-stepper,deal-close-buttons,deal-summary-panel,deal-activity-popover,deal-label-chip,won-lost-dialog,opportunity-form}, components/ui/popover, settings/pipelines/rot-days-input, scripts/e2e-rayan.mts]
- verified: [gsd-verifier 5/5, tsc, build, e2e 21/21, migration 0013 idempotent x2, live Playwright (drag persist, lost dialog→DB, list/forecast/3-panel), test data cleaned]
- deployed: [pushed e409bf2; prod deal views serve]
- next: GSD Phase 3 (Leads inbox)
