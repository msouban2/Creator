-- 0080_order_window_15min_24h.sql
-- =============================================================
-- 15-minute order window with a 24h retry cooldown.
-- =============================================================
-- When a creator is selected for a reimbursement campaign they get 15 minutes
-- to buy the product and upload the order screenshot (move status -> 'ordered').
-- The window is anchored on `order_started_at` (falling back to `selected_at`
-- for the very first window). If the 15 minutes lapse without ordering, they
-- must wait 24 hours from the window start before they can restart it (stamp a
-- fresh `order_started_at`) and try again. Staff bypass entirely.
--
-- Enforced server-side so it can't be bypassed by the client.
--
-- Safe to run multiple times.
-- =============================================================

create or replace function public.enforce_order_window()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  win_start timestamptz;
begin
  if auth.uid() is null or public.is_staff(auth.uid()) then
    return new;
  end if;

  -- (1) Ordering: creators can only move selected -> ordered within 15 minutes
  --     of the current window start.
  if new.status = 'ordered' and old.status = 'selected' then
    win_start := coalesce(old.order_started_at, old.selected_at);
    if win_start is null or now() > win_start + interval '15 minutes' then
      raise exception 'ORDER_WINDOW_CLOSED: the 15-minute order window has closed — please try again later'
        using errcode = 'check_violation';
    end if;
  end if;

  -- (2) Restarting the window: resetting order_started_at while still 'selected'
  --     is only allowed once the previous 15-min window has expired AND the 24h
  --     cooldown from that window start has elapsed.
  if new.status = 'selected' and old.status = 'selected'
     and new.order_started_at is distinct from old.order_started_at then
    win_start := coalesce(old.order_started_at, old.selected_at);
    if win_start is not null
       and now() > win_start + interval '15 minutes'
       and now() < win_start + interval '24 hours' then
      raise exception 'ORDER_RETRY_COOLDOWN: please wait 24 hours before trying to order again'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_enforce_order_window on public.applications;
create trigger trg_enforce_order_window
  before update on public.applications
  for each row execute function public.enforce_order_window();
