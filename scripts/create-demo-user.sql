-- =============================================================================
-- create-demo-user.sql
-- Creates a demo email/password user for local testing.
-- Run AFTER the schema migrations (0001/0002/0003) so the post-signup trigger
-- exists and fires, populating public.users with role='admin' (first user).
-- Idempotent: safe to re-run; won't recreate the user if it exists.
--
-- Credentials:
--   email    : demo@schoolconex.com
--   password : Test1234!
-- =============================================================================

do $$
declare
  demo_email     text := 'demo@schoolconex.com';
  demo_password  text := 'Test1234!';
  v_user_id      uuid;
begin
  select id into v_user_id from auth.users where email = demo_email;
  if v_user_id is not null then
    raise notice 'demo user already exists with id %, skipping', v_user_id;
    return;
  end if;

  v_user_id := gen_random_uuid();

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) values (
    '00000000-0000-0000-0000-000000000000'::uuid,
    v_user_id,
    'authenticated',
    'authenticated',
    demo_email,
    crypt(demo_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', 'Demo User'),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    v_user_id::text,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', demo_email, 'email_verified', true),
    'email',
    now(),
    now(),
    now()
  );

  raise notice 'created demo user % with id %', demo_email, v_user_id;
end $$;
