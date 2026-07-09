-- =============================================================================
-- 0011_rep_edit_access.sql
-- D-043: any authenticated user (rep or admin) may UPDATE accounts, contacts,
-- and opportunities — matching the already-open INSERT policies. Previously
-- UPDATE was owner-gated, so a rep editing a record they didn't own either
-- errored (with-check) or silently saved nothing (0 rows matched).
-- DELETE stays admin-only; billing figures stay admin-gated in the UI.
-- Idempotent (drop if exists + create).
-- =============================================================================

drop policy if exists accounts_update_own on public.accounts;
drop policy if exists accounts_update on public.accounts;
create policy accounts_update on public.accounts
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists opportunities_update_own on public.opportunities;
drop policy if exists opportunities_update on public.opportunities;
create policy opportunities_update on public.opportunities
  for update using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
