-- Hotfix: pr_boxes was created in migration 0005 with SELECT + UPDATE
-- policies only — INSERT was implicitly denied by RLS (default-deny when
-- the table has policies but no matching one for an operation).
--
-- This bit was caught when an athlete tried "Criar box" on /pr/coach and
-- the API surfaced "new row violates row-level security policy for table
-- pr_boxes". Adding the missing policies here so any signed-in user can
-- create a box owned by themselves, and delete a box they own.

drop policy if exists "auth user creates own box" on public.pr_boxes;
create policy "auth user creates own box" on public.pr_boxes
  for insert with check (owner_user_id = auth.uid());

drop policy if exists "owner deletes own box" on public.pr_boxes;
create policy "owner deletes own box" on public.pr_boxes
  for delete using (owner_user_id = auth.uid());
