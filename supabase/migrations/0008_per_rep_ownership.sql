-- =============================================================================
-- 0008_per_rep_ownership.sql
-- Per-rep visibility for sync surfaces:
--   * Add owner_user_id to mailshake_campaigns
--   * Add assigned_user_id to mailshake_leads
--   * Tighten SELECT RLS on activities, email_messages, calls,
--     mailshake_campaigns, mailshake_leads so reps see only their own data
--     (or activities on accounts they own); admin sees everything.
--   * Backfill all current Mailshake rows to Rayan and cascade account
--     ownership + Mailshake-event activity attribution.
-- Idempotent: safe to re-run via `npm run db:apply-migrations`.
-- =============================================================================

-- ── Schema additions ────────────────────────────────────────────────
alter table public.mailshake_campaigns
  add column if not exists owner_user_id uuid references public.users(id) on delete set null;

alter table public.mailshake_leads
  add column if not exists assigned_user_id uuid references public.users(id) on delete set null;

create index if not exists mailshake_campaigns_owner_idx
  on public.mailshake_campaigns (owner_user_id);
create index if not exists mailshake_leads_assigned_idx
  on public.mailshake_leads (assigned_user_id);

-- ── Backfill: Rayan owns all current Mailshake data ────────────────
update public.mailshake_campaigns
   set owner_user_id = u.id
  from public.users u
 where u.google_email = 'rayan@schoolconex.com'
   and mailshake_campaigns.owner_user_id is null;

update public.mailshake_leads
   set assigned_user_id = u.id
  from public.users u
 where u.google_email = 'rayan@schoolconex.com'
   and mailshake_leads.assigned_user_id is null;

-- Cascade: accounts created from Mailshake leads should inherit rep ownership
-- so per-rep filters (and the new RLS below) include the right rows.
update public.accounts
   set owner_user_id = sub.assigned_user_id
  from (
    select distinct l.account_id, l.assigned_user_id
      from public.mailshake_leads l
     where l.account_id is not null
       and l.assigned_user_id is not null
  ) as sub
 where accounts.id = sub.account_id
   and accounts.owner_user_id is null;

-- Cascade: stamp Mailshake-event activities with the assigned rep so they
-- show in the rep's account timelines under the new RLS predicate.
update public.activities
   set user_id = sub.assigned_user_id
  from (
    select distinct l.account_id, l.assigned_user_id
      from public.mailshake_leads l
     where l.account_id is not null
       and l.assigned_user_id is not null
  ) as sub
 where activities.account_id = sub.account_id
   and activities.channel = 'mailshake_event'
   and activities.user_id is null;

-- ── RLS rewrites ────────────────────────────────────────────────────
-- Pattern: admin override + (user_id = self OR account_id is one of mine).
-- Drop-then-create so re-running is idempotent.

-- activities: rep sees their own + activities on accounts they own.
-- Unmatched (account_id IS NULL) activities still visible to the rep who
-- created them (e.g. their own Gmail/Dialpad items that didn't auto-match).
drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities
  for select using (
    public.is_admin()
    or user_id = auth.uid()
    or account_id in (
      select id from public.accounts where owner_user_id = auth.uid()
    )
  );

-- email_messages: visibility flows from the parent activity.
drop policy if exists email_messages_select on public.email_messages;
create policy email_messages_select on public.email_messages
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.activities a
       where a.id = email_messages.activity_id
         and (
           a.user_id = auth.uid()
           or a.account_id in (
             select id from public.accounts where owner_user_id = auth.uid()
           )
         )
    )
  );

-- calls: same shape as email_messages (via activity join).
drop policy if exists calls_select on public.calls;
create policy calls_select on public.calls
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.activities a
       where a.id = calls.activity_id
         and (
           a.user_id = auth.uid()
           or a.account_id in (
             select id from public.accounts where owner_user_id = auth.uid()
           )
         )
    )
  );

-- mailshake_campaigns: per-rep owner.
drop policy if exists mailshake_campaigns_select on public.mailshake_campaigns;
create policy mailshake_campaigns_select on public.mailshake_campaigns
  for select using (
    public.is_admin()
    or owner_user_id = auth.uid()
  );

-- mailshake_leads: per-rep assigned, or via account ownership.
drop policy if exists mailshake_leads_select on public.mailshake_leads;
create policy mailshake_leads_select on public.mailshake_leads
  for select using (
    public.is_admin()
    or assigned_user_id = auth.uid()
    or account_id in (
      select id from public.accounts where owner_user_id = auth.uid()
    )
  );
