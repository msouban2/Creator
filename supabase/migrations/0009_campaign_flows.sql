-- =============================================================
-- Aaina — Per-type campaign flows (reimbursement / barter / paid)
-- =============================================================
-- Safe to run multiple times. Run in Supabase SQL editor.
--
-- Reimbursement : no follower gate; product link; creator uploads
--                 purchase image + posted review; staff verify -> pay.
-- Barter        : no product link; brand ships product (worth X) to
--                 creator ADDRESS; creator submits reel; small reward.
-- Paid          : follower gate; product shipped to address; creator
--                 uploads a DRAFT video (with deadline) -> staff approve
--                 or send correction -> post on Instagram -> submit reel
--                 link -> staff approve -> payment.
-- =============================================================

-- ---------- 1. new campaign fields ----------
alter table public.campaigns
  add column if not exists product_name     text,   -- "which product" (all types)
  add column if not exists sample_video_url text;    -- reference/sample video (paid)

-- ---------- 2. new application fields (paid draft + shipping) ----------
alter table public.applications
  add column if not exists shipped_at       timestamptz,  -- product dispatched to address
  add column if not exists draft_video_url  text,         -- creator's draft reel
  add column if not exists draft_feedback   text,         -- staff correction note
  add column if not exists draft_deadline   timestamptz,  -- deadline to upload draft
  add column if not exists reel_link        text;         -- final posted Instagram reel link

-- ---------- 3. new application_status values (paid flow) ----------
-- NOTE: do not USE these new values elsewhere in this same script.
alter type application_status add value if not exists 'product_shipped';
alter type application_status add value if not exists 'draft_submitted';
alter type application_status add value if not exists 'draft_revision';
alter type application_status add value if not exists 'draft_approved';
alter type application_status add value if not exists 'posted';
alter type application_status add value if not exists 'link_submitted';

-- (Draft videos reuse the existing private 'submission-videos' bucket:
--  creator writes to their own folder; staff can read for review.)
