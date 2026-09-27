-- 0015_employee_permissions.sql
-- Per-employee section access. Admins keep full access; employees only see the
-- sections listed in profiles.permissions. Other roles ignore this column.

-- ---------- column ----------
alter table public.profiles
  add column if not exists permissions text[] not null default '{}';

comment on column public.profiles.permissions is
  'Section keys an employee may access (e.g. kyc, applications). Ignored for admins/sellers/creators.';

-- ---------- admin-only setter ----------
create or replace function public.admin_set_permissions(
  p_user uuid,
  p_perms text[]
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can change permissions';
  end if;

  update public.profiles
    set permissions = coalesce(p_perms, '{}'),
        updated_at = now()
  where id = p_user;
end $$;

grant execute on function public.admin_set_permissions(uuid, text[]) to authenticated;
