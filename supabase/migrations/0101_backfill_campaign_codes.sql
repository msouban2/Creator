-- Persist the campaign codes already shown by the admin fallback for legacy
-- campaigns that do not yet have a stored code. Preserve any custom codes.
update public.campaigns
set campaign_code =
  (case campaign_type::text
    when 'barter' then 'BR'
    when 'paid' then 'PD'
    else 'RB'
  end)
  || extract(year from created_at)::int::text
  || '-'
  || upper(substr(replace(id::text, '-', ''), 1, 5))
where campaign_code is null or btrim(campaign_code) = '';