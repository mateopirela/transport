-- Chat and notifications (B07) concurrency: two real sessions (dblink) race
--   1. two send_message calls on the same conversation: the one that started
--      first but waited for the conversation lock gets the newer timestamp,
--      so a read marker taken in between never covers it;
--   2. two register_push_token calls of the same user: they serialize on the
--      user's profile row, so the 10-device limit holds.
--
-- The sessions need committed fixtures, so this file creates them through its
-- own connection and deletes them at the end (same approach as
-- 10_trip_concurrency.test.sql, with Supabase's default local credentials).
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(6);

create schema tests;

create function tests.conninfo()
returns text
language sql
as $$
  select format(
    'host=%s port=%s dbname=%s user=postgres password=postgres',
    host(inet_server_addr()), inet_server_port(), current_database()
  )
$$;

-- Opens a transaction in a session as the given user.
create function tests.begin_as(p_conn text, p_user uuid)
returns void
language sql
as $$
  select extensions.dblink_exec(p_conn, 'begin');
  select extensions.dblink_exec(p_conn, 'set local lock_timeout = ''15s''');
  select extensions.dblink_exec(p_conn, 'set local role authenticated');
  select extensions.dblink_exec(
    p_conn,
    format('set local request.jwt.claims = %L', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text)
  );
$$;

create table tests.pids (conn text primary key, pid integer not null);

create function tests.connect(p_conn text)
returns void
language sql
as $$
  select extensions.dblink_connect(p_conn, tests.conninfo());
  insert into tests.pids
  select p_conn, pid from extensions.dblink(p_conn, 'select pg_backend_pid()') as t(pid integer);
$$;

create function tests.wait_until_blocked(p_conn text)
returns boolean
language plpgsql
as $$
declare
  v_pid integer := (select pid from tests.pids where conn = p_conn);
begin
  for i in 1..200 loop
    if cardinality(pg_blocking_pids(v_pid)) > 0 then
      return true;
    end if;
    perform pg_sleep(0.05);
  end loop;
  return false;
end;
$$;

-- Runs a query on the setup connection and returns one text value.
create function tests.peek(p_sql text)
returns text
language sql
as $$ select v from extensions.dblink('setup', p_sql) as t(v text) $$;

-- Removes this file's committed fixtures (also leftovers of an aborted run).
create function tests.cleanup()
returns void
language sql
as $$
  select extensions.dblink_exec('setup', $sql$
    -- Messages are immutable; the guard is lifted only for this cleanup.
    alter table public.messages disable trigger messages_immutable;
    delete from public.messages
    where conversation_id in (
      select id from public.conversations where shipper_company_id = 'c7100000-0000-4000-8000-000000000001'
    );
    alter table public.messages enable trigger messages_immutable;
    delete from public.conversations where shipper_company_id = 'c7100000-0000-4000-8000-000000000001';
    delete from public.negotiations where shipper_company_id = 'c7100000-0000-4000-8000-000000000001';
    delete from public.loads where shipper_company_id = 'c7100000-0000-4000-8000-000000000001';
    delete from auth.users where id in ('a7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000002');
    delete from public.companies where id in (
      'c7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000002'
    );
  $sql$);
$$;

select tests.connect('setup');
select tests.connect('s1');
select tests.connect('s2');
select tests.cleanup();

-- Fixtures: shipper ...01 (company S), carrier ...02 (company A), a load of S
-- negotiated by A (its conversation is opened by the trigger), and 9 push
-- tokens of the shipper.
select extensions.dblink_exec('setup', $sql$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
    ('a7100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'sara@cs.test', now(),
     '{"role":"shipper"}', now(), now()),
    ('a7100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ana@ca.test', now(),
     '{"role":"carrier"}', now(), now());
  insert into public.companies (id, type, legal_name, rfc, status) values
    ('c7100000-0000-4000-8000-000000000001', 'shipper', 'Charla Sigma SA de CV', 'CSI070707AA7', 'approved'),
    ('c7100000-0000-4000-8000-000000000002', 'carrier', 'Charla Alfa SA de CV', 'CAL070707AA7', 'approved');
  update public.profiles set company_id = 'c7100000-0000-4000-8000-000000000001'
  where id = 'a7100000-0000-4000-8000-000000000001';
  update public.profiles set company_id = 'c7100000-0000-4000-8000-000000000002'
  where id = 'a7100000-0000-4000-8000-000000000002';

  insert into public.loads (id, shipper_company_id, status,
    origin_address, origin_city, origin_state, origin_lat, origin_lng,
    destination_address, destination_city, destination_state, destination_lat, destination_lng,
    pickup_window_start, pickup_window_end, delivery_window_start, delivery_window_end,
    cargo_type, description, weight_kg, unit_type, proposed_price_cents, published_at)
  values ('f7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'negotiating',
    'Centro', 'Monterrey', 'Nuevo León', 25.6866, -100.3161,
    'Centro', 'Guadalajara', 'Jalisco', 20.6597, -103.3496,
    now() + interval '1 day', now() + interval '2 days', now() + interval '2 days', now() + interval '3 days',
    'general', 'Carga de prueba', 1000, 'dry_van', 3000000, now());
  insert into public.negotiations (load_id, shipper_company_id, carrier_company_id)
  values ('f7100000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001',
          'c7100000-0000-4000-8000-000000000002');

  insert into public.push_tokens (user_id, token, platform, last_seen_at)
  select 'a7100000-0000-4000-8000-000000000001', format('ExponentPushToken[concurrent%s]', i), 'ios',
         now() - make_interval(mins => 20 - i)
  from generate_series(1, 9) i;
$sql$);

create table tests.ids (name text primary key, id uuid not null);
insert into tests.ids
select 'conversation', tests.peek($sql$
  select id::text from public.conversations where load_id = 'f7100000-0000-4000-8000-000000000001'
$sql$)::uuid;

-- ---------------------------------------------------------------------------
-- 1. s1 starts first, s2 sends and holds the conversation lock; s1's send
--    waits. s1's message must still be newer than s2's.
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a7100000-0000-4000-8000-000000000001');
select * from extensions.dblink('s1', 'select now()::text') as t(started text);
select pg_sleep(0.05);

select tests.begin_as('s2', 'a7100000-0000-4000-8000-000000000002');
insert into tests.ids
select 'second', id::uuid from extensions.dblink('s2', format(
  'select public.send_message(%L, %L)::text', (select id from tests.ids where name = 'conversation'), 'Ya cargamos.'
)) as t(id text);

select extensions.dblink_send_query('s1', format(
  'select public.send_message(%L, %L)::text', (select id from tests.ids where name = 'conversation'), '¿A qué hora?'
));
select ok(tests.wait_until_blocked('s1'), 'a send waits for the conversation lock');
select extensions.dblink_exec('s2', 'commit');
insert into tests.ids select 'first', id::uuid from extensions.dblink_get_result('s1') as t(id text);
select * from extensions.dblink_get_result('s1', false) as t(r text);
select extensions.dblink_exec('s1', 'commit');

select ok(
  tests.peek(format($sql$
    select (a.created_at > b.created_at)::text from public.messages a, public.messages b
    where a.id = %L and b.id = %L
  $sql$, (select id from tests.ids where name = 'first'), (select id from tests.ids where name = 'second')))::boolean,
  'the message that waited is stamped after the one it waited for'
);
select ok(
  tests.peek(format($sql$
    select (c.last_message_at = m.created_at)::text from public.conversations c, public.messages m
    where c.id = %L and m.id = %L
  $sql$, (select id from tests.ids where name = 'conversation'), (select id from tests.ids where name = 'first')))::boolean,
  'last_message_at is the timestamp of the latest message'
);

-- ---------------------------------------------------------------------------
-- 2. The shipper has 9 tokens; two devices register at the same time.
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a7100000-0000-4000-8000-000000000001');
select * from extensions.dblink('s1', $sql$
  select public.register_push_token('ExponentPushToken[concurrentX]', 'android')::text
$sql$) as t(r text);

select tests.begin_as('s2', 'a7100000-0000-4000-8000-000000000001');
select extensions.dblink_send_query('s2', $sql$
  select public.register_push_token('ExponentPushToken[concurrentY]', 'android')::text
$sql$);
select ok(tests.wait_until_blocked('s2'), 'a registration waits for the other one of the same user');
select extensions.dblink_exec('s1', 'commit');
select * from extensions.dblink_get_result('s2') as t(r text);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'commit');

select is(
  tests.peek($sql$
    select count(*)::text from public.push_tokens where user_id = 'a7100000-0000-4000-8000-000000000001'
  $sql$),
  '10',
  'the user keeps exactly 10 devices'
);
select is(
  tests.peek($sql$
    select count(*)::text from public.push_tokens
    where token in ('ExponentPushToken[concurrent1]', 'ExponentPushToken[concurrentX]', 'ExponentPushToken[concurrentY]')
  $sql$),
  '2',
  'the oldest device is the one dropped; both new ones stay'
);

select tests.cleanup();
select extensions.dblink_disconnect('s1');
select extensions.dblink_disconnect('s2');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
