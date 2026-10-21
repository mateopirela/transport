-- H1.2 · Internal chat of each trip (D28), over the chat of B07.
--
-- Every trip gets a second conversation, `trip_internal`: the operator
-- currently assigned to the trip, the coordinators of the trip's business
-- unit and the managers of the carrier. The shipper never sees it. The
-- operator, in turn, stops taking part in the trip chat with the shipper:
-- they report to their coordinator, and the coordinator talks to the shipper.
-- The messages an operator already wrote there stay (they are immutable).
--
-- Who takes part lives in is_conversation_participant and conversations_select;
-- messages_select, message_reads_select, send_message, mark_conversation_read,
-- Realtime and the policies of the `chat` bucket go through them, so
-- attachments and photos work as today without new code. A closed or
-- cancelled trip keeps its internal conversation, open for writing (D20-E1).
--
-- A message in an internal conversation notifies the other participants
-- (`internal_message`, push and inbox only), grouped: one unread notification
-- per conversation and recipient every 10 minutes at most.
--
-- Lock order: the notification trigger runs inside send_message, which
-- already holds the conversation row; it takes no other lock.

-- ---------------------------------------------------------------------------
-- conversations: one per trip and kind.
-- ---------------------------------------------------------------------------
alter table public.conversations drop constraint conversations_subject;
alter table public.conversations add constraint conversations_subject check (
  (kind = 'negotiation' and negotiation_id is not null and trip_id is null)
  or (kind in ('trip', 'trip_internal') and trip_id is not null and negotiation_id is null)
);

alter table public.conversations drop constraint conversations_trip_key;
alter table public.conversations add constraint conversations_trip_key unique (trip_id, kind);

comment on table public.conversations is
  'Chat of a negotiation or a trip (D01), and the carrier''s internal chat of a trip (D28). '
  'Created by triggers; parties never change.';

-- Same as B07, except a trip opens two conversations: with the shipper
-- (`trip`) and the carrier's internal one (`trip_internal`).
create or replace function public.open_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Caller check: only as the after insert trigger of a negotiation or a trip
  -- (Postgres also refuses a direct call, and EXECUTE is revoked).
  if tg_op is distinct from 'INSERT' or tg_when is distinct from 'AFTER'
     or tg_table_name not in ('negotiations', 'trips') then
    raise exception 'open_conversation runs only after inserting a negotiation or a trip'
      using errcode = '42501';
  end if;
  if tg_table_name = 'negotiations' then
    insert into public.conversations (kind, negotiation_id, load_id, shipper_company_id, carrier_company_id)
    values ('negotiation', new.id, new.load_id, new.shipper_company_id, new.carrier_company_id);
  else
    insert into public.conversations (kind, trip_id, load_id, shipper_company_id, carrier_company_id)
    values
      ('trip', new.id, new.load_id, new.shipper_company_id, new.carrier_company_id),
      ('trip_internal', new.id, new.load_id, new.shipper_company_id, new.carrier_company_id);
  end if;
  return null;
end;
$$;

revoke all on function public.open_conversation() from public, anon, authenticated;

-- Trips created before this migration get their internal conversation too.
insert into public.conversations (kind, trip_id, load_id, shipper_company_id, carrier_company_id, created_at)
select 'trip_internal', t.id, t.load_id, t.shipper_company_id, t.carrier_company_id, t.created_at
from public.trips t
on conflict (trip_id, kind) do nothing;

-- ---------------------------------------------------------------------------
-- Participants. Same as G1a.2, except:
--   * `negotiation` and `trip`: no longer the assigned operator (D28);
--   * `trip_internal`: never the shipper; the operator currently assigned to
--     the trip (a reassigned one loses it at once).
-- ---------------------------------------------------------------------------
create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    left join public.trips t on t.id = c.trip_id
    where c.id = p_conversation_id
      and (
        (c.kind <> 'trip_internal' and c.shipper_company_id = public.auth_shipper_company_id())
        or c.carrier_company_id = public.auth_fleet_company_id()
        or (
          c.carrier_company_id = public.auth_carrier_company_id()
          and public.conversation_business_unit_id(c.id) = any (public.auth_business_unit_ids())
        )
        or (
          c.kind = 'trip_internal'
          and t.operator_id is not null
          and t.operator_id = public.auth_operator_id()
        )
      )
  );
$$;

revoke all on function public.is_conversation_participant(uuid) from public, anon;
grant execute on function public.is_conversation_participant(uuid) to authenticated, service_role;

-- Same as G1a.2, with the participants above (admins read every conversation).
drop policy conversations_select on public.conversations;
create policy conversations_select
on public.conversations
for select
to authenticated
using (
  (kind <> 'trip_internal' and shipper_company_id = (select public.auth_shipper_company_id()))
  or carrier_company_id = (select public.auth_fleet_company_id())
  or (
    carrier_company_id = (select public.auth_carrier_company_id())
    and public.conversation_business_unit_id(id) = any ((select public.auth_business_unit_ids())::uuid[])
  )
  or (select public.is_admin())
  or (
    kind = 'trip_internal'
    and (select public.auth_operator_id()) is not null
    and exists (
      select 1 from public.trips t
      where t.id = conversations.trip_id and t.operator_id = (select public.auth_operator_id())
    )
  )
);

-- ---------------------------------------------------------------------------
-- Notification of a new internal message: to every other participant, unless
-- they already have an unread one of the same conversation from the last 10
-- minutes (grouping). The data carries the ids of the deep link, the sender's
-- name and a preview of the text (null for attachments only: the copy says
-- "📷 Foto").
-- ---------------------------------------------------------------------------
create function public.notify_internal_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.conversations;
  v_trip public.trips;
  v_body text := nullif(btrim(regexp_replace(coalesce(new.body, ''), '\s+', ' ', 'g')), '');
  v_data jsonb;
begin
  -- Caller check: only as the after insert trigger of messages, and a message
  -- of a signed-in user is always their own (send_message sets the sender);
  -- the migrations, the seed and the service role run without a user.
  if tg_op is distinct from 'INSERT' or tg_when is distinct from 'AFTER'
     or tg_table_name is distinct from 'messages' then
    raise exception 'notify_internal_message runs only after inserting a message'
      using errcode = '42501';
  end if;
  if auth.uid() is not null and new.sender_id is distinct from auth.uid() then
    raise exception 'a message is sent by its sender' using errcode = '42501';
  end if;

  -- Locks the conversation (send_message already holds it): two messages at
  -- the same time notify one after the other, so the grouping sees the first.
  select * into v_conversation from public.conversations c
  where c.id = new.conversation_id and c.kind = 'trip_internal'
  for update;
  if not found then
    return null;
  end if;
  select * into v_trip from public.trips t where t.id = v_conversation.trip_id;

  v_data := jsonb_build_object(
    'tripId', v_conversation.trip_id,
    'conversationId', v_conversation.id,
    'senderName', (select nullif(btrim(p.full_name), '') from public.profiles p where p.id = new.sender_id),
    'preview', case when char_length(v_body) > 80 then left(v_body, 79) || '…' else v_body end
  ) || public.load_route_data(v_conversation.load_id);

  insert into public.notifications (user_id, type, data)
  select r.user_id, 'internal_message', v_data
  from (
    -- The managers of the carrier.
    select p.id as user_id
    from public.profiles p
    join public.companies co on co.id = p.company_id and co.archived_at is null
    where p.company_id = v_conversation.carrier_company_id and p.role = 'manager'
    union
    -- The coordinators of the trip's business unit.
    select bc.profile_id
    from public.business_unit_coordinators bc
    join public.business_units b on b.id = bc.business_unit_id and b.archived_at is null
    join public.profiles p on p.id = bc.profile_id and p.role = 'coordinator' and p.company_id = b.company_id
    where bc.business_unit_id = v_trip.business_unit_id
    union
    -- The operator assigned now.
    select o.profile_id
    from public.operators o
    where o.id = v_trip.operator_id and o.profile_id is not null and o.archived_at is null
  ) r
  where r.user_id is distinct from new.sender_id
    and not exists (
      select 1 from public.notifications n
      where n.user_id = r.user_id
        and n.type = 'internal_message'
        and n.read_at is null
        and n.data ->> 'conversationId' = v_conversation.id::text
        and n.created_at > now() - interval '10 minutes'
    );
  return null;
end;
$$;

revoke all on function public.notify_internal_message() from public, anon, authenticated;

create trigger messages_notify_internal
after insert on public.messages
for each row execute function public.notify_internal_message();

-- ---------------------------------------------------------------------------
-- RPC: the internal conversations the caller sees (RLS), with their trip,
-- operator, latest message and the caller's unread messages. Only the ones
-- with messages, unread first, then the most recent, at most 100. Feeds
-- "Mensajes de operadores" (app). `p_trip_ids` narrows it to those trips,
-- without the limit: the unread badges of the trips on screen (web, the
-- operator's trip), so none is left out.
-- ---------------------------------------------------------------------------
create function public.internal_chat_inbox(p_trip_ids uuid[] default null)
returns table (
  trip_id uuid,
  conversation_id uuid,
  trip_status public.trip_status,
  origin_city text,
  destination_city text,
  operator_name text,
  last_message_at timestamptz,
  last_message_body text,
  last_message_attachments integer,
  last_sender_id uuid,
  unread_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from (
  select c.trip_id,
         c.id,
         t.status,
         l.origin_city,
         l.destination_city,
         o.full_name,
         m.created_at as last_message_at,
         m.body,
         jsonb_array_length(m.attachments),
         m.sender_id,
         (
           select count(*)::integer
           from public.messages x
           where x.conversation_id = c.id
             and x.sender_id is distinct from (select auth.uid())
             and x.created_at > coalesce(
               (select r.last_read_at from public.message_reads r
                where r.conversation_id = c.id and r.user_id = (select auth.uid())),
               '-infinity'::timestamptz
             )
         ) as unread_count
  from public.conversations c
  left join public.trips t on t.id = c.trip_id
  left join public.loads l on l.id = c.load_id
  left join public.operators o on o.id = t.operator_id
  join lateral (
    select x.created_at, x.body, x.attachments, x.sender_id
    from public.messages x
    where x.conversation_id = c.id
    order by x.created_at desc
    limit 1
  ) m on true
  where c.kind = 'trip_internal'
    and (p_trip_ids is null or c.trip_id = any (p_trip_ids))
  ) inbox
  order by inbox.unread_count > 0 desc, inbox.last_message_at desc
  -- No limit for the trips asked for (null is no limit).
  limit case when p_trip_ids is null then 100 end;
$$;

revoke all on function public.internal_chat_inbox(uuid[]) from public, anon;
grant execute on function public.internal_chat_inbox(uuid[]) to authenticated;
