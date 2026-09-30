begin;
create table public.members (
 email text primary key check (email = lower(email)),
 role text not null default 'member' check (role in ('admin', 'member')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create function public.is_member() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.members where email = lower(auth.jwt()->>'email') and active);
$$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.members where email = lower(auth.jwt()->>'email') and active and role = 'admin');
$$;
revoke all on function public.is_member(), public.is_admin() from public;
grant execute on function public.is_member(), public.is_admin() to authenticated;
alter table public.members enable row level security;
create policy "Members can check their own access; admins can list" on public.members for select to authenticated using (email = lower(auth.jwt()->>'email') or public.is_admin());
-- Membership writes only through the trusted server admin client after authorization.
create table public.categories (
 id uuid primary key default gen_random_uuid(), name text not null unique, color text not null
);
insert into public.categories (name,color) values ('Groceries','#7ba887'),('Dining','#df9865'),('Home','#a394c8'),('Transport','#78a5c4'),('Health','#d47f8b'),('Shopping','#c5a65d'),('Travel','#6baeb0'),('Subscriptions','#919ac8'),('Other','#9ba5aa');
alter table public.categories enable row level security;
create policy "Approved users read categories" on public.categories for select to authenticated using (public.is_member());
create table public.expenses (
 id uuid primary key default gen_random_uuid(),
 merchant text not null check (length(merchant) between 1 and 160),
 amount numeric(10,2) not null check (amount > 0),
 currency text not null default 'ILS' check (currency in ('ILS','EUR','USD','GBP')),
 spent_on date not null,
 category_id uuid not null references public.categories(id),
 notes text not null default '' check (length(notes) <= 2000),
 receipt_path text unique,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (receipt_path is null or receipt_path = created_by::text || '/' || id::text || '.pdf' or receipt_path = created_by::text || '/' || id::text || '.jpg' or receipt_path = created_by::text || '/' || id::text || '.png')
);
create index expenses_date_idx on public.expenses(spent_on desc, created_at desc);
create index expenses_category_date_idx on public.expenses(category_id, spent_on desc);
create index expenses_creator_idx on public.expenses(created_by);
alter table public.expenses enable row level security;
create policy "Household reads expenses" on public.expenses for select to authenticated using (public.is_member());
create policy "Members add own expenses" on public.expenses for insert to authenticated with check (public.is_member() and created_by = auth.uid());
create policy "Owner or admin edits expenses" on public.expenses for update to authenticated using (public.is_member() and (created_by = auth.uid() or public.is_admin())) with check (public.is_member() and (created_by = auth.uid() or public.is_admin()));
create policy "Owner or admin deletes expenses" on public.expenses for delete to authenticated using (public.is_member() and (created_by = auth.uid() or public.is_admin()));
create function public.touch_expense() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); new.created_by = old.created_by; new.receipt_path = old.receipt_path; return new; end; $$;
create trigger expense_updated before update on public.expenses for each row execute function public.touch_expense();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('receipts','receipts',false,10485760,array['application/pdf','image/jpeg','image/png']);
create policy "Household reads linked receipts" on storage.objects for select to authenticated using (bucket_id='receipts' and public.is_member() and exists(select 1 from public.expenses where receipt_path = name));
create policy "Members upload to own folder" on storage.objects for insert to authenticated with check (bucket_id='receipts' and public.is_member() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Owners or admins remove receipts" on storage.objects for delete to authenticated using (bucket_id='receipts' and public.is_member() and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
insert into public.members(email,role) values ('benjiar@gmail.com','admin'),('keshet94@gmail.com','member');
grant select on public.members, public.categories to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
-- Aggregate in Postgres rather than loading the entire month's ledger into Node.
create function public.monthly_summary(month_start date)
returns table(currency text, category_id uuid, total numeric, expense_count bigint, receipt_count bigint)
language sql stable security invoker set search_path = '' as $$
 select e.currency, e.category_id, sum(e.amount), count(*), count(e.receipt_path)
 from public.expenses e
 where e.spent_on >= month_start and e.spent_on < (month_start + interval '1 month')::date
 group by e.currency,e.category_id;
$$;
revoke all on function public.monthly_summary(date) from public;
grant execute on function public.monthly_summary(date) to authenticated;

commit;
