-- =============================================================
-- Bilkul — Employee productivity: availability + team leaderboard
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
-- =============================================================

-- Agents can mark themselves available / away.
alter table public.profiles
  add column if not exists available boolean not null default true;

-- Team workload snapshot for the current week (staff only).
create or replace function public.review_leaderboard()
returns table (
  reviewer_id  uuid,
  full_name    text,
  role         text,
  available    boolean,
  reviews_week bigint,
  open_claimed bigint,
  support_open bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff(auth.uid()) then
    return;
  end if;
  return query
    select
      p.id,
      p.full_name,
      p.role::text,
      p.available,
      (select count(*) from public.campaign_submissions s
        where s.reviewed_by = p.id and s.reviewed_at >= date_trunc('week', now())),
      (select count(*) from public.campaign_submissions s
        where s.claimed_by = p.id and s.review_status = 'pending'),
      (select count(*) from public.support_tickets t
        where t.claimed_by = p.id and t.status = 'open')
    from public.profiles p
    where p.role in ('admin', 'employee')
    order by 5 desc, p.full_name asc;
end $$;

grant execute on function public.review_leaderboard() to authenticated;
