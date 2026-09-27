-- =============================================================
-- Bilkul — Employee review claim queue (no double-reviews)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- When many employees review a large backlog, two of them must never end up
-- reviewing the same submission. We add a claim (with a short lease) to each
-- submission and hand out work atomically with FOR UPDATE SKIP LOCKED so two
-- concurrent "get next" calls always receive different rows. Abandoned claims
-- (older than the lease) automatically return to the pool.
-- =============================================================

alter table public.campaign_submissions
  add column if not exists claimed_by uuid references public.profiles(id) on delete set null,
  add column if not exists claimed_at timestamptz;

create index if not exists idx_submissions_claim
  on public.campaign_submissions (review_status, claimed_at);

-- ---------- claim the next available review ----------
-- Returns the id of the submission now claimed by the caller, or null when the
-- queue (for the caller's assigned campaign types) is empty.
create or replace function public.claim_next_review(p_types text[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_lease constant interval := interval '15 minutes';
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Only staff can claim reviews';
  end if;

  -- Already holding an active claim? Return it so a refresh doesn't skip work.
  select s.id into v_id
  from public.campaign_submissions s
  where s.review_status = 'pending'
    and s.claimed_by = auth.uid()
    and s.claimed_at >= now() - v_lease
  order by s.claimed_at asc
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  -- Otherwise atomically grab the oldest unclaimed (or stale-claimed) item of
  -- one of the caller's assigned campaign types.
  select s.id into v_id
  from public.campaign_submissions s
  join public.applications a on a.id = s.application_id
  join public.campaigns c on c.id = a.campaign_id
  where s.review_status = 'pending'
    and c.campaign_type::text = any(p_types)
    and (s.claimed_by is null or s.claimed_at < now() - v_lease)
  order by s.created_at asc
  for update of s skip locked
  limit 1;

  if v_id is null then
    return null;
  end if;

  update public.campaign_submissions
    set claimed_by = auth.uid(), claimed_at = now()
    where id = v_id;

  return v_id;
end $$;

grant execute on function public.claim_next_review(text[]) to authenticated;

-- ---------- release a claim (skip / give it back) ----------
create or replace function public.release_review(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.campaign_submissions
    set claimed_by = null, claimed_at = null
    where id = p_id and (claimed_by = auth.uid() or public.is_admin(auth.uid()));
end $$;

grant execute on function public.release_review(uuid) to authenticated;

-- ---------- how many items are waiting for me ----------
-- Available (unclaimed or stale) pending items per campaign type.
create or replace function public.review_queue_depth(p_types text[])
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.campaign_submissions s
  join public.applications a on a.id = s.application_id
  join public.campaigns c on c.id = a.campaign_id
  where s.review_status = 'pending'
    and c.campaign_type::text = any(p_types)
    and (s.claimed_by is null or s.claimed_at < now() - interval '15 minutes');
$$;

grant execute on function public.review_queue_depth(text[]) to authenticated;
