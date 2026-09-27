-- =============================================================
-- Aaina — Unique submission per application
-- =============================================================
-- Safe to run multiple times. Run in Supabase SQL editor.
-- The app upserts into campaign_submissions with
-- onConflict: "application_id", which requires a UNIQUE
-- constraint on application_id. Without it, submitting a reel
-- link fails with:
--   "there is no unique or exclusion constraint matching the
--    ON CONFLICT specification"
-- =============================================================

-- ---------- 1. remove any duplicate rows first ----------
-- Keep the most recently updated submission per application.
delete from public.campaign_submissions s
where s.ctid not in (
  select distinct on (application_id) ctid
  from public.campaign_submissions
  order by application_id, updated_at desc, ctid desc
);

-- ---------- 2. add the unique constraint ----------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'campaign_submissions_application_id_key'
  ) then
    alter table public.campaign_submissions
      add constraint campaign_submissions_application_id_key
      unique (application_id);
  end if;
end $$;
