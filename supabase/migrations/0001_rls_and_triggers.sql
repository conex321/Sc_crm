-- =============================================================================
-- 0001_rls_and_triggers.sql
-- Applied AFTER `drizzle-kit push` creates the table structures.
-- Idempotent: safe to re-run.
-- =============================================================================

-- ─── Helper: updated_at trigger ──────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Apply to every table with updated_at
do $$
declare
  t text;
  tables text[] := array[
    'users', 'accounts', 'contacts', 'pipelines', 'pipeline_stages',
    'opportunities', 'activities'
  ];
begin
  foreach t in array tables loop
    execute format(
      'drop trigger if exists touch_updated_at on public.%I;
       create trigger touch_updated_at
         before update on public.%I
         for each row execute function public.touch_updated_at();',
      t, t
    );
  end loop;
end $$;

-- ─── Helper: who am I ────────────────────────────────────────────────────────
-- security definer so it can read public.users without recursing through RLS
create or replace function public.current_user_role()
returns user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.users where id = auth.uid() and is_active = true
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin' and is_active = true
  )
$$;

create or replace function public.is_manager_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role in ('manager', 'admin') and is_active = true
  )
$$;

-- ─── Post-signup: auth.users → public.users ──────────────────────────────────
-- Validates email domain (D-007) and creates the public.users row.
-- ALLOWED_EMAIL_DOMAIN is read from a setting; defaults to schoolconex.com.
-- Allowed email domain is hardcoded here. To change it, edit this function and
-- re-run the migration (Supabase does not permit ALTER DATABASE ... SET ...
-- from a regular role, so we cannot use a database-level GUC).
-- First signed-in user is auto-promoted to admin so the team can bootstrap
-- without out-of-band SQL.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed_domain text := 'schoolconex.com';
  email_domain text := split_part(new.email, '@', 2);
  display_name text := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );
  is_first_user boolean;
  assigned_role user_role;
begin
  if email_domain is null or email_domain <> allowed_domain then
    raise exception 'Email domain % not allowed (expected %)', email_domain, allowed_domain;
  end if;

  select count(*) = 0 into is_first_user from public.users;
  assigned_role := case when is_first_user then 'admin'::user_role else 'rep'::user_role end;

  insert into public.users (id, full_name, google_email, role, is_active)
  values (new.id, display_name, new.email, assigned_role, true)
  on conflict (id) do update
    set google_email = excluded.google_email,
        full_name = coalesce(public.users.full_name, excluded.full_name),
        is_active = true;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ─── Audit log: write-events on admin-touchable tables ───────────────────────
create or replace function public.record_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_id_value uuid;
begin
  if tg_op = 'DELETE' then
    row_id_value := (old).id;
    insert into public.audit_log (actor_user_id, table_name, row_id, action, before, after)
    values (auth.uid(), tg_table_name, row_id_value, 'DELETE', to_jsonb(old), null);
    return old;
  elsif tg_op = 'UPDATE' then
    row_id_value := (new).id;
    insert into public.audit_log (actor_user_id, table_name, row_id, action, before, after)
    values (auth.uid(), tg_table_name, row_id_value, 'UPDATE', to_jsonb(old), to_jsonb(new));
    return new;
  else
    row_id_value := (new).id;
    insert into public.audit_log (actor_user_id, table_name, row_id, action, before, after)
    values (auth.uid(), tg_table_name, row_id_value, 'INSERT', null, to_jsonb(new));
    return new;
  end if;
end;
$$;

do $$
declare
  t text;
  audited text[] := array['users', 'pipelines', 'pipeline_stages'];
begin
  foreach t in array audited loop
    execute format(
      'drop trigger if exists audit_log_trg on public.%I;
       create trigger audit_log_trg
         after insert or update or delete on public.%I
         for each row execute function public.record_audit_log();',
      t, t
    );
  end loop;
end $$;

-- ─── Enable RLS on all public tables ─────────────────────────────────────────
alter table public.users enable row level security;
alter table public.accounts enable row level security;
alter table public.contacts enable row level security;
alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.opportunities enable row level security;
alter table public.activities enable row level security;
alter table public.notes enable row level security;
alter table public.tasks enable row level security;
alter table public.audit_log enable row level security;

-- ─── RLS policies ────────────────────────────────────────────────────────────
-- Pattern: drop-then-create so re-running is idempotent.

-- users
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select using (auth.role() = 'authenticated');

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.users where id = auth.uid()));

drop policy if exists users_update_admin on public.users;
create policy users_update_admin on public.users
  for update using (public.is_admin())
  with check (public.is_admin());

drop policy if exists users_insert_admin on public.users;
create policy users_insert_admin on public.users
  for insert with check (public.is_admin());

-- accounts: rep can read all live, edit own; manager/admin edit any
drop policy if exists accounts_select on public.accounts;
create policy accounts_select on public.accounts
  for select using (
    auth.role() = 'authenticated'
    and (deleted_at is null or public.is_admin())
  );

drop policy if exists accounts_insert on public.accounts;
create policy accounts_insert on public.accounts
  for insert with check (auth.role() = 'authenticated');

drop policy if exists accounts_update_own on public.accounts;
create policy accounts_update_own on public.accounts
  for update using (
    owner_user_id = auth.uid() or public.is_manager_or_admin()
  )
  with check (
    owner_user_id = auth.uid() or public.is_manager_or_admin()
  );

drop policy if exists accounts_delete on public.accounts;
create policy accounts_delete on public.accounts
  for delete using (public.is_admin());

-- contacts: rep can read all, edit if account is theirs (or any if manager/admin)
drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts
  for select using (
    auth.role() = 'authenticated'
    and (deleted_at is null or public.is_admin())
  );

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts
  for insert with check (auth.role() = 'authenticated');

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts
  for update using (
    public.is_manager_or_admin()
    or exists (
      select 1 from public.accounts a
      where a.id = contacts.account_id and a.owner_user_id = auth.uid()
    )
  )
  with check (
    public.is_manager_or_admin()
    or exists (
      select 1 from public.accounts a
      where a.id = contacts.account_id and a.owner_user_id = auth.uid()
    )
  );

drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts
  for delete using (public.is_admin());

-- pipelines: read by all, write by admin only
drop policy if exists pipelines_select on public.pipelines;
create policy pipelines_select on public.pipelines
  for select using (auth.role() = 'authenticated');

drop policy if exists pipelines_admin_write on public.pipelines;
create policy pipelines_admin_write on public.pipelines
  for all using (public.is_admin()) with check (public.is_admin());

-- pipeline_stages: read by all, write by admin only
drop policy if exists pipeline_stages_select on public.pipeline_stages;
create policy pipeline_stages_select on public.pipeline_stages
  for select using (auth.role() = 'authenticated');

drop policy if exists pipeline_stages_admin_write on public.pipeline_stages;
create policy pipeline_stages_admin_write on public.pipeline_stages
  for all using (public.is_admin()) with check (public.is_admin());

-- opportunities: same pattern as accounts
drop policy if exists opportunities_select on public.opportunities;
create policy opportunities_select on public.opportunities
  for select using (
    auth.role() = 'authenticated'
    and (deleted_at is null or public.is_admin())
  );

drop policy if exists opportunities_insert on public.opportunities;
create policy opportunities_insert on public.opportunities
  for insert with check (auth.role() = 'authenticated');

drop policy if exists opportunities_update_own on public.opportunities;
create policy opportunities_update_own on public.opportunities
  for update using (
    owner_user_id = auth.uid() or public.is_manager_or_admin()
  )
  with check (
    owner_user_id = auth.uid() or public.is_manager_or_admin()
  );

drop policy if exists opportunities_delete on public.opportunities;
create policy opportunities_delete on public.opportunities
  for delete using (public.is_admin());

-- activities: read by all (it's the timeline); write by anyone authenticated
-- but only if they own the parent account or manager/admin
drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities
  for select using (auth.role() = 'authenticated');

drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities
  for insert with check (auth.role() = 'authenticated');

drop policy if exists activities_update on public.activities;
create policy activities_update on public.activities
  for update using (
    user_id = auth.uid() or public.is_manager_or_admin()
  )
  with check (
    user_id = auth.uid() or public.is_manager_or_admin()
  );

drop policy if exists activities_delete on public.activities;
create policy activities_delete on public.activities
  for delete using (public.is_manager_or_admin());

-- notes / tasks: same as activities (parent governs)
drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes
  for select using (auth.role() = 'authenticated');

drop policy if exists notes_write on public.notes;
create policy notes_write on public.notes
  for all using (
    exists (
      select 1 from public.activities a
      where a.id = notes.activity_id
        and (a.user_id = auth.uid() or public.is_manager_or_admin())
    )
  ) with check (
    exists (
      select 1 from public.activities a
      where a.id = notes.activity_id
        and (a.user_id = auth.uid() or public.is_manager_or_admin())
    )
  );

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select using (auth.role() = 'authenticated');

drop policy if exists tasks_write on public.tasks;
create policy tasks_write on public.tasks
  for all using (
    exists (
      select 1 from public.activities a
      where a.id = tasks.activity_id
        and (a.user_id = auth.uid() or a.user_id = tasks.assigned_user_id or public.is_manager_or_admin())
    )
  ) with check (
    exists (
      select 1 from public.activities a
      where a.id = tasks.activity_id
        and (a.user_id = auth.uid() or a.user_id = tasks.assigned_user_id or public.is_manager_or_admin())
    )
  );

-- audit_log: read-only for authenticated; insert via trigger (security definer);
-- only admins can read the full log.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select using (public.is_admin());

-- ─── Useful indexes ──────────────────────────────────────────────────────────
create index if not exists accounts_owner_idx on public.accounts (owner_user_id) where deleted_at is null;
create index if not exists accounts_name_idx on public.accounts using gin (to_tsvector('english', name));
create index if not exists contacts_account_idx on public.contacts (account_id) where deleted_at is null;
create index if not exists contacts_email_idx on public.contacts (lower(email)) where deleted_at is null;
create index if not exists contacts_phone_idx on public.contacts (phone) where deleted_at is null;
create index if not exists opportunities_owner_idx on public.opportunities (owner_user_id) where deleted_at is null;
create index if not exists opportunities_account_idx on public.opportunities (account_id) where deleted_at is null;
create index if not exists opportunities_pipeline_idx on public.opportunities (pipeline_id, stage_id) where deleted_at is null;
create index if not exists activities_account_idx on public.activities (account_id, occurred_at desc);
create index if not exists activities_contact_idx on public.activities (contact_id, occurred_at desc);
create index if not exists activities_opportunity_idx on public.activities (opportunity_id, occurred_at desc);
create index if not exists activities_unmatched_idx on public.activities (occurred_at desc) where account_id is null;
create index if not exists tasks_due_idx on public.tasks (due_at) where completed_at is null;
create index if not exists audit_log_table_row_idx on public.audit_log (table_name, row_id, occurred_at desc);
