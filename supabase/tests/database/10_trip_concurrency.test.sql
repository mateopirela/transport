-- Trips (B06) concurrency: two real sessions (dblink) race
--   1. assign_trip and archiving the operator it assigns, who is also the
--      fleet operator of the unit. Archiving locks the operator and then the
--      unit (operators_release_vehicles); assign_trip takes them in the same
--      order, so the two never deadlock: the assignment waits and then fails
--      because the operator is archived;
--   2. archiving an operator that waits for an assignment and then sees the
--      trip in progress.
--
-- The sessions need committed fixtures, so this file creates them through its
-- own connection and deletes them at the end (same approach as
-- 08_negotiation_concurrency.test.sql, with Supabase's default local
-- credentials).
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(7);

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
    -- The timeline is immutable; the guard is lifted only for this cleanup.
    alter table public.trip_events disable trigger trip_events_immutable;
    delete from public.trip_events
    where trip_id in (select id from public.trips where shipper_company_id = 'c5400000-0000-4000-8000-000000000001');
    alter table public.trip_events enable trigger trip_events_immutable;
    -- Conversations of the negotiations and trips (B07).
    delete from public.conversations where shipper_company_id = 'c5400000-0000-4000-8000-000000000001';
    delete from public.trips where shipper_company_id = 'c5400000-0000-4000-8000-000000000001';
    update public.loads
    set status = 'draft', accepted_offer_id = null, carrier_company_id = null, agreed_price_cents = null,
        contracted_at = null
    where shipper_company_id = 'c5400000-0000-4000-8000-000000000001';
    delete from public.offers where shipper_company_id = 'c5400000-0000-4000-8000-000000000001';
    delete from public.negotiations where shipper_company_id = 'c5400000-0000-4000-8000-000000000001';
    delete from public.loads where shipper_company_id = 'c5400000-0000-4000-8000-000000000001';
    delete from public.vehicle_availability where company_id = 'c5400000-0000-4000-8000-000000000002';
    delete from public.vehicles where company_id = 'c5400000-0000-4000-8000-000000000002';
    delete from public.operators where company_id = 'c5400000-0000-4000-8000-000000000002';
    delete from auth.users where id in (
      'a5400000-0000-4000-8000-000000000001', 'a5400000-0000-4000-8000-000000000002',
      'a5400000-0000-4000-8000-000000000003', 'a5400000-0000-4000-8000-000000000004'
    );
    delete from public.companies where id in (
      'c5400000-0000-4000-8000-000000000001', 'c5400000-0000-4000-8000-000000000002'
    );
  $sql$);
$$;

select tests.connect('setup');
select tests.connect('s1');
select tests.connect('s2');

select tests.cleanup();

-- Fixtures: shipper ...01 (company S), carrier ...02 (company A), operators
-- O (...03) and P (...04) of A with accounts. Unit V1 is driven by O in the
-- fleet, unit V2 by nobody. Loads L1 and L2 with a pending offer from A each.
select extensions.dblink_exec('setup', $sql$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
    ('a5400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'sara@ts.test', now(),
     '{"role":"shipper"}', now(), now()),
    ('a5400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ana@ta.test', now(),
     '{"role":"carrier"}', now(), now()),
    ('a5400000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'oscar@ta.test', now(),
     '{"role":"operator"}', now(), now()),
    ('a5400000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'pedro@ta.test', now(),
     '{"role":"operator"}', now(), now());
  insert into public.companies (id, type, legal_name, rfc, status) values
    ('c5400000-0000-4000-8000-000000000001', 'shipper', 'Trayecto Sigma SA de CV', 'TSI060606AA6', 'approved'),
    ('c5400000-0000-4000-8000-000000000002', 'carrier', 'Trayecto Alfa SA de CV', 'TAL060606AA6', 'approved');
  update public.profiles set company_id = 'c5400000-0000-4000-8000-000000000001'
  where id = 'a5400000-0000-4000-8000-000000000001';
  update public.profiles set company_id = 'c5400000-0000-4000-8000-000000000002'
  where id in ('a5400000-0000-4000-8000-000000000002', 'a5400000-0000-4000-8000-000000000003',
               'a5400000-0000-4000-8000-000000000004');

  insert into public.operators (id, company_id, profile_id, full_name) values
    ('d5400000-0000-4000-8000-000000000003', 'c5400000-0000-4000-8000-000000000002',
     'a5400000-0000-4000-8000-000000000003', 'Óscar Operador'),
    ('d5400000-0000-4000-8000-000000000004', 'c5400000-0000-4000-8000-000000000002',
     'a5400000-0000-4000-8000-000000000004', 'Pedro Operador');
  insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg, current_operator_id) values
    ('e5400000-0000-4000-8000-000000000001', 'c5400000-0000-4000-8000-000000000002', 'rigid', 'TCA1111', 'dry_van',
     30000, 'd5400000-0000-4000-8000-000000000003'),
    ('e5400000-0000-4000-8000-000000000002', 'c5400000-0000-4000-8000-000000000002', 'rigid', 'TCA2222', 'dry_van',
     30000, null);

  insert into public.loads (id, shipper_company_id, status,
    origin_address, origin_city, origin_state, origin_lat, origin_lng,
    destination_address, destination_city, destination_state, destination_lat, destination_lng,
    pickup_window_start, pickup_window_end, delivery_window_start, delivery_window_end,
    cargo_type, description, weight_kg, unit_type, proposed_price_cents, published_at)
  select l.id, 'c5400000-0000-4000-8000-000000000001', 'negotiating',
    'Centro', 'Monterrey', 'Nuevo León', 25.6866, -100.3161,
    'Centro', 'Guadalajara', 'Jalisco', 20.6597, -103.3496,
    now() + interval '1 day', now() + interval '2 days', now() + interval '2 days', now() + interval '3 days',
    'general', 'Carga de prueba', 1000, 'dry_van', 3000000, now()
  from (values
    ('f5400000-0000-4000-8000-000000000001'::uuid),
    ('f5400000-0000-4000-8000-000000000002'::uuid)) as l(id);
  insert into public.negotiations (id, load_id, shipper_company_id, carrier_company_id)
  select ('f5500000-0000-4000-8000-00000000000' || right(l.id::text, 1))::uuid, l.id,
         'c5400000-0000-4000-8000-000000000001', 'c5400000-0000-4000-8000-000000000002'
  from public.loads l where l.shipper_company_id = 'c5400000-0000-4000-8000-000000000001';
  insert into public.offers (id, negotiation_id, load_id, shipper_company_id, carrier_company_id, side, amount_cents)
  select ('f5600000-0000-4000-8000-00000000000' || right(n.load_id::text, 1))::uuid, n.id, n.load_id,
         n.shipper_company_id, n.carrier_company_id, 'carrier', 2900000
  from public.negotiations n where n.shipper_company_id = 'c5400000-0000-4000-8000-000000000001';
$sql$);

-- The shipper accepts both offers: two trips pending assignment.
select tests.begin_as('s1', 'a5400000-0000-4000-8000-000000000001');
create table tests.trips (name text primary key, id uuid not null);
insert into tests.trips
select 'trip1', trip_id::uuid from extensions.dblink('s1', $sql$
  select public.accept_offer('f5600000-0000-4000-8000-000000000001')::text
$sql$) as t(trip_id text);
insert into tests.trips
select 'trip2', trip_id::uuid from extensions.dblink('s1', $sql$
  select public.accept_offer('f5600000-0000-4000-8000-000000000002')::text
$sql$) as t(trip_id text);
select extensions.dblink_exec('s1', 'commit');

-- ---------------------------------------------------------------------------
-- 1. Archiving O (operator, then unit V1) against assigning trip 1 to O + V1.
-- s1 takes O's row lock first; s2's assign_trip waits for it without holding
-- V1; s1 then archives O, which also releases V1. No deadlock.
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a5400000-0000-4000-8000-000000000002');
select * from extensions.dblink('s1', $sql$
  select id::text from public.operators where id = 'd5400000-0000-4000-8000-000000000003' for no key update
$sql$) as t(id text);

select tests.begin_as('s2', 'a5400000-0000-4000-8000-000000000002');
select extensions.dblink_send_query('s2', format(
  'select public.assign_trip(%L, %L, %L)',
  (select id from tests.trips where name = 'trip1'),
  'e5400000-0000-4000-8000-000000000001', 'd5400000-0000-4000-8000-000000000003'
));
select ok(tests.wait_until_blocked('s2'), 'the assignment waits for the operator lock');

select lives_ok(
  $$ select extensions.dblink_exec('s1', $sql$
       update public.operators set archived_at = now() where id = 'd5400000-0000-4000-8000-000000000003'
     $sql$) $$,
  'archiving the operator (and releasing its unit) does not deadlock with the waiting assignment'
);
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(r text) $$,
  '22023', null,
  'the assignment then fails: the operator is archived'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'rollback');

select is(
  tests.peek(format($sql$ select status::text from public.trips where id = %L $sql$,
                    (select id from tests.trips where name = 'trip1'))),
  'pending_assignment',
  'trip 1 stays pending assignment'
);

-- ---------------------------------------------------------------------------
-- 2. Assigning trip 2 to P + V2, while archiving P waits for it.
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a5400000-0000-4000-8000-000000000002');
select * from extensions.dblink('s1', format(
  'select public.assign_trip(%L, %L, %L)',
  (select id from tests.trips where name = 'trip2'),
  'e5400000-0000-4000-8000-000000000002', 'd5400000-0000-4000-8000-000000000004'
)) as t(r text);

select tests.begin_as('s2', 'a5400000-0000-4000-8000-000000000002');
select extensions.dblink_send_query('s2', $sql$
  update public.operators set archived_at = now() where id = 'd5400000-0000-4000-8000-000000000004'
$sql$);
select ok(tests.wait_until_blocked('s2'), 'archiving the operator waits for the assignment');
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(r text) $$,
  '55000', 'cannot archive: it is assigned to a trip in progress',
  'archiving then fails: the operator has a trip in progress'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'rollback');

select is(
  tests.peek($sql$
    select (archived_at is null)::text from public.operators where id = 'd5400000-0000-4000-8000-000000000004'
  $sql$),
  'true',
  'the operator of the trip stays active'
);

select tests.cleanup();
select extensions.dblink_disconnect('s1');
select extensions.dblink_disconnect('s2');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
