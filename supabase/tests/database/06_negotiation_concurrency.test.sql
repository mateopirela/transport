-- Loads and negotiation (B05) concurrency: two real sessions (dblink) race
--   1. two acceptances of different offers on the same load;
--   2. an acceptance and a new offer on the same load;
--   3. an acceptance and a withdrawal of the same offer.
-- In every case the second call waits for the load lock and then fails with a
-- clear error (55000); a load never ends with two accepted offers.
--
-- The sessions need committed fixtures, so this file creates them through its
-- own connection and deletes them at the end (same approach as
-- 04_fleet_concurrency.test.sql, with Supabase's default local credentials).
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(13);

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

create function tests.cleanup()
returns void
language sql
as $$
  select extensions.dblink_exec('setup', $sql$
    update public.loads
    set status = 'draft', accepted_offer_id = null, carrier_company_id = null, agreed_price_cents = null,
        contracted_at = null
    where shipper_company_id = 'c5100000-0000-4000-8000-000000000001';
    delete from public.offers where shipper_company_id = 'c5100000-0000-4000-8000-000000000001';
    delete from public.negotiations where shipper_company_id = 'c5100000-0000-4000-8000-000000000001';
    delete from public.loads where shipper_company_id = 'c5100000-0000-4000-8000-000000000001';
    delete from auth.users where id in (
      'a5100000-0000-4000-8000-000000000001', 'a5100000-0000-4000-8000-000000000002',
      'a5100000-0000-4000-8000-000000000003'
    );
    delete from public.companies where id in (
      'c5100000-0000-4000-8000-000000000001', 'c5100000-0000-4000-8000-000000000002',
      'c5100000-0000-4000-8000-000000000003'
    );
  $sql$);
$$;

select tests.connect('setup');
select tests.connect('s1');
select tests.connect('s2');

select tests.cleanup();

-- Fixtures: shipper ...01 (company S), carriers ...02 (A) and ...03 (B), all
-- approved. Loads L1, L2, L3 negotiating, with pending offers:
--   L1: A1 (carrier A), B1 (carrier B)   L2: A2 (carrier A)   L3: A3 (carrier A)
select extensions.dblink_exec('setup', $sql$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
    ('a5100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'sara@cs.test', now(),
     '{"role":"shipper"}', now(), now()),
    ('a5100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ana@ca.test', now(),
     '{"role":"carrier"}', now(), now()),
    ('a5100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'beto@cb.test', now(),
     '{"role":"carrier"}', now(), now());
  insert into public.companies (id, type, legal_name, rfc, status) values
    ('c5100000-0000-4000-8000-000000000001', 'shipper', 'Carrera Sigma SA de CV', 'CSI050505AA5', 'approved'),
    ('c5100000-0000-4000-8000-000000000002', 'carrier', 'Carrera Alfa SA de CV', 'CAL050505AA5', 'approved'),
    ('c5100000-0000-4000-8000-000000000003', 'carrier', 'Carrera Beta SA de CV', 'CBE050505AA5', 'approved');
  update public.profiles set company_id = 'c5100000-0000-4000-8000-000000000001'
  where id = 'a5100000-0000-4000-8000-000000000001';
  update public.profiles set company_id = 'c5100000-0000-4000-8000-000000000002'
  where id = 'a5100000-0000-4000-8000-000000000002';
  update public.profiles set company_id = 'c5100000-0000-4000-8000-000000000003'
  where id = 'a5100000-0000-4000-8000-000000000003';

  insert into public.loads (id, shipper_company_id, status,
    origin_address, origin_city, origin_state, origin_lat, origin_lng,
    destination_address, destination_city, destination_state, destination_lat, destination_lng,
    pickup_window_start, pickup_window_end, delivery_window_start, delivery_window_end,
    cargo_type, description, weight_kg, unit_type, proposed_price_cents, published_at)
  select l.id, 'c5100000-0000-4000-8000-000000000001', 'negotiating',
    'Centro', 'Monterrey', 'Nuevo León', 25.6866, -100.3161,
    'Centro', 'Guadalajara', 'Jalisco', 20.6597, -103.3496,
    now() + interval '1 day', now() + interval '2 days', now() + interval '2 days', now() + interval '3 days',
    'general', 'Carga de prueba', 1000, 'dry_van', 3000000, now()
  from (values
    ('f5100000-0000-4000-8000-000000000001'::uuid),
    ('f5100000-0000-4000-8000-000000000002'::uuid),
    ('f5100000-0000-4000-8000-000000000003'::uuid)) as l(id);

  insert into public.negotiations (id, load_id, shipper_company_id, carrier_company_id) values
    ('f5200000-0000-4000-8000-0000000000a1', 'f5100000-0000-4000-8000-000000000001',
     'c5100000-0000-4000-8000-000000000001', 'c5100000-0000-4000-8000-000000000002'),
    ('f5200000-0000-4000-8000-0000000000b1', 'f5100000-0000-4000-8000-000000000001',
     'c5100000-0000-4000-8000-000000000001', 'c5100000-0000-4000-8000-000000000003'),
    ('f5200000-0000-4000-8000-0000000000a2', 'f5100000-0000-4000-8000-000000000002',
     'c5100000-0000-4000-8000-000000000001', 'c5100000-0000-4000-8000-000000000002'),
    ('f5200000-0000-4000-8000-0000000000a3', 'f5100000-0000-4000-8000-000000000003',
     'c5100000-0000-4000-8000-000000000001', 'c5100000-0000-4000-8000-000000000002');

  insert into public.offers (id, negotiation_id, load_id, shipper_company_id, carrier_company_id, side, amount_cents)
  select o.id, n.id, n.load_id, n.shipper_company_id, n.carrier_company_id, 'carrier', 2900000
  from (values
    ('f5300000-0000-4000-8000-0000000000a1'::uuid, 'f5200000-0000-4000-8000-0000000000a1'::uuid),
    ('f5300000-0000-4000-8000-0000000000b1', 'f5200000-0000-4000-8000-0000000000b1'),
    ('f5300000-0000-4000-8000-0000000000a2', 'f5200000-0000-4000-8000-0000000000a2'),
    ('f5300000-0000-4000-8000-0000000000a3', 'f5200000-0000-4000-8000-0000000000a3')
  ) as o(id, negotiation_id)
  join public.negotiations n on n.id = o.negotiation_id;
$sql$);

-- ---------------------------------------------------------------------------
-- 1. Two acceptances on the same load (different offers).
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a5100000-0000-4000-8000-000000000001');
select * from extensions.dblink('s1', $sql$
  select public.accept_offer('f5300000-0000-4000-8000-0000000000a1')::text
$sql$) as t(trip_id text);

select tests.begin_as('s2', 'a5100000-0000-4000-8000-000000000001');
select extensions.dblink_send_query('s2', $sql$
  select public.accept_offer('f5300000-0000-4000-8000-0000000000b1')::text
$sql$);

select ok(tests.wait_until_blocked('s2'), 'a second acceptance waits for the first one on the load lock');
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(trip_id text) $$,
  '55000', null,
  'once the first acceptance commits, the second fails cleanly'
);
select * from extensions.dblink_get_result('s2', false) as t(trip_id text);
select extensions.dblink_exec('s2', 'rollback');

select is(
  tests.peek($sql$
    select count(*)::text from public.offers
    where load_id = 'f5100000-0000-4000-8000-000000000001' and status = 'accepted'
  $sql$),
  '1',
  'the load has exactly one accepted offer'
);
select is(
  tests.peek($sql$
    select status::text || ' ' || carrier_company_id::text from public.loads
    where id = 'f5100000-0000-4000-8000-000000000001'
  $sql$),
  'contracted c5100000-0000-4000-8000-000000000002',
  'the load is contracted with the first accepted carrier'
);
select is(
  tests.peek($sql$ select status::text from public.offers where id = 'f5300000-0000-4000-8000-0000000000b1' $sql$),
  'rejected',
  'the competing offer ends rejected'
);

-- ---------------------------------------------------------------------------
-- 2. An acceptance and a new offer on the same load.
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a5100000-0000-4000-8000-000000000001');
select * from extensions.dblink('s1', $sql$
  select public.accept_offer('f5300000-0000-4000-8000-0000000000a2')::text
$sql$) as t(trip_id text);

-- Carrier B (no negotiation on L2) offers while the shipper accepts A2.
select tests.begin_as('s2', 'a5100000-0000-4000-8000-000000000003');
select extensions.dblink_send_query('s2', $sql$
  select public.make_offer('f5100000-0000-4000-8000-000000000002', 2800000)::text
$sql$);

select ok(tests.wait_until_blocked('s2'), 'a new offer waits for a concurrent acceptance');
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(offer_id text) $$,
  '42501', null,
  'then the new offer fails: the contracted load is no longer open to other carriers'
);
select * from extensions.dblink_get_result('s2', false) as t(offer_id text);
select extensions.dblink_exec('s2', 'rollback');

select is(
  tests.peek($sql$
    select count(*)::text from public.offers where load_id = 'f5100000-0000-4000-8000-000000000002'
  $sql$),
  '1',
  'no offer is left pending on a contracted load'
);

-- ---------------------------------------------------------------------------
-- 3. An acceptance racing the withdrawal of the same offer, in both orders.
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a5100000-0000-4000-8000-000000000002');
select * from extensions.dblink('s1', $sql$
  select public.withdraw_offer('f5300000-0000-4000-8000-0000000000a3')::text
$sql$) as t(status text);

select tests.begin_as('s2', 'a5100000-0000-4000-8000-000000000001');
select extensions.dblink_send_query('s2', $sql$
  select public.accept_offer('f5300000-0000-4000-8000-0000000000a3')::text
$sql$);

select ok(tests.wait_until_blocked('s2'), 'an acceptance waits for a concurrent withdrawal');
select extensions.dblink_exec('s1', 'rollback');
select lives_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(trip_id text) $$,
  'if the withdrawal rolls back, the acceptance goes through'
);
select * from extensions.dblink_get_result('s2', false) as t(trip_id text);

select tests.begin_as('s1', 'a5100000-0000-4000-8000-000000000002');
select extensions.dblink_send_query('s1', $sql$
  select public.withdraw_offer('f5300000-0000-4000-8000-0000000000a3')
$sql$);

select ok(tests.wait_until_blocked('s1'), 'a withdrawal waits for a concurrent acceptance');
select extensions.dblink_exec('s2', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s1') as t(status text) $$,
  '55000', null,
  'once the acceptance commits, the offer can no longer be withdrawn'
);
select * from extensions.dblink_get_result('s1', false) as t(status text);
select extensions.dblink_exec('s1', 'rollback');

select is(
  tests.peek($sql$ select status::text from public.offers where id = 'f5300000-0000-4000-8000-0000000000a3' $sql$),
  'accepted',
  'the offer stays accepted'
);

select tests.cleanup();
select extensions.dblink_disconnect('s1');
select extensions.dblink_disconnect('s2');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
