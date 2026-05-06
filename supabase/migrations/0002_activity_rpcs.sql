-- =============================================================================
-- 0002_activity_rpcs.sql
-- Postgres RPCs that atomically insert parent activity + child row.
-- Idempotent.
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
  return v_completed;
end;
$$;
