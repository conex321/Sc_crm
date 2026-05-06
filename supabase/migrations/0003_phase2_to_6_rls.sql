-- =============================================================================
-- 0003_phase2_to_6_rls.sql
-- RLS + helper SQL for Phase 2 (Drive), Phase 3 (Dialpad), Phase 4 (catalog),
-- Phase 5 (Stripe + Mailshake), Phase 6 (WhatsApp).
-- Idempotent.
-- =============================================================================

-- ─── Apply touch_updated_at to new tables ────────────────────────────────────
do $$
declare
  t text;
  tables text[] := array[
    'documents', 'contract_templates', 'integration_credentials',
    'products', 'packages', 'opportunity_line_items'
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

-- ─── Audit log on admin-touchable Phase 4 tables ─────────────────────────────
do $$
declare
  t text;
  audited text[] := array['products', 'packages', 'package_items', 'contract_templates'];
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

-- ─── Auto-recompute opportunity amount from line items ──────────────────────
create or replace function public.recompute_opportunity_amount(p_opp_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.opportunities o
  set amount = coalesce((
    select sum(li.quantity * li.unit_price * (100 - li.discount_pct) / 100.0)
    from public.opportunity_line_items li
    where li.opportunity_id = o.id
  ), o.amount)
  where o.id = p_opp_id;
$$;

create or replace function public.opportunity_line_items_recompute_trg()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_opportunity_amount(old.opportunity_id);
    return old;
  else
    perform public.recompute_opportunity_amount(new.opportunity_id);
    return new;
  end if;
end;
$$;

drop trigger if exists li_recompute_trg on public.opportunity_line_items;
create trigger li_recompute_trg
  after insert or update or delete on public.opportunity_line_items
  for each row execute function public.opportunity_line_items_recompute_trg();

-- ─── Enable RLS on new tables ────────────────────────────────────────────────
alter table public.documents enable row level security;
alter table public.contract_templates enable row level security;
alter table public.integration_credentials enable row level security;
alter table public.integration_events_raw enable row level security;
alter table public.calls enable row level security;
alter table public.messages enable row level security;
alter table public.email_events enable row level security;
alter table public.contract_events enable row level security;
alter table public.payments enable row level security;
alter table public.products enable row level security;
alter table public.packages enable row level security;
alter table public.package_items enable row level security;
alter table public.opportunity_line_items enable row level security;

-- ─── documents: read by all, write by account-owner / manager / admin ────────
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select using (auth.role() = 'authenticated');

drop policy if exists documents_write on public.documents;
create policy documents_write on public.documents
  for all using (
    public.is_manager_or_admin()
    or exists (
      select 1 from public.accounts a
      where a.id = documents.account_id and a.owner_user_id = auth.uid()
    )
  ) with check (
    public.is_manager_or_admin()
    or exists (
      select 1 from public.accounts a
      where a.id = documents.account_id and a.owner_user_id = auth.uid()
    )
  );

-- ─── contract_templates: read by all, write by admin ────────────────────────
drop policy if exists contract_templates_select on public.contract_templates;
create policy contract_templates_select on public.contract_templates
  for select using (auth.role() = 'authenticated');

drop policy if exists contract_templates_admin_write on public.contract_templates;
create policy contract_templates_admin_write on public.contract_templates
  for all using (public.is_admin()) with check (public.is_admin());

-- ─── integration_credentials: read/write only by self or admin ──────────────
drop policy if exists integration_credentials_self on public.integration_credentials;
create policy integration_credentials_self on public.integration_credentials
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- ─── integration_events_raw: admin-only read; insert via webhook (service role) ─
drop policy if exists integration_events_raw_admin on public.integration_events_raw;
create policy integration_events_raw_admin on public.integration_events_raw
  for select using (public.is_admin());

-- ─── calls / messages / email_events / contract_events / payments ───────────
-- All follow activities-parent visibility: read by all authenticated; write
-- restricted similarly to activities (service-role inserts bypass RLS).
do $$
declare
  t text;
  child_tables text[] := array[
    'calls', 'messages', 'email_events', 'contract_events', 'payments'
  ];
begin
  foreach t in array child_tables loop
    execute format(
      'drop policy if exists %1$s_select on public.%1$s;
       create policy %1$s_select on public.%1$s
         for select using (auth.role() = ''authenticated'');',
      t
    );
    execute format(
      'drop policy if exists %1$s_write on public.%1$s;
       create policy %1$s_write on public.%1$s
         for all using (
           public.is_manager_or_admin()
           or exists (
             select 1 from public.activities a
             where a.id = %1$s.activity_id and a.user_id = auth.uid()
           )
         ) with check (
           public.is_manager_or_admin()
           or exists (
             select 1 from public.activities a
             where a.id = %1$s.activity_id and a.user_id = auth.uid()
           )
         );',
      t
    );
  end loop;
end $$;

-- ─── catalog: read by all, write by admin ────────────────────────────────────
do $$
declare
  t text;
  catalog text[] := array['products', 'packages', 'package_items'];
begin
  foreach t in array catalog loop
    execute format(
      'drop policy if exists %1$s_select on public.%1$s;
       create policy %1$s_select on public.%1$s
         for select using (auth.role() = ''authenticated'');',
      t
    );
    execute format(
      'drop policy if exists %1$s_admin_write on public.%1$s;
       create policy %1$s_admin_write on public.%1$s
         for all using (public.is_admin()) with check (public.is_admin());',
      t
    );
  end loop;
end $$;

-- ─── opportunity_line_items: same pattern as opportunities ──────────────────
drop policy if exists opp_line_items_select on public.opportunity_line_items;
create policy opp_line_items_select on public.opportunity_line_items
  for select using (auth.role() = 'authenticated');

drop policy if exists opp_line_items_write on public.opportunity_line_items;
create policy opp_line_items_write on public.opportunity_line_items
  for all using (
    public.is_manager_or_admin()
    or exists (
      select 1 from public.opportunities o
      where o.id = opportunity_line_items.opportunity_id
        and o.owner_user_id = auth.uid()
    )
  ) with check (
    public.is_manager_or_admin()
    or exists (
      select 1 from public.opportunities o
      where o.id = opportunity_line_items.opportunity_id
        and o.owner_user_id = auth.uid()
    )
  );

-- ─── Indexes ────────────────────────────────────────────────────────────────
create index if not exists documents_account_idx on public.documents (account_id);
create index if not exists documents_opp_idx on public.documents (opportunity_id);
create index if not exists documents_status_idx on public.documents (status) where status <> 'archived';

create index if not exists integration_events_provider_received_idx
  on public.integration_events_raw (provider, received_at desc);
create index if not exists integration_events_unprocessed_idx
  on public.integration_events_raw (received_at) where processed_at is null;

create index if not exists products_active_category_idx
  on public.products (category, is_active);
create index if not exists opp_line_items_opp_idx
  on public.opportunity_line_items (opportunity_id, position);
