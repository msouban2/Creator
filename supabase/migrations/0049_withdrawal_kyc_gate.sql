-- =============================================================
-- Bilkul — Gate withdrawals on verified KYC
-- =============================================================
-- Safe to run multiple times. Applied live via Management API.
--
-- Payouts now require real, API-verified KYC (FinPayUltra):
--   • Any withdrawal      → the creator's Aadhaar must be verified.
--   • Bank-transfer payout → the destination bank account must be verified.
-- UPI payouts only require the Aadhaar check (UPI IDs aren't verified by the
-- provider). Enforced here in the security-definer RPC so the client can't
-- bypass it.
-- =============================================================

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
  v_aadhaar_ok boolean;
  v_bank_ok boolean;
begin
  if p_amount < 300 then
    raise exception 'Minimum withdrawal amount is 300';
  end if;

  -- KYC gate: identity must be API-verified before any payout.
  select coalesce(aadhaar_verified, false) into v_aadhaar_ok
    from public.kyc where user_id = auth.uid();
  if not coalesce(v_aadhaar_ok, false) then
    raise exception 'Complete your Aadhaar verification in KYC before withdrawing.';
  end if;

  -- Bank payouts must go to a verified account belonging to this creator.
  if p_method = 'bank_transfer' then
    select exists (
      select 1 from public.bank_accounts
      where user_id = auth.uid()
        and verified = true
        and account_number = p_bank_account
        and upper(ifsc_code) = upper(coalesce(p_ifsc, ifsc_code))
    ) into v_bank_ok;
    if not coalesce(v_bank_ok, false) then
      raise exception 'Select a verified bank account. Verify it in KYC before withdrawing.';
    end if;
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
