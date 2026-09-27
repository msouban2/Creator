-- =============================================================
-- Aaina/Bilkul — Move Instagram access tokens out of profiles
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Security review #5: the profiles select policy lets any `is_staff`
-- user (admin OR employee) read every column, including the cleartext
-- Instagram OAuth access token. A rogue/compromised employee could
-- exfiltrate all creators' tokens.
--
-- Fix: store tokens in a dedicated table that has RLS enabled with NO
-- policies and no anon/authenticated grants, so ONLY the service role
-- (used by the instagram-oauth edge function) can read/write them.
-- Then drop the token columns from profiles. Nothing client-side reads
-- these columns (verified), so no app code breaks.
-- =============================================================

-- ---------- 1. dedicated, service-role-only table ----------
create table if not exists public.instagram_credentials (
  user_id                    uuid primary key references public.profiles(id) on delete cascade,
  instagram_token            text,
  instagram_token_expires_at timestamptz,
  updated_at                 timestamptz not null default now()
);

alter table public.instagram_credentials enable row level security;

-- No policies are created on purpose: with RLS enabled and no policy,
-- neither anon nor authenticated (including staff) can read or write any
-- row. The service role bypasses RLS, which is how the edge function
-- accesses it. Belt-and-braces: also revoke table privileges.
revoke all on public.instagram_credentials from anon, authenticated;

-- ---------- 2. migrate any existing tokens ----------
insert into public.instagram_credentials (user_id, instagram_token, instagram_token_expires_at)
select id, instagram_token, instagram_token_expires_at
from public.profiles
where instagram_token is not null
on conflict (user_id) do update
  set instagram_token            = excluded.instagram_token,
      instagram_token_expires_at = excluded.instagram_token_expires_at,
      updated_at                 = now();

-- ---------- 3. drop the exposed columns from profiles ----------
alter table public.profiles
  drop column if exists instagram_token,
  drop column if exists instagram_token_expires_at;
