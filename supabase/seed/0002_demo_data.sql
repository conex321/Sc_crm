-- =============================================================================
-- 0002_demo_data.sql
-- Optional demo data so the UI isn't empty on first sign-in.
-- Idempotent (uses fixed UUIDs + on conflict do nothing).
-- =============================================================================

insert into public.accounts (id, name, type, website, phone, country, source)
values
  ('aaaaaaa1-1111-4111-8111-aaaaaaaaaaaa', 'Lincoln Elementary School District', 'district', 'https://lincoln.example.edu', '+1-555-0142', 'US', 'mailshake'),
  ('aaaaaaa2-2222-4222-8222-aaaaaaaaaaab', 'Bright Horizons Charter', 'school', 'https://bright-horizons.example.edu', '+1-555-0188', 'US', 'referral'),
  ('aaaaaaa3-3333-4333-8333-aaaaaaaaaaac', 'Maria Hernandez (founder cohort)', 'aspiring_founder', null, '+1-555-0220', 'US', 'inbound')
on conflict (id) do nothing;

insert into public.contacts (id, account_id, first_name, last_name, role, email, phone, is_primary)
values
  ('bbbbbbb1-1111-4111-8111-bbbbbbbbbbb1', 'aaaaaaa1-1111-4111-8111-aaaaaaaaaaaa', 'Sandra', 'Reyes',  'Superintendent', 'sandra.reyes@lincoln.example.edu', '+1-555-0142', true),
  ('bbbbbbb1-1111-4111-8111-bbbbbbbbbbb2', 'aaaaaaa1-1111-4111-8111-aaaaaaaaaaaa', 'Marcus',  'Lee',    'Principal',      'marcus.lee@lincoln.example.edu',  '+1-555-0143', false),
  ('bbbbbbb2-2222-4222-8222-bbbbbbbbbbb1', 'aaaaaaa2-2222-4222-8222-aaaaaaaaaaab', 'Elena',   'Park',   'Head of School', 'elena.park@bright-horizons.example.edu', '+1-555-0188', true),
  ('bbbbbbb3-3333-4333-8333-bbbbbbbbbbb1', 'aaaaaaa3-3333-4333-8333-aaaaaaaaaaac', 'Maria',   'Hernandez', 'Founder',     'maria.h@example.com',              '+1-555-0220', true)
on conflict (id) do nothing;

-- Open opportunities, one per account, in early stages
insert into public.opportunities (id, account_id, pipeline_id, stage_id, name, amount, currency, expected_close_date, primary_contact_id, status)
select
  'ccccccc1-1111-4111-8111-ccccccccccc1'::uuid,
  'aaaaaaa1-1111-4111-8111-aaaaaaaaaaaa'::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid,  -- Principal Service
  s.id,
  'Lincoln ESD — Principal coaching pilot',
  48000,
  'USD',
  current_date + interval '45 days',
  'bbbbbbb1-1111-4111-8111-bbbbbbbbbbb1',
  'open'
from public.pipeline_stages s
where s.pipeline_id = '11111111-1111-4111-8111-111111111111' and s.position = 2  -- Discovery
on conflict (id) do nothing;

insert into public.opportunities (id, account_id, pipeline_id, stage_id, name, amount, currency, expected_close_date, primary_contact_id, status)
select
  'ccccccc2-2222-4222-8222-ccccccccccc2'::uuid,
  'aaaaaaa2-2222-4222-8222-aaaaaaaaaaab'::uuid,
  '22222222-2222-4222-8222-222222222222'::uuid,  -- LMS
  s.id,
  'Bright Horizons — LMS evaluation',
  18500,
  'USD',
  current_date + interval '60 days',
  'bbbbbbb2-2222-4222-8222-bbbbbbbbbbb1',
  'open'
from public.pipeline_stages s
where s.pipeline_id = '22222222-2222-4222-8222-222222222222' and s.position = 2  -- Demo
on conflict (id) do nothing;

insert into public.opportunities (id, account_id, pipeline_id, stage_id, name, amount, currency, expected_close_date, primary_contact_id, status)
select
  'ccccccc3-3333-4333-8333-ccccccccccc3'::uuid,
  'aaaaaaa3-3333-4333-8333-aaaaaaaaaaac'::uuid,
  '33333333-3333-4333-8333-333333333333'::uuid,  -- Courses
  s.id,
  'Hernandez — School Founder bundle',
  4200,
  'USD',
  current_date + interval '14 days',
  'bbbbbbb3-3333-4333-8333-bbbbbbbbbbb1',
  'open'
from public.pipeline_stages s
where s.pipeline_id = '33333333-3333-4333-8333-333333333333' and s.position = 2  -- Quote
on conflict (id) do nothing;

-- A note + task on the Lincoln account
insert into public.activities (id, account_id, contact_id, opportunity_id, channel, direction, occurred_at, summary)
values
  ('eeeeeee1-1111-4111-8111-eeeeeeeeeee1', 'aaaaaaa1-1111-4111-8111-aaaaaaaaaaaa', 'bbbbbbb1-1111-4111-8111-bbbbbbbbbbb1', 'ccccccc1-1111-4111-8111-ccccccccccc1', 'note', 'outbound', now() - interval '2 days', 'Initial discovery call. Sandra wants principal coaching for 4 schools.'),
  ('eeeeeee1-1111-4111-8111-eeeeeeeeeee2', 'aaaaaaa1-1111-4111-8111-aaaaaaaaaaaa', 'bbbbbbb1-1111-4111-8111-bbbbbbbbbbb1', 'ccccccc1-1111-4111-8111-ccccccccccc1', 'task', 'system',   now(),                    'Task: Send tailored proposal by Friday')
on conflict (id) do nothing;

insert into public.notes (activity_id, body)
values ('eeeeeee1-1111-4111-8111-eeeeeeeeeee1', 'Initial discovery call. Sandra wants principal coaching for 4 schools — looking at a 6-month engagement starting fall semester. Budget hint: $40-50k. Need formal proposal by Friday.')
on conflict (activity_id) do nothing;

insert into public.tasks (activity_id, title, due_at)
values ('eeeeeee1-1111-4111-8111-eeeeeeeeeee2', 'Send tailored proposal by Friday', now() + interval '3 days')
on conflict (activity_id) do nothing;
