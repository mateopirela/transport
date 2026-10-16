-- F6 · Deleting an account that sent chat messages (D18):
--   * the account can be deleted; its messages stay for the counterpart and
--     for disputes, anonymized (sender_id null) and otherwise unchanged;
--   * messages stay immutable: only that erasure gets through the trigger;
--   * participants keep seeing the anonymized messages, and they count as
--     unread for the shipper (load_negotiation_carriers);
--   * Realtime publishes the erasure (an UPDATE with every column), so open
--     chats show it live (F13);
--   * no foreign key blocks deleting an account: every one that reaches
--     auth.users, directly or through a row deleted with it, is
--     SET NULL or CASCADE.
begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated;

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

-- Messages of the conversation, without the sender (bypassing RLS).
create function tests.messages_without_sender()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(m) - 'sender_id' order by m.created_at), '[]'::jsonb)
  from public.messages m
  where m.conversation_id = (select v.id from tests.vals v where v.name = 'conv');
$$;

create table tests.snapshot (name text primary key, data jsonb);

grant execute on all functions in schema tests to authenticated;

-- Users: ...01 shipper S1 and ...02 shipper S2 (company S)
--        ...03 carrier A1 and ...04 carrier A2 (company A)
select tests.new_user('af600000-0000-4000-8000-000000000001', 'sara@f6.test', 'shipper');
select tests.new_user('af600000-0000-4000-8000-000000000002', 'sofia@f6.test', 'shipper');
select tests.new_user('af600000-0000-4000-8000-000000000003', 'ana@f6.test', 'carrier');
select tests.new_user('af600000-0000-4000-8000-000000000004', 'alma@f6.test', 'carrier');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('cf600000-0000-4000-8000-000000000001', 'shipper', 'Envíos Sigma SA de CV', 'ESI030303EF3', 'approved'),
  ('cf600000-0000-4000-8000-000000000002', 'carrier', 'Fletes Alfa SA de CV', 'FAL010101AB1', 'approved');
update public.profiles set company_id = 'cf600000-0000-4000-8000-000000000001'
where id in ('af600000-0000-4000-8000-000000000001', 'af600000-0000-4000-8000-000000000002');
update public.profiles set company_id = 'cf600000-0000-4000-8000-000000000002'
where id in ('af600000-0000-4000-8000-000000000003', 'af600000-0000-4000-8000-000000000004');

-- ---------------------------------------------------------------------------
-- A negotiation and its chat: S1 writes twice, A1 twice, A2 once.
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('af600000-0000-4000-8000-000000000001');
insert into tests.vals select 'load', public.create_load(tests.payload());
select public.publish_load(tests.val('load'));
select tests.login('af600000-0000-4000-8000-000000000003');
insert into tests.vals select 'offer', public.make_offer(tests.val('load'), 3400000);
insert into tests.vals
select 'conv', c.id from public.conversations c
join public.offers o on o.negotiation_id = c.negotiation_id
where o.id = tests.val('offer');

select tests.login('af600000-0000-4000-8000-000000000001');
select public.send_message(tests.val('conv'), '¿Pueden cargar a las 8?', '[]', 'bf600000-0000-4000-8000-000000000001');
select tests.login('af600000-0000-4000-8000-000000000003');
select public.send_message(tests.val('conv'), 'Sí, a las 8.');
select tests.login('af600000-0000-4000-8000-000000000001');
select public.send_message(tests.val('conv'), 'Perfecto, gracias.');
select tests.login('af600000-0000-4000-8000-000000000003');
select public.send_message(tests.val('conv'), 'Llevamos caja seca.', '[]', 'bf600000-0000-4000-8000-000000000003');
select tests.login('af600000-0000-4000-8000-000000000004');
select public.send_message(tests.val('conv'), 'Les confirmo la placa mañana.');
reset role;

insert into tests.snapshot values ('before', tests.messages_without_sender());

-- ---------------------------------------------------------------------------
-- Deleting S1 anonymizes their messages and changes nothing else
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ delete from auth.users where id = 'af600000-0000-4000-8000-000000000001' $$,
  'the account of a shipper who sent messages can be deleted'
);
select is(
  (select count(*) from public.messages
   where conversation_id = tests.val('conv') and sender_id is null),
  2::bigint,
  'their two messages stay, without a sender'
);
select is(
  (select count(*) from public.messages where sender_id = 'af600000-0000-4000-8000-000000000001'),
  0::bigint,
  'the deleted user is no longer the sender of any message'
);
select is(
  tests.messages_without_sender(),
  (select data from tests.snapshot where name = 'before'),
  'every message is unchanged except for the erased sender (role, body, key, time)'
);

-- ---------------------------------------------------------------------------
-- Messages stay immutable: only the erasure of the sender gets through
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update public.messages set body = 'editado'
     where conversation_id = tests.val('conv') and sender_id is null $$,
  '42501', 'messages is immutable',
  'an anonymized message cannot be edited'
);
select throws_ok(
  $$ update public.messages set sender_id = 'af600000-0000-4000-8000-000000000002'
     where conversation_id = tests.val('conv') and sender_id is null $$,
  '42501', 'messages is immutable',
  'an anonymized message cannot be given another sender'
);
select throws_ok(
  $$ update public.messages set sender_id = null, body = 'editado'
     where sender_id = 'af600000-0000-4000-8000-000000000003' $$,
  '42501', 'messages is immutable',
  'erasing the sender does not let other changes through'
);
select throws_ok(
  $$ delete from public.messages where conversation_id = tests.val('conv') and sender_id is null $$,
  '42501', 'messages is immutable',
  'an anonymized message cannot be deleted'
);

-- ---------------------------------------------------------------------------
-- Participants keep seeing them; the shipper counts them as unread
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('af600000-0000-4000-8000-000000000002');
select is(
  (select count(*) from public.messages where conversation_id = tests.val('conv') and sender_id is null),
  2::bigint,
  'a colleague of the deleted shipper still sees the anonymized messages'
);
select tests.login('af600000-0000-4000-8000-000000000004');
select results_eq(
  $$ select sender_role::text, body from public.messages
     where conversation_id = tests.val('conv') and sender_id is null order by created_at $$,
  $$ values ('shipper', '¿Pueden cargar a las 8?'), ('shipper', 'Perfecto, gracias.') $$,
  'the counterpart still reads them, with the role of who sent them'
);
reset role;

select lives_ok(
  $$ delete from auth.users where id = 'af600000-0000-4000-8000-000000000003' $$,
  'the account of a carrier who sent messages can be deleted'
);

set local role authenticated;
select tests.login('af600000-0000-4000-8000-000000000002');
select is(
  (select unread_messages from public.load_negotiation_carriers(tests.val('load'))),
  5::bigint,
  'messages without a sender count as unread for the shipper'
);
reset role;

-- ---------------------------------------------------------------------------
-- F13: open chats get the erasure live. Realtime sends what the publication
-- publishes, filtered by messages_select (which does not look at sender_id).
-- ---------------------------------------------------------------------------
select ok(
  (select pubupdate from pg_catalog.pg_publication where pubname = 'supabase_realtime'),
  'the Realtime publication publishes updates (the erasure of a sender)'
);
select ok(
  (select array['id', 'conversation_id', 'sender_id', 'sender_role', 'body', 'attachments', 'created_at']::name[]
          <@ attnames
   from pg_catalog.pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'),
  'messages are published with every column the chats show and filter on'
);

-- ---------------------------------------------------------------------------
-- Inventory: every foreign key that reaches auth.users, directly or through a
-- table whose rows are deleted with the account (ON DELETE CASCADE), is
-- SET NULL or CASCADE. Exceptions, on purpose, go in the list below.
-- ---------------------------------------------------------------------------
select is_empty(
  $$
    with recursive erased (relid) as (
      select 'auth.users'::regclass::oid
      union
      select c.conrelid from pg_catalog.pg_constraint c join erased e on c.confrelid = e.relid
      where c.contype = 'f' and c.confdeltype = 'c'
    ),
    exceptions (table_name, constraint_name) as (
      -- (none: add a row with the reason when a restriction is intended)
      select null::text, null::text where false
    )
    select c.conrelid::regclass::text, c.conname, c.confdeltype::text
    from pg_catalog.pg_constraint c
    where c.contype = 'f'
      and c.confrelid in (select relid from erased)
      and c.confdeltype not in ('c', 'n')
      and (c.conrelid::regclass::text, c.conname::text) not in (select table_name, constraint_name from exceptions)
  $$,
  'no foreign key keeps an account from being deleted'
);

select * from finish();
rollback;
