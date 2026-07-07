-- =============================================================================
-- 0010_followup_view.sql
-- Follow-up queue: open Mailshake leads joined to their account's last touch
-- (call/email activity). security_invoker so RLS applies as the querying rep —
-- each rep computes last-touch only from activities they can see.
-- NOTE: views are not tracked in lib/db/schema.ts (tables only); queried via
-- the Supabase client. Idempotent (create or replace / if not exists).
-- =============================================================================

create or replace view public.followup_leads
with (security_invoker = true) as
select l.id,
       l.email,
       l.full_name,
       l.school_name,
       l.status,
       l.last_status_change_at,
       l.assigned_user_id,
       l.account_id,
       a.name as account_name,
       a.owner_user_id,
       t.last_touch_at
  from public.mailshake_leads l
  join public.accounts a on a.id = l.account_id and a.deleted_at is null
  left join lateral (
    select max(act.occurred_at) as last_touch_at
      from public.activities act
     where act.account_id = l.account_id
       and act.channel in ('call', 'email_outbound', 'email_inbound', 'whatsapp')
  ) t on true
 where l.status = 'open';

create index if not exists activities_account_occurred_idx
  on public.activities (account_id, occurred_at desc);
