-- =============================================================================
-- Create a sign-in account for rayan@schoolconex.com so we can test as him.
-- Idempotent. Rayan is a REP (D-039) — per-rep RLS scopes him to his own
-- synced data. Matthew (matthew@schoolconex.com) is the admin.
--
--   email    : rayan@schoolconex.com
--   password : Test1234!
-- =============================================================================

do $$
declare
  rayan_email    text := 'rayan@schoolconex.com';
  rayan_password text := 'Test1234!';
  v_user_id      uuid;
begin
  select id into v_user_id from auth.users where email = rayan_email;
  if v_user_id is not null then
    raise notice 'rayan already exists with id %, refreshing password + role', v_user_id;
    update auth.users
       set encrypted_password = crypt(rayan_password, gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where id = v_user_id;
    update public.users set role = 'rep', is_active = true where id = v_user_id;
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
    rayan_email,
    crypt(rayan_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', 'Rayan Gohargani'),
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
    jsonb_build_object('sub', v_user_id::text, 'email', rayan_email, 'email_verified', true),
    'email',
    now(),
    now(),
    now()
  );

  -- Rayan is a rep (D-039): the trigger's 'rep' default is correct, just make
  -- sure the row is active.
  update public.users set role = 'rep', is_active = true where id = v_user_id;

  raise notice 'created rayan@schoolconex.com with id %', v_user_id;
end $$;
