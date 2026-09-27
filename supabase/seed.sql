-- =============================================================
-- Aaina — Seed Data (development / demo)
-- =============================================================
-- NOTE: profiles reference auth.users. For local dev, create the auth
-- users first (via Supabase Studio or the seed script in /supabase/seed),
-- then run this file, OR use the supabase CLI `db seed`.
-- The UUIDs below are placeholders — replace with real auth user ids.

-- Demo campaigns (no auth dependency)
insert into public.campaigns
  (id, title, brand_name, campaign_type, campaign_image, description, deliverables,
   instructions, category, min_followers, reward_amount, cashback_percentage,
   application_deadline, campaign_deadline, status)
values
  (
    '11111111-1111-1111-1111-111111111101',
    'Hair Reset Mist 30 ml (ZP)', 'ZeroPore', 'reimbursement',
    'https://picsum.photos/seed/hairmist/600/600',
    'Share honest feedback for our new Hair Reset Mist and get cashback.',
    '1 Instagram Reel, 1 Story', 'Buy the product, create content, submit invoice + content.',
    'Beauty & Personal Care', 0, 225, 100,
    now() + interval '20 days', now() + interval '30 days', 'active'
  ),
  (
    '11111111-1111-1111-1111-111111111102',
    'Shine Stopper Primer – Mini (TR)', 'The Ruby', 'reimbursement',
    'https://picsum.photos/seed/primer/600/600',
    'Try our mattifying primer and share your review.',
    '1 Instagram Reel', 'Buy, review, submit.',
    'Makeup', 0, 180, 100,
    now() + interval '18 days', now() + interval '28 days', 'active'
  ),
  (
    '11111111-1111-1111-1111-111111111103',
    'LANEIGE Lip Sleeping Mask', 'LANEIGE', 'barter',
    'https://picsum.photos/seed/laneige/600/600',
    'Get the iconic lip mask in exchange for a reel.',
    '1 Reel', 'Create 1 reel featuring the product.',
    'Skincare', 500, 0, 0,
    now() + interval '14 days', now() + interval '25 days', 'active'
  ),
  (
    '11111111-1111-1111-1111-111111111104',
    'Rice Water Hair Growth Serum', 'Alps Goodness', 'barter',
    'https://picsum.photos/seed/riceserum/600/600',
    'Barter collaboration for our bestselling hair serum.',
    '1 Reel', 'Create 1 reel featuring the product.',
    'Hair Care', 500, 0, 0,
    now() + interval '16 days', now() + interval '26 days', 'active'
  ),
  (
    '11111111-1111-1111-1111-111111111105',
    'Glowish Vitamin C Serum Campaign', 'Glowish', 'paid',
    'https://picsum.photos/seed/vitc/600/600',
    'Paid collaboration — create amazing content and earn.',
    '1 Reel + 1 Post', 'Deliver reel and post as per brief.',
    'Skincare', 5000, 3000, 0,
    now() + interval '13 days', now() + interval '23 days', 'active'
  ),
  (
    '11111111-1111-1111-1111-111111111106',
    'Lumière Matte Foundation Campaign', 'Lumière', 'paid',
    'https://picsum.photos/seed/lumiere/600/600',
    'Paid collaboration for our matte foundation.',
    '1 Reel', 'Deliver reel as per brief.',
    'Makeup', 10000, 5000, 0,
    now() + interval '16 days', now() + interval '26 days', 'active'
  )
on conflict (id) do nothing;
