-- =============================================================================
-- 0007_users_dialpad_phone.sql
-- Add users.dialpad_phone (E.164) so historical Dialpad calls whose raw
-- payload lacks user_id/target.id can be attributed by matching
-- from_number/to_number against the rep's phone.
-- Idempotent.
-- =============================================================================

alter table public.users
  add column if not exists dialpad_phone text;

-- Seed Rayan
update public.users
   set dialpad_phone = '+14375234132'
 where google_email = 'rayan@schoolconex.com'
   and (dialpad_phone is null or dialpad_phone <> '+14375234132');

-- Seed Matthew (only updates if Matthew row exists; create-matthew-user.sql
-- creates the row first, then migration re-run picks up the mapping).
update public.users
   set dialpad_user_id = '5502522061422592',
       dialpad_phone   = '+16474956991'
 where google_email = 'matthew@schoolconex.com'
   and (dialpad_user_id is distinct from '5502522061422592'
        or dialpad_phone is distinct from '+16474956991');
