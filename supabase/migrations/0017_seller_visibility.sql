-- 0017_seller_visibility.sql
-- Connect the seller's read-only view to the full flow: a campaign defines the
-- product/ASIN and the assigned seller; creators apply; employees review the
-- submissions. A seller must be able to SEE (never edit) their own campaigns,
-- the creators who applied, and the employee review status of those submissions.
--
-- Sellers already have applications_select_seller (0014) and addresses_seller_read
-- (0014). They were still missing:
--   1. read access to their own campaigns at any status (only active were visible),
--   2. read access to campaign_submissions (the employee's review status), and
--   3. a SAFE way to see applicant creators (name + engagement only — never PII).
--
-- Row-level policies cannot restrict columns, so creator data is exposed through a
-- SECURITY DEFINER function returning only safe columns (NOT a base-table policy,
-- which would let a seller read creator email/phone/earnings with their own token).

-- ---------- helpers ----------
create or replace function public.seller_owns_application(p_application uuid, p_seller uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.applications a
    join public.campaigns c on c.id = a.campaign_id
    where a.id = p_application and c.seller_id = p_seller
  );
$$;

create or replace function public.seller_owns_campaign(p_campaign uuid, p_seller uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.campaigns c where c.id = p_campaign and c.seller_id = p_seller
  );
$$;

grant execute on function public.seller_owns_application(uuid, uuid) to authenticated;
grant execute on function public.seller_owns_campaign(uuid, uuid) to authenticated;

-- ---------- 0. sellers can read ALL of their own campaigns (any status) -------
-- and every application to them, so the performance view also covers closed
-- campaigns/past deals (campaigns_read_active only exposes active ones).
drop policy if exists "campaigns_select_seller" on public.campaigns;
create policy "campaigns_select_seller" on public.campaigns
  for select using (seller_id = auth.uid());

drop policy if exists "applications_select_seller" on public.applications;
create policy "applications_select_seller" on public.applications
  for select using (public.seller_owns_campaign(campaign_id, auth.uid()));

-- ---------- 1. sellers can read submissions for their own campaigns ----------
-- (content links + the employee's review status; no PII in this table)
drop policy if exists "submissions_select_seller" on public.campaign_submissions;
create policy "submissions_select_seller" on public.campaign_submissions
  for select using (public.seller_owns_application(application_id, auth.uid()));

-- ---------- 2. safe creator info for the seller (name + engagement only) ------
-- Returns ONLY non-sensitive columns for creators who applied to the caller's
-- campaigns. No email/phone/earnings/kyc are exposed, and sellers get NO policy
-- on the profiles base table.
create or replace function public.seller_creators()
returns table (
  id                  uuid,
  full_name           text,
  instagram_username  text,
  instagram_followers integer,
  ig_avg_views        integer
) language sql stable security definer set search_path = public as $$
  select distinct
    p.id, p.full_name, p.instagram_username, p.instagram_followers, p.ig_avg_views
  from public.profiles p
  join public.applications a on a.creator_id = p.id
  join public.campaigns c on c.id = a.campaign_id
  where c.seller_id = auth.uid();
$$;

grant execute on function public.seller_creators() to authenticated;

