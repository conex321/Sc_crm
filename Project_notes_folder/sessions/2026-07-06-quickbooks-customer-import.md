# Session 2026-07-06 — quickbooks-customer-import

**Agent:** Claude
**Duration / scope:** Import the real customer book (QuickBooks + Stripe) into the CRM with active/inactive status, dedup, billing rollups, and a UI filter.
**Related decisions:** D-041 (D-038 for the RLS precedent that drove admin-only revenue).

## What was done

- Deep research (6 subagents) established: QBO customer data lives in `SchoolConex_Quickbooks_Api` (no DB of its own; JSON exports + a separate SQLite AR dashboard); the CRM is the Supabase side; the QBO token is owned by the prod finance server and rotates daily — a local `.env` pull would fail or break prod.
- Verified CRM Supabase live (before: 2,695 accounts / 3,899 contacts).
- **Server-side QBO+Stripe pull** over SSH (`~/.ssh/hetzner_codinginabox_ed25519` → root@78.47.233.60), reusing the app's `src/services/qbo.js` auth. Temp script copied to `/opt/cfo/app/scripts/`, run (`Active=true` ∪ `Active=false`, all invoices/payments, live Stripe), JSON scp'd back, script removed. Token rotation persisted correctly (verified). Pulled 85 customers (78 active / 7 archived), 747 invoices, 787 payments, 34 Stripe.
- Built `scripts/quickbooks-build-canonical.mts` (dedupe + classify) → 72 accounts (34 active / 7 inactive / 31 prospect); merged QBO dups + Stripe collisions; kept the two "Michelle Zhang" namesakes separate; Lorvale correctly inactive.
- Migration `0009_quickbooks_customers.sql` + `lib/db/schema.ts` (customer_status enum, external_ids, email, billing_summary), applied surgically + verified idempotent.
- `scripts/quickbooks-import-customers.mts` (npm `quickbooks:import`, `--dry`): idempotent upsert by quickbooks_id → stripe id → name. First run 65 inserted / 7 enriched / 45 contacts; re-run 0 dupes. (One namesake-collapse bug was caught, rolled back, fixed, re-run clean.)
- UI: accounts-list status filter + Status badge + admin-only Outstanding column; detail-page billing card (admin-only, CAD).
- Adversarial multi-agent review (Workflow, 17 agents): 8 confirmed findings, all fixed.

## Files touched

- New: `scripts/quickbooks-build-canonical.mts`, `scripts/quickbooks-import-customers.mts`, `supabase/migrations/0009_quickbooks_customers.sql`, `components/crm/customer-status-badge.tsx`, `.quickbooks/` (git-ignored PII export/canonical).
- Modified: `lib/db/schema.ts`, `lib/crm/accounts.ts`, `app/(dashboard)/accounts/page.tsx`, `app/(dashboard)/accounts/[id]/page.tsx`, `package.json`, `.gitignore`.
- Prod finance server: temp pull script added + removed (no residue); one QBO token rotation (normal).

## Decisions made

- D-041 — QuickBooks + Stripe customer import (schema 0009, dedup/classify pipeline, admin-only revenue).

## Failures encountered

- Namesake "Michelle Zhang" collapse on the enrich path (both rows enriched one account). Caught in verification, rolled back fully, guarded with a per-run `claimed` map, re-run clean. Not logged as an F-ID (caught + fixed same session, no lingering impact).

## Handoff notes

- **Decision for Matthew:** keep reps revenue-blind (current default — billing figures admin-only, per D-038) or relax so Rayan sees billing.
- **Not committed / not deployed.** Working tree has the new scripts + migration + UI. Deploy with `npx vercel --prod --yes` when approved (migration 0009 already applied to the shared prod DB, so the deploy is only code).
- Still pending from prior sessions: Matthew + Rayan connect Gmail at `/settings/integrations`.
- Re-import anytime: `npm run quickbooks:build-canonical` (needs a fresh `.quickbooks/qbo-crm-export.json` from a server-side pull) then `npm run quickbooks:import`.
