-- =============================================================
-- Bilkul — Manual work assignment grants per-item access
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Employees are normally scoped to the campaign types they're assigned
-- (review_types) — enforced in RLS via can_review_type(). But an admin can
-- MANUALLY assign a specific application's work item to a specific employee on
-- the Employee Stats page (work_assignments, migration 0090). That employee
-- must then be able to actually SEE and ACT on that application even if it's a
-- campaign type they don't normally handle.
--
-- This migration extends the applications + campaign_submissions RLS so a staff
-- member also gets access when they hold a manual assignment for that
-- application. Everything else (creators, sellers, type-scoping) is unchanged.
-- =============================================================

-- Does this user hold any manual work assignment for this application?
create or replace function public.is_assigned_to(uid uuid, p_application uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.work_assignments
    where application_id = p_application and assigned_to = uid
  );
$$;

grant execute on function public.is_assigned_to(uuid, uuid) to authenticated;

-- ---------- applications: read ----------
drop policy if exists "applications_select_staff" on public.applications;
create policy "applications_select_staff" on public.applications
  for select using (
    public.is_staff(auth.uid())
    and (
      public.can_review_type(auth.uid(), public.campaign_type_of(campaign_id))
      or public.is_assigned_to(auth.uid(), id)
    )
  );

-- ---------- applications: update ----------
drop policy if exists "applications_update_staff" on public.applications;
create policy "applications_update_staff" on public.applications
  for update using (
    public.is_staff(auth.uid())
    and (
      public.can_review_type(auth.uid(), public.campaign_type_of(campaign_id))
      or public.is_assigned_to(auth.uid(), id)
    )
  )
  with check (
    public.is_staff(auth.uid())
    and (
      public.can_review_type(auth.uid(), public.campaign_type_of(campaign_id))
      or public.is_assigned_to(auth.uid(), id)
    )
  );

-- ---------- campaign_submissions: read ----------
drop policy if exists "submissions_select" on public.campaign_submissions;
create policy "submissions_select" on public.campaign_submissions
  for select using (
    (
      public.is_staff(auth.uid())
      and (
        public.can_review_type(auth.uid(), public.application_campaign_type(application_id))
        or public.is_assigned_to(auth.uid(), application_id)
      )
    )
    or exists (
      select 1 from public.applications a
      where a.id = application_id and a.creator_id = auth.uid()
    )
  );

-- ---------- campaign_submissions: update ----------
drop policy if exists "submissions_update" on public.campaign_submissions;
create policy "submissions_update" on public.campaign_submissions
  for update using (
    (
      public.is_staff(auth.uid())
      and (
        public.can_review_type(auth.uid(), public.application_campaign_type(application_id))
        or public.is_assigned_to(auth.uid(), application_id)
      )
    )
    or exists (
      select 1 from public.applications a
      where a.id = application_id and a.creator_id = auth.uid()
    )
  );
