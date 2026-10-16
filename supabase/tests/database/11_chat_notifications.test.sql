-- Chat and notifications (B07): conversations opened with negotiations and
-- trips; role x operation RLS matrix for conversations, messages,
-- message_reads, push_tokens and notifications; only participants read and
-- write; messages cannot be edited or deleted; the `chat` bucket; and the
-- notifications queued by the key events (producto §3).
begin;
create extension if not exists pgtap with schema extensions;

select plan(115);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.new_user(p_id uuid, p_email text, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_email, now(), jsonb_build_object('role', p_role), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create function tests.payload()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'origin', jsonb_build_object('address', 'Av. Constitución 100', 'city', 'Monterrey', 'state', 'Nuevo León',
                                 'lat', 25.6866, 'lng', -100.3161),
    'destination', jsonb_build_object('address', 'Av. Vallarta 200', 'city', 'Guadalajara', 'state', 'Jalisco',
                                      'lat', 20.6597, 'lng', -103.3496),
    'pickupWindow', jsonb_build_object('start', now() + interval '1 day', 'end', now() + interval '1 day 4 hours'),
    'deliveryWindow', jsonb_build_object('start', now() + interval '2 days', 'end', now() + interval '2 days 6 hours'),
    'cargoType', 'palletized',
    'description', 'Tarimas',
    'weightKg', 18000,
    'unitType', 'dry_van',
    'specialRequirements', jsonb_build_array(),
    'proposedPriceCents', 3500000
  );
$$;

create table tests.vals (name text primary key, id uuid);
grant select, insert on tests.vals to authenticated;

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

-- Conversation of a negotiation or trip, bypassing RLS (fixture lookup only).
create function tests.conversation_of(p_subject uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.conversations c where c.negotiation_id = p_subject or c.trip_id = p_subject;
$$;

-- Notifications of a user by type and data (bypassing RLS, to check recipients).
create function tests.notified(p_user uuid, p_type text, p_data jsonb default '{}')
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.notifications n
  where n.user_id = p_user and n.type::text = p_type and n.data @> p_data;
$$;

-- Messages visible to the current user in a conversation.
create function tests.visible_messages(p_conversation uuid)
returns bigint
language sql
stable
as $$ select count(*) from public.messages where conversation_id = p_conversation $$;

grant execute on all functions in schema tests to authenticated;

-- Notifications that already exist (e.g. from the demo seed): the global
-- counts below only look at the ones this test creates.
create table tests.preexisting_notifications as select id from public.notifications;

-- Users: ...01 shipper S1 and ...02 shipper S2 (company S)   ...03 shipper T
--        ...04 carrier A   ...05 carrier B   ...06 operator O of A
--        ...07 operator P of A   ...08 admin
select tests.new_user('a7000000-0000-4000-8000-000000000001', 'sara@s.test', 'shipper');
select tests.new_user('a7000000-0000-4000-8000-000000000002', 'sofia@s.test', 'shipper');
select tests.new_user('a7000000-0000-4000-8000-000000000003', 'tomas@t.test', 'shipper');
select tests.new_user('a7000000-0000-4000-8000-000000000004', 'ana@a.test', 'carrier');
select tests.new_user('a7000000-0000-4000-8000-000000000005', 'beto@b.test', 'carrier');
select tests.new_user('a7000000-0000-4000-8000-000000000006', 'oscar@a.test', 'operator');
select tests.new_user('a7000000-0000-4000-8000-000000000007', 'pedro@a.test', 'operator');
select tests.new_user('a7000000-0000-4000-8000-000000000008', 'admin@x.test', 'shipper');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c7000000-0000-4000-8000-000000000001', 'shipper', 'Envíos Sigma SA de CV', 'ESI030303EF3', 'approved'),
  ('c7000000-0000-4000-8000-000000000002', 'shipper', 'Tiendas Tau SA de CV', 'TTA030303EF3', 'approved'),
  ('c7000000-0000-4000-8000-000000000003', 'carrier', 'Fletes Alfa SA de CV', 'FAL010101AB1', 'approved'),
  ('c7000000-0000-4000-8000-000000000004', 'carrier', 'Transportes Beta SA de CV', 'TBE020202CD2', 'approved');

update public.profiles p set company_id = c.id
from (values
  ('a7000000-0000-4000-8000-000000000001'::uuid, 'c7000000-0000-4000-8000-000000000001'::uuid),
  ('a7000000-0000-4000-8000-000000000002', 'c7000000-0000-4000-8000-000000000001'),
  ('a7000000-0000-4000-8000-000000000003', 'c7000000-0000-4000-8000-000000000002'),
  ('a7000000-0000-4000-8000-000000000004', 'c7000000-0000-4000-8000-000000000003'),
  ('a7000000-0000-4000-8000-000000000005', 'c7000000-0000-4000-8000-000000000004'),
  ('a7000000-0000-4000-8000-000000000006', 'c7000000-0000-4000-8000-000000000003'),
  ('a7000000-0000-4000-8000-000000000007', 'c7000000-0000-4000-8000-000000000003')
) as c(uid, id)
where p.id = c.uid;
update public.profiles set role = 'admin' where id = 'a7000000-0000-4000-8000-000000000008';

insert into public.operators (id, company_id, profile_id, full_name) values
  ('d7000000-0000-4000-8000-000000000006', 'c7000000-0000-4000-8000-000000000003',
   'a7000000-0000-4000-8000-000000000006', 'Óscar Operador'),
  ('d7000000-0000-4000-8000-000000000007', 'c7000000-0000-4000-8000-000000000003',
   'a7000000-0000-4000-8000-000000000007', 'Pedro Operador');
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('e7000000-0000-4000-8000-000000000003', 'c7000000-0000-4000-8000-000000000003', 'rigid', 'AAA1111', 'dry_van', 30000);

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
select has_table('public', t, format('%s exists', t))
from unnest(array['conversations', 'messages', 'message_reads', 'push_tokens', 'notifications']) t;
select ok(
  not has_table_privilege('anon', 'public.' || t, 'select,insert,update,delete'),
  format('anon has no privileges on %s', t)
)
from unnest(array['conversations', 'messages', 'message_reads', 'push_tokens', 'notifications']) t;
select ok(
  not has_table_privilege('authenticated', 'public.' || t, 'insert,update,delete'),
  format('clients cannot write %s directly', t)
)
from unnest(array['conversations', 'messages', 'message_reads', 'push_tokens', 'notifications']) t;
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ),
  'messages are published to Realtime'
);
select ok(
  (select not public from storage.buckets where id = 'chat'),
  'the chat bucket exists and is private'
);

-- ---------------------------------------------------------------------------
-- Negotiations open conversations; offers notify the other side.
-- ---------------------------------------------------------------------------
set local role authenticated;

select tests.login('a7000000-0000-4000-8000-000000000001');
insert into tests.vals select 'load1', public.create_load(tests.payload());
select public.publish_load(tests.val('load1'));

select tests.login('a7000000-0000-4000-8000-000000000004');
insert into tests.vals select 'offerA', public.make_offer(tests.val('load1'), 3400000);
select tests.login('a7000000-0000-4000-8000-000000000005');
insert into tests.vals select 'offerB', public.make_offer(tests.val('load1'), 3300000);

reset role;
insert into tests.vals
select 'convA', tests.conversation_of(o.negotiation_id) from public.offers o where o.id = tests.val('offerA');
insert into tests.vals
select 'convB', tests.conversation_of(o.negotiation_id) from public.offers o where o.id = tests.val('offerB');

select results_eq(
  $$ select c.kind::text, c.load_id, c.shipper_company_id, c.carrier_company_id
     from public.conversations c where c.id = tests.val('convA') $$,
  $$ values ('negotiation', tests.val('load1'), 'c7000000-0000-4000-8000-000000000001'::uuid,
             'c7000000-0000-4000-8000-000000000003'::uuid) $$,
  'make_offer opens a conversation for the negotiation with its two companies'
);
select is(
  (select count(*) from public.conversations where load_id = tests.val('load1')), 2::bigint,
  'one conversation per negotiation'
);
select is(
  tests.notified('a7000000-0000-4000-8000-000000000001', 'offer_received',
                 jsonb_build_object('offerId', tests.val('offerA'), 'amountCents', 3400000,
                                    'originCity', 'Monterrey', 'destinationCity', 'Guadalajara')),
  1::bigint, 'a new offer notifies the shipper, with the amount and the route'
);
select is(
  tests.notified('a7000000-0000-4000-8000-000000000002', 'offer_received',
                 jsonb_build_object('offerId', tests.val('offerA'))),
  1::bigint, 'and every shipper of the company'
);
select is(
  (select count(*) from public.notifications where user_id in (
    'a7000000-0000-4000-8000-000000000003', 'a7000000-0000-4000-8000-000000000004',
    'a7000000-0000-4000-8000-000000000005')),
  0::bigint, 'nobody else is notified (neither the author nor another company)'
);

-- ---------------------------------------------------------------------------
-- Conversation visibility matrix
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000001');
select is((select count(*) from public.conversations where load_id = tests.val('load1')), 2::bigint,
  'the shipper sees the conversations of both negotiations');
select tests.login('a7000000-0000-4000-8000-000000000004');
select is((select array_agg(id) from public.conversations), array[tests.val('convA')],
  'carrier A sees only its negotiation''s conversation');
select tests.login('a7000000-0000-4000-8000-000000000005');
select is((select array_agg(id) from public.conversations), array[tests.val('convB')],
  'carrier B sees only its negotiation''s conversation');
select tests.login('a7000000-0000-4000-8000-000000000003');
select is((select count(*) from public.conversations), 0::bigint, 'another shipper sees no conversation');
select tests.login('a7000000-0000-4000-8000-000000000006');
select is((select count(*) from public.conversations), 0::bigint, 'an operator does not see negotiations');
select tests.login('a7000000-0000-4000-8000-000000000008');
select is((select count(*) from public.conversations where load_id = tests.val('load1')), 2::bigint,
  'admins see every conversation');

-- ---------------------------------------------------------------------------
-- send_message
-- ---------------------------------------------------------------------------
select tests.login('a7000000-0000-4000-8000-000000000004');
insert into tests.vals
select 'msg1', public.send_message(tests.val('convA'), '  ¿Pueden cargar a las 8?  ', '[]',
                                   'f7000000-0000-4000-8000-000000000001');
select results_eq(
  $$ select sender_id, sender_role::text, body, attachments from public.messages where id = tests.val('msg1') $$,
  $$ values ('a7000000-0000-4000-8000-000000000004'::uuid, 'carrier', '¿Pueden cargar a las 8?', '[]'::jsonb) $$,
  'a participant sends a message (trimmed, with sender and role)'
);
select is(
  public.send_message(tests.val('convA'), 'otro texto', '[]', 'f7000000-0000-4000-8000-000000000001'),
  tests.val('msg1'), 'send_message is idempotent on the client message id'
);
select tests.login('a7000000-0000-4000-8000-000000000002');
select lives_ok(
  $$ select public.send_message(tests.val('convA'), 'Sí, a las 8.') $$,
  'another shipper of the company writes in the conversation'
);

select tests.login('a7000000-0000-4000-8000-000000000005');
select throws_ok($$ select public.send_message(tests.val('convA'), 'hola') $$, '42501', null,
  'another carrier cannot write in a negotiation that is not its own');
select tests.login('a7000000-0000-4000-8000-000000000003');
select throws_ok($$ select public.send_message(tests.val('convA'), 'hola') $$, '42501', null,
  'another shipper cannot write in it');
select tests.login('a7000000-0000-4000-8000-000000000006');
select throws_ok($$ select public.send_message(tests.val('convA'), 'hola') $$, '42501', null,
  'an operator cannot write in a negotiation');
select tests.login('a7000000-0000-4000-8000-000000000008');
select throws_ok($$ select public.send_message(tests.val('convA'), 'hola') $$, '42501', null,
  'admins read but do not write');

select tests.login('a7000000-0000-4000-8000-000000000004');
select throws_ok($$ select public.send_message(tests.val('convA'), '   ') $$, '22023', null,
  'a message needs text or an attachment');
select throws_ok($$ select public.send_message(tests.val('convA'), repeat('a', 4001)) $$, '22023', null,
  'a message has at most 4000 characters');
select throws_ok(
  $$ insert into public.messages (conversation_id, sender_id, sender_role, body)
     values (tests.val('convA'), 'a7000000-0000-4000-8000-000000000004', 'carrier', 'directo') $$,
  '42501', null, 'clients cannot insert messages directly'
);

-- Visibility of messages
select is(tests.visible_messages(tests.val('convA')), 2::bigint, 'carrier A reads its conversation');
select tests.login('a7000000-0000-4000-8000-000000000001');
select is(tests.visible_messages(tests.val('convA')), 2::bigint, 'the shipper reads it');
select tests.login('a7000000-0000-4000-8000-000000000008');
select is(tests.visible_messages(tests.val('convA')), 2::bigint, 'admins read it');
select tests.login('a7000000-0000-4000-8000-000000000005');
select is(tests.visible_messages(tests.val('convA')), 0::bigint, 'another carrier does not read it');
select tests.login('a7000000-0000-4000-8000-000000000003');
select is(tests.visible_messages(tests.val('convA')), 0::bigint, 'another shipper does not read it');
select tests.login('a7000000-0000-4000-8000-000000000006');
select is(tests.visible_messages(tests.val('convA')), 0::bigint, 'an operator does not read it');

-- ---------------------------------------------------------------------------
-- Messages are immutable
-- ---------------------------------------------------------------------------
select tests.login('a7000000-0000-4000-8000-000000000004');
select throws_ok($$ update public.messages set body = 'editado' where id = tests.val('msg1') $$, '42501', null,
  'the sender cannot edit a message');
select throws_ok($$ delete from public.messages where id = tests.val('msg1') $$, '42501', null,
  'the sender cannot delete a message');
reset role;
select throws_ok($$ update public.messages set body = 'editado' where id = tests.val('msg1') $$, '42501', null,
  'not even the table owner can edit a message');
select throws_ok($$ delete from public.messages where id = tests.val('msg1') $$, '42501', null,
  'nor delete it');
select throws_ok($$ truncate public.messages cascade $$, '42501', null, 'nor truncate messages');
select is((select body from public.messages where id = tests.val('msg1')), '¿Pueden cargar a las 8?',
  'the message is unchanged');

-- ---------------------------------------------------------------------------
-- Attachments (bucket `chat`)
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000004');
select lives_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, owner_id, metadata)
       values ('chat', '%s/b7000000-0000-4000-8000-000000000001.pdf', 'a7000000-0000-4000-8000-000000000004',
               '{"mimetype": "application/pdf", "size": 4096}') $$,
    tests.val('convA')
  ),
  'a participant uploads a file to its conversation folder'
);
select throws_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, owner_id)
       values ('chat', '%s/b7000000-0000-4000-8000-000000000002.pdf', 'a7000000-0000-4000-8000-000000000004') $$,
    tests.val('convB')
  ),
  '42501', null, 'a carrier cannot upload to another negotiation''s folder'
);
select throws_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, owner_id)
       values ('chat', '%s/notas.txt', 'a7000000-0000-4000-8000-000000000004') $$,
    tests.val('convA')
  ),
  '42501', null, 'attachment paths are {conversation}/{uuid}.{allowed extension}'
);
insert into tests.vals select 'msg2', public.send_message(
  tests.val('convA'), null,
  jsonb_build_array(jsonb_build_object('path', tests.val('convA') || '/b7000000-0000-4000-8000-000000000001.pdf',
                                       'name', 'Carta porte.pdf'))
);
select is(
  (select attachments from public.messages where id = tests.val('msg2')),
  jsonb_build_array(jsonb_build_object(
    'path', tests.val('convA') || '/b7000000-0000-4000-8000-000000000001.pdf', 'name', 'Carta porte.pdf',
    'mimeType', 'application/pdf', 'sizeBytes', 4096)),
  'a message carries the uploaded file with its name, type and size'
);
select throws_ok(
  format($$ select public.send_message(%L, null, '[{"path": "%s/b7000000-0000-4000-8000-000000000009.pdf"}]') $$,
         tests.val('convA'), tests.val('convA')),
  '22023', null, 'the attached file must have been uploaded'
);
select throws_ok(
  format($$ select public.send_message(%L, null, '[{"path": "%s/b7000000-0000-4000-8000-000000000001.pdf"}]') $$,
         tests.val('convA'), tests.val('convB')),
  '22023', null, 'attachments must be in the folder of the conversation'
);
select throws_ok(
  $$ select public.send_message(tests.val('convA'), 'x', '[{}, {}, {}, {}, {}, {}]') $$, '22023', null,
  'at most 5 attachments'
);
select tests.login('a7000000-0000-4000-8000-000000000001');
select throws_ok(
  format($$ select public.send_message(%L, null, '[{"path": "%s/b7000000-0000-4000-8000-000000000001.pdf"}]') $$,
         tests.val('convA'), tests.val('convA')),
  '22023', null, 'only the uploader can attach a file'
);
select is((select count(*) from storage.objects where bucket_id = 'chat'), 1::bigint,
  'the shipper can read the attachment');
select tests.login('a7000000-0000-4000-8000-000000000005');
select is((select count(*) from storage.objects where bucket_id = 'chat'), 0::bigint,
  'another carrier cannot read the attachment');
select tests.login('a7000000-0000-4000-8000-000000000004');
with changed as (
  update storage.objects set metadata = '{}' where bucket_id = 'chat' returning 1
)
select is((select count(*) from changed), 0::bigint, 'attachments cannot be overwritten');

-- ---------------------------------------------------------------------------
-- Read markers
-- ---------------------------------------------------------------------------
select tests.login('a7000000-0000-4000-8000-000000000001');
select public.mark_conversation_read(tests.val('convA'), tests.val('msg1'));
select is(
  (select last_read_at from public.message_reads
   where conversation_id = tests.val('convA') and user_id = 'a7000000-0000-4000-8000-000000000001'),
  (select created_at from public.messages where id = tests.val('msg1')),
  'the shipper reads up to a message'
);
select public.mark_conversation_read(tests.val('convA'));
select is(
  (select last_read_at from public.message_reads
   where conversation_id = tests.val('convA') and user_id = 'a7000000-0000-4000-8000-000000000001'),
  (select max(created_at) from public.messages where conversation_id = tests.val('convA')),
  'or up to the latest message'
);
select throws_ok(
  $$ select public.mark_conversation_read(tests.val('convA'), gen_random_uuid()) $$, '22023', null,
  'the message must belong to the conversation'
);
select throws_ok(
  $$ update public.message_reads set last_read_at = now() + interval '1 year' $$, '42501', null,
  'clients cannot write read markers directly'
);
select tests.login('a7000000-0000-4000-8000-000000000004');
select is(
  (select count(*) from public.message_reads where conversation_id = tests.val('convA')), 1::bigint,
  'the other participant sees the read receipt'
);
select tests.login('a7000000-0000-4000-8000-000000000005');
select is((select count(*) from public.message_reads), 0::bigint, 'another carrier sees no read marker');
select throws_ok($$ select public.mark_conversation_read(tests.val('convA')) $$, '42501', null,
  'and cannot mark a conversation that is not its own');

-- ---------------------------------------------------------------------------
-- Counteroffer and acceptance: notifications and the trip conversation
-- ---------------------------------------------------------------------------
select tests.login('a7000000-0000-4000-8000-000000000001');
insert into tests.vals select 'counterS', public.counter_offer(tests.val('offerA'), 3450000);
reset role;
select is(
  tests.notified('a7000000-0000-4000-8000-000000000004', 'counter_offer_received',
                 jsonb_build_object('offerId', tests.val('counterS'), 'amountCents', 3450000, 'side', 'shipper')),
  1::bigint, 'a counteroffer of the shipper notifies the carrier'
);
select is(tests.notified('a7000000-0000-4000-8000-000000000002', 'counter_offer_received'), 0::bigint,
  'the shipper''s own company is not notified of its counteroffer');

set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000004');
insert into tests.vals select 'trip1', public.accept_offer(tests.val('counterS'));
reset role;
insert into tests.vals select 'convTrip', tests.conversation_of(tests.val('trip1'));
select is(
  tests.notified('a7000000-0000-4000-8000-000000000001', 'offer_accepted',
                 jsonb_build_object('offerId', tests.val('counterS'))),
  1::bigint, 'the acceptance notifies the side that made the offer'
);
select is(tests.notified('a7000000-0000-4000-8000-000000000002', 'offer_accepted'), 1::bigint,
  'every shipper of that company');
select is(tests.notified('a7000000-0000-4000-8000-000000000004', 'offer_accepted'), 0::bigint,
  'not the user who accepted');
select results_eq(
  $$ select kind::text, load_id, shipper_company_id, carrier_company_id from public.conversations
     where id = tests.val('convTrip') $$,
  $$ values ('trip', tests.val('load1'), 'c7000000-0000-4000-8000-000000000001'::uuid,
             'c7000000-0000-4000-8000-000000000003'::uuid) $$,
  'accept_offer opens the conversation of the trip'
);
select is(
  (select count(*) from public.notifications where type = 'trip_status_changed'
     and id not in (select id from tests.preexisting_notifications)), 0::bigint,
  'the creation of the trip is not a status notification (the acceptance covers it)'
);

-- ---------------------------------------------------------------------------
-- Trip conversation: the assigned operator joins it.
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000006');
select is((select count(*) from public.conversations), 0::bigint,
  'an operator does not see the trip conversation before the assignment');
select throws_ok($$ select public.send_message(tests.val('convTrip'), 'hola') $$, '42501', null,
  'nor writes in it');

select tests.login('a7000000-0000-4000-8000-000000000004');
select public.assign_trip(tests.val('trip1'), 'e7000000-0000-4000-8000-000000000003',
                          'd7000000-0000-4000-8000-000000000006');
reset role;
select is(
  tests.notified('a7000000-0000-4000-8000-000000000006', 'trip_assigned',
                 jsonb_build_object('tripId', tests.val('trip1'), 'status', 'assigned', 'originCity', 'Monterrey')),
  1::bigint, 'the assignment notifies the operator'
);
select is(
  tests.notified('a7000000-0000-4000-8000-000000000001', 'trip_status_changed',
                 jsonb_build_object('tripId', tests.val('trip1'), 'eventType', 'assigned')),
  1::bigint, 'and the shipper, as a status change'
);
select is(tests.notified('a7000000-0000-4000-8000-000000000004', 'trip_status_changed'), 0::bigint,
  'not the carrier who assigned it');
select is(tests.notified('a7000000-0000-4000-8000-000000000007', 'trip_assigned'), 0::bigint,
  'nor another operator');

set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000006');
select is((select array_agg(id) from public.conversations), array[tests.val('convTrip')],
  'the assigned operator sees only the trip conversation');
select lives_ok($$ select public.send_message(tests.val('convTrip'), 'Voy en camino.') $$,
  'and writes in it');
select tests.login('a7000000-0000-4000-8000-000000000007');
select is((select count(*) from public.conversations), 0::bigint, 'another operator does not see it');
select throws_ok($$ select public.send_message(tests.val('convTrip'), 'hola') $$, '42501', null,
  'nor writes in it');
select tests.login('a7000000-0000-4000-8000-000000000005');
select is((select count(*) from public.conversations where id = tests.val('convTrip')), 0::bigint,
  'the losing carrier does not see the trip conversation');
select tests.login('a7000000-0000-4000-8000-000000000001');
select is(tests.visible_messages(tests.val('convTrip')), 1::bigint, 'the shipper reads the trip conversation');

select tests.login('a7000000-0000-4000-8000-000000000006');
select public.record_trip_event(tests.val('trip1'), 'departed', now(), 25.6866, -100.3161);
reset role;
select is(
  tests.notified('a7000000-0000-4000-8000-000000000001', 'trip_status_changed',
                 jsonb_build_object('eventType', 'departed', 'status', 'en_route_to_pickup')),
  1::bigint, 'a status event of the operator notifies the shipper'
);
select is(
  tests.notified('a7000000-0000-4000-8000-000000000004', 'trip_status_changed',
                 jsonb_build_object('eventType', 'departed')),
  1::bigint, 'and the carrier'
);
select is(tests.notified('a7000000-0000-4000-8000-000000000006', 'trip_status_changed'), 0::bigint,
  'not the operator who recorded it');

-- ---------------------------------------------------------------------------
-- Notifications: own only; read state through the RPC.
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000001');
select is(
  (select count(*) from public.notifications where user_id <> 'a7000000-0000-4000-8000-000000000001'), 0::bigint,
  'a user sees only their own notifications'
);
select is((select count(*) from public.notifications), 5::bigint,
  'the shipper has its offer, acceptance and trip notifications');
select throws_ok($$ update public.notifications set read_at = now() $$, '42501', null,
  'clients cannot update notifications directly');
select throws_ok($$ delete from public.notifications $$, '42501', null,
  'nor delete them');
insert into tests.vals
select 'notif1', id from public.notifications
where type = 'offer_received' and data ->> 'offerId' = tests.val('offerA')::text;
select is(public.mark_notifications_read(array[tests.val('notif1')]), 1, 'marks the given notifications as read');
select is(public.mark_notifications_read(), 4, 'or all of them');
select is(public.mark_notifications_read(), 0, 'already read ones are not counted again');
select tests.login('a7000000-0000-4000-8000-000000000002');
select is(public.mark_notifications_read(array[tests.val('notif1')]), 0,
  'nobody marks someone else''s notification');
select is((select count(*) from public.notifications where read_at is not null), 0::bigint,
  'the colleague''s notifications stay unread');
select tests.login('a7000000-0000-4000-8000-000000000008');
select is((select count(*) from public.notifications), 0::bigint, 'admins do not read other users'' notifications');

-- ---------------------------------------------------------------------------
-- Documents: the review notifies the owner company.
-- ---------------------------------------------------------------------------
reset role;
insert into tests.vals values ('doc1', 'b7000000-0000-4000-8000-0000000000d1');
insert into public.documents (id, company_id, requirement_id, owner_type, owner_id, storage_path)
select tests.val('doc1'), 'c7000000-0000-4000-8000-000000000001', r.id, 'company',
       'c7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000001/doc1.pdf'
from public.document_requirements r where r.code = 'proof_of_address';
set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000008');
select public.review_document(tests.val('doc1'), 'reject', 'El comprobante es ilegible.');
reset role;
select is(
  tests.notified('a7000000-0000-4000-8000-000000000001', 'document_rejected',
                 jsonb_build_object('documentId', tests.val('doc1'), 'requirementName', 'Comprobante de domicilio',
                                    'reviewNotes', 'El comprobante es ilegible.')),
  1::bigint, 'a rejected document notifies its company with the reason'
);
select is(tests.notified('a7000000-0000-4000-8000-000000000002', 'document_rejected'), 1::bigint,
  'every shipper of the company');
select is(
  (select count(*) from public.notifications where type in ('document_rejected', 'document_approved')
     and user_id not in ('a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000002')
     and id not in (select id from tests.preexisting_notifications)),
  0::bigint, 'no other company is notified'
);

insert into tests.vals values ('doc2', 'b7000000-0000-4000-8000-0000000000d2');
insert into public.documents (id, company_id, requirement_id, owner_type, owner_id, storage_path)
select tests.val('doc2'), 'c7000000-0000-4000-8000-000000000003', r.id, 'company',
       'c7000000-0000-4000-8000-000000000003', 'c7000000-0000-4000-8000-000000000003/doc2.pdf'
from public.document_requirements r where r.code = 'proof_of_address';
set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000008');
select public.review_document(tests.val('doc2'), 'approve');
reset role;
select is(
  tests.notified('a7000000-0000-4000-8000-000000000004', 'document_approved',
                 jsonb_build_object('documentId', tests.val('doc2'))),
  1::bigint, 'an approved document notifies the carriers of the company'
);
select is(tests.notified('a7000000-0000-4000-8000-000000000006', 'document_approved'), 0::bigint,
  'operators do not manage company documents');

-- ---------------------------------------------------------------------------
-- Push tokens
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000006');
select lives_ok($$ select public.register_push_token('ExponentPushToken[abcdefgh1234]', 'android') $$,
  'a user registers the push token of their device');
select lives_ok($$ select public.register_push_token('ExponentPushToken[abcdefgh1234]', 'android') $$,
  'registering it again is harmless');
select is((select count(*) from public.push_tokens), 1::bigint, 'one row per token');
select throws_ok($$ select public.register_push_token('not-a-token', 'ios') $$, '22023', null,
  'only Expo push tokens are accepted');
select tests.login('a7000000-0000-4000-8000-000000000007');
select is((select count(*) from public.push_tokens), 0::bigint, 'a user does not see other users'' tokens');
select throws_ok(
  $$ insert into public.push_tokens (user_id, token, platform)
     values ('a7000000-0000-4000-8000-000000000007', 'ExponentPushToken[zzzzzzzz0000]', 'ios') $$,
  '42501', null, 'clients cannot insert tokens directly'
);
select public.unregister_push_token('ExponentPushToken[abcdefgh1234]');
select public.register_push_token('ExponentPushToken[abcdefgh1234]', 'ios');
select is((select user_id from public.push_tokens), 'a7000000-0000-4000-8000-000000000007'::uuid,
  'a token moves to the last user who signs in on the device (unregister of another user''s token is a no-op)');
select tests.login('a7000000-0000-4000-8000-000000000006');
select is((select count(*) from public.push_tokens), 0::bigint, 'the previous user no longer has it');
select public.register_push_token(format('ExponentPushToken[device%s0000]', i), 'android') from generate_series(1, 11) i;
select is((select count(*) from public.push_tokens), 10::bigint, 'each user keeps at most 10 devices');
select public.unregister_push_token('ExponentPushToken[device110000]');
select is((select count(*) from public.push_tokens), 9::bigint, 'a user unregisters their token on sign-out');

select * from finish();
rollback;
