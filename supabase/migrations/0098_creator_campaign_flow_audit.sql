create or replace function public.log_creator_campaign_flow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message text;
  v_submission uuid;
begin
  if auth.uid() is distinct from new.creator_id then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'selected' then
      v_message := 'Reimbursement application selected; order step unlocked';
    else
      v_message := 'Campaign application submitted';
    end if;
  elsif new.status is distinct from old.status then
    if new.status = 'ordered' then
      v_message := 'Order screenshot submitted';
    elsif new.status = 'submitted' then
      v_message := 'Review deliverables submitted';
    end if;
  elsif new.delivery_photo_url is distinct from old.delivery_photo_url
        and new.delivery_photo_url is not null then
    v_message := 'Delivered-date screenshot uploaded';
  end if;

  if v_message is not null then
    select s.id into v_submission
    from public.campaign_submissions s
    where s.application_id = new.id
    order by s.created_at desc
    limit 1;

    insert into public.review_notes (
      application_id, submission_id, author_id, actor_id, note, kind
    ) values (
      new.id, v_submission, null, new.creator_id, v_message, 'system'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists log_creator_campaign_flow_trg on public.applications;
create trigger log_creator_campaign_flow_trg
  after insert or update of status, delivery_photo_url on public.applications
  for each row execute function public.log_creator_campaign_flow();