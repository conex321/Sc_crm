-- =============================================================================
-- 0004_mailshake_campaigns_rls.sql
-- RLS for mailshake_campaigns and mailshake_leads tables (synced from
-- Mailshake API). All authenticated users can read; writes are restricted to
-- service role / admin (sync runs server-side via Drizzle, bypassing RLS).
-- Idempotent.
-- =============================================================================

-- Apply touch_updated_at trigger
do $$
declare
  t text;
  tables text[] := array['mailshake_campaigns', 'mailshake_leads'];
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

alter table public.mailshake_campaigns enable row level security;
alter table public.mailshake_leads enable row level security;

-- mailshake_campaigns: read by all authenticated; write by admin only
drop policy if exists mailshake_campaigns_select on public.mailshake_campaigns;
create policy mailshake_campaigns_select on public.mailshake_campaigns
  for select using (auth.role() = 'authenticated');

drop policy if exists mailshake_campaigns_admin_write on public.mailshake_campaigns;
create policy mailshake_campaigns_admin_write on public.mailshake_campaigns
  for all using (public.is_admin()) with check (public.is_admin());

-- mailshake_leads: same pattern
drop policy if exists mailshake_leads_select on public.mailshake_leads;
create policy mailshake_leads_select on public.mailshake_leads
  for select using (auth.role() = 'authenticated');

drop policy if exists mailshake_leads_admin_write on public.mailshake_leads;
create policy mailshake_leads_admin_write on public.mailshake_leads
  for all using (public.is_admin()) with check (public.is_admin());
