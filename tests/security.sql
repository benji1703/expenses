begin;
insert into auth.users(id,email) values
 ('11111111-1111-4111-8111-111111111111','security-member@example.invalid'),
 ('22222222-2222-4222-8222-222222222222','security-outsider@example.invalid'),
 ('33333333-3333-4333-8333-333333333333','security-admin@example.invalid'),
 ('55555555-5555-4555-8555-555555555555','security-reader@example.invalid');
insert into public.members(email,role) values ('security-member@example.invalid','member'),('security-admin@example.invalid','admin'),('security-reader@example.invalid','read_only');
insert into public.expenses(id,merchant,amount,currency,spent_on,category_id,created_by,receipt_path)
select '44444444-4444-4444-8444-444444444444','Security test',12.34,'ILS','2026-09-30',id,'11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444.pdf' from public.categories limit 1;
insert into storage.objects(bucket_id,name) values ('receipts','11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444.pdf');
insert into public.expense_receipts(id,expense_id,path,created_by) values
 ('66666666-6666-4666-8666-666666666666','44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/66666666-6666-4666-8666-666666666666.pdf','11111111-1111-4111-8111-111111111111'),
 ('77777777-7777-4777-8777-777777777777','44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/77777777-7777-4777-8777-777777777777.pdf','11111111-1111-4111-8111-111111111111');
insert into storage.objects(bucket_id,name) values
 ('receipts','11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/66666666-6666-4666-8666-666666666666.pdf'),
 ('receipts','11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/77777777-7777-4777-8777-777777777777.pdf');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","email":"security-outsider@example.invalid","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.expenses) then raise exception 'SECURITY: outsider read expenses'; end if;
 if exists(select 1 from public.categories) then raise exception 'SECURITY: outsider read categories'; end if;
 if exists(select 1 from storage.objects where bucket_id='receipts') then raise exception 'SECURITY: outsider read receipts'; end if;
 if exists(select 1 from public.monthly_summary('2026-09-01')) then raise exception 'SECURITY: outsider read totals'; end if;
 begin
  insert into public.members(email) values ('attacker@example.invalid');
  raise exception 'SECURITY: outsider self-approved';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","email":"security-member@example.invalid","role":"authenticated"}',true);
do $$ begin
 if not exists(select 1 from public.expenses where id='44444444-4444-4444-8444-444444444444') then raise exception 'Member cannot read shared ledger'; end if;
 if (select count(*) from public.expense_receipts where expense_id='44444444-4444-4444-8444-444444444444') <> 2 then raise exception 'Member cannot read multiple expense receipts'; end if;
 if not exists(select 1 from storage.objects where name='11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444.pdf') then raise exception 'Member cannot read linked receipt'; end if;
 if exists(select 1 from public.members where email='security-admin@example.invalid') then raise exception 'SECURITY: member listed other members'; end if;
 begin
  insert into public.expenses(merchant,amount,spent_on,category_id,created_by) select 'Spoofed',1,'2026-09-30',id,'33333333-3333-4333-8333-333333333333' from public.categories limit 1;
  raise exception 'SECURITY: member spoofed creator';
 exception when insufficient_privilege then null; end;
 begin
  insert into storage.objects(bucket_id,name) values ('receipts','33333333-3333-4333-8333-333333333333/wrong.pdf');
  raise exception 'SECURITY: member uploaded to another folder';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"55555555-5555-4555-8555-555555555555","email":"security-reader@example.invalid","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.expense_receipts where expense_id='44444444-4444-4444-8444-444444444444') <> 2 then raise exception 'Read-only member cannot read receipt metadata'; end if;
 begin
  insert into public.expense_receipts(expense_id,path,created_by) values ('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555/44444444-4444-4444-8444-444444444444/88888888-8888-4888-8888-888888888888.pdf','55555555-5555-4555-8555-555555555555');
  raise exception 'SECURITY: read-only member added a receipt';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","email":"security-admin@example.invalid","role":"authenticated"}',true);
do $$ begin
 if not exists(select 1 from public.members where email='security-member@example.invalid') then raise exception 'Admin cannot list members'; end if;
 update public.expenses set merchant='Admin edit' where id='44444444-4444-4444-8444-444444444444';
 if not exists(select 1 from public.expenses where merchant='Admin edit') then raise exception 'Admin cannot edit household expenses'; end if;
end $$;
reset role;
update public.members set active=false where email='security-member@example.invalid';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","email":"security-member@example.invalid","role":"authenticated"}',true);
do $$ begin
 if exists(select 1 from public.expenses) then raise exception 'SECURITY: revoked member read expenses'; end if;
 if exists(select 1 from storage.objects where bucket_id='receipts') then raise exception 'SECURITY: revoked member read receipts'; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from storage.buckets where id='receipts' and public=true) then raise exception 'SECURITY: receipts bucket is public'; end if;
end $$;
rollback;
select 'PASS: invitation, household access, multiple receipts, read-only access, admin edit, creator spoofing, and revocation' as result;
