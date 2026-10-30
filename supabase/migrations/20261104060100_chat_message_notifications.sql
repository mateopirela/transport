-- Notifications of the chat with the shipper (plan §H.2 item 2, follow-up of
-- H1): a message in a `trip` or `negotiation` conversation notifies the other
-- participants (`chat_message`, push and inbox only), grouped like H1's
-- internal chat: one unread notification per conversation and recipient every
-- 10 minutes at most.
--
-- The recipients are the participants of is_conversation_participant (H1) for
-- these kinds: the users of the shipper company, the managers of the carrier
-- and the coordinators of the business unit of the negotiation or the trip.
-- Never the operator (D28): the assigned operator no longer takes part in the
-- chat with the shipper.
--
-- The sender's name is shown only to their own company. The other party sees
-- the sender's company, as in the chat itself, which labels the other side by
-- role ("Transportista", "Cliente") and never by the person's name.
--
-- Lock order: the trigger runs inside send_message, which already holds the
-- conversation row; it takes no other lock.

create function public.notify_chat_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
  v_business_unit_id uuid;
  v_sender_company_id uuid;
  v_sender_name text;
  v_sender_company_name text;
  v_body text := nullif(btrim(regexp_replace(coalesce(new.body, ''), '\s+', ' ', 'g')), '');
  v_data jsonb;
begin
  -- Caller check: only as the after insert trigger of messages, and a message
  -- of a signed-in user is always their own (send_message sets the sender);
  -- the migrations, the seed and the service role run without a user.
  if tg_op is distinct from 'INSERT' or tg_when is distinct from 'AFTER'
     or tg_table_name is distinct from 'messages' then
    raise exception 'notify_chat_message runs only after inserting a message'
      using errcode = '42501';
  end if;
  if auth.uid() is not null and new.sender_id is distinct from auth.uid() then
    raise exception 'a message is sent by its sender' using errcode = '42501';
  end if;

  -- Locks the conversation (send_message already holds it): two messages at
  -- the same time notify one after the other, so the grouping sees the first.
  select * into v_conversation from public.conversations c
  where c.id = new.conversation_id and c.kind in ('trip', 'negotiation')
  for update;
  if not found then
    return null;
  end if;
  -- The business unit of the negotiation or of the trip (it moves with the
  -- assigned unit), as conversation_business_unit_id reads it.
  select coalesce(n.business_unit_id, t.business_unit_id) into v_business_unit_id
  from public.conversations c
  left join public.negotiations n on n.id = c.negotiation_id
  left join public.trips t on t.id = c.trip_id
  where c.id = v_conversation.id;

  select p.company_id, nullif(btrim(p.full_name), ''), nullif(btrim(co.legal_name), '')
  into v_sender_company_id, v_sender_name, v_sender_company_name
  from public.profiles p
  left join public.companies co on co.id = p.company_id
  where p.id = new.sender_id;

  v_data := jsonb_build_object(
    'conversationId', v_conversation.id,
    'kind', v_conversation.kind,
    'preview', case when char_length(v_body) > 80 then left(v_body, 79) || '…' else v_body end
  )
  || case
       when v_conversation.kind = 'trip' then jsonb_build_object('tripId', v_conversation.trip_id)
       else jsonb_build_object('negotiationId', v_conversation.negotiation_id)
     end
  || public.load_route_data(v_conversation.load_id);

  insert into public.notifications (user_id, type, data)
  select r.user_id, 'chat_message',
         v_data || jsonb_build_object(
           'senderName',
           case when r.company_id = v_sender_company_id then v_sender_name else v_sender_company_name end
         )
  from (
    -- The users of the shipper company.
    select p.id as user_id, p.company_id
    from public.profiles p
    join public.companies co on co.id = p.company_id and co.type = 'shipper' and co.archived_at is null
    where p.company_id = v_conversation.shipper_company_id and p.role = 'shipper'
    union
    -- The managers of the carrier.
    select p.id, p.company_id
    from public.profiles p
    join public.companies co on co.id = p.company_id and co.type = 'carrier' and co.archived_at is null
    where p.company_id = v_conversation.carrier_company_id and p.role = 'manager'
    union
    -- The coordinators of the business unit of the negotiation or the trip.
    select p.id, p.company_id
    from public.business_unit_coordinators bc
    join public.business_units b on b.id = bc.business_unit_id and b.archived_at is null
    join public.profiles p on p.id = bc.profile_id and p.role = 'coordinator' and p.company_id = b.company_id
    join public.companies co on co.id = p.company_id and co.type = 'carrier' and co.archived_at is null
    where bc.business_unit_id = v_business_unit_id
      and b.company_id = v_conversation.carrier_company_id
  ) r
  where r.user_id is distinct from new.sender_id
    and not exists (
      select 1 from public.notifications n
      where n.user_id = r.user_id
        and n.type = 'chat_message'
        and n.read_at is null
        and n.data ->> 'conversationId' = v_conversation.id::text
        and n.created_at > now() - interval '10 minutes'
    );
  return null;
end;
$$;

revoke all on function public.notify_chat_message() from public, anon, authenticated;

create trigger messages_notify_chat
after insert on public.messages
for each row execute function public.notify_chat_message();
