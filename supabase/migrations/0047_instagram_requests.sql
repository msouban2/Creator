-- =============================================================
-- Bilkul — Instagram verification requests (manual tester bridge)
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Until Phyllo production access is live, creators request Instagram
-- verification by submitting their username. An admin adds that username as a
-- tester on the Phyllo/Instagram side (this can take ~24h to be granted). When
-- the admin marks the request "invited", the creator is notified that they've
-- been added and can connect. Only verified (connected) creators are eligible
-- to be paid.
-- =============================================================

create table if not exists public.instagram_requests (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  instagram_username text not null,
  status             text not null default 'pending', -- pending | invited | connected | rejected
  admin_note         text,
  created_at         timestamptz not null default now(),
  invited_at         timestamptz,
  connected_at       timestamptz,
  updated_at         timestamptz not null default now()
);

-- One active request row per creator (they can re-submit by updating it).
create unique index if not exists instagram_requests_user_uniq
  on public.instagram_requests (user_id);

create index if not exists instagram_requests_status_idx
  on public.instagram_requests (status, created_at);

alter table public.instagram_requests enable row level security;

-- Creator manages their own request; staff can read all.
drop policy if exists "ig_requests_owner_select" on public.instagram_requests;
create policy "ig_requests_owner_select" on public.instagram_requests
  for select using (user_id = auth.uid() or public.is_staff(auth.uid()));

drop policy if exists "ig_requests_owner_insert" on public.instagram_requests;
create policy "ig_requests_owner_insert" on public.instagram_requests
  for insert with check (user_id = auth.uid());

-- Creator can update only their own row while it's still pending (edit username);
-- staff can update any row (status changes go through the RPC below).
drop policy if exists "ig_requests_owner_update" on public.instagram_requests;
create policy "ig_requests_owner_update" on public.instagram_requests
  for update using (
    (user_id = auth.uid() and status = 'pending') or public.is_staff(auth.uid())
  );

grant select, insert, update on public.instagram_requests to authenticated;

-- ---------- staff: set request status (+ notify the creator) ----------
create or replace function public.set_instagram_request_status(
  p_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_username text;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'Only staff can update Instagram requests';
  end if;

  select user_id, instagram_username into v_user, v_username
  from public.instagram_requests where id = p_id;
  if v_user is null then
    raise exception 'Request not found';
  end if;

  update public.instagram_requests
    set status = p_status,
        admin_note = coalesce(p_note, admin_note),
        invited_at = case when p_status = 'invited' then now() else invited_at end,
        connected_at = case when p_status = 'connected' then now() else connected_at end,
        updated_at = now()
    where id = p_id;

  -- Notify the creator on meaningful transitions.
  if p_status = 'invited' then
    insert into public.notifications (user_id, title, message, type)
    values (
      v_user,
      'Instagram verification ready 🎉',
      'You''ve been added! Open the app and tap Connect Instagram to verify @' || v_username ||
        ' and unlock your payouts.',
      'instagram'
    );
  elsif p_status = 'rejected' then
    insert into public.notifications (user_id, title, message, type)
    values (
      v_user,
      'Instagram verification update',
      coalesce(p_note, 'We couldn''t process your Instagram verification request. Please re-check your username and try again.'),
      'instagram'
    );
  end if;
end $$;

grant execute on function public.set_instagram_request_status(uuid, text, text) to authenticated;
