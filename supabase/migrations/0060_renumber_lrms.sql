-- =============================================================
-- Bilkul — Renumber LRMS refs to start from 1
-- =============================================================
-- Safe to run once. Applied live via Management API.
--
-- 0055 seeded ref numbers at 10000+. Renumber everything to start at 1 in the
-- same creation order (applications first, then submissions continue after),
-- and reset the shared sequence so new rows keep counting up (…N+1, N+2).
-- New values (1..) never collide with the old ones (10000..), so in-place
-- updates are safe under the unique indexes.
-- =============================================================

-- Applications: 1 .. N in creation order.
update public.applications a
set ref_no = o.rn
from (
  select id, row_number() over (order by applied_at nulls last, id) as rn
  from public.applications
) o
where a.id = o.id;

-- Submissions: continue right after the applications' highest number.
update public.campaign_submissions s
set ref_no = o.rn + (select coalesce(max(ref_no), 0) from public.applications)
from (
  select id, row_number() over (order by created_at nulls last, id) as rn
  from public.campaign_submissions
) o
where s.id = o.id;

-- Reset the shared sequence past every value now in use.
select setval('public.lrms_ref_seq', greatest(
  coalesce((select max(ref_no) from public.applications), 0),
  coalesce((select max(ref_no) from public.campaign_submissions), 0),
  1
));
