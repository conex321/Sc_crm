-- =============================================================================
-- 0009_quickbooks_customers.sql
-- Adds customer-lifecycle + billing fields to accounts so QuickBooks/Stripe
-- customers (signed-up + churned) can be imported and filtered (D-041).
-- Idempotent: safe to re-run via `npm run db:apply-migrations`.
-- =============================================================================

-- customer_status enum (create-if-missing; CREATE TYPE has no IF NOT EXISTS).
do $$ begin
  create type public.customer_status as enum ('active', 'inactive', 'prospect');
exception when duplicate_object then null;
end $$;

-- Additive columns on accounts.
alter table public.accounts
  add column if not exists email text;

alter table public.accounts
  add column if not exists customer_status public.customer_status;

alter table public.accounts
  add column if not exists external_ids jsonb not null default '{}'::jsonb;

alter table public.accounts
  add column if not exists billing_summary jsonb;

-- Indexes for the accounts-list status/source filter and idempotent QBO matching.
create index if not exists accounts_customer_status_idx
  on public.accounts (customer_status);
create index if not exists accounts_source_idx
  on public.accounts (source);
create index if not exists accounts_qbo_id_idx
  on public.accounts ((external_ids->>'quickbooks_id'));

-- No RLS change: accounts SELECT is intentionally open to all authenticated
-- users (D-038); admin/rep visibility of these customers is unaffected.
