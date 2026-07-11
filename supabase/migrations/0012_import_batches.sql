-- =============================================================================
-- 0012_import_batches.sql
-- D-044: CSV/Excel lead-import machinery (Pipedrive-style).
--   import_batches     — one row per import run (upload / google_sheet / hubspot)
--   import_batch_rows  — per-source-row lineage: which account/contact each row
--                        created or matched. Powers revert (delete ONLY created
--                        rows), bulk ops scoping, and chunk-retry idempotency.
--   accounts.norm_name — stored generated column for indexed name-dedupe
--                        (same normalizer as lib/integrations/auto-pipeline.ts).
-- Idempotent (create if not exists / drop-if-exists policies).
-- =============================================================================

create table if not exists public.import_batches (
  id                uuid primary key default gen_random_uuid(),
  created_by        uuid not null references public.users(id),
  filename          text not null,
  source            text not null default 'csv_upload',
  status            text not null default 'pending',
  mapping           jsonb not null default '{}'::jsonb,
  total_rows        integer not null default 0,
  accounts_created  integer not null default 0,
  accounts_matched  integer not null default 0,
  contacts_created  integer not null default 0,
  contacts_updated  integer not null default 0,
  skipped_rows      integer not null default 0,
  error_rows        jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz,
  reverted_at       timestamptz
);

create table if not exists public.import_batch_rows (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references public.import_batches(id) on delete cascade,
  row_index      integer not null,
  account_id     uuid references public.accounts(id) on delete set null,
  contact_id     uuid references public.contacts(id) on delete set null,
  account_action text,
  contact_action text,
  error          text,
  raw            jsonb,
  created_at     timestamptz not null default now(),
  unique (batch_id, row_index)
);

create index if not exists import_batch_rows_batch_idx   on public.import_batch_rows(batch_id);
create index if not exists import_batch_rows_account_idx on public.import_batch_rows(account_id);
create index if not exists import_batches_created_by_idx on public.import_batches(created_by);

-- Indexed normalized-name dedupe (matches normName in auto-pipeline / importers)
alter table public.accounts add column if not exists norm_name text
  generated always as (regexp_replace(lower(name), '[^a-z0-9]', '', 'g')) stored;
create index if not exists accounts_norm_name_idx on public.accounts(norm_name);

alter table public.import_batches    enable row level security;
alter table public.import_batch_rows enable row level security;

drop policy if exists import_batches_select on public.import_batches;
create policy import_batches_select on public.import_batches
  for select using (created_by = auth.uid() or public.is_admin());

drop policy if exists import_batches_insert on public.import_batches;
create policy import_batches_insert on public.import_batches
  for insert with check (created_by = auth.uid());

drop policy if exists import_batches_update on public.import_batches;
create policy import_batches_update on public.import_batches
  for update using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists import_batch_rows_select on public.import_batch_rows;
create policy import_batch_rows_select on public.import_batch_rows
  for select using (exists (
    select 1 from public.import_batches b
    where b.id = batch_id and (b.created_by = auth.uid() or public.is_admin())
  ));

drop policy if exists import_batch_rows_insert on public.import_batch_rows;
create policy import_batch_rows_insert on public.import_batch_rows
  for insert with check (exists (
    select 1 from public.import_batches b
    where b.id = batch_id and b.created_by = auth.uid()
  ));
