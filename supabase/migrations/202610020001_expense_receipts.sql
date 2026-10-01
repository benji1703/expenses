begin;

create table public.expense_receipts (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  path text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (
    path like created_by::text || '/' || expense_id::text || '/%'
    or path in (
      created_by::text || '/' || expense_id::text || '.pdf',
      created_by::text || '/' || expense_id::text || '.jpg',
      created_by::text || '/' || expense_id::text || '.png'
    )
  )
);

alter table public.expense_receipts enable row level security;
create policy "Household reads expense receipts" on public.expense_receipts
  for select to authenticated using (public.is_member());
create policy "Members add expense receipts" on public.expense_receipts
  for insert to authenticated with check (public.can_write() and created_by = auth.uid()
    and exists (select 1 from public.expenses e where e.id = expense_id
      and (e.created_by = auth.uid() or public.is_admin())));
create policy "Owners or admins remove expense receipts" on public.expense_receipts
  for delete to authenticated using (public.can_write() and (created_by = auth.uid() or public.is_admin()));
grant select, insert, delete on public.expense_receipts to authenticated;

insert into public.expense_receipts(expense_id, path, created_by)
select id, receipt_path, created_by from public.expenses where receipt_path is not null
on conflict (path) do nothing;

drop policy "Household reads linked receipts" on storage.objects;
create policy "Household reads linked receipts" on storage.objects for select to authenticated
  using (bucket_id='receipts' and public.is_member() and (
    exists(select 1 from public.expenses where receipt_path = name)
    or exists(select 1 from public.expense_receipts where path = name)
  ));

drop function public.monthly_summary(date);
create function public.monthly_summary(month_start date default null)
returns table(currency text, category_id uuid, total numeric, paid_total numeric, outstanding_total numeric, planned_total numeric, expense_count bigint, receipt_count bigint)
language sql stable security invoker set search_path = '' as $$
 select e.currency,e.category_id,sum(e.amount),
 coalesce(sum(e.amount) filter(where e.payment_status='paid'),0),
 coalesce(sum(e.amount) filter(where e.payment_status='unpaid'),0),
 coalesce(sum(e.amount) filter(where e.payment_status='planned'),0),count(*),coalesce(sum(rc.receipt_count),0)
 from public.expenses e
 left join lateral (select count(*) as receipt_count from public.expense_receipts r where r.expense_id=e.id) rc on true
 where month_start is null or (e.spent_on >= month_start and e.spent_on < (month_start + interval '1 month')::date)
 group by e.currency,e.category_id;
$$;
revoke all on function public.monthly_summary(date) from public;
grant execute on function public.monthly_summary(date) to authenticated;

commit;
