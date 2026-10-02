-- Run against a disposable/local database with migrations applied. Changes roll
-- back, but these tests take membership locks; do not run against live user flows.
begin;
insert into public.members(email,role,active) values
 ('guard-admin-a@example.invalid','admin',true),
 ('guard-admin-b@example.invalid','admin',true),
 ('guard-member@example.invalid','member',true);

-- Fixture admins remain while existing admins are hidden within this transaction.
update public.members set active=false
 where role='admin' and email not in ('guard-admin-a@example.invalid','guard-admin-b@example.invalid');
update public.members set active=false where email='guard-admin-a@example.invalid';

do $$
declare
  failed_constraint text;
begin
  begin
    update public.members set active=false where email='guard-admin-b@example.invalid';
    raise exception 'GUARD: revoked final admin';
  exception when check_violation then
    get stacked diagnostics failed_constraint = constraint_name;
    if failed_constraint <> 'members_last_active_admin' then raise; end if;
  end;
  begin
    update public.members set role='member' where email='guard-admin-b@example.invalid';
    raise exception 'GUARD: demoted final admin';
  exception when check_violation then
    get stacked diagnostics failed_constraint = constraint_name;
    if failed_constraint <> 'members_last_active_admin' then raise; end if;
  end;
  begin
    delete from public.members where email='guard-admin-b@example.invalid';
    raise exception 'GUARD: deleted final admin';
  exception when check_violation then
    get stacked diagnostics failed_constraint = constraint_name;
    if failed_constraint <> 'members_last_active_admin' then raise; end if;
  end;
end;
$$;

-- Ordinary edits, removing non-admins and restoring another admin are allowed.
update public.members set role='admin', active=true where email='guard-admin-b@example.invalid';
delete from public.members where email='guard-member@example.invalid';
update public.members set active=true where email='guard-admin-a@example.invalid';
delete from public.members where email='guard-admin-b@example.invalid';
rollback;

-- Concurrency check (disposable DB only): seed exactly two active admins A and B.
-- Session 1: BEGIN; UPDATE members SET active=false WHERE email='B';
-- Session 2: BEGIN; UPDATE members SET active=false WHERE email='A';
-- Session 1: COMMIT;
-- Session 2 must fail 23514 (or a concurrent row-lock deadlock/serialization error),
-- leaving at least one active admin. Repeat with REPEATABLE READ on both sessions;
-- locking a candidate changed after the snapshot must fail 40001, not pass the guard.
