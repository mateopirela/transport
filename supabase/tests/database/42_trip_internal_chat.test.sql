-- H1 · Internal chat of a trip (D28): the carrier's conversation between the
-- operator assigned now, the coordinators of the trip's business unit and the
-- managers. Never the shipper.
--   * two conversations per trip (one per kind), opened by the trigger; every
--     trip has its internal one (backfill);
--   * matrix manager M / coordinator A (the trip's unit) / coordinator B
--     (another unit) / operator O (assigned) / operator P / shipper S /
--     manager X of another carrier / admin × read the conversation and its
--     messages, send_message, mark_conversation_read, upload and read
--     attachments of the `chat` bucket;
--   * the operator no longer reads or writes the chat with the shipper;
--   * notifications `internal_message`, grouped per conversation and recipient;
--   * internal_chat_inbox;
--   * a reassigned operator loses the conversation at once; the operator of a
--     cancelled trip keeps it (D20-E1) and the shipper still cannot see it.
begin;
create extension if not exists pgtap with schema extensions;

select plan(63);

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
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@h1.test', now(),
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

-- How many rows of p_sql p_uid sees.
create function tests.sees(p_uid uuid, p_sql text)
returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  perform tests.login(p_uid);
  execute 'set local role authenticated';
  execute format('select count(*) from (%s) x', p_sql) into v_count;
  execute 'reset role';
  return v_count;
end;
$$;

-- Columns: M, A, B, O, P, S, X, admin.
create function tests.matrix(p_sql text)
returns text
language sql
as $$
  select string_agg(tests.sees(u.id, p_sql)::text, ',' order by u.ord)
  from (values (1, 'a4200000-0000-4000-8000-000000000002'::uuid), (2, 'a4200000-0000-4000-8000-000000000003'),
               (3, 'a4200000-0000-4000-8000-000000000004'), (4, 'a4200000-0000-4000-8000-000000000005'),
               (5, 'a4200000-0000-4000-8000-000000000006'), (6, 'a4200000-0000-4000-8000-000000000001'),
               (7, 'a4200000-0000-4000-8000-000000000007'), (8, 'a4200000-0000-4000-8000-000000000008'))
       as u(ord, id);
$$;

-- Which of them a call as p_uid succeeds for (1) or is refused with 42501 (0).
create function tests.can(p_uid uuid, p_sql text)
returns integer
language plpgsql
as $$
begin
  perform tests.login(p_uid);
  execute 'set local role authenticated';
  begin
    execute p_sql;
  exception when insufficient_privilege then
    execute 'reset role';
    return 0;
  end;
  execute 'reset role';
  return 1;
end;
$$;

create function tests.can_matrix(p_sql text)
returns text
language sql
as $$
  select string_agg(tests.can(u.id, p_sql)::text, ',' order by u.ord)
  from (values (1, 'a4200000-0000-4000-8000-000000000002'::uuid), (2, 'a4200000-0000-4000-8000-000000000003'),
               (3, 'a4200000-0000-4000-8000-000000000004'), (4, 'a4200000-0000-4000-8000-000000000005'),
               (5, 'a4200000-0000-4000-8000-000000000006'), (6, 'a4200000-0000-4000-8000-000000000001'),
               (7, 'a4200000-0000-4000-8000-000000000007'), (8, 'a4200000-0000-4000-8000-000000000008'))
       as u(ord, id);
$$;

-- Unread internal_message notifications of a user (as the owner).
create function tests.notified(p_user uuid)
returns bigint
language sql
as $$
  select count(*) from public.notifications
  where user_id = p_user and type = 'internal_message' and data ->> 'conversationId' = tests.val('internal')::text;
$$;

grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures. Users a42…: 01 S shipper, 02 M manager, 03 A coordinator of unit
-- A, 04 B coordinator of unit B, 05 O operator (unit A), 06 P operator (unit
-- A), 07 X manager of another carrier, 08 admin.
-- ---------------------------------------------------------------------------
select tests.new_user('a4200000-0000-4000-8000-000000000001', 'shipper', 'Sara Cliente');
select tests.new_user('a4200000-0000-4000-8000-000000000002', 'manager', 'Mario Gerente');
select tests.new_user('a4200000-0000-4000-8000-000000000003', 'coordinator', 'Andrea Coordinadora');
select tests.new_user('a4200000-0000-4000-8000-000000000004', 'coordinator', 'Beto Coordinador');
select tests.new_user('a4200000-0000-4000-8000-000000000005', 'operator', 'Óscar Operador');
select tests.new_user('a4200000-0000-4000-8000-000000000006', 'operator', 'Pablo Operador');
select tests.new_user('a4200000-0000-4000-8000-000000000007', 'manager', 'Ximena Ajena');
select tests.new_user('a4200000-0000-4000-8000-000000000008', 'shipper', 'Admin');
update public.profiles set role = 'admin' where id = 'a4200000-0000-4000-8000-000000000008';

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c4200000-0000-4000-8000-000000000001', 'shipper', 'Envíos Hache SA de CV', 'EHA050505GH5', 'approved'),
  ('c4200000-0000-4000-8000-000000000002', 'carrier', 'Fletes Hache SA de CV', 'FHA040404CD4', 'approved'),
  ('c4200000-0000-4000-8000-000000000003', 'carrier', 'Fletes Ajenos SA de CV', 'FAJ040404CD4', 'approved');
update public.profiles set company_id = 'c4200000-0000-4000-8000-000000000001'
where id = 'a4200000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c4200000-0000-4000-8000-000000000002'
where id in ('a4200000-0000-4000-8000-000000000002', 'a4200000-0000-4000-8000-000000000003',
             'a4200000-0000-4000-8000-000000000004', 'a4200000-0000-4000-8000-000000000005',
             'a4200000-0000-4000-8000-000000000006');
update public.profiles set company_id = 'c4200000-0000-4000-8000-000000000003'
where id = 'a4200000-0000-4000-8000-000000000007';

update public.business_units set name = 'Unidad A' where company_id = 'c4200000-0000-4000-8000-000000000002';
insert into tests.vals select 'bu_a', id from public.business_units where company_id = 'c4200000-0000-4000-8000-000000000002';
insert into public.business_units (id, company_id, name)
values ('b4200000-0000-4000-8000-00000000000b', 'c4200000-0000-4000-8000-000000000002', 'Unidad B');
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id) values
  (tests.val('bu_a'), 'c4200000-0000-4000-8000-000000000002', 'a4200000-0000-4000-8000-000000000003'),
  ('b4200000-0000-4000-8000-00000000000b', 'c4200000-0000-4000-8000-000000000002', 'a4200000-0000-4000-8000-000000000004');

insert into public.operators (id, company_id, business_unit_id, profile_id, full_name, license_type, license_expires_on) values
  ('d4200000-0000-4000-8000-000000000005', 'c4200000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'a4200000-0000-4000-8000-000000000005', 'Óscar Operador', 'E', current_date + 365),
  ('d4200000-0000-4000-8000-000000000006', 'c4200000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'a4200000-0000-4000-8000-000000000006', 'Pablo Operador', 'E', current_date + 365);
insert into public.vehicles (id, company_id, business_unit_id, kind, plate, unit_type, capacity_kg) values
  ('e4200000-0000-4000-8000-00000000000a', 'c4200000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'rigid', 'HHA4201', 'dry_van', 30000);
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'c4200000-0000-4000-8000-000000000002'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- A load of S, offered by A with the unit of unit A, accepted by S and
-- assigned by A to O.
set local role authenticated;
select tests.login('a4200000-0000-4000-8000-000000000001');
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
select tests.login('a4200000-0000-4000-8000-000000000003');
insert into tests.vals
select 'offer', public.make_offer(tests.val('load'), 3000000, null, 'e4200000-0000-4000-8000-00000000000a');
select tests.login('a4200000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip', public.accept_offer(tests.val('offer'));
select tests.login('a4200000-0000-4000-8000-000000000003');
select public.assign_trip(tests.val('trip'), 'e4200000-0000-4000-8000-00000000000a', 'd4200000-0000-4000-8000-000000000005');
reset role;

insert into tests.vals select 'shipper_chat', id from public.conversations where trip_id = tests.val('trip') and kind = 'trip';
insert into tests.vals select 'internal', id from public.conversations where trip_id = tests.val('trip') and kind = 'trip_internal';
-- Notifications before the chat, to tell the new ones apart.
delete from public.notifications where user_id::text like 'a4200000-%';

-- ---------------------------------------------------------------------------
-- Two conversations per trip
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select kind::text, shipper_company_id, carrier_company_id from public.conversations
     where trip_id = tests.val('trip') order by kind $$,
  $$ values ('trip', 'c4200000-0000-4000-8000-000000000001'::uuid, 'c4200000-0000-4000-8000-000000000002'::uuid),
            ('trip_internal', 'c4200000-0000-4000-8000-000000000001'::uuid, 'c4200000-0000-4000-8000-000000000002'::uuid) $$,
  'a new trip opens the chat with the shipper and the carrier''s internal one, with the trip''s parties'
);
select is(
  (select count(*)::int from public.trips t
   where not exists (select 1 from public.conversations c where c.trip_id = t.id and c.kind = 'trip_internal')),
  0, 'every trip has its internal conversation (backfill of the existing ones)'
);
select throws_ok(
  $$ insert into public.conversations (kind, trip_id, load_id, shipper_company_id, carrier_company_id)
     select 'trip_internal', id, load_id, shipper_company_id, carrier_company_id from public.trips where id = tests.val('trip') $$,
  '23505', null, 'one internal conversation per trip'
);
select throws_ok(
  $$ insert into public.conversations (kind, negotiation_id, load_id, shipper_company_id, carrier_company_id)
     select 'trip_internal', id, load_id, shipper_company_id, carrier_company_id from public.negotiations
     where load_id = tests.val('load') $$,
  '23514', null, 'an internal conversation belongs to a trip, never to a negotiation'
);

-- ---------------------------------------------------------------------------
-- Who sees and writes (columns: M, A, B, O, P, S, X, admin)
-- ---------------------------------------------------------------------------
select is(tests.matrix($$ select 1 from public.conversations where id = tests.val('internal') $$),
  '1,1,0,1,0,0,0,1', 'the internal conversation: the manager, the trip''s coordinator, its operator and admins');
select is(tests.matrix($$ select 1 from public.conversations where id = tests.val('shipper_chat') $$),
  '1,1,0,0,0,1,0,1', 'the chat with the shipper: no longer the operator (D28)');

select is(tests.can_matrix($$ select public.send_message(tests.val('internal'), 'Hola, ¿cómo vas?') $$),
  '1,1,0,1,0,0,0,0', 'send_message in the internal conversation: its participants only (admins read, never write)');
select is(tests.can_matrix($$ select public.send_message(tests.val('shipper_chat'), 'Hola') $$),
  '1,1,0,0,0,1,0,0', 'send_message in the chat with the shipper: not the operator');
select is(tests.matrix($$ select 1 from public.messages where conversation_id = tests.val('internal') $$),
  '3,3,0,3,0,0,0,3', 'the internal messages: the same as the conversation');
select is(tests.matrix($$ select 1 from public.messages where conversation_id = tests.val('shipper_chat') $$),
  '3,3,0,0,0,3,0,3', 'the messages with the shipper: not the operator');

select is(tests.can_matrix($$ select public.mark_conversation_read(tests.val('internal')) $$),
  '1,1,0,1,0,0,0,0', 'mark_conversation_read in the internal conversation: its participants only');
select is(tests.can_matrix($$ select public.mark_conversation_read(tests.val('shipper_chat')) $$),
  '1,1,0,0,0,1,0,0', 'mark_conversation_read in the chat with the shipper: not the operator');
select is(tests.matrix($$ select 1 from public.message_reads where conversation_id = tests.val('internal') $$),
  '3,3,0,3,0,0,0,3', 'the read markers of the internal conversation: its participants and admins');

-- ---------------------------------------------------------------------------
-- Attachments (bucket `chat`)
-- ---------------------------------------------------------------------------
select is(
  tests.can_matrix(format(
    $$ insert into storage.objects (bucket_id, name, owner_id, metadata)
       values ('chat', '%s/' || gen_random_uuid() || '.jpg', (select auth.uid())::text,
               '{"mimetype": "image/jpeg", "size": 2048}') $$,
    tests.val('internal'))),
  '1,1,0,1,0,0,0,0', 'uploads to the internal conversation''s folder: its participants only'
);
select is(
  tests.matrix(format($$ select 1 from storage.objects where bucket_id = 'chat' and name like '%s/%%' $$,
                      tests.val('internal'))),
  '3,3,0,3,0,0,0,3', 'and reading those files: the same as the conversation (never the shipper)'
);

-- The operator sends a photo: its file and the message.
set local role authenticated;
select tests.login('a4200000-0000-4000-8000-000000000005');
insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('chat', tests.val('internal') || '/f4200000-0000-4000-8000-000000000001.jpg',
        'a4200000-0000-4000-8000-000000000005', '{"mimetype": "image/jpeg", "size": 4096}');
select lives_ok(
  format($$ select public.send_message(%L, null, '[{"path": "%s/f4200000-0000-4000-8000-000000000001.jpg"}]') $$,
         tests.val('internal'), tests.val('internal')),
  'the operator sends a photo to the internal conversation'
);
select throws_ok(
  format($$ select public.send_message(%L, 'x') $$, tests.val('shipper_chat')),
  '42501', null, 'and cannot write to the shipper'
);
reset role;

-- ---------------------------------------------------------------------------
-- Notifications (the tests above sent: M, A and O one message each, then the
-- photo of O; reads do not touch notifications)
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select user_id, data - 'conversationId' from public.notifications
     where type = 'internal_message' and data ->> 'conversationId' = tests.val('internal')::text
     order by user_id $$,
  $$ values ('a4200000-0000-4000-8000-000000000002'::uuid,
             jsonb_build_object('tripId', tests.val('trip'), 'senderName', 'Andrea Coordinadora', 'preview', 'Hola, ¿cómo vas?',
                                'loadId', tests.val('load'), 'originCity', 'Monterrey', 'destinationCity', 'Guadalajara')),
            ('a4200000-0000-4000-8000-000000000003'::uuid,
             jsonb_build_object('tripId', tests.val('trip'), 'senderName', 'Mario Gerente', 'preview', 'Hola, ¿cómo vas?',
                                'loadId', tests.val('load'), 'originCity', 'Monterrey', 'destinationCity', 'Guadalajara')),
            ('a4200000-0000-4000-8000-000000000005'::uuid,
             jsonb_build_object('tripId', tests.val('trip'), 'senderName', 'Mario Gerente', 'preview', 'Hola, ¿cómo vas?',
                                'loadId', tests.val('load'), 'originCity', 'Monterrey', 'destinationCity', 'Guadalajara')) $$,
  'the first message notifies every other participant; the next ones, while unread, are grouped'
);
select is(
  (select count(*)::int from public.notifications n
   where n.type = 'internal_message' and n.user_id in ('a4200000-0000-4000-8000-000000000001',
     'a4200000-0000-4000-8000-000000000004', 'a4200000-0000-4000-8000-000000000006',
     'a4200000-0000-4000-8000-000000000007', 'a4200000-0000-4000-8000-000000000008')),
  0, 'never the shipper, the other coordinator, another operator, another carrier or the admin'
);

-- After reading it, the next message notifies again; a photo reads "📷 Foto" (copy).
set local role authenticated;
select tests.login('a4200000-0000-4000-8000-000000000003');
select public.mark_notifications_read();
select tests.login('a4200000-0000-4000-8000-000000000005');
select public.send_message(tests.val('internal'), repeat('Mucho tráfico en la caseta de Lagos. ', 4));
reset role;
select is(tests.notified('a4200000-0000-4000-8000-000000000003'), 2::bigint,
  'once read, the next message notifies again');
select is(
  (select data ->> 'preview' from public.notifications
   where user_id = 'a4200000-0000-4000-8000-000000000003' and type = 'internal_message' and read_at is null),
  left(repeat('Mucho tráfico en la caseta de Lagos. ', 4), 79) || '…',
  'the preview is the text cut at 80 characters'
);
select is(tests.notified('a4200000-0000-4000-8000-000000000002'), 1::bigint,
  'the manager, with one still unread, gets no other');

set local role authenticated;
select tests.login('a4200000-0000-4000-8000-000000000002');
select public.mark_notifications_read();
select tests.login('a4200000-0000-4000-8000-000000000005');
insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('chat', tests.val('internal') || '/f4200000-0000-4000-8000-000000000002.jpg',
        'a4200000-0000-4000-8000-000000000005', '{"mimetype": "image/jpeg", "size": 4096}');
select public.send_message(tests.val('internal'), null,
  jsonb_build_array(jsonb_build_object('path', tests.val('internal') || '/f4200000-0000-4000-8000-000000000002.jpg')));
reset role;
select ok(
  (select data ? 'preview' and data -> 'preview' = 'null'::jsonb from public.notifications
   where user_id = 'a4200000-0000-4000-8000-000000000002' and type = 'internal_message' and read_at is null),
  'a photo without text has no preview (the copy says "📷 Foto")'
);

-- The chat with the shipper never notifies as internal (it has its own
-- chat_message, 49_chat_message_notifications).
select is(
  (select count(*)::int from public.notifications where type = 'internal_message'
   and data ->> 'conversationId' = tests.val('shipper_chat')::text),
  0, 'messages to the shipper do not notify as internal'
);

-- ---------------------------------------------------------------------------
-- internal_chat_inbox
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a4200000-0000-4000-8000-000000000003');
select results_eq(
  $$ select trip_id, conversation_id, trip_status::text, origin_city, destination_city, operator_name,
            last_message_attachments, last_sender_id, unread_count from public.internal_chat_inbox() $$,
  $$ values (tests.val('trip'), tests.val('internal'), 'assigned', 'Monterrey', 'Guadalajara', 'Óscar Operador', 1,
             'a4200000-0000-4000-8000-000000000005'::uuid, 3) $$,
  'the coordinator''s inbox: the trip, its operator, the latest message and the unread ones (since their marker)'
);
select is(
  (select unread_count from public.internal_chat_inbox(array[tests.val('trip')])), 3,
  'narrowed to the trips on screen'
);
select is(
  (select count(*)::int from public.internal_chat_inbox(array[gen_random_uuid()])), 0,
  'another trip: nothing'
);
select is(
  (select count(*)::int from public.internal_chat_inbox(array[]::uuid[])), 0,
  'no trips: nothing'
);
select public.mark_conversation_read(tests.val('internal'));
select is((select unread_count from public.internal_chat_inbox()), 0, 'reading the chat clears them');
select tests.login('a4200000-0000-4000-8000-000000000005');
select is((select unread_count from public.internal_chat_inbox()), 0,
  'the operator''s own messages are never unread for them');
select tests.login('a4200000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.internal_chat_inbox()), 0, 'the shipper gets nothing');
select tests.login('a4200000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.internal_chat_inbox()), 0, 'nor the coordinator of another unit');
select tests.login('a4200000-0000-4000-8000-000000000007');
select is((select count(*)::int from public.internal_chat_inbox()), 0, 'nor another carrier');
reset role;

-- The triggers check their caller: a signed-in user's message is their own,
-- and open_conversation runs only as a trigger.
select tests.login('a4200000-0000-4000-8000-000000000003');
select throws_ok(
  $$ insert into public.messages (conversation_id, sender_id, sender_role, body)
     values (tests.val('internal'), 'a4200000-0000-4000-8000-000000000005', 'operator', 'No lo escribí yo') $$,
  '42501', 'a message is sent by its sender',
  'notify_internal_message refuses a message in someone else''s name'
);
select tests.login('a4200000-0000-4000-8000-000000000004');
select throws_ok(
  $$ insert into public.negotiations (load_id, shipper_company_id, carrier_company_id, business_unit_id)
     select l.id, l.shipper_company_id, b.company_id, b.id
     from public.loads l, public.business_units b
     where l.id = tests.val('load') and b.company_id = 'c4200000-0000-4000-8000-000000000003'
     limit 1 $$,
  '42501', 'only a party opens its conversations',
  'open_conversation refuses a caller who is not a party'
);
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select public.open_conversation() $$,
  '0A000', null,
  'open_conversation cannot be called directly'
);

-- The shipper cannot reach the internal messages by any other table either.
select is(
  tests.sees('a4200000-0000-4000-8000-000000000001',
    $$ select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
       where c.trip_id = tests.val('trip') and c.kind = 'trip_internal' $$),
  0::bigint, 'the shipper reads no internal message'
);
select is(
  tests.sees('a4200000-0000-4000-8000-000000000001',
    $$ select 1 from public.notifications where type = 'internal_message' $$),
  0::bigint, 'nor any internal notification'
);

-- ---------------------------------------------------------------------------
-- Reassignment: P takes the trip; O loses the conversation at once
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a4200000-0000-4000-8000-000000000003');
select public.assign_trip(tests.val('trip'), 'e4200000-0000-4000-8000-00000000000a', 'd4200000-0000-4000-8000-000000000006');
reset role;
select is(tests.matrix($$ select 1 from public.conversations where id = tests.val('internal') $$),
  '1,1,0,0,1,0,0,1', 'the reassigned operator no longer sees it; the new one does');
select is(tests.matrix($$ select 1 from public.messages where conversation_id = tests.val('internal') $$),
  '6,6,0,0,6,0,0,6', 'including its earlier messages');
select is(tests.can_matrix($$ select public.send_message(tests.val('internal'), '¿Quién lleva el viaje?') $$),
  '1,1,0,0,1,0,0,0', 'only the new operator writes in it');
select is(
  tests.matrix(format($$ select 1 from storage.objects where bucket_id = 'chat' and name like '%s/%%' $$,
                      tests.val('internal'))),
  '5,5,0,0,5,0,0,5', 'and only the new one reads its files'
);
select is(tests.notified('a4200000-0000-4000-8000-000000000005'), 1::bigint,
  'the reassigned operator gets no notification of the new messages');
select ok(tests.notified('a4200000-0000-4000-8000-000000000006') > 0, 'the new one does');
select is(
  tests.can('a4200000-0000-4000-8000-000000000005', $$ select public.mark_conversation_read(tests.val('internal')) $$),
  0, 'the reassigned operator cannot mark it read'
);
select is(
  tests.sees('a4200000-0000-4000-8000-000000000005', $$ select 1 from public.internal_chat_inbox() $$),
  0::bigint, 'and it leaves their inbox'
);

-- ---------------------------------------------------------------------------
-- A cancelled trip keeps its internal conversation open (D20-E1)
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a4200000-0000-4000-8000-000000000001');
select public.cancel_trip(tests.val('trip'), 'shipper_request', null);
reset role;
select is((select status::text from public.trips where id = tests.val('trip')), 'cancelled', 'the shipper cancels the trip');
select is(tests.matrix($$ select 1 from public.conversations where id = tests.val('internal') $$),
  '1,1,0,0,1,0,0,1', 'its operator still sees the internal conversation; the shipper does not');
select is(
  tests.can('a4200000-0000-4000-8000-000000000006',
    $$ select public.send_message(tests.val('internal'), 'La unidad quedó en el patio de Apodaca.') $$),
  1, 'the operator of the cancelled trip still writes to their coordinator'
);
select is(
  tests.can('a4200000-0000-4000-8000-000000000003',
    $$ select public.send_message(tests.val('internal'), 'Gracias, la libero.') $$),
  1, 'and the coordinator answers'
);
select is(
  tests.can('a4200000-0000-4000-8000-000000000001',
    $$ select public.send_message(tests.val('internal'), 'hola') $$),
  0, 'the shipper still cannot write in it'
);
select is(
  tests.sees('a4200000-0000-4000-8000-000000000006', $$ select 1 from public.internal_chat_inbox() $$),
  1::bigint, 'the cancelled trip stays in the operator''s inbox'
);
select is(
  tests.sees('a4200000-0000-4000-8000-000000000001',
    $$ select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
       where c.kind = 'trip_internal' $$),
  0::bigint, 'nor reads it after the cancellation'
);

-- Admins read the internal messages (disputes, D01) but never write.
select is(
  tests.sees('a4200000-0000-4000-8000-000000000008', $$ select 1 from public.messages where conversation_id = tests.val('internal') $$),
  11::bigint, 'admins read every internal message'
);
select is(
  tests.sees('a4200000-0000-4000-8000-000000000008',
    $$ select 1 where public.is_conversation_participant(tests.val('internal')) $$),
  0::bigint, 'but do not take part in it'
);
select is(
  (select public.is_conversation_participant(tests.val('internal'))), false,
  'without a session nobody takes part'
);

-- The operator of the trip in the shipper's chat: their earlier messages stay.
select is(
  (select count(*)::int from public.messages m where m.conversation_id = tests.val('shipper_chat')
   and m.sender_role = 'operator'),
  0, 'the operator never wrote in the chat with the shipper here'
);
select is(
  tests.sees('a4200000-0000-4000-8000-000000000006',
    $$ select 1 from public.conversations where kind <> 'trip_internal' $$),
  0::bigint, 'an operator sees no negotiation or shipper chat at all'
);

-- Hygiene of the new objects.
select is(
  has_function_privilege('anon', 'public.internal_chat_inbox(uuid[])', 'execute'), false,
  'anon cannot call internal_chat_inbox'
);
select is(
  has_function_privilege('authenticated', 'public.notify_internal_message()', 'execute'), false,
  'clients cannot call the notification trigger'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.internal_chat_inbox(uuid[])'::regprocedure), false,
  'internal_chat_inbox runs as the caller (RLS)'
);
select is(
  (select count(*)::int from pg_trigger where tgrelid = 'public.messages'::regclass and tgname = 'messages_notify_internal'),
  1, 'messages notify through messages_notify_internal'
);
select is(
  (select count(*)::int from pg_constraint where conrelid = 'public.conversations'::regclass
   and conname = 'conversations_trip_key' and pg_get_constraintdef(oid) = 'UNIQUE (trip_id, kind)'),
  1, 'one conversation per trip and kind'
);

select * from finish();
rollback;
