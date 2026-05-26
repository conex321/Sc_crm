-- =============================================================================
-- 0005_users_dialpad_user_id.sql
-- Per-rep Dialpad attribution. Adds users.dialpad_user_id so the daily
-- company-wide Dialpad sync can resolve each call's owning rep to a CRM user.
-- Idempotent.
-- =============================================================================

alter table public.users
  add column if not exists dialpad_user_id text;

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'users'
      and indexname = 'users_dialpad_user_id_unique'
  ) then
    create unique index users_dialpad_user_id_unique
      on public.users (dialpad_user_id)
      where dialpad_user_id is not null;
  end if;
end $$;

-- Seed the only known Dialpad rep mapping today. Rayan's Dialpad user_id is
-- 6598548464648192 (see PROJECT_NOTES D-019). Idempotent — safe to re-run.
update public.users
   set dialpad_user_id = '6598548464648192'
 where google_email = 'rayan@schoolconex.com'
   and (dialpad_user_id is null or dialpad_user_id <> '6598548464648192');
