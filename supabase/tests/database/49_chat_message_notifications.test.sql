-- Notifications of the chat with the shipper (plan §H.2 item 2): a message in
-- a negotiation or a trip conversation notifies its other participants with a
-- `chat_message`, grouped per conversation and recipient like H1.
--   * recipients: the users of the shipper company, the managers of the
--     carrier and the coordinators of the negotiation's or the trip's
--     business unit; never the sender, the operator (D28), the coordinator
--     of another unit, another carrier or the admin;
--   * data: conversationId, kind, tripId or negotiationId, the load's route,
--     senderName (the person for their colleagues, the company for the other
--     party) and the preview (80 characters; null for a photo);
--   * grouping: no new one while an unread one of the conversation from the
--     last 10 minutes exists; once read (or older), the next message notifies;
--   * the internal chat keeps its own type: neither notifies as the other.
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated;

create function tests.new_user(p_id uuid, p_role text, p_name text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@chat.test', now(),
          case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end,
          jsonb_build_object('role', p_role, 'phone', '+525500000000', 'full_name', p_name), now(), now());
  update public.profiles set full_name = p_name where id = p_id;
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create table tests.vals (name text primary key, id uuid);
grant select, insert on tests.vals to authenticated;

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

-- Who has chat_message notifications of a conversation (one letter each,
-- sorted; `unread` only the unread ones), as the owner.
create function tests.recipients(p_conversation text, p_unread boolean default false)
returns text
language sql
as $$
  select coalesce(string_agg(u.letter, ',' order by u.letter), '')
  from public.notifications n
  join (values ('a4900000-0000-4000-8000-000000000001'::uuid, 'S'), ('a4900000-0000-4000-8000-000000000009', 'T'),
               ('a4900000-0000-4000-8000-000000000002', 'M'), ('a4900000-0000-4000-8000-000000000003', 'A'),
               ('a4900000-0000-4000-8000-000000000004', 'B'), ('a4900000-0000-4000-8000-000000000005', 'O'),
               ('a4900000-0000-4000-8000-000000000007', 'X'), ('a4900000-0000-4000-8000-000000000008', 'Z'))
       as u(id, letter) on u.id = n.user_id
  where n.type = 'chat_message'
    and n.data ->> 'conversationId' = tests.val(p_conversation)::text
    and (not p_unread or n.read_at is null);
$$;

-- How many chat_message notifications of a conversation a user has.
create function tests.notified(p_user uuid, p_conversation text)
returns integer
language sql
as $$
  select count(*)::int from public.notifications
  where user_id = p_user and type = 'chat_message' and data ->> 'conversationId' = tests.val(p_conversation)::text;
$$;

grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures. Users a49…: 01 S and 09 T shipper users of the same company, 02 M
-- manager, 03 A coordinator of unit A, 04 B coordinator of unit B, 05 O
-- operator (unit A), 07 X manager of another carrier, 08 Z admin.
-- ---------------------------------------------------------------------------
select tests.new_user('a4900000-0000-4000-8000-000000000001', 'shipper', 'Sara Cliente');
select tests.new_user('a4900000-0000-4000-8000-000000000009', 'shipper', 'Tomás Cliente');
select tests.new_user('a4900000-0000-4000-8000-000000000002', 'manager', 'Mario Gerente');
select tests.new_user('a4900000-0000-4000-8000-000000000003', 'coordinator', 'Andrea Coordinadora');
select tests.new_user('a4900000-0000-4000-8000-000000000004', 'coordinator', 'Beto Coordinador');
select tests.new_user('a4900000-0000-4000-8000-000000000005', 'operator', 'Óscar Operador');
select tests.new_user('a4900000-0000-4000-8000-000000000007', 'manager', 'Ximena Ajena');
select tests.new_user('a4900000-0000-4000-8000-000000000008', 'shipper', 'Admin');
update public.profiles set role = 'admin' where id = 'a4900000-0000-4000-8000-000000000008';

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c4900000-0000-4000-8000-000000000001', 'shipper', 'Envíos Charla SA de CV', 'ECH050505GH5', 'approved'),
  ('c4900000-0000-4000-8000-000000000002', 'carrier', 'Fletes Charla SA de CV', 'FCH040404CD4', 'approved'),
  ('c4900000-0000-4000-8000-000000000003', 'carrier', 'Fletes Ajenos SA de CV', 'FAJ040404CD4', 'approved');
update public.profiles set company_id = 'c4900000-0000-4000-8000-000000000001'
where id in ('a4900000-0000-4000-8000-000000000001', 'a4900000-0000-4000-8000-000000000009');
update public.profiles set company_id = 'c4900000-0000-4000-8000-000000000002'
where id in ('a4900000-0000-4000-8000-000000000002', 'a4900000-0000-4000-8000-000000000003',
             'a4900000-0000-4000-8000-000000000004', 'a4900000-0000-4000-8000-000000000005');
update public.profiles set company_id = 'c4900000-0000-4000-8000-000000000003'
where id = 'a4900000-0000-4000-8000-000000000007';

update public.business_units set name = 'Unidad A' where company_id = 'c4900000-0000-4000-8000-000000000002';
insert into tests.vals select 'bu_a', id from public.business_units where company_id = 'c4900000-0000-4000-8000-000000000002';
insert into public.business_units (id, company_id, name)
values ('b4900000-0000-4000-8000-00000000000b', 'c4900000-0000-4000-8000-000000000002', 'Unidad B');
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id) values
  (tests.val('bu_a'), 'c4900000-0000-4000-8000-000000000002', 'a4900000-0000-4000-8000-000000000003'),
  ('b4900000-0000-4000-8000-00000000000b', 'c4900000-0000-4000-8000-000000000002', 'a4900000-0000-4000-8000-000000000004');

insert into public.operators (id, company_id, business_unit_id, profile_id, full_name, license_type, license_expires_on) values
  ('d4900000-0000-4000-8000-000000000005', 'c4900000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'a4900000-0000-4000-8000-000000000005', 'Óscar Operador', 'E', current_date + 365);
insert into public.vehicles (id, company_id, business_unit_id, kind, plate, unit_type, capacity_kg) values
  ('e4900000-0000-4000-8000-00000000000a', 'c4900000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'rigid', 'HCH4901', 'dry_van', 30000);
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'c4900000-0000-4000-8000-000000000002'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- A load of S, offered by A with the unit of unit A: its negotiation.
set local role authenticated;
select tests.login('a4900000-0000-4000-8000-000000000001');
insert into tests.vals select 'load', public.create_load(jsonb_build_object(
  'origin', jsonb_build_object('address', 'Av. Constitución 100', 'city', 'Monterrey', 'state', 'Nuevo León',
                               'lat', 25.6866, 'lng', -100.3161),
  'destination', jsonb_build_object('address', 'Av. Vallarta 200', 'city', 'Guadalajara', 'state', 'Jalisco',
                                    'lat', 20.6597, 'lng', -103.3496),
  'pickupWindow', jsonb_build_object('start', now() + interval '1 day', 'end', now() + interval '1 day 4 hours'),
  'deliveryWindow', jsonb_build_object('start', now() + interval '2 days', 'end', now() + interval '2 days 6 hours'),
  'cargoType', 'palletized', 'description', 'Tarimas', 'weightKg', 18000, 'unitType', 'dry_van',
  'specialRequirements', jsonb_build_array(), 'proposedPriceCents', 3500000
));
select public.publish_load(tests.val('load'));
select tests.login('a4900000-0000-4000-8000-000000000003');
insert into tests.vals
select 'offer', public.make_offer(tests.val('load'), 3000000, null, 'e4900000-0000-4000-8000-00000000000a');
reset role;
insert into tests.vals select 'negotiation', negotiation_id from public.offers where id = tests.val('offer');
insert into tests.vals select 'nego_chat', id from public.conversations where negotiation_id = tests.val('negotiation');
-- Notifications before the chat, to tell the new ones apart.
delete from public.notifications where user_id::text like 'a4900000-%';

-- ---------------------------------------------------------------------------
-- The negotiation chat
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a4900000-0000-4000-8000-000000000001');
select public.send_message(tests.val('nego_chat'), '  ¿Incluye   maniobras de carga?  ');
reset role;

select is(tests.recipients('nego_chat'), 'A,M,T',
  'a message of the shipper notifies its colleagues, the manager and the coordinator of the unit');
select results_eq(
  $$ select data from public.notifications
     where user_id = 'a4900000-0000-4000-8000-000000000003' and type = 'chat_message' $$,
  $$ values (jsonb_build_object('conversationId', tests.val('nego_chat'), 'kind', 'negotiation',
                                'negotiationId', tests.val('negotiation'), 'senderName', 'Envíos Charla SA de CV',
                                'preview', '¿Incluye maniobras de carga?', 'loadId', tests.val('load'),
                                'originCity', 'Monterrey', 'destinationCity', 'Guadalajara')) $$,
  'the data: the conversation, its kind and negotiation, the route, the sender''s company and the preview'
);
select is(
  (select data ->> 'senderName' from public.notifications
   where user_id = 'a4900000-0000-4000-8000-000000000009' and type = 'chat_message'),
  'Sara Cliente', 'a colleague of the sender sees their name; the other party, only the company'
);

set local role authenticated;
select tests.login('a4900000-0000-4000-8000-000000000003');
select public.send_message(tests.val('nego_chat'), 'Sí, incluidas.');
reset role;
select is(tests.recipients('nego_chat'), 'A,M,S,T',
  'the answer notifies the shipper; the others, with one still unread, get no other');
select is(tests.notified('a4900000-0000-4000-8000-000000000002', 'nego_chat'), 1,
  'the manager keeps a single notification of the conversation');

-- ---------------------------------------------------------------------------
-- The trip chat: S accepts, A assigns O
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a4900000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip', public.accept_offer(tests.val('offer'));
select tests.login('a4900000-0000-4000-8000-000000000003');
select public.assign_trip(tests.val('trip'), 'e4900000-0000-4000-8000-00000000000a', 'd4900000-0000-4000-8000-000000000005');
reset role;
insert into tests.vals select 'trip_chat', id from public.conversations where trip_id = tests.val('trip') and kind = 'trip';
insert into tests.vals select 'internal', id from public.conversations where trip_id = tests.val('trip') and kind = 'trip_internal';

set local role authenticated;
select tests.login('a4900000-0000-4000-8000-000000000003');
select public.send_message(tests.val('trip_chat'), 'El operador sale a las 6.');
reset role;
select is(tests.recipients('trip_chat'), 'M,S,T',
  'a message of the coordinator in the trip chat notifies the shipper users and the manager');
select is(tests.notified('a4900000-0000-4000-8000-000000000005', 'trip_chat'), 0,
  'never the assigned operator: they no longer take part in the chat with the shipper (D28)');
select is(
  (select count(*)::int from public.notifications
   where type = 'chat_message' and user_id in ('a4900000-0000-4000-8000-000000000004',
     'a4900000-0000-4000-8000-000000000005', 'a4900000-0000-4000-8000-000000000007',
     'a4900000-0000-4000-8000-000000000008')),
  0, 'nor the coordinator of another unit, the operator, another carrier or the admin, in any conversation'
);
select results_eq(
  $$ select data - 'conversationId' from public.notifications
     where user_id = 'a4900000-0000-4000-8000-000000000001' and type = 'chat_message'
       and data ->> 'kind' = 'trip' $$,
  $$ values (jsonb_build_object('kind', 'trip', 'tripId', tests.val('trip'), 'senderName', 'Fletes Charla SA de CV',
                                'preview', 'El operador sale a las 6.', 'loadId', tests.val('load'),
                                'originCity', 'Monterrey', 'destinationCity', 'Guadalajara')) $$,
  'the data of the trip chat carries the trip'
);

-- Grouping: while unread, no other; once read, the next one notifies again.
set local role authenticated;
select tests.login('a4900000-0000-4000-8000-000000000002');
select public.send_message(tests.val('trip_chat'), 'Confirmado.');
reset role;
select is(tests.notified('a4900000-0000-4000-8000-000000000001', 'trip_chat'), 1,
  'a second message, while the first is unread, is grouped');
select is(tests.notified('a4900000-0000-4000-8000-000000000003', 'trip_chat'), 1,
  'the coordinator gets the manager''s message');

set local role authenticated;
select tests.login('a4900000-0000-4000-8000-000000000001');
select public.mark_notifications_read();
select tests.login('a4900000-0000-4000-8000-000000000003');
select public.send_message(tests.val('trip_chat'), repeat('Hay mucho tráfico en la caseta de Lagos. ', 4));
reset role;
select is(tests.notified('a4900000-0000-4000-8000-000000000001', 'trip_chat'), 2,
  'once read, the next message notifies again');
select is(tests.notified('a4900000-0000-4000-8000-000000000009', 'trip_chat'), 1,
  'while the colleague who did not read it gets no other');
select is(
  (select data ->> 'preview' from public.notifications
   where user_id = 'a4900000-0000-4000-8000-000000000001' and type = 'chat_message' and read_at is null),
  left(repeat('Hay mucho tráfico en la caseta de Lagos. ', 4), 79) || '…',
  'the preview is the text cut at 80 characters'
);

-- An unread one older than 10 minutes does not group.
update public.notifications set created_at = now() - interval '11 minutes'
where user_id = 'a4900000-0000-4000-8000-000000000009' and type = 'chat_message';
set local role authenticated;
select tests.login('a4900000-0000-4000-8000-000000000001');
insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('chat', tests.val('trip_chat') || '/f4900000-0000-4000-8000-000000000001.jpg',
        'a4900000-0000-4000-8000-000000000001', '{"mimetype": "image/jpeg", "size": 4096}');
select public.send_message(tests.val('trip_chat'), null,
  jsonb_build_array(jsonb_build_object('path', tests.val('trip_chat') || '/f4900000-0000-4000-8000-000000000001.jpg')));
reset role;
select is(tests.notified('a4900000-0000-4000-8000-000000000009', 'trip_chat'), 2,
  'an unread notification older than 10 minutes does not group the next message');
select ok(
  (select data ? 'preview' and data -> 'preview' = 'null'::jsonb from public.notifications
   where user_id = 'a4900000-0000-4000-8000-000000000009' and type = 'chat_message'
   order by created_at desc limit 1),
  'a photo without text has no preview (the copy says "📷 Foto")'
);

-- The internal chat keeps its own type.
set local role authenticated;
select tests.login('a4900000-0000-4000-8000-000000000005');
select public.send_message(tests.val('internal'), 'Ya llegué a cargar');
reset role;
select is(tests.recipients('internal'), '', 'a message of the internal chat is no chat_message');
select is(
  (select count(*)::int from public.notifications
   where type = 'internal_message' and data ->> 'conversationId' <> tests.val('internal')::text
     and user_id::text like 'a4900000-%'),
  0, 'and the chat with the shipper never notifies as internal'
);

-- Each user reads only their own notifications: the shipper reads its own
-- previews, never the ones of another recipient.
set local role authenticated;
select tests.login('a4900000-0000-4000-8000-000000000001');
select results_eq(
  $$ select user_id, data ->> 'kind' from public.notifications where type = 'chat_message' order by 2 $$,
  $$ values ('a4900000-0000-4000-8000-000000000001'::uuid, 'negotiation'),
            ('a4900000-0000-4000-8000-000000000001'::uuid, 'trip'),
            ('a4900000-0000-4000-8000-000000000001'::uuid, 'trip') $$,
  'the shipper reads only its own chat notifications'
);
reset role;

-- ---------------------------------------------------------------------------
-- The trigger checks its caller; hygiene
-- ---------------------------------------------------------------------------
select tests.login('a4900000-0000-4000-8000-000000000003');
select throws_ok(
  $$ insert into public.messages (conversation_id, sender_id, sender_role, body)
     values (tests.val('trip_chat'), 'a4900000-0000-4000-8000-000000000001', 'shipper', 'No lo escribí yo') $$,
  '42501', 'a message is sent by its sender',
  'a message in someone else''s name is refused'
);
select set_config('request.jwt.claims', '', true);
select is(
  has_function_privilege('authenticated', 'public.notify_chat_message()', 'execute'), false,
  'clients cannot call the notification trigger'
);
select is(
  (select count(*)::int from pg_trigger where tgrelid = 'public.messages'::regclass and tgname = 'messages_notify_chat'),
  1, 'messages notify through messages_notify_chat'
);

select * from finish();
rollback;
