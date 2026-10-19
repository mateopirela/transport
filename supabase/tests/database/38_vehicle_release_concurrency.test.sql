-- G5 · Releasing a unit concurrently (two real sessions, dblink), on unit V:
--   1. The coordinator releases V (s1, holding the unit) while the manager
--      assigns V to another trip (s2): the assignment waits for the unit and
--      then goes through, since V is released.
--   2. The shipper cancels a trip that set off with V (s1: trip, then unit,
--      then the new task) while the manager assigns V (s2): the assignment
--      waits for the unit and then sees V pending release, and is refused.
--   3. Two releases of the same task (s1, s2): the second waits for the unit
--      and then finds the task released, so the task closes once and V gets
--      one availability.
-- Every session locks in the same order (trip, unit, task), so none of these
-- races deadlocks. Committed fixtures through the setup connection, deleted
-- at the end (same approach as 20_return_trip_concurrency.test.sql).
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(11);

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

create table tests.pids (conn text primary key, pid integer not null);

create function tests.connect(p_conn text)
returns void
language sql
as $$
  select extensions.dblink_connect(p_conn, tests.conninfo());
  insert into tests.pids
  select p_conn, pid from extensions.dblink(p_conn, 'select pg_backend_pid()') as t(pid integer);
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

-- Runs p_sql on the setup connection as p_user (committed) and returns one text value.
create function tests.as_user(p_user uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  perform extensions.dblink_exec('setup', format(
    'set request.jwt.claims = %L', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text
  ));
  select r into v from extensions.dblink('setup', p_sql) as t(r text);
  return v;
end;
$$;

create function tests.peek(p_sql text)
returns text
language sql
as $$ select v from extensions.dblink('setup', p_sql) as t(v text) $$;

create table tests.vals (name text primary key, id uuid not null);

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

-- S publishes a load that M offers for (naming p_vehicle_id, or none) and S
-- accepts. Returns the trip.
create function tests.contract(p_days integer, p_vehicle_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_load text;
  v_offer text;
begin
  v_load := tests.as_user('a3400000-0000-4000-8000-000000000001', format($sql$
    select public.create_load(jsonb_build_object(
      'origin', jsonb_build_object('address', 'Av. Constitución 100', 'city', 'Monterrey', 'state', 'Nuevo León',
                                   'lat', 25.6866, 'lng', -100.3161),
      'destination', jsonb_build_object('address', 'Av. Vallarta 200', 'city', 'Guadalajara', 'state', 'Jalisco',
                                        'lat', 20.6597, 'lng', -103.3496),
      'pickupWindow', jsonb_build_object('start', now() + interval '%1$s days',
                                         'end', now() + interval '%1$s days' + interval '4 hours'),
      'deliveryWindow', jsonb_build_object('start', now() + interval '%1$s days' + interval '1 day',
                                           'end', now() + interval '%1$s days' + interval '30 hours'),
      'cargoType', 'palletized', 'description', 'Tarimas', 'weightKg', 18000, 'unitType', 'dry_van',
      'specialRequirements', jsonb_build_array(), 'proposedPriceCents', 3500000
    ))::text
  $sql$, p_days));
  perform tests.as_user('a3400000-0000-4000-8000-000000000001',
                        format('select public.publish_load(%L)::text', v_load));
  v_offer := tests.as_user('a3400000-0000-4000-8000-000000000002',
                           format('select public.make_offer(%L, 3000000, null, %L)::text', v_load, p_vehicle_id));
  return tests.as_user('a3400000-0000-4000-8000-000000000001',
                       format('select public.accept_offer(%L)::text', v_offer))::uuid;
end;
$$;

create function tests.cleanup()
returns void
language sql
as $$
  select extensions.dblink_exec('setup', $sql$
    alter table public.trip_events disable trigger trip_events_immutable;
    delete from public.trip_events
    where trip_id in (select id from public.trips where shipper_company_id = 'c3400000-0000-4000-8000-000000000001');
    alter table public.trip_events enable trigger trip_events_immutable;
    delete from public.vehicle_release_tasks where company_id = 'c3400000-0000-4000-8000-000000000002';
    delete from public.trip_locations
    where trip_id in (select id from public.trips where shipper_company_id = 'c3400000-0000-4000-8000-000000000001');
    delete from public.conversations where shipper_company_id = 'c3400000-0000-4000-8000-000000000001';
    delete from public.document_shares where shipper_company_id = 'c3400000-0000-4000-8000-000000000001';
    delete from public.trips where shipper_company_id = 'c3400000-0000-4000-8000-000000000001';
    update public.loads
    set status = 'draft', accepted_offer_id = null, carrier_company_id = null, agreed_price_cents = null,
        contracted_at = null
    where shipper_company_id = 'c3400000-0000-4000-8000-000000000001';
    delete from public.offers where shipper_company_id = 'c3400000-0000-4000-8000-000000000001';
    delete from public.negotiations where shipper_company_id = 'c3400000-0000-4000-8000-000000000001';
    delete from public.loads where shipper_company_id = 'c3400000-0000-4000-8000-000000000001';
    delete from public.vehicle_availability where company_id = 'c3400000-0000-4000-8000-000000000002';
    delete from public.documents where company_id = 'c3400000-0000-4000-8000-000000000002';
    delete from public.vehicles where company_id = 'c3400000-0000-4000-8000-000000000002';
    delete from public.operators where company_id = 'c3400000-0000-4000-8000-000000000002';
    delete from auth.users where id in (
      'a3400000-0000-4000-8000-000000000001', 'a3400000-0000-4000-8000-000000000002',
      'a3400000-0000-4000-8000-000000000003'
    );
    delete from public.business_units where company_id = 'c3400000-0000-4000-8000-000000000002';
    delete from public.companies where id in ('c3400000-0000-4000-8000-000000000001', 'c3400000-0000-4000-8000-000000000002');
  $sql$);
$$;

select tests.connect('setup');
select tests.connect('s1');
select tests.connect('s2');
-- Leftovers of an interrupted run, if any.
select tests.cleanup();

-- ---------------------------------------------------------------------------
-- Fixtures (committed): S shipper, M manager, O operator; unit V.
-- ---------------------------------------------------------------------------
select extensions.dblink_exec('setup', $sql$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    ('a3400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 's@g5c.test', now(), null, '{"role":"shipper","phone":"+525500000000"}', now(), now()),
    ('a3400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'm@g5c.test', now(), null, '{"role":"manager","phone":"+525500000000"}', now(), now()),
    ('a3400000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'o@g5c.test', now(), '{"provisioned_by":"redeem-invitation"}', '{"role":"operator","phone":"+525500000000"}', now(), now());
  insert into public.companies (id, type, legal_name, rfc, status) values
    ('c3400000-0000-4000-8000-000000000001', 'shipper', 'Envíos Siete SA de CV', 'ESI050505GH5', 'approved'),
    ('c3400000-0000-4000-8000-000000000002', 'carrier', 'Fletes Siete SA de CV', 'FSI040404CD4', 'approved');
  update public.profiles set company_id = 'c3400000-0000-4000-8000-000000000001'
  where id = 'a3400000-0000-4000-8000-000000000001';
  update public.profiles set company_id = 'c3400000-0000-4000-8000-000000000002'
  where id in ('a3400000-0000-4000-8000-000000000002', 'a3400000-0000-4000-8000-000000000003');
  insert into public.operators (id, company_id, profile_id, full_name, license_type, license_expires_on) values
    ('d3400000-0000-4000-8000-000000000001', 'c3400000-0000-4000-8000-000000000002',
     'a3400000-0000-4000-8000-000000000003', 'Óscar Siete', 'E', current_date + 365);
  insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
    ('e3400000-0000-4000-8000-000000000001', 'c3400000-0000-4000-8000-000000000002', 'rigid', 'GGC3401', 'dry_van', 30000);
  insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
  select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
         'approved', case when r.requires_expiry then now() + interval '1 year' end
  from public.vehicles v
  cross join public.document_requirements r
  where v.company_id = 'c3400000-0000-4000-8000-000000000002'
    and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;
$sql$);

-- Trip 1 sets off with V and the shipper cancels it: V waits for its release.
insert into tests.vals select 'trip1', tests.contract(1, 'e3400000-0000-4000-8000-000000000001');
select tests.as_user('a3400000-0000-4000-8000-000000000002', format(
  'select public.assign_trip(%L, %L, %L)::text', tests.val('trip1'), 'e3400000-0000-4000-8000-000000000001',
  'd3400000-0000-4000-8000-000000000001'));
select tests.as_user('a3400000-0000-4000-8000-000000000003', format(
  'select public.record_trip_event(%L, %L, now(), 25.70, -100.30)::text', tests.val('trip1'), 'departed'));
select tests.as_user('a3400000-0000-4000-8000-000000000001', format(
  'select public.cancel_trip(%L, %L, null)::text', tests.val('trip1'), 'shipper_request'));
insert into tests.vals
select 'task1', tests.peek(format(
  'select id::text from public.vehicle_release_tasks where trip_id = %L', tests.val('trip1')))::uuid;
-- Trip 2 waits for its unit.
insert into tests.vals select 'trip2', tests.contract(2, null);

-- ---------------------------------------------------------------------------
-- 1. Release (s1) vs assignment (s2)
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a3400000-0000-4000-8000-000000000002');
select lives_ok(
  format($$ select * from extensions.dblink('s1', %L) as t(r text) $$, format(
    'select public.release_vehicle(%L, now(), 25.7817, -100.1886, %L, %L, null)::text',
    tests.val('task1'), 'Apodaca', 'Nuevo León')),
  'the manager releases V (not committed yet)'
);
select tests.begin_as('s2', 'a3400000-0000-4000-8000-000000000002');
select extensions.dblink_send_query('s2', format(
  'select public.assign_trip(%L, %L, %L)::text', tests.val('trip2'), 'e3400000-0000-4000-8000-000000000001',
  'd3400000-0000-4000-8000-000000000001'));
select ok(tests.wait_until_blocked('s2'), 'the assignment waits for the unit while it is released');
select extensions.dblink_exec('s1', 'commit');
select lives_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(r text) $$,
  'then V is assigned: it was released'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'commit');
select is(
  tests.peek(format('select status::text from public.trips where id = %L', tests.val('trip2'))),
  'assigned', 'trip 2 has V'
);

-- ---------------------------------------------------------------------------
-- 2. Cancellation after departure (s1) vs assignment (s2)
-- ---------------------------------------------------------------------------
select tests.as_user('a3400000-0000-4000-8000-000000000003', format(
  'select public.record_trip_event(%L, %L, now(), 25.70, -100.30)::text', tests.val('trip2'), 'departed'));
insert into tests.vals select 'trip3', tests.contract(3, null);
select tests.begin_as('s1', 'a3400000-0000-4000-8000-000000000001');
select lives_ok(
  format($$ select * from extensions.dblink('s1', %L) as t(r text) $$, format(
    'select public.cancel_trip(%L, %L, null)::text', tests.val('trip2'), 'cargo_issue')),
  'the shipper cancels trip 2 on its way (not committed yet)'
);
select tests.begin_as('s2', 'a3400000-0000-4000-8000-000000000002');
select extensions.dblink_send_query('s2', format(
  'select public.assign_trip(%L, %L, %L)::text', tests.val('trip3'), 'e3400000-0000-4000-8000-000000000001',
  'd3400000-0000-4000-8000-000000000001'));
select ok(tests.wait_until_blocked('s2'), 'the assignment waits for the unit while the cancellation holds it');
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(r text) $$,
  '55000', 'vehicle is pending release',
  'then the assignment sees V pending release and is refused'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'rollback');
insert into tests.vals
select 'task2', tests.peek(format(
  'select id::text from public.vehicle_release_tasks where trip_id = %L', tests.val('trip2')))::uuid;

-- ---------------------------------------------------------------------------
-- 3. Two releases of the same task
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a3400000-0000-4000-8000-000000000002');
select lives_ok(
  format($$ select * from extensions.dblink('s1', %L) as t(r text) $$, format(
    'select public.release_vehicle(%L, now(), 25.6866, -100.3161, %L, %L, null)::text',
    tests.val('task2'), 'Monterrey', 'Nuevo León')),
  'one release (not committed yet)'
);
select tests.begin_as('s2', 'a3400000-0000-4000-8000-000000000002');
select extensions.dblink_send_query('s2', format(
  'select public.release_vehicle(%L, now(), 25.7817, -100.1886, %L, %L, null)::text',
  tests.val('task2'), 'Apodaca', 'Nuevo León'));
select ok(tests.wait_until_blocked('s2'), 'the second release waits for the unit');
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(r text) $$,
  '55000', 'release task is not pending',
  'then it finds the task released'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'rollback');
select is(
  tests.peek($sql$
    select string_agg(source::text || ':' || city, ',') from public.vehicle_availability
    where vehicle_id = 'e3400000-0000-4000-8000-000000000001' and archived_at is null
  $sql$),
  'release:Monterrey', 'V has the one availability of the first release'
);

select tests.cleanup();
select extensions.dblink_disconnect('s1');
select extensions.dblink_disconnect('s2');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
