# Session index — newest first

- 2026-07-11 — `2026-07-11-lead-import-feature.md` — Pipedrive-style lead import shipped (D-044): template + auto-map wizard at /accounts/import, dedupe engine, batch history with bulk edit/delete/revert; OSSD Google Sheet imported live (2,782 accounts + ~2,900 contacts → Rayan); HubSpot importer ready (awaits token); leaked test password scrubbed from public repo + rotated in prod. Deployed.

- 2026-07-09 — `2026-07-09-edit-crash-rep-access.md` — Fixed Rayan's account-edit error (D-043): Radix empty-value SelectItem crash in account/opportunity forms + owner-gated UPDATE RLS (silent no-op) → sentinel values + migration 0011 (reps edit everything, deletes admin-only). Browser-verified. Committed D-042+D-043, pushed, DEPLOYED to prod.

- 2026-07-06 — `2026-07-06-crm-visibility-upgrade.md` — Connections + visibility upgrade (D-042): fixed the dead RLS contact-matcher (root cause of 87% unmatched calls), identity call-matching + backfill, real per-rep dashboard + follow-up queue (migration 0010 view), CAD/weighted kanban, inline Mailshake webhook processing, Slack + daily-digest + in-app notifications, public website lead-capture endpoint, 72 customers → Rayan, demo data purged. Verified (build/e2e/smokes); not committed/deployed.
- 2026-07-06 — `2026-07-06-quickbooks-customer-import.md` — Imported 72 QuickBooks/Stripe customers (34 active / 7 inactive / 31 prospect) + 45 contacts into the CRM (D-041): server-side QBO pull over SSH, migration 0009, dedup pipeline, admin-only billing UI, adversarial review (8 fixes). Not committed/deployed.

- 2026-07-03 — `2026-07-03-notes-infrastructure-alignment.md` — Notes wiring standardized (D-040): repo root CLAUDE.md added, CRM row added to global skill mapping table; no app code changed. Gmail-connect handoff still pending.
- 2026-06-12 — `2026-06-12-oauth-fix-per-rep-rls.md` — Prod SSO fixed (NEXT_PUBLIC_SITE_URL), per-rep RLS shipped (migration 0008), role swap corrected (D-039), /inbox attach UI, notes split to multi-file mode.
