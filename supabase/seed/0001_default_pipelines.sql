-- =============================================================================
-- 0001_default_pipelines.sql
-- Seeds the two default pipelines for SchoolConex (D-006 / Phase 1).
-- Idempotent: re-runnable.
-- =============================================================================

insert into public.pipelines (id, name, slug, service_line, is_active)
values
  ('11111111-1111-4111-8111-111111111111', 'Principal Service', 'principal-service', 'principal_service', true),
  ('22222222-2222-4222-8222-222222222222', 'LMS', 'lms', 'lms', true),
  ('33333333-3333-4333-8333-333333333333', 'Courses', 'courses', 'courses', true)
on conflict (slug) do nothing;

-- Principal Service stages
insert into public.pipeline_stages (pipeline_id, name, position, probability, is_won, is_lost)
values
  ('11111111-1111-4111-8111-111111111111', 'Lead',          1, 10,  false, false),
  ('11111111-1111-4111-8111-111111111111', 'Discovery',     2, 25,  false, false),
  ('11111111-1111-4111-8111-111111111111', 'Proposal',      3, 50,  false, false),
  ('11111111-1111-4111-8111-111111111111', 'Contract Sent', 4, 75,  false, false),
  ('11111111-1111-4111-8111-111111111111', 'Signed',        5, 100, true,  false),
  ('11111111-1111-4111-8111-111111111111', 'Onboarded',     6, 100, true,  false),
  ('11111111-1111-4111-8111-111111111111', 'Lost',          7, 0,   false, true)
on conflict (pipeline_id, position) do nothing;

-- LMS stages
insert into public.pipeline_stages (pipeline_id, name, position, probability, is_won, is_lost)
values
  ('22222222-2222-4222-8222-222222222222', 'Lead',     1, 10,  false, false),
  ('22222222-2222-4222-8222-222222222222', 'Demo',     2, 30,  false, false),
  ('22222222-2222-4222-8222-222222222222', 'Pilot',    3, 50,  false, false),
  ('22222222-2222-4222-8222-222222222222', 'Quote',    4, 70,  false, false),
  ('22222222-2222-4222-8222-222222222222', 'Closed Won',  5, 100, true,  false),
  ('22222222-2222-4222-8222-222222222222', 'Closed Lost', 6, 0,   false, true)
on conflict (pipeline_id, position) do nothing;

-- Courses stages
insert into public.pipeline_stages (pipeline_id, name, position, probability, is_won, is_lost)
values
  ('33333333-3333-4333-8333-333333333333', 'Lead',        1, 10,  false, false),
  ('33333333-3333-4333-8333-333333333333', 'Quote',       2, 50,  false, false),
  ('33333333-3333-4333-8333-333333333333', 'Closed Won',  3, 100, true,  false),
  ('33333333-3333-4333-8333-333333333333', 'Closed Lost', 4, 0,   false, true)
on conflict (pipeline_id, position) do nothing;
