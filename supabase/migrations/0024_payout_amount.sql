-- 0024_payout_amount.sql
-- Records the exact amount released to a creator on the application itself, so a
-- seller's "used" budget reflects the real payouts from THEIR campaigns (not an
-- estimate). Sellers can read their own applications, so this is visible to them.
-- Remaining budget may legitimately go negative if payouts exceed money received.

alter table public.applications
  add column if not exists payout_amount numeric(12,2);

comment on column public.applications.payout_amount is
  'Actual amount released to the creator for this order (debited from the campaign seller''s budget).';

-- Re-create the payout RPC so it also stores the released amount on the application.
create or replace function public.release_campaign_payment(
  p_application uuid,
  p_amount      numeric,
  p_type        transaction_type default 'campaign_payment'
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_creator uuid;
  v_campaign uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can release payments';
  end if;

  select creator_id, campaign_id into v_creator, v_campaign
    from public.applications where id = p_application;

  insert into public.transactions (user_id, amount, type, remarks, campaign_id)
  values (v_creator, p_amount, p_type, 'Campaign payment released', v_campaign);

  update public.wallets
    set available_balance = available_balance + p_amount,
        lifetime_earnings = lifetime_earnings + p_amount,
        updated_at = now()
    where user_id = v_creator;

  update public.profiles set total_earnings = total_earnings + p_amount
    where id = v_creator;

  update public.applications
    set status = 'completed', completed_at = now(), payout_amount = p_amount
    where id = p_application;

  insert into public.notifications (user_id, title, message, type)
  values (v_creator, 'Payment Released 💰',
          '₹' || p_amount || ' has been credited to your wallet.', 'payment');
end $$;
