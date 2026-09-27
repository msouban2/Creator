-- =============================================================
-- Bilkul — Manual work assignment for the Employee Stats queues
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Review work and creator/campaign work are normally pooled by campaign type
-- and auto-claimed (migration 0083). The Employee Stats page also lets an admin
-- MANUALLY assign a specific queue item (one artifact of an application) to a
-- specific employee. Each item is identified by (application_id, kind) where
-- kind is one of the six tracked artifacts:
--   order_ss | review_rec | seller_fb | creators | draft_vid | live_up
-- =============================================================

create table if not exists public.work_assignments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  kind text not null check (kind in ('order_ss','review_rec','seller_fb','creators','draft_vid','live_up')),
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique (application_id, kind)
);

create index if not exists idx_work_assignments_assignee
  on public.work_assignments (assigned_to);

alter table public.work_assignments enable row level security;

-- Any signed-in staff member may read assignments (needed for the stats page).
drop policy if exists work_assignments_read on public.work_assignments;
create policy work_assignments_read on public.work_assignments
  for select using (public.is_staff(auth.uid()));

-- Assign (or reassign / clear) a queue item to an employee. Admins only.
-- Passing p_assignee = null clears the assignment (back to the auto pool).
create or replace function public.admin_assign_work(p_application uuid, p_kind text, p_assignee uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can assign work';
  end if;

  if p_kind not in ('order_ss','review_rec','seller_fb','creators','draft_vid','live_up') then
    raise exception 'Invalid work kind: %', p_kind;
  end if;

  if p_assignee is null then
    delete from public.work_assignments
      where application_id = p_application and kind = p_kind;
    return;
  end if;

  insert into public.work_assignments (application_id, kind, assigned_to, assigned_by, assigned_at)
    values (p_application, p_kind, p_assignee, auth.uid(), now())
  on conflict (application_id, kind)
    do update set assigned_to = excluded.assigned_to,
                  assigned_by = excluded.assigned_by,
                  assigned_at = excluded.assigned_at;
end $$;

grant execute on function public.admin_assign_work(uuid, text, uuid) to authenticated;
