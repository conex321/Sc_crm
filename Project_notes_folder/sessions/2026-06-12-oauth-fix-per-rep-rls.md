# Session 2026-06-12 — oauth-fix-per-rep-rls

**Agent:** Claude
**Duration / scope:** Multi-day continuation (2026-06-06 → 2026-06-12). Prod login fix → per-rep separation feature → role correction → verification.
**Related decisions:** D-038, D-039 (see decisions.md); F-019 (failures.md)

## What was done
- Diagnosed + fixed prod Google SSO (F-019 part 1): NEXT_PUBLIC_SITE_URL was localhost in Vercel prod; fixed + redeployed twice (final deploy dpl_EH9H8Sdx7wapJwjHNMwk7LRN2oQK aliased to sc-crm-sand.vercel.app).
- Shipped per-rep visibility (D-038): migration 0008 (ownership columns, RLS rewrite, Rayan backfill), mailshake-sync owner stamping (MAILSHAKE_SYNC_USER_EMAIL), auto-pipeline ownership inheritance, attach-to-account dialog on /inbox.
- Corrected inverted roles (D-039 / F-019 part 2): Matthew=admin, Rayan=rep; fixed both create-user scripts.
- Verified RLS with simulated JWTs (set_config request.jwt.claims + set local role authenticated): admin=178/178 activities, rep=74 (exact expected slice), rep can attach own unmatched item.
- Verified all 4 GCP OAuth redirect URIs registered by probing Google's authorize endpoint unauthenticated.
- Split Project_notes_folder to multi-file mode (PROJECT_NOTES.md 558 lines → index + topic files).

## Files touched
- supabase/migrations/0008_per_rep_ownership.sql (new)
- lib/db/schema.ts, lib/integrations/mailshake-sync.ts, lib/integrations/auto-pipeline.ts
- app/(dashboard)/activities/actions.ts, app/(dashboard)/inbox/page.tsx
- components/crm/attach-to-account-dialog.tsx (new), components/crm/activity-timeline.tsx
- scripts/create-matthew-user.sql, scripts/create-rayan-user.sql
- Vercel prod env: NEXT_PUBLIC_SITE_URL corrected, MAILSHAKE_SYNC_USER_EMAIL added

## Decisions made
D-038 (per-rep RLS), D-039 (role correction).

## Failures encountered
F-019 (prod SSO + inverted roles) — resolved.

## Handoff notes
- Gmail connect is READY: both reps need to visit /settings/integrations → Connect Gmail. Neither connected as of 2026-06-12 21:00 UTC (0 google_gmail credential rows).
- After first connect: trigger /api/cron/gmail-sync with CRON_SECRET to verify ingestion without waiting for 09:00 UTC.
- Code changes NOT yet committed at time of writing — commit pending in-session.
