-- =============================================================================
-- 0013_deals_parity.sql
-- Phase 2: rotting config, deal labels, won/lost timestamps, next-task view,
-- rot-reset touches on activity RPCs. Idempotent (apply-sql re-runs all files).
-- =============================================================================

alter table public.pipeline_stages add column if not exists rot_days integer;
alter table public.opportunities   add column if not exists label   text;
alter table public.opportunities   add column if not exists won_at  timestamptz;
alter table public.opportunities   add column if not exists lost_at timestamptz;

-- Forecast bucketing + list sorting
create index if not exists opportunities_expected_close_idx
  on public.opportunities (expected_close_date) where deleted_at is null;
-- Next-task view join path. NOTE: 0001 already creates this name as
-- (opportunity_id, occurred_at desc), which covers the join — this statement
-- is a safety no-op on any DB that ran 0001 (kept for fresh-DB robustness).
create index if not exists activities_opportunity_idx
  on public.activities (opportunity_id) where opportunity_id is not null;
-- (tasks_due_idx on tasks(due_at) where completed_at is null already exists — 0001)

-- Backfill won_at/lost_at from updated_at (best available approximation).
-- Idempotent: `is null` guard makes re-runs no-ops.
update public.opportunities set won_at  = updated_at where status = 'won'  and won_at  is null;
update public.opportunities set lost_at = updated_at where status = 'lost' and lost_at is null;

-- Next scheduled task per deal. security_invoker so activities RLS applies
-- (reps see chips only for tasks their RLS allows — expected per D-038).
drop view if exists public.opportunity_next_task;
create view public.opportunity_next_task
with (security_invoker = true) as
select distinct on (a.opportunity_id)
  a.opportunity_id,
  o.pipeline_id,
  a.id as activity_id,
  t.title,
  t.due_at
from public.activities a
join public.tasks t on t.activity_id = a.id
join public.opportunities o on o.id = a.opportunity_id
where t.completed_at is null
  and o.deleted_at is null
  and o.status = 'open'
order by a.opportunity_id, t.due_at asc nulls last;

-- =============================================================================
-- Activity RPCs (recreated from 0002 with rot-reset touches appended).
-- Touching the deal fires the touch_updated_at trigger (0001) which bumps
-- opportunities.updated_at = now() — resetting the rotting clock.
-- opportunities UPDATE is rep-open per migration 0011, so RLS passes.
-- =============================================================================

create or replace function public.create_note(
  p_account_id uuid,
  p_contact_id uuid,
  p_opportunity_id uuid,
  p_body text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_activity_id uuid;
  v_summary text;
begin
  if p_body is null or btrim(p_body) = '' then
    raise exception 'Note body is required';
  end if;

  v_summary := substring(btrim(p_body) from 1 for 200);

  insert into public.activities (
    account_id, contact_id, opportunity_id, user_id,
    channel, direction, occurred_at, summary,
    created_by, updated_by
  ) values (
    p_account_id, p_contact_id, p_opportunity_id, auth.uid(),
    'note', 'outbound', now(), v_summary,
    auth.uid(), auth.uid()
  ) returning id into v_activity_id;

  insert into public.notes (activity_id, body)
  values (v_activity_id, p_body);

  -- Rot-reset: touching the deal bumps updated_at via touch_updated_at trigger
  if p_opportunity_id is not null then
    update public.opportunities set updated_by = auth.uid() where id = p_opportunity_id;
  end if;

  return v_activity_id;
end;
$$;

create or replace function public.create_task(
  p_account_id uuid,
  p_contact_id uuid,
  p_opportunity_id uuid,
  p_title text,
  p_due_at timestamptz,
  p_assigned_user_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_activity_id uuid;
  v_summary text;
begin
  if p_title is null or btrim(p_title) = '' then
    raise exception 'Task title is required';
  end if;

  v_summary := 'Task: ' || substring(btrim(p_title) from 1 for 180);

  insert into public.activities (
    account_id, contact_id, opportunity_id, user_id,
    channel, direction, occurred_at, summary,
    created_by, updated_by
  ) values (
    p_account_id, p_contact_id, p_opportunity_id, auth.uid(),
    'task', 'system', now(), v_summary,
    auth.uid(), auth.uid()
  ) returning id into v_activity_id;

  insert into public.tasks (activity_id, title, due_at, completed_at, assigned_user_id)
  values (v_activity_id, p_title, p_due_at, null, coalesce(p_assigned_user_id, auth.uid()));

  -- Rot-reset: touching the deal bumps updated_at via touch_updated_at trigger
  if p_opportunity_id is not null then
    update public.opportunities set updated_by = auth.uid() where id = p_opportunity_id;
  end if;

  return v_activity_id;
end;
$$;

create or replace function public.toggle_task_complete(p_activity_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_completed boolean;
begin
  update public.tasks
  set completed_at = case when completed_at is null then v_now else null end
  where activity_id = p_activity_id
  returning (completed_at is not null) into v_completed;

  if v_completed is null then
    raise exception 'Task not found';
  end if;

  -- Rot-reset: touching the deal bumps updated_at via touch_updated_at trigger
  update public.opportunities o set updated_by = auth.uid()
  from public.activities a
  where a.id = p_activity_id and o.id = a.opportunity_id;

  return v_completed;
end;
$$;
