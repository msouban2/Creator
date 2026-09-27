-- 0016_review_assignments.sql
-- Divide submission-review work by campaign type. Each employee is assigned one
-- or more campaign types (barter / reimbursement / paid). Employees only see &
-- review submissions for their assigned types; admins see everything. Every
-- review records who did it and when, so the admin can track each employee's
-- workload and the pending queue per type.

-- ---------- 1. columns ----------
alter table public.profiles
  add column if not exists review_types text[] not null default '{}';

comment on column public.profiles.review_types is
  'Campaign types (barter/reimbursement/paid) this employee reviews. Empty = none. Ignored for admins (see all) and non-employees.';

alter table public.campaign_submissions
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at timestamptz;

comment on column public.campaign_submissions.reviewed_by is
  'Staff member who last set a non-pending review_status (stamped by trigger).';

create index if not exists idx_campaign_submissions_reviewed_by
  on public.campaign_submissions (reviewed_by);

-- ---------- 2. helpers ----------
-- Campaign type for the campaign behind an application.
create or replace function public.application_campaign_type(p_application uuid)
returns text language sql stable security definer set search_path = public as $$
  select c.campaign_type::text
  from public.applications a
  join public.campaigns c on c.id = a.campaign_id
  where a.id = p_application;
$$;

-- Whether a user may review a given campaign type (admins may review any type).
create or replace function public.can_review_type(uid uuid, p_type text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = uid
      and (
        role = 'admin'
        or (role = 'employee' and p_type = any(review_types))
      )
  );
$$;

-- Campaign type for a campaign id (used by application RLS).
create or replace function public.campaign_type_of(p_campaign uuid)
returns text language sql stable security definer set search_path = public as $$
  select campaign_type::text from public.campaigns where id = p_campaign;
$$;

-- ---------- 3. reviewer stamp trigger ----------
create or replace function public.stamp_submission_reviewer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.review_status is distinct from old.review_status then
    if new.review_status = 'pending' then
      new.reviewed_by := null;
      new.reviewed_at := null;
    else
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_stamp_submission_reviewer on public.campaign_submissions;
create trigger trg_stamp_submission_reviewer
  before update on public.campaign_submissions
  for each row execute function public.stamp_submission_reviewer();

-- ---------- 4. type-scoped RLS ----------
-- Employees only see/review submissions for their assigned campaign types;
-- admins see everything; creators keep access to their own submissions.
drop policy if exists "submissions_select" on public.campaign_submissions;
create policy "submissions_select" on public.campaign_submissions
  for select using (
    (
      public.is_staff(auth.uid())
      and public.can_review_type(auth.uid(), public.application_campaign_type(application_id))
    )
    or exists (
      select 1 from public.applications a
      where a.id = application_id and a.creator_id = auth.uid()
    )
  );

drop policy if exists "submissions_update" on public.campaign_submissions;
create policy "submissions_update" on public.campaign_submissions
  for update using (
    (
      public.is_staff(auth.uid())
      and public.can_review_type(auth.uid(), public.application_campaign_type(application_id))
    )
    or exists (
      select 1 from public.applications a
      where a.id = application_id and a.creator_id = auth.uid()
    )
  );

-- ---------- 4b. type-scoped RLS for applications ----------
-- Consolidate the older duplicate staff policies into type-scoped ones so an
-- employee only sees/acts on applications for their assigned campaign types.
-- Creators keep read/update of their own rows; sellers keep their own policy.
drop policy if exists "applications_select" on public.applications;        -- legacy (creator or any staff)
drop policy if exists "applications_select_staff" on public.applications;   -- legacy (any staff)
create policy "applications_select_staff" on public.applications
  for select using (
    public.is_staff(auth.uid())
    and public.can_review_type(auth.uid(), public.campaign_type_of(campaign_id))
  );

drop policy if exists "applications_select_own" on public.applications;
create policy "applications_select_own" on public.applications
  for select using (creator_id = auth.uid());

drop policy if exists "applications_update" on public.applications;         -- legacy (any staff)
drop policy if exists "applications_update_staff" on public.applications;   -- legacy (any staff)
create policy "applications_update_staff" on public.applications
  for update using (
    public.is_staff(auth.uid())
    and public.can_review_type(auth.uid(), public.campaign_type_of(campaign_id))
  )
  with check (
    public.is_staff(auth.uid())
    and public.can_review_type(auth.uid(), public.campaign_type_of(campaign_id))
  );

-- ---------- 5. admin-only: assign an employee's review types ----------
create or replace function public.admin_set_review_types(p_user uuid, p_types text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can assign review types';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_types, '{}')) t
    where t not in ('barter', 'reimbursement', 'paid')
  ) then
    raise exception 'Invalid campaign type in %', p_types;
  end if;
  update public.profiles
    set review_types = coalesce(p_types, '{}'),
        updated_at = now()
  where id = p_user;
end $$;

grant execute on function public.admin_set_review_types(uuid, text[]) to authenticated;

-- ---------- 6. stats: pending vs done per campaign type ----------
-- Scoped to what the caller may see (admins: all types; employees: their types).
create or replace function public.review_stats()
returns table (
  campaign_type text,
  pending  bigint,
  approved bigint,
  rejected bigint,
  revision bigint,
  total    bigint
) language sql stable security definer set search_path = public as $$
  select
    c.campaign_type::text,
    count(*) filter (where s.review_status = 'pending'),
    count(*) filter (where s.review_status = 'approved'),
    count(*) filter (where s.review_status = 'rejected'),
    count(*) filter (where s.review_status = 'revision'),
    count(*)
  from public.campaign_submissions s
  join public.applications a on a.id = s.application_id
  join public.campaigns c on c.id = a.campaign_id
  where public.can_review_type(auth.uid(), c.campaign_type::text)
  group by c.campaign_type;
$$;

grant execute on function public.review_stats() to authenticated;

-- ---------- 7. admin oversight: reviews done per staff member ----------
create or replace function public.reviewer_workload()
returns table (
  reviewer_id   uuid,
  reviewer_name text,
  review_types  text[],
  reviewed      bigint
) language sql stable security definer set search_path = public as $$
  select
    p.id,
    p.full_name,
    p.review_types,
    count(s.id)
  from public.profiles p
  left join public.campaign_submissions s on s.reviewed_by = p.id
  where public.is_admin(auth.uid())
    and p.role in ('admin', 'employee')
  group by p.id, p.full_name, p.review_types
  order by count(s.id) desc;
$$;

grant execute on function public.reviewer_workload() to authenticated;
