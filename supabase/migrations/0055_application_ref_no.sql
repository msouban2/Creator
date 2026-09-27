-- =============================================================
-- Bilkul — Stable, unique reference numbers (LRMS-xxxxx)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Every application AND submission gets a permanent, globally-unique sequential
-- ref_no from one shared sequence, so the human-friendly code is collision-free
-- at any scale (10k+ reviews):
--   • application.ref_no          -> LRMS-<n>-SHIP (the order / shipment)
--   • campaign_submissions.ref_no -> LRMS-<n>-REV  (the content under review)
-- Existing rows are backfilled in creation order; new rows auto-assign.
-- =============================================================

create sequence if not exists public.lrms_ref_seq;

alter table public.applications
  add column if not exists ref_no bigint;
alter table public.campaign_submissions
  add column if not exists ref_no bigint;

-- Backfill applications in creation order.
update public.applications a
set ref_no = o.rn + 10000
from (
  select id, row_number() over (order by applied_at nulls last, id) as rn
  from public.applications
) o
where a.id = o.id and a.ref_no is null;

-- Backfill submissions, continuing after the applications' highest number.
update public.campaign_submissions s
set ref_no = o.rn + (select coalesce(max(ref_no), 10000) from public.applications)
from (
  select id, row_number() over (order by created_at nulls last, id) as rn
  from public.campaign_submissions
) o
where s.id = o.id and s.ref_no is null;

-- Advance the shared sequence past every backfilled value.
select setval('public.lrms_ref_seq', greatest(
  coalesce((select max(ref_no) from public.applications), 10000),
  coalesce((select max(ref_no) from public.campaign_submissions), 10000)
));

alter table public.applications
  alter column ref_no set default nextval('public.lrms_ref_seq');
alter table public.campaign_submissions
  alter column ref_no set default nextval('public.lrms_ref_seq');

create unique index if not exists applications_ref_no_uniq on public.applications (ref_no);
create unique index if not exists campaign_submissions_ref_no_uniq on public.campaign_submissions (ref_no);
