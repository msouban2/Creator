-- 0025_backfill_payout.sql
-- One-time backfill: populate applications.payout_amount for payouts released
-- BEFORE the payout_amount column existed, using the real amounts from the
-- transactions table. This makes the seller Performance "used"/"remaining"
-- reflect actual historical Release Payment amounts.

update public.applications a
set payout_amount = sub.total
from (
  select campaign_id, user_id, sum(amount) as total
  from public.transactions
  where type in ('campaign_payment', 'reimbursement')
    and campaign_id is not null
  group by campaign_id, user_id
) sub
where sub.campaign_id = a.campaign_id
  and sub.user_id = a.creator_id
  and a.status = 'completed'
  and a.payout_amount is null;
