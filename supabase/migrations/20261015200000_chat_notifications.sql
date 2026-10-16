-- B07 · Chat and notifications (schema): conversations (one per negotiation and
-- one per trip), messages (immutable; attachments in the private `chat`
-- bucket), message_reads, push_tokens and notifications (in-app inbox), plus
-- the triggers that queue a notification on the key events (producto §3).
--
-- Security model (same as B01-B06):
--   * Every table has RLS; `anon` gets nothing and `authenticated` only SELECT.
--     Every write goes through a `security definer` RPC that validates the
--     caller, or through the triggers of this file.
--   * Participants of a conversation: the shippers (role `shipper`) of its
--     shipper company, the carriers (role `carrier`) of its carrier company
--     and, in a trip conversation, the operator currently assigned to the trip.
--     Only they write messages, upload attachments and mark as read. Admins
--     read every conversation (D01: traceability and legal backup) but never
--     write.
--   * messages are immutable (reject_mutation from B06): no client privileges
--     and triggers reject UPDATE, DELETE and TRUNCATE for every role.
--   * notifications and push_tokens belong to one user, who is the only one
--     that sees them. Notifications store a type and data, not text: the
--     apps and the dispatcher (B09) render them with the Spanish copy of
--     packages/shared (copy/notifications.ts), so it lives in one place.
--
-- Lock order: send_message locks the conversation row only. No RPC of this
-- file locks loads, offers or trips, so it cannot deadlock with B05/B06.

-- ---------------------------------------------------------------------------
-- Enums (identifiers match packages/shared enums)
-- ---------------------------------------------------------------------------
create type public.conversation_kind as enum ('negotiation', 'trip');

create type public.push_platform as enum ('ios', 'android');

-- `load_match` is queued by matching (B08) and `document_expiring` by the
-- crons (B09); the triggers below queue the rest.
create type public.notification_type as enum (
  'load_match',
  'offer_received',
  'counter_offer_received',
  'offer_accepted',
  'trip_assigned',
  'trip_status_changed',
  'document_approved',
  'document_rejected',
  'document_expiring'
);

-- ---------------------------------------------------------------------------
-- conversations: created by triggers when a negotiation or a trip is created.
-- ---------------------------------------------------------------------------
-- Lets a conversation reference its trip together with the trip's parties.
alter table public.trips
  add constraint trips_parties_key unique (id, load_id, shipper_company_id, carrier_company_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind public.conversation_kind not null,
  negotiation_id uuid,
  trip_id uuid,
  load_id uuid not null references public.loads (id) on delete restrict,
  shipper_company_id uuid not null references public.companies (id) on delete restrict,
  carrier_company_id uuid not null references public.companies (id) on delete restrict,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  -- The parties always match the negotiation or the trip (composite FKs).
  constraint conversations_negotiation_fkey foreign key (negotiation_id, load_id, shipper_company_id, carrier_company_id)
    references public.negotiations (id, load_id, shipper_company_id, carrier_company_id) on delete restrict,
  constraint conversations_trip_fkey foreign key (trip_id, load_id, shipper_company_id, carrier_company_id)
    references public.trips (id, load_id, shipper_company_id, carrier_company_id) on delete restrict,
  constraint conversations_negotiation_key unique (negotiation_id),
  constraint conversations_trip_key unique (trip_id),
  constraint conversations_subject check (
    (kind = 'negotiation' and negotiation_id is not null and trip_id is null)
    or (kind = 'trip' and trip_id is not null and negotiation_id is null)
  )
);

comment on table public.conversations is
  'Chat of a negotiation or a trip (D01). Created by triggers; parties never change.';

create index conversations_shipper_company_idx on public.conversations (shipper_company_id, last_message_at desc);
create index conversations_carrier_company_idx on public.conversations (carrier_company_id, last_message_at desc);
create index conversations_load_idx on public.conversations (load_id);

-- ---------------------------------------------------------------------------
-- messages: immutable. `attachments` is built by send_message from the files
-- the sender uploaded: [{path, name, mimeType, sizeBytes}].
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete restrict,
  -- Restrict: a message is a legal record (D01) and messages are immutable,
  -- so the sender's account cannot be deleted while they exist.
  sender_id uuid not null references auth.users (id) on delete restrict,
  sender_role public.user_role not null,
  body text constraint messages_body_length check (char_length(body) between 1 and 4000),
  attachments jsonb not null default '[]'::jsonb,
  -- Idempotency key from the device (offline retries).
  client_message_id uuid,
  created_at timestamptz not null default now(),
  constraint messages_attachments_array check (
    jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 5
  ),
  constraint messages_not_empty check (body is not null or attachments <> '[]'::jsonb),
  constraint messages_client_message_key unique (sender_id, client_message_id)
);

comment on table public.messages is 'Chat messages. Written only by send_message. Immutable.';

create index messages_conversation_idx on public.messages (conversation_id, created_at);

create trigger messages_immutable before update or delete on public.messages
for each row execute function public.reject_mutation();
create trigger messages_no_truncate before truncate on public.messages
for each statement execute function public.reject_mutation();

-- ---------------------------------------------------------------------------
-- message_reads: how far each participant has read a conversation. A message
-- is read by a user when created_at <= their last_read_at (read receipts).
-- ---------------------------------------------------------------------------
create table public.message_reads (
  conversation_id uuid not null references public.conversations (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

comment on table public.message_reads is 'Read marker per conversation and user. Written only by mark_conversation_read.';

create index message_reads_user_idx on public.message_reads (user_id);

create trigger message_reads_set_updated_at
before update on public.message_reads
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- push_tokens: Expo push tokens of each user's devices (B17 obtains them; the
-- dispatcher of B09 sends to them and deletes the invalid ones).
-- ---------------------------------------------------------------------------
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Mirrors isExpoPushToken (apps/mobile/src/lib/push-policy.ts).
  token text not null constraint push_tokens_token_format
    check (char_length(token) <= 255 and token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$'),
  platform public.push_platform not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint push_tokens_token_key unique (token)
);

comment on table public.push_tokens is 'Expo push tokens per user. Written only by register/unregister_push_token.';

create index push_tokens_user_idx on public.push_tokens (user_id, last_seen_at desc);

-- ---------------------------------------------------------------------------
-- notifications: in-app inbox, and the queue of the dispatcher (B09), which
-- sets dispatched_at once push and email were handled.
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.notification_type not null,
  -- Ids for the deep link and the values the copy needs (camelCase keys).
  data jsonb not null default '{}'::jsonb constraint notifications_data_object check (jsonb_typeof(data) = 'object'),
  read_at timestamptz,
  dispatched_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.notifications is
  'In-app notifications per user. Queued by triggers (and B08/B09); read state only through mark_notifications_read.';

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_pending_dispatch_idx on public.notifications (created_at) where dispatched_at is null;

-- ---------------------------------------------------------------------------
-- Helper: whether the caller takes part in a conversation (can write in it).
-- Admins are not participants: they only read.
-- ---------------------------------------------------------------------------
create function public.is_conversation_participant(p_conversation_id uuid)
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
        c.shipper_company_id = public.auth_shipper_company_id()
        or c.carrier_company_id = public.auth_fleet_company_id()
        or (t.operator_id is not null and t.operator_id = public.auth_operator_id())
      )
  );
$$;

revoke all on function public.is_conversation_participant(uuid) from public, anon;
grant execute on function public.is_conversation_participant(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Conversations are opened with their negotiation (make_offer) and their trip
-- (accept_offer). make_offer reuses a negotiation with ON CONFLICT DO UPDATE,
-- which does not fire AFTER INSERT: one conversation per negotiation.
-- ---------------------------------------------------------------------------
create function public.open_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.conversations (kind, negotiation_id, trip_id, load_id, shipper_company_id, carrier_company_id)
  values (
    case tg_table_name when 'negotiations' then 'negotiation' else 'trip' end::public.conversation_kind,
    case tg_table_name when 'negotiations' then new.id end,
    case tg_table_name when 'trips' then new.id end,
    new.load_id, new.shipper_company_id, new.carrier_company_id
  );
  return null;
end;
$$;

revoke all on function public.open_conversation() from public, anon, authenticated;

create trigger negotiations_open_conversation
after insert on public.negotiations
for each row execute function public.open_conversation();

create trigger trips_open_conversation
after insert on public.trips
for each row execute function public.open_conversation();

-- Negotiations and trips created before this migration get theirs too.
insert into public.conversations (kind, negotiation_id, load_id, shipper_company_id, carrier_company_id, created_at)
select 'negotiation', n.id, n.load_id, n.shipper_company_id, n.carrier_company_id, n.created_at
from public.negotiations n;

insert into public.conversations (kind, trip_id, load_id, shipper_company_id, carrier_company_id, created_at)
select 'trip', t.id, t.load_id, t.shipper_company_id, t.carrier_company_id, t.created_at
from public.trips t;

-- ---------------------------------------------------------------------------
-- RPC: a participant sends a message with text and/or up to 5 attachments
-- previously uploaded by them to `chat/{conversation_id}/{uuid}.{ext}`.
-- p_attachments: [{path, name?}]. Idempotent on p_client_message_id.
-- Returns the message id.
-- ---------------------------------------------------------------------------
create function public.send_message(
  p_conversation_id uuid,
  p_body text default null,
  p_attachments jsonb default '[]'::jsonb,
  p_client_message_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_body text := nullif(btrim(p_body), '');
  v_input jsonb := coalesce(p_attachments, '[]'::jsonb);
  v_attachments jsonb := '[]'::jsonb;
  v_item jsonb;
  v_path text;
  v_name text;
  v_object storage.objects%rowtype;
  v_id uuid;
begin
  -- Authorize before locking: other conversations are never locked.
  if not public.is_conversation_participant(p_conversation_id) then
    raise exception 'conversation not found' using errcode = '42501';
  end if;
  -- Serializes the sends of a conversation: makes the idempotency check
  -- race-free and keeps last_message_at monotonic.
  perform 1 from public.conversations where id = p_conversation_id for update;

  if p_client_message_id is not null then
    select m.id into v_id from public.messages m
    where m.sender_id = v_uid and m.client_message_id = p_client_message_id;
    if found then
      return v_id;
    end if;
  end if;

  if char_length(v_body) > 4000 then
    raise exception 'message is too long' using errcode = '22023';
  end if;
  if jsonb_typeof(v_input) <> 'array' or jsonb_array_length(v_input) > 5 then
    raise exception 'attachments must be an array of at most 5 items' using errcode = '22023';
  end if;

  for v_item in select x from jsonb_array_elements(v_input) x loop
    v_path := case when jsonb_typeof(v_item) = 'object' then v_item ->> 'path' end;
    v_name := case when jsonb_typeof(v_item) = 'object' then nullif(btrim(v_item ->> 'name'), '') end;
    if v_path is null or v_path !~ (
      '^' || p_conversation_id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|heic|pdf)$'
    ) then
      raise exception 'invalid attachment path' using errcode = '22023';
    end if;
    if char_length(v_name) > 255 then
      raise exception 'attachment name is too long' using errcode = '22023';
    end if;
    if v_attachments @> jsonb_build_array(jsonb_build_object('path', v_path)) then
      raise exception 'duplicate attachment' using errcode = '22023';
    end if;
    -- The file must exist and have been uploaded by the caller.
    select * into v_object from storage.objects o
    where o.bucket_id = 'chat' and o.name = v_path and o.owner_id = v_uid::text;
    if not found then
      raise exception 'file was not uploaded' using errcode = '22023';
    end if;
    v_attachments := v_attachments || jsonb_build_array(jsonb_build_object(
      'path', v_path,
      'name', coalesce(v_name, split_part(v_path, '/', 2)),
      'mimeType', v_object.metadata ->> 'mimetype',
      'sizeBytes', (v_object.metadata ->> 'size')::bigint
    ));
  end loop;

  if v_body is null and v_attachments = '[]'::jsonb then
    raise exception 'a message needs text or an attachment' using errcode = '22023';
  end if;

  insert into public.messages (conversation_id, sender_id, sender_role, body, attachments, client_message_id)
  values (p_conversation_id, v_uid, public.auth_role(), v_body, v_attachments, p_client_message_id)
  returning id into v_id;

  update public.conversations set last_message_at = now() where id = p_conversation_id;
  return v_id;
end;
$$;

revoke all on function public.send_message(uuid, text, jsonb, uuid) from public, anon;
grant execute on function public.send_message(uuid, text, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: a participant marks a conversation as read up to a message (or up to
-- its latest message). The marker never moves backwards.
-- ---------------------------------------------------------------------------
create function public.mark_conversation_read(p_conversation_id uuid, p_message_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_up_to timestamptz;
begin
  if not public.is_conversation_participant(p_conversation_id) then
    raise exception 'conversation not found' using errcode = '42501';
  end if;

  if p_message_id is not null then
    select m.created_at into v_up_to from public.messages m
    where m.id = p_message_id and m.conversation_id = p_conversation_id;
    if not found then
      raise exception 'message not found' using errcode = '22023';
    end if;
  else
    -- Latest committed message, not now(): a message committed later with an
    -- earlier created_at must not count as read.
    select max(m.created_at) into v_up_to from public.messages m where m.conversation_id = p_conversation_id;
    if v_up_to is null then
      return;
    end if;
  end if;

  insert into public.message_reads (conversation_id, user_id, last_read_at)
  values (p_conversation_id, (select auth.uid()), v_up_to)
  on conflict (conversation_id, user_id)
  do update set last_read_at = greatest(public.message_reads.last_read_at, excluded.last_read_at);
end;
$$;

revoke all on function public.mark_conversation_read(uuid, uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs: register this device's push token for the caller (a token moves to
-- the last user that signs in on the device; each user keeps their 10 most
-- recent devices), and remove it on sign-out.
-- ---------------------------------------------------------------------------
create function public.register_push_token(p_token text, p_platform public.push_platform)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_platform is null or p_token is null or char_length(p_token) > 255
     or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$' then
    raise exception 'invalid push token' using errcode = '22023';
  end if;

  insert into public.push_tokens (user_id, token, platform, last_seen_at)
  values (v_uid, p_token, p_platform, clock_timestamp())
  on conflict (token) do update
  set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = excluded.last_seen_at;

  delete from public.push_tokens
  where user_id = v_uid
    and id not in (
      select t.id from public.push_tokens t where t.user_id = v_uid order by t.last_seen_at desc, t.id limit 10
    );
end;
$$;

revoke all on function public.register_push_token(text, public.push_platform) from public, anon;
grant execute on function public.register_push_token(text, public.push_platform) to authenticated;

create function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.push_tokens where token = p_token and user_id = (select auth.uid());
end;
$$;

revoke all on function public.unregister_push_token(text) from public, anon;
grant execute on function public.unregister_push_token(text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: the caller marks their notifications as read (the given ones, or all).
-- Returns how many changed.
-- ---------------------------------------------------------------------------
create function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  update public.notifications
  set read_at = now()
  where user_id = (select auth.uid())
    and read_at is null
    and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Notification triggers (producto §3, Transversal). The user who caused the
-- event is never notified of it.
-- ---------------------------------------------------------------------------

-- Internal: notify the members of a company with a given role.
create function public.notify_company(
  p_company_id uuid,
  p_role public.user_role,
  p_type public.notification_type,
  p_data jsonb
)
returns void
language sql
set search_path = ''
as $$
  insert into public.notifications (user_id, type, data)
  select p.id, p_type, p_data
  from public.profiles p
  where p.company_id = p_company_id
    and p.role = p_role
    and p.id is distinct from (select auth.uid());
$$;

revoke all on function public.notify_company(uuid, public.user_role, public.notification_type, jsonb)
  from public, anon, authenticated;

-- Internal: the route of a load, shown in every notification about it.
create function public.load_route_data(p_load_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('loadId', l.id, 'originCity', l.origin_city, 'destinationCity', l.destination_city)
     from public.loads l where l.id = p_load_id),
    jsonb_build_object('loadId', p_load_id)
  );
$$;

revoke all on function public.load_route_data(uuid) from public, anon, authenticated;

-- Offers: a new offer or counteroffer goes to the other side; an accepted
-- offer, to the side that made it.
create function public.notify_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_data jsonb := jsonb_build_object(
    'offerId', new.id, 'negotiationId', new.negotiation_id, 'amountCents', new.amount_cents, 'side', new.side
  ) || public.load_route_data(new.load_id);
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    if new.side = 'carrier' then
      perform public.notify_company(
        new.shipper_company_id, 'shipper',
        case when new.parent_offer_id is null then 'offer_received' else 'counter_offer_received' end::public.notification_type,
        v_data
      );
    else
      perform public.notify_company(new.carrier_company_id, 'carrier', 'counter_offer_received', v_data);
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    if new.side = 'carrier' then
      perform public.notify_company(new.carrier_company_id, 'carrier', 'offer_accepted', v_data);
    else
      perform public.notify_company(new.shipper_company_id, 'shipper', 'offer_accepted', v_data);
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.notify_offer() from public, anon, authenticated;

create trigger offers_notify
after insert or update of status on public.offers
for each row execute function public.notify_offer();

-- Trips: every status change goes to the shipper and the carrier; the
-- assignment, to the assigned operator; a cancellation, to the operator too.
create function public.notify_trip_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_data jsonb;
begin
  if new.to_status is null or new.event_type = 'created' then
    return null;
  end if;
  select * into v_trip from public.trips where id = new.trip_id;
  v_data := jsonb_build_object('tripId', v_trip.id, 'eventType', new.event_type, 'status', new.to_status)
    || public.load_route_data(v_trip.load_id);

  perform public.notify_company(v_trip.shipper_company_id, 'shipper', 'trip_status_changed', v_data);
  perform public.notify_company(v_trip.carrier_company_id, 'carrier', 'trip_status_changed', v_data);

  if new.event_type in ('assigned', 'cancelled') then
    insert into public.notifications (user_id, type, data)
    select o.profile_id,
           case new.event_type when 'assigned' then 'trip_assigned' else 'trip_status_changed' end::public.notification_type,
           v_data
    from public.operators o
    where o.id = v_trip.operator_id
      and o.profile_id is not null
      and o.profile_id is distinct from (select auth.uid())
      -- An owner-operator (D13) already got it as the carrier.
      and not exists (
        select 1 from public.profiles p
        where p.id = o.profile_id and p.role = 'carrier' and p.company_id = v_trip.carrier_company_id
      );
  end if;
  return null;
end;
$$;

revoke all on function public.notify_trip_event() from public, anon, authenticated;

create trigger trip_events_notify
after insert on public.trip_events
for each row execute function public.notify_trip_event();

-- Documents: the review result goes to the owner company (its shippers or
-- carriers, who manage documents).
create function public.notify_document_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_type public.company_type;
begin
  if old.status <> 'pending_review' or new.status not in ('approved', 'rejected') then
    return null;
  end if;
  select c.type into v_company_type from public.companies c where c.id = new.company_id;
  perform public.notify_company(
    new.company_id,
    v_company_type::text::public.user_role,
    case new.status when 'approved' then 'document_approved' else 'document_rejected' end::public.notification_type,
    jsonb_build_object(
      'documentId', new.id,
      'ownerType', new.owner_type,
      'ownerId', new.owner_id,
      'requirementName', (select r.name from public.document_requirements r where r.id = new.requirement_id),
      'reviewNotes', new.review_notes
    )
  );
  return null;
end;
$$;

revoke all on function public.notify_document_review() from public, anon, authenticated;

create trigger documents_notify_review
after update of status on public.documents
for each row
when (old.status is distinct from new.status)
execute function public.notify_document_review();

-- ---------------------------------------------------------------------------
-- Privileges: read-only for clients; every write goes through the RPCs above.
-- ---------------------------------------------------------------------------
revoke all on table public.conversations, public.messages, public.message_reads, public.push_tokens,
  public.notifications from anon, authenticated;
grant select on table public.conversations, public.messages, public.message_reads, public.push_tokens,
  public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security. Only select policies: no client writes at all.
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_reads enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notifications enable row level security;

-- conversations: participants and admins. The trips subquery is filtered by
-- trips_select, which never reads conversations (no recursion).
create policy conversations_select
on public.conversations
for select
to authenticated
using (
  shipper_company_id = (select public.auth_shipper_company_id())
  or carrier_company_id = (select public.auth_fleet_company_id())
  or (select public.is_admin())
  or (
    trip_id is not null
    and (select public.auth_operator_id()) is not null
    and exists (
      select 1 from public.trips t
      where t.id = conversations.trip_id and t.operator_id = (select public.auth_operator_id())
    )
  )
);

-- Messages and read markers: whoever sees the conversation (the subquery is
-- filtered by conversations_select). Participants see each other's markers
-- (read receipts).
create policy messages_select
on public.messages
for select
to authenticated
using (exists (select 1 from public.conversations c where c.id = messages.conversation_id));

create policy message_reads_select
on public.message_reads
for select
to authenticated
using (exists (select 1 from public.conversations c where c.id = message_reads.conversation_id));

create policy push_tokens_select_own
on public.push_tokens
for select
to authenticated
using (user_id = (select auth.uid()));

create policy notifications_select_own
on public.notifications
for select
to authenticated
using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Realtime: new messages reach the open chats (B14, B19). Realtime applies
-- messages_select to every subscriber.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

alter publication supabase_realtime add table public.messages;

-- ---------------------------------------------------------------------------
-- Storage: private bucket `chat`, path {conversation_id}/{uuid}.{ext}.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat', 'chat', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do nothing;

-- Only participants upload, into their conversation's folder. No update or
-- delete policy: attachments are never overwritten or removed by clients.
create policy chat_bucket_insert_participant
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat'
  and objects.name ~ (
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|heic|pdf)$'
  )
  and exists (
    select 1 from public.conversations c
    where c.id::text = split_part(objects.name, '/', 1)
      and public.is_conversation_participant(c.id)
  )
);

-- Same visibility as the conversation (the subquery is filtered by
-- conversations_select).
create policy chat_bucket_select_conversation
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chat'
  and exists (select 1 from public.conversations c where c.id::text = split_part(objects.name, '/', 1))
);
