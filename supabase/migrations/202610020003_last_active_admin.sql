begin;

create function public.guard_last_active_admin() returns trigger
language plpgsql volatile security definer set search_path = '' as $$
begin
  if old.role = 'admin' and old.active then
    if tg_op = 'UPDATE' then
      if new.role = 'admin' and new.active then
        return new;
      end if;
    end if;

    -- Serialize removals. VOLATILE obtains a fresh snapshot for the subsequent
    -- query under Read Committed, including changes made while this lock waited.
    perform pg_catalog.pg_advisory_xact_lock(48, 20261002);

    -- Lock the remaining admins too: Repeatable Read must fail serialization if
    -- a candidate changed after its snapshot, rather than trust a stale count.
    -- Simultaneous cross-revocations can deadlock; Postgres rolls one back safely.
    perform email from public.members
      where role = 'admin' and active and email <> old.email
      order by email for update;
    if not found then
      raise exception using
        errcode = '23514',
        constraint = 'members_last_active_admin',
        message = 'At least one active administrator must remain';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.guard_last_active_admin() from public;

create trigger members_keep_active_admin
  before update or delete on public.members
  for each row execute function public.guard_last_active_admin();

commit;
