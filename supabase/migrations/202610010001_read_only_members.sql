begin;

alter table public.members drop constraint members_role_check;
alter table public.members
  add constraint members_role_check
  check (role in ('admin', 'member', 'read_only'));

create or replace function public.can_write() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members
    where email = lower(auth.jwt()->>'email')
      and active
      and role in ('admin', 'member')
  );
$$;
revoke all on function public.can_write() from public;
grant execute on function public.can_write() to authenticated;

drop policy "Members add own expenses" on public.expenses;
create policy "Members add own expenses" on public.expenses for insert to authenticated
  with check (public.can_write() and created_by = auth.uid());

drop policy "Owner or admin edits expenses" on public.expenses;
create policy "Owner or admin edits expenses" on public.expenses for update to authenticated
  using (public.can_write() and (created_by = auth.uid() or public.is_admin()))
  with check (public.can_write() and (created_by = auth.uid() or public.is_admin()));

drop policy "Owner or admin deletes expenses" on public.expenses;
create policy "Owner or admin deletes expenses" on public.expenses for delete to authenticated
  using (public.can_write() and (created_by = auth.uid() or public.is_admin()));

drop policy "Members upload to own folder" on storage.objects;
create policy "Members upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id='receipts' and public.can_write() and (storage.foldername(name))[1] = auth.uid()::text);

drop policy "Owners or admins remove receipts" on storage.objects;
create policy "Owners or admins remove receipts" on storage.objects for delete to authenticated
  using (bucket_id='receipts' and public.can_write() and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

commit;
