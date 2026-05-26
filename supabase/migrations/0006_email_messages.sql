-- =============================================================================
-- 0006_email_messages.sql
-- Per-rep Gmail mailbox sync. 1:1 child of activities (channel='email_inbound'
-- | 'email_outbound'). RLS: authenticated read, service-role write.
-- Idempotent.
-- =============================================================================

create table if not exists public.email_messages (
  activity_id uuid primary key references public.activities(id) on delete cascade,
  provider text not null default 'gmail',
  provider_message_id text not null unique,
  thread_id text,
  from_address text,
  to_addresses jsonb not null default '[]'::jsonb,
  cc_addresses jsonb not null default '[]'::jsonb,
  subject text,
  snippet text,
  body_text text,
  body_html text,
  internal_date timestamptz
);

create index if not exists email_messages_thread_id_idx
  on public.email_messages (thread_id);

create index if not exists email_messages_from_address_idx
  on public.email_messages (lower(from_address));

alter table public.email_messages enable row level security;

drop policy if exists email_messages_select on public.email_messages;
create policy email_messages_select on public.email_messages
  for select using (auth.role() = 'authenticated');

drop policy if exists email_messages_admin_write on public.email_messages;
create policy email_messages_admin_write on public.email_messages
  for all using (public.is_admin()) with check (public.is_admin());
