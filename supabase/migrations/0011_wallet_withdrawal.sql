-- 0011_wallet_withdrawal.sql
-- Wallet & withdrawal enhancements:
--   * ₹300 minimum withdrawal enforcement
--   * payout reference (UTR) + failure reason on withdrawals
--   * "failed" withdrawal status
--   * saved payout details on the creator profile (remembered for reuse)
--   * process_withdrawal RPC (paid / failed / rejected) for admin manual payouts

-- 1. New "failed" status
alter type withdrawal_status add value if not exists 'failed';

-- 2. Extra columns on withdrawals
alter table public.withdrawals add column if not exists reference_id text;    -- UTR / transaction reference recorded by admin after paying
alter table public.withdrawals add column if not exists failure_reason text;  -- why a payout was failed / rejected

-- 3. Saved payout details on the profile (last used, remembered for reuse)
alter table public.profiles add column if not exists payout_method withdrawal_method;
alter table public.profiles add column if not exists payout_upi_id text;
alter table public.profiles add column if not exists payout_bank_account text;
alter table public.profiles add column if not exists payout_ifsc text;
alter table public.profiles add column if not exists payout_account_name text;

-- 4. request_withdrawal: enforce ₹300 minimum + remember payout details on profile
create or replace function public.request_withdrawal(
  p_amount numeric,
  p_method withdrawal_method,
  p_upi text default null,
  p_bank_account text default null,
  p_ifsc text default null,
  p_account_name text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_balance numeric;
  v_id uuid;
begin
  if p_amount < 300 then
    raise exception 'Minimum withdrawal amount is 300';
  end if;

  select available_balance into v_balance from public.wallets where user_id = auth.uid();
  if v_balance is null or v_balance < p_amount then
    raise exception 'Insufficient balance';
  end if;

  update public.wallets
    set available_balance = available_balance - p_amount,
        pending_balance = pending_balance + p_amount,
        updated_at = now()
    where user_id = auth.uid();

  insert into public.withdrawals (user_id, amount, method, upi_id, bank_account, ifsc_code, account_name)
  values (auth.uid(), p_amount, p_method, p_upi, p_bank_account, p_ifsc, p_account_name)
  returning id into v_id;

  update public.profiles
    set payout_method = p_method,
        payout_upi_id = p_upi,
        payout_bank_account = p_bank_account,
        payout_ifsc = p_ifsc,
        payout_account_name = p_account_name
    where id = auth.uid();

  return v_id;
end $fn$;

-- 5. process_withdrawal: admin manual payout (paid = record UTR; failed/rejected = refund)
create or replace function public.process_withdrawal(
  p_withdrawal uuid,
  p_action text,
  p_reference text default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_user uuid;
  v_amount numeric;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can process withdrawals';
  end if;

  select user_id, amount into v_user, v_amount
    from public.withdrawals where id = p_withdrawal and status = 'requested';
  if v_user is null then
    raise exception 'Withdrawal not found or already processed';
  end if;

  if p_action = 'paid' then
    update public.wallets set pending_balance = pending_balance - v_amount, updated_at = now()
      where user_id = v_user;
    insert into public.transactions (user_id, amount, type, remarks)
      values (v_user, -v_amount, 'withdrawal', 'Withdrawal paid');
    update public.withdrawals
      set status = 'paid', reference_id = p_reference, processed_by = auth.uid(), processed_at = now()
      where id = p_withdrawal;
    insert into public.notifications (user_id, title, message, type)
      values (v_user, 'Withdrawal Paid', 'Your withdrawal of Rs ' || v_amount || ' has been paid.', 'payment');
  elsif p_action in ('failed', 'rejected') then
    update public.wallets
      set pending_balance = pending_balance - v_amount,
          available_balance = available_balance + v_amount,
          updated_at = now()
      where user_id = v_user;
    update public.withdrawals
      set status = p_action::withdrawal_status, failure_reason = p_reason, processed_by = auth.uid(), processed_at = now()
      where id = p_withdrawal;
    insert into public.notifications (user_id, title, message, type)
      values (v_user,
              case when p_action = 'failed' then 'Withdrawal Failed' else 'Withdrawal Rejected' end,
              'Your withdrawal of Rs ' || v_amount || ' was not completed. Amount refunded to your wallet.', 'payment');
  else
    raise exception 'Invalid action';
  end if;
end $fn$;

grant execute on function public.process_withdrawal(uuid, text, text, text) to authenticated;
