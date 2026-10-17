-- Return trips (F2) concurrency: two real sessions (dblink) race on one unit.
--   1. The previous trip writes the unit's estimate (set_trip_vehicle_availability,
--      unit locked for update) while the shipper contracts the return trip
--      with that unit: the contract waits for the unit lock and then archives
--      the new estimate.
--   2. The other way round: the contract holds the unit, the estimate waits
--      and then sees the unit booked, so it writes nothing (active).
--   3. F5: the estimate is written while the return trip is cancelled: the
--      cancellation waits for the unit and then restores that estimate.
--   4. F5: two assignments swap the same two units: they serialize on the
--      units (locked in one order) instead of deadlocking.
--   5. F5: an estimate written while the unit sets off on its next trip:
--      the departure waits for the unit and then forgets that estimate.
--   6. F5: the same, with the estimate held back by the departing trip,
--      which the departure locks first: no deadlock.
--
-- The sessions need committed fixtures, so this file creates them through its
-- own connection and deletes them at the end (same approach as
-- 10_trip_concurrency.test.sql, with Supabase's default local credentials).
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(21);

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
    where trip_id in (select id from public.trips where shipper_company_id = 'c2f00000-0000-4000-8000-000000000001');
    alter table public.trip_events enable trigger trip_events_immutable;
    delete from public.conversations where shipper_company_id = 'c2f00000-0000-4000-8000-000000000001';
    delete from public.trips where shipper_company_id = 'c2f00000-0000-4000-8000-000000000001';
    update public.loads
    set status = 'draft', accepted_offer_id = null, carrier_company_id = null, agreed_price_cents = null,
        contracted_at = null
    where shipper_company_id = 'c2f00000-0000-4000-8000-000000000001';
    delete from public.offers where shipper_company_id = 'c2f00000-0000-4000-8000-000000000001';
    delete from public.negotiations where shipper_company_id = 'c2f00000-0000-4000-8000-000000000001';
    delete from public.loads where shipper_company_id = 'c2f00000-0000-4000-8000-000000000001';
    delete from public.vehicle_availability where company_id = 'c2f00000-0000-4000-8000-000000000002';
    delete from public.vehicles where company_id = 'c2f00000-0000-4000-8000-000000000002';
    delete from public.operators where company_id = 'c2f00000-0000-4000-8000-000000000002';
    delete from auth.users where id in (
      'a2f00000-0000-4000-8000-000000000001', 'a2f00000-0000-4000-8000-000000000002',
      'a2f00000-0000-4000-8000-000000000003'
    );
    delete from public.companies where id in ('c2f00000-0000-4000-8000-000000000001', 'c2f00000-0000-4000-8000-000000000002');
  $sql$);
$$;

create table tests.trips (name text primary key, id uuid not null);

-- Writes the estimate of trip 1 for its unit, as record_trip_event does.
create function tests.write_estimate_sql()
returns text
language sql
as $$
  select format($sql$
    do $do$ begin
      perform public.set_trip_vehicle_availability(t, now() + interval '1 hour')
      from public.trips t where t.id = %L;
    end $do$
  $sql$, (select id from tests.trips where name = 'trip1'))
$$;

-- An active estimate of V, as if trip 1 had just started unloading.
create function tests.seed_estimate()
returns void
language sql
as $$
  select extensions.dblink_exec('setup', $sql$
    insert into public.vehicle_availability (company_id, vehicle_id, available_from, location, city, state, source)
    values ('c2f00000-0000-4000-8000-000000000002', 'e2f00000-0000-4000-8000-000000000001', now() + interval '2 hours',
            'SRID=4326;POINT(-103.3496 20.6597)', 'Guadalajara', 'Jalisco', 'trip_estimate');
  $sql$);
$$;

create function tests.active_estimates()
returns integer
language sql
as $$
  select tests.peek($sql$
    select count(*)::text from public.vehicle_availability
    where vehicle_id = 'e2f00000-0000-4000-8000-000000000001' and archived_at is null
  $sql$)::integer
$$;

select tests.connect('setup');
select tests.connect('s1');
select tests.connect('s2');

select tests.cleanup();

-- Fixtures: shipper ...01 (company S), carrier ...02 (company A), operator O
-- (...03) of A, unit V. Load L1 with a plain offer (trip 1); loads L2 and L3
-- with offers that book V (the return trips).
select extensions.dblink_exec('setup', $sql$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
    ('a2f00000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'sara@rc.test', now(),
     '{"role":"shipper"}', now(), now()),
    ('a2f00000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ana@rc.test', now(),
     '{"role":"manager"}', now(), now()),
    ('a2f00000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'oscar@rc.test', now(),
     '{"role":"operator"}', now(), now());
  insert into public.companies (id, type, legal_name, rfc, status) values
    ('c2f00000-0000-4000-8000-000000000001', 'shipper', 'Regreso Sigma SA de CV', 'RSI070707AA7', 'approved'),
    ('c2f00000-0000-4000-8000-000000000002', 'carrier', 'Regreso Alfa SA de CV', 'RAL070707AA7', 'approved');
  update public.profiles set company_id = 'c2f00000-0000-4000-8000-000000000001' where id = 'a2f00000-0000-4000-8000-000000000001';
  update public.profiles set company_id = 'c2f00000-0000-4000-8000-000000000002'
  where id in ('a2f00000-0000-4000-8000-000000000002', 'a2f00000-0000-4000-8000-000000000003');

  insert into public.operators (id, company_id, profile_id, full_name) values
    ('d2f00000-0000-4000-8000-000000000003', 'c2f00000-0000-4000-8000-000000000002', 'a2f00000-0000-4000-8000-000000000003', 'Óscar Operador');
  -- D16 (G3): assign_trip needs a current license of a suitable type.
  update public.operators set license_type = 'E', license_expires_on = current_date + 365
  where license_type is null;
  insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
    ('e2f00000-0000-4000-8000-000000000001', 'c2f00000-0000-4000-8000-000000000002', 'rigid', 'RCA1111', 'dry_van', 30000),
    ('e2f00000-0000-4000-8000-000000000002', 'c2f00000-0000-4000-8000-000000000002', 'rigid', 'RCA2222', 'dry_van', 30000);

  insert into public.loads (id, shipper_company_id, status,
    origin_address, origin_city, origin_state, origin_lat, origin_lng,
    destination_address, destination_city, destination_state, destination_lat, destination_lng,
    pickup_window_start, pickup_window_end, delivery_window_start, delivery_window_end,
    cargo_type, description, weight_kg, unit_type, proposed_price_cents, published_at)
  select l.id, 'c2f00000-0000-4000-8000-000000000001', 'negotiating',
    'Centro', 'Monterrey', 'Nuevo León', 25.6866, -100.3161,
    'Centro', 'Guadalajara', 'Jalisco', 20.6597, -103.3496,
    now() + interval '1 day', now() + interval '2 days', now() + interval '2 days', now() + interval '3 days',
    'general', 'Carga de prueba', 1000, 'dry_van', 3000000, now()
  from (values
    ('f2f00000-0000-4000-8000-000000000001'::uuid),
    ('f2f00000-0000-4000-8000-000000000002'::uuid),
    ('f2f00000-0000-4000-8000-000000000003'::uuid),
    ('f2f00000-0000-4000-8000-000000000004'::uuid),
    ('f2f00000-0000-4000-8000-000000000005'::uuid)) as l(id);
  insert into public.negotiations (id, load_id, shipper_company_id, carrier_company_id)
  select ('f2f10000-0000-4000-8000-00000000000' || right(l.id::text, 1))::uuid, l.id, 'c2f00000-0000-4000-8000-000000000001', 'c2f00000-0000-4000-8000-000000000002'
  from public.loads l where l.shipper_company_id = 'c2f00000-0000-4000-8000-000000000001';
  insert into public.offers (id, negotiation_id, load_id, shipper_company_id, carrier_company_id, side, amount_cents,
                             vehicle_id)
  select ('f2f20000-0000-4000-8000-00000000000' || right(n.load_id::text, 1))::uuid, n.id, n.load_id,
         n.shipper_company_id, n.carrier_company_id, 'carrier', 2900000,
         case when right(n.load_id::text, 1) in ('2', '3') then 'e2f00000-0000-4000-8000-000000000001'::uuid end
  from public.negotiations n where n.shipper_company_id = 'c2f00000-0000-4000-8000-000000000001';
$sql$);

-- Trip 1: contracted, assigned to O + V and unloading.
select tests.begin_as('s1', 'a2f00000-0000-4000-8000-000000000001');
insert into tests.trips
select 'trip1', trip_id::uuid from extensions.dblink('s1', $sql$
  select public.accept_offer('f2f20000-0000-4000-8000-000000000001')::text
$sql$) as t(trip_id text);
select extensions.dblink_exec('s1', 'commit');
select tests.begin_as('s1', 'a2f00000-0000-4000-8000-000000000002');
select * from extensions.dblink('s1', format(
  'select public.assign_trip(%L, %L, %L)::text', (select id from tests.trips where name = 'trip1'),
  'e2f00000-0000-4000-8000-000000000001', 'd2f00000-0000-4000-8000-000000000003'
)) as t(r text);
select extensions.dblink_exec('s1', 'commit');
select extensions.dblink_exec('setup', format(
  'update public.trips set status = %L where id = %L', 'unloading', (select id from tests.trips where name = 'trip1')
));

-- ---------------------------------------------------------------------------
-- 1. Trip 1 writes V's estimate (s1) while the shipper contracts return trip
--    2 with V (s2): the contract waits for V and then archives that estimate.
-- ---------------------------------------------------------------------------
select tests.seed_estimate();
select extensions.dblink_exec('s1', 'begin');
select extensions.dblink_exec('s1', 'set local lock_timeout = ''15s''');
select extensions.dblink_exec('s1', tests.write_estimate_sql());

select tests.begin_as('s2', 'a2f00000-0000-4000-8000-000000000001');
select extensions.dblink_send_query('s2', $sql$
  select public.accept_offer('f2f20000-0000-4000-8000-000000000002')::text
$sql$);
select ok(tests.wait_until_blocked('s2'), 'the contract waits for the unit while its estimate is written');
select extensions.dblink_exec('s1', 'commit');
select isnt(
  (select r from extensions.dblink_get_result('s2') as t(r text)), null,
  'the return trip is contracted'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'commit');
select is(tests.active_estimates(), 0, 'the estimate written meanwhile is archived too');

-- Trip 2 is called off, so V is free again for the second race.
select extensions.dblink_exec('setup', $sql$
  update public.trips set status = 'cancelled', cancelled_at = now()
  where offer_id = 'f2f20000-0000-4000-8000-000000000002';
$sql$);

-- ---------------------------------------------------------------------------
-- 2. The shipper contracts return trip 3 with V (s2) while trip 1 writes V's
--    estimate (s1): the estimate waits, then sees V booked and writes nothing.
-- ---------------------------------------------------------------------------
-- F5: the cancellation gives V back the estimate trip 2 ended.
select is(tests.active_estimates(), 1, 'V has an estimate again');
select tests.begin_as('s2', 'a2f00000-0000-4000-8000-000000000001');
select ok(
  (select r from extensions.dblink('s2', $sql$
     select public.accept_offer('f2f20000-0000-4000-8000-000000000003')::text
   $sql$) as t(r text)) is not null,
  'return trip 3 is contracted with V (not committed yet)'
);
select extensions.dblink_exec('s1', 'begin');
select extensions.dblink_exec('s1', 'set local lock_timeout = ''15s''');
select extensions.dblink_send_query('s1', tests.write_estimate_sql());
select ok(tests.wait_until_blocked('s1'), 'writing the estimate waits for the contract');
select extensions.dblink_exec('s2', 'commit');
select lives_ok(
  $$ select * from extensions.dblink_get_result('s1') as t(r text) $$,
  'then it goes on'
);
select * from extensions.dblink_get_result('s1', false) as t(r text);
select extensions.dblink_exec('s1', 'commit');
select is(tests.active_estimates(), 0, 'and writes no estimate: V is booked for trip 3');

-- ---------------------------------------------------------------------------
-- 3. F5: trip 1 writes V's estimate (s1, kept archived: V is booked) while
--    the shipper cancels trip 3 (s2): the cancellation waits for V and then
--    restores that estimate.
-- ---------------------------------------------------------------------------
select extensions.dblink_exec('s1', 'begin');
select extensions.dblink_exec('s1', 'set local lock_timeout = ''15s''');
select extensions.dblink_exec('s1', replace(tests.write_estimate_sql(), '1 hour', '3 hours'));

select tests.begin_as('s2', 'a2f00000-0000-4000-8000-000000000001');
select extensions.dblink_send_query('s2', $sql$
  select public.cancel_trip(
    (select id from public.trips where offer_id = 'f2f20000-0000-4000-8000-000000000003'), 'Cambio de planes'
  )::text
$sql$);
select ok(tests.wait_until_blocked('s2'), 'the cancellation waits for the unit while its estimate is written');
select extensions.dblink_exec('s1', 'commit');
select lives_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(r text) $$,
  'then trip 3 is cancelled'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'commit');
select is(
  tests.peek($sql$
    select string_agg(source::text || ' ' || (available_from > now() + interval '2 hours')::text, ',')
    from public.vehicle_availability
    where vehicle_id = 'e2f00000-0000-4000-8000-000000000001' and archived_at is null
  $sql$),
  'trip_estimate true',
  'and V gets back the estimate written meanwhile, its only availability'
);

-- ---------------------------------------------------------------------------
-- 4. F5: two assignments swap the same units (trip 4: V -> W, trip 5: W -> V).
--    Each locks both units in the same order before the trip changes, so the
--    second waits for the first and both go through (no deadlock).
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a2f00000-0000-4000-8000-000000000001');
select * from extensions.dblink('s1', $sql$
  select public.accept_offer('f2f20000-0000-4000-8000-000000000004')::text
  union all select public.accept_offer('f2f20000-0000-4000-8000-000000000005')::text
$sql$) as t(r text);
select extensions.dblink_exec('s1', 'commit');
select tests.begin_as('s1', 'a2f00000-0000-4000-8000-000000000002');
select * from extensions.dblink('s1', $sql$
  select public.assign_trip(t.id, case t.offer_id when 'f2f20000-0000-4000-8000-000000000004'
                                    then 'e2f00000-0000-4000-8000-000000000001'::uuid
                                    else 'e2f00000-0000-4000-8000-000000000002'::uuid end,
                            'd2f00000-0000-4000-8000-000000000003')::text
  from public.trips t
  where t.offer_id in ('f2f20000-0000-4000-8000-000000000004', 'f2f20000-0000-4000-8000-000000000005')
$sql$) as t(r text);
select extensions.dblink_exec('s1', 'commit');

select tests.begin_as('s1', 'a2f00000-0000-4000-8000-000000000002');
select * from extensions.dblink('s1', $sql$
  select public.assign_trip(t.id, 'e2f00000-0000-4000-8000-000000000002', 'd2f00000-0000-4000-8000-000000000003')::text
  from public.trips t where t.offer_id = 'f2f20000-0000-4000-8000-000000000004'
$sql$) as t(r text);
select tests.begin_as('s2', 'a2f00000-0000-4000-8000-000000000002');
select extensions.dblink_send_query('s2', $sql$
  select public.assign_trip(t.id, 'e2f00000-0000-4000-8000-000000000001', 'd2f00000-0000-4000-8000-000000000003')::text
  from public.trips t where t.offer_id = 'f2f20000-0000-4000-8000-000000000005'
$sql$);
select ok(tests.wait_until_blocked('s2'), 'the second swap waits for the units the first one holds');
select extensions.dblink_exec('s1', 'commit');
select lives_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(r text) $$,
  'then it goes through'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'commit');
select is(
  tests.peek($sql$
    select string_agg(right(o.id::text, 1) || ':' || right(t.vehicle_id::text, 1), ',' order by o.id)
    from public.trips t join public.offers o on o.id = t.offer_id
    where o.id in ('f2f20000-0000-4000-8000-000000000004', 'f2f20000-0000-4000-8000-000000000005')
  $sql$),
  '4:2,5:1',
  'both trips end up with the swapped units'
);

-- ---------------------------------------------------------------------------
-- 5. F5: V is assigned trips 4 and 5. Trip 1 writes V's estimate (s1; held
--    back by one of them) while O sets off on the other (s2): the departure
--    waits for V and then forgets that estimate too, so no cancellation can
--    bring it back. (Held back by the departing trip itself, the departure
--    would wait anyway: that row's foreign key share-locks the trip.)
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a2f00000-0000-4000-8000-000000000002');
select * from extensions.dblink('s1', $sql$
  select public.assign_trip(t.id, 'e2f00000-0000-4000-8000-000000000001', 'd2f00000-0000-4000-8000-000000000003')::text
  from public.trips t where t.offer_id = 'f2f20000-0000-4000-8000-000000000004'
$sql$) as t(r text);
select extensions.dblink_exec('s1', 'commit');
create table tests.departing as
select tests.peek($sql$
  select t.id::text from public.trips t
  where t.offer_id in ('f2f20000-0000-4000-8000-000000000004', 'f2f20000-0000-4000-8000-000000000005')
    and t.id <> public.vehicle_committing_trip(
      'e2f00000-0000-4000-8000-000000000001',
      (select id from public.trips where offer_id = 'f2f20000-0000-4000-8000-000000000001'))
$sql$)::uuid as id;

select extensions.dblink_exec('s1', 'begin');
select extensions.dblink_exec('s1', 'set local lock_timeout = ''15s''');
select extensions.dblink_exec('s1', tests.write_estimate_sql());
select tests.begin_as('s2', 'a2f00000-0000-4000-8000-000000000003');
select extensions.dblink_send_query('s2', format(
  'select public.record_trip_event(%L, %L, now(), 25.6866, -100.3161)::text',
  (select id from tests.departing), 'departed'
));
select ok(tests.wait_until_blocked('s2'), 'the departure waits for the unit while its estimate is written');
select extensions.dblink_exec('s1', 'commit');
select lives_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(r text) $$,
  'then O sets off'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'commit');
select is(
  tests.peek($sql$
    select count(*)::text from public.vehicle_availability
    where vehicle_id = 'e2f00000-0000-4000-8000-000000000001' and ended_by_trip_id is not null
  $sql$),
  '0',
  'nothing held back for V is left to restore'
);

-- ---------------------------------------------------------------------------
-- 6. F5: O sets off on the trip holding V back, which locks that trip first
--    (s2), while trip 1 writes V's estimate held back by it (s1): writing
--    the estimate never waits for the trip, so the departure only waits for
--    V and both go through (no deadlock).
-- ---------------------------------------------------------------------------
create table tests.holding as
select tests.peek($sql$
  select public.vehicle_committing_trip(
    'e2f00000-0000-4000-8000-000000000001',
    (select id from public.trips where offer_id = 'f2f20000-0000-4000-8000-000000000001'))::text
$sql$)::uuid as id;
select extensions.dblink_exec('s2', 'begin');
select extensions.dblink_exec('s2', 'set local lock_timeout = ''15s''');
select * from extensions.dblink('s2', format(
  'select id::text from public.trips where id = %L for update', (select id from tests.holding)
)) as t(r text);
select extensions.dblink_exec('s2', 'set local role authenticated');
select extensions.dblink_exec('s2', format(
  'set local request.jwt.claims = %L',
  jsonb_build_object('sub', 'a2f00000-0000-4000-8000-000000000003', 'role', 'authenticated')::text
));
select extensions.dblink_exec('s1', 'begin');
select extensions.dblink_exec('s1', 'set local lock_timeout = ''15s''');
select lives_ok(
  $$ select extensions.dblink_exec('s1', tests.write_estimate_sql()) $$,
  'the estimate held back by a locked trip is written without waiting for it'
);
select extensions.dblink_send_query('s2', format(
  'select public.record_trip_event(%L, %L, now(), 25.6866, -100.3161)::text',
  (select id from tests.holding), 'departed'
));
select ok(tests.wait_until_blocked('s2'), 'the departure waits for the unit');
select extensions.dblink_exec('s1', 'commit');
select lives_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(r text) $$,
  'then O sets off'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'commit');
select is(
  tests.peek($sql$
    select count(*)::text from public.vehicle_availability
    where vehicle_id = 'e2f00000-0000-4000-8000-000000000001' and ended_by_trip_id is not null
  $sql$),
  '0',
  'and nothing held back for V is left to restore'
);

select tests.cleanup();
select extensions.dblink_disconnect('s1');
select extensions.dblink_disconnect('s2');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
