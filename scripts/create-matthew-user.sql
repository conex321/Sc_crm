-- =============================================================================
-- create-matthew-user.sql
-- Creates matthew@schoolconex.com in auth.users so the post-signup trigger
-- populates public.users with a stable id. Matthew is auto-promoted to admin
-- only if he's the first user (he won't be — demo + rayan exist). Defaults
-- to 'rep' role; manually elevate to 'admin' afterward via SQL if desired.
--
-- Idempotent: safe to re-run. Does NOT create a password — Matthew signs in
-- via Google SSO. We just need the auth.users row to exist so the trigger
-- has fired and the foreign-key relationship is in place.
-- =============================================================================

do $$
declare
  v_email     text := 'matthew@schoolconex.com';
  v_full_name text := 'Matthew Rubio';
  v_user_id   uuid;
begin
  select id into v_user_id from auth.users where email = v_email;
  if v_user_id is not null then
    raise notice 'matthew already exists with id %, skipping auth.users insert', v_user_id;
  else
    v_user_id := gen_random_uuid();
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
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
      v_email,
      now(),
      jsonb_build_object('provider', 'google', 'providers', jsonb_build_array('google')),
      jsonb_build_object('full_name', v_full_name),
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
    raise notice 'created auth.users row for % (%)', v_email, v_user_id;
  end if;

  -- Ensure public.users row exists with the right name (the trigger may have
  -- run with a different display name on a prior pass; idempotent update).
  insert into public.users (id, full_name, google_email, role)
  values (v_user_id, v_full_name, v_email, 'admin')
  on conflict (id) do update
    set full_name = excluded.full_name,
        google_email = excluded.google_email;

  -- Seed Dialpad mappings (Matthew's known ids).
  update public.users
     set dialpad_user_id = '5502522061422592',
         dialpad_phone   = '+16474956991'
   where id = v_user_id;

  raise notice 'matthew dialpad mappings set (id=5502522061422592, phone=+16474956991)';
end $$;
