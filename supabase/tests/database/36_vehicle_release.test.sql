-- G5 · Cancelling a trip that already set off, and releasing its unit (D20):
--   * cancel_trip takes a reason code (notes required for 'other') and
--     records the side; the old signature still works as 'other';
--   * before departure F5 still restores the unit's availability, and no task;
--   * after departure the unit waits for its release: a task with the last
--     known point, its availability (the destination estimate) archived,
--     vehicle_release_pending to the manager and the unit's coordinators;
--   * while it waits: no availability, no assignment, no offer, no matching;
--   * vehicle_release_tasks and vehicle_release_context: only the staff that
--     runs the unit (and admins); release_vehicle: only the manager and the
--     coordinators of the unit's business unit;
--   * the release writes the availability 'release' that matching sees,
--     closes the task once and notifies; a second cancellation while the unit
--     waits adds no task.
begin;
create extension if not exists pgtap with schema extensions;

select plan(48);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated;

create function tests.new_user(p_id uuid, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@g5.test', now(),
          case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end,
          jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create function tests.payload(p_days integer)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'origin', jsonb_build_object('address', 'Av. Constitución 100', 'city', 'Monterrey', 'state', 'Nuevo León',
                                 'lat', 25.6866, 'lng', -100.3161),
    'destination', jsonb_build_object('address', 'Av. Vallarta 200', 'city', 'Guadalajara', 'state', 'Jalisco',
                                      'lat', 20.6597, 'lng', -103.3496),
    'pickupWindow', jsonb_build_object('start', now() + make_interval(days => p_days),
                                       'end', now() + make_interval(days => p_days, hours => 4)),
    'deliveryWindow', jsonb_build_object('start', now() + make_interval(days => p_days + 1),
                                         'end', now() + make_interval(days => p_days + 1, hours => 6)),
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

-- S publishes a load, coordinator A offers naming p_vehicle_id, S accepts.
create function tests.contract(p_name text, p_days integer, p_vehicle_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_load uuid;
  v_offer uuid;
  v_trip uuid;
begin
  perform tests.login('a3300000-0000-4000-8000-000000000001');
  v_load := public.create_load(tests.payload(p_days));
  perform public.publish_load(v_load);
  perform tests.login('a3300000-0000-4000-8000-000000000003');
  v_offer := public.make_offer(v_load, 3000000, null, p_vehicle_id);
  perform tests.login('a3300000-0000-4000-8000-000000000001');
  v_trip := public.accept_offer(v_offer);
  insert into tests.vals values (p_name, v_trip), ('load_' || p_name, v_load);
  return v_trip;
end;
$$;

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

-- Columns: S, M, A, B, O, X, admin.
create function tests.matrix(p_sql text)
returns text
language sql
as $$
  select string_agg(tests.sees(u.id, p_sql)::text, ',' order by u.id)
  from (values ('a3300000-0000-4000-8000-000000000001'::uuid), ('a3300000-0000-4000-8000-000000000002'),
               ('a3300000-0000-4000-8000-000000000003'), ('a3300000-0000-4000-8000-000000000004'),
               ('a3300000-0000-4000-8000-000000000005'), ('a3300000-0000-4000-8000-000000000006'),
               ('a3300000-0000-4000-8000-000000000007')) as u(id);
$$;

create function tests.active_availability(p_vehicle_id uuid)
returns table (source text, city text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.source::text, a.city from public.vehicle_availability a
  where a.vehicle_id = p_vehicle_id and a.archived_at is null
$$;

create function tests.notified(p_type text, p_key text, p_value uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(n.user_id order by n.user_id), '{}') from public.notifications n
  where n.type::text = p_type and n.data ->> p_key = p_value::text
$$;

grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures. Users a33…: 01 S shipper, 02 M manager, 03 A coordinator of unit
-- A, 04 B coordinator of unit B, 05 O operator (unit A), 06 X manager of
-- another carrier, 07 admin. Units: V and W (unit A), U (unit B).
-- ---------------------------------------------------------------------------
select tests.new_user('a3300000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a3300000-0000-4000-8000-000000000002', 'manager');
select tests.new_user('a3300000-0000-4000-8000-000000000003', 'coordinator');
select tests.new_user('a3300000-0000-4000-8000-000000000004', 'coordinator');
select tests.new_user('a3300000-0000-4000-8000-000000000005', 'operator');
select tests.new_user('a3300000-0000-4000-8000-000000000006', 'manager');
select tests.new_user('a3300000-0000-4000-8000-000000000007', 'shipper');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c3300000-0000-4000-8000-000000000001', 'shipper', 'Envíos Cinco SA de CV', 'ECI050505GH5', 'approved'),
  ('c3300000-0000-4000-8000-000000000002', 'carrier', 'Fletes Cinco SA de CV', 'FCI040404CD4', 'approved'),
  ('c3300000-0000-4000-8000-000000000003', 'carrier', 'Fletes Seis SA de CV', 'FSE040404CD4', 'approved');
update public.profiles set company_id = 'c3300000-0000-4000-8000-000000000001'
where id = 'a3300000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c3300000-0000-4000-8000-000000000002'
where id in ('a3300000-0000-4000-8000-000000000002', 'a3300000-0000-4000-8000-000000000003',
             'a3300000-0000-4000-8000-000000000004', 'a3300000-0000-4000-8000-000000000005');
update public.profiles set company_id = 'c3300000-0000-4000-8000-000000000003'
where id = 'a3300000-0000-4000-8000-000000000006';
update public.profiles set role = 'admin' where id = 'a3300000-0000-4000-8000-000000000007';

update public.business_units set name = 'Unidad A' where company_id = 'c3300000-0000-4000-8000-000000000002';
insert into tests.vals select 'bu_a', id from public.business_units where company_id = 'c3300000-0000-4000-8000-000000000002';
insert into public.business_units (id, company_id, name)
values ('b3300000-0000-4000-8000-00000000000b', 'c3300000-0000-4000-8000-000000000002', 'Unidad B');
insert into tests.vals values ('bu_b', 'b3300000-0000-4000-8000-00000000000b');
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id) values
  (tests.val('bu_a'), 'c3300000-0000-4000-8000-000000000002', 'a3300000-0000-4000-8000-000000000003'),
  (tests.val('bu_b'), 'c3300000-0000-4000-8000-000000000002', 'a3300000-0000-4000-8000-000000000004');

insert into public.operators (id, company_id, business_unit_id, profile_id, full_name, license_type, license_expires_on)
values ('d3300000-0000-4000-8000-00000000000a', 'c3300000-0000-4000-8000-000000000002', tests.val('bu_a'),
        'a3300000-0000-4000-8000-000000000005', 'Óscar A', 'E', current_date + 365);
insert into public.vehicles (id, company_id, business_unit_id, kind, plate, fleet_number, unit_type, capacity_kg) values
  ('e3300000-0000-4000-8000-00000000000a', 'c3300000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'rigid', 'GGV3301', 'V-01', 'dry_van', 30000),
  ('e3300000-0000-4000-8000-00000000000b', 'c3300000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'rigid', 'GGW3301', null, 'dry_van', 30000),
  ('e3300000-0000-4000-8000-00000000000c', 'c3300000-0000-4000-8000-000000000002', tests.val('bu_b'),
   'rigid', 'GGU3301', null, 'dry_van', 30000);
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'c3300000-0000-4000-8000-000000000002'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;
update public.trip_evidence_requirements set min_photos = 0;

-- ---------------------------------------------------------------------------
-- 1. Before departure: F5 restores, no task; the reason is structured
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3300000-0000-4000-8000-000000000003');
select public.set_vehicle_availability('e3300000-0000-4000-8000-00000000000a', now() + interval '1 hour',
                                       25.6866, -100.3161, 'Monterrey', 'Nuevo León');
select tests.contract('trip1', 1, 'e3300000-0000-4000-8000-00000000000a');
select tests.login('a3300000-0000-4000-8000-000000000003');
select public.assign_trip(tests.val('trip1'), 'e3300000-0000-4000-8000-00000000000a',
                          'd3300000-0000-4000-8000-00000000000a');

select throws_ok(
  $$ select public.cancel_trip(tests.val('trip1'), null, 'x') $$,
  '22023', 'a cancellation reason is required', 'a reason code is required'
);
select throws_ok(
  $$ select public.cancel_trip(tests.val('trip1'), 'other', '   ') $$,
  '22023', 'a reason of at most 1000 characters is required', 'the reason other needs notes'
);
select throws_ok(
  $$ select public.cancel_trip(tests.val('trip1'), 'carrier_request', repeat('x', 1001)) $$,
  '22023', 'a reason of at most 1000 characters is required', 'notes fit in 1000 characters'
);
select lives_ok(
  $$ select public.cancel_trip(tests.val('trip1'), 'carrier_request', null) $$,
  'the carrier staff cancel before departure with a reason and no notes'
);
reset role;
select results_eq(
  $$ select cancellation_reason_code::text, cancelled_by_side::text, cancellation_reason from public.trips
     where id = tests.val('trip1') $$,
  $$ values ('carrier_request', 'carrier', null::text) $$,
  'the trip keeps the reason code and the side that cancelled'
);
select results_eq(
  $$ select * from tests.active_availability('e3300000-0000-4000-8000-00000000000a') $$,
  $$ values ('manual', 'Monterrey') $$,
  'before departure F5 gives the unit its availability back'
);
select is(
  (select count(*)::int from public.vehicle_release_tasks), 0,
  'before departure no release task is opened'
);

-- The B06 signature still works: reason 'other' with the text as notes.
set local role authenticated;
select tests.contract('trip0', 1, null);
select tests.login('a3300000-0000-4000-8000-000000000001');
select public.cancel_trip(tests.val('trip0'), 'Ya no se necesita');
reset role;
select results_eq(
  $$ select cancellation_reason_code::text, cancelled_by_side::text, cancellation_reason from public.trips
     where id = tests.val('trip0') $$,
  $$ values ('other', 'shipper', 'Ya no se necesita') $$,
  'the old signature cancels with the reason other and the shipper side'
);
select throws_ok(
  $$ update public.trips set cancellation_reason = null where id = tests.val('trip0') $$,
  '23514', null, 'a trip cancelled for other keeps its notes'
);

-- ---------------------------------------------------------------------------
-- 2. After departure: the unit waits for its release
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.contract('trip2', 1, 'e3300000-0000-4000-8000-00000000000a');
select tests.login('a3300000-0000-4000-8000-000000000003');
select public.assign_trip(tests.val('trip2'), 'e3300000-0000-4000-8000-00000000000a',
                          'd3300000-0000-4000-8000-00000000000a');
select tests.login('a3300000-0000-4000-8000-000000000005');
select public.record_trip_event(tests.val('trip2'), 'departed', now() + interval '5 seconds', 25.7500, -100.2500);
reset role;
-- A GPS point after the departure (the operator app sends them).
insert into public.trip_locations (trip_id, recorded_at, latitude, longitude)
values (tests.val('trip2'), now() + interval '10 seconds', 25.7817, -100.1886);
-- An availability the unit still had (as if estimated): it must not survive.
insert into public.vehicle_availability (company_id, vehicle_id, available_from, location, city, state, source)
values ('c3300000-0000-4000-8000-000000000002', 'e3300000-0000-4000-8000-00000000000a', now() + interval '2 days',
        extensions.st_setsrid(extensions.st_makepoint(-103.3496, 20.6597), 4326)::extensions.geography,
        'Guadalajara', 'Jalisco', 'trip_estimate');

set local role authenticated;
select tests.login('a3300000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.cancel_trip(tests.val('trip2'), 'shipper_request', 'Se pospuso el pedido') $$,
  'the shipper cancels the trip on its way to the pickup'
);
reset role;
insert into tests.vals select 'task2', id from public.vehicle_release_tasks where trip_id = tests.val('trip2');
select results_eq(
  $$ select status::text, vehicle_id, business_unit_id, round(extensions.st_y(last_known_location::extensions.geometry)::numeric, 4),
            last_known_at = now() + interval '10 seconds'
     from public.vehicle_release_tasks where trip_id = tests.val('trip2') $$,
  $$ values ('pending', 'e3300000-0000-4000-8000-00000000000a'::uuid, tests.val('bu_a'), 25.7817, true) $$,
  'cancelling after departure opens a pending task with the last GPS point'
);
select is_empty(
  $$ select * from tests.active_availability('e3300000-0000-4000-8000-00000000000a') $$,
  'and the unit loses the availability it had (the estimate does not survive)'
);
select is(
  (select count(*)::int from public.vehicle_availability
   where vehicle_id = 'e3300000-0000-4000-8000-00000000000a' and ended_by_trip_id is not null),
  0, 'nothing held back for the unit can be restored'
);
select is(
  tests.notified('vehicle_release_pending', 'taskId', tests.val('task2')),
  array['a3300000-0000-4000-8000-000000000002', 'a3300000-0000-4000-8000-000000000003']::uuid[],
  'the manager and the coordinators of the unit get vehicle_release_pending (not the other unit, not the shipper)'
);
select is(
  (select cancelled_by_side::text from public.trips where id = tests.val('trip2')), 'shipper',
  'the side is the shipper'
);

-- ---------------------------------------------------------------------------
-- 3. While pending: no availability, assignment, offer or matching
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3300000-0000-4000-8000-000000000001');
insert into tests.vals select 'load3', public.create_load(tests.payload(2));
select public.publish_load(tests.val('load3'));
select tests.login('a3300000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.set_vehicle_availability('e3300000-0000-4000-8000-00000000000a', now(), 25.69, -100.32,
                                            'Monterrey', 'Nuevo León') $$,
  '55000', 'vehicle is pending release', 'a pending unit cannot be made available'
);
select throws_ok(
  $$ select public.make_offer(tests.val('load3'), 3000000, null, 'e3300000-0000-4000-8000-00000000000a') $$,
  '55000', 'vehicle is pending release', 'a pending unit cannot be offered'
);
insert into tests.vals
select 'offer3', public.make_offer(tests.val('load3'), 3000000, null, 'e3300000-0000-4000-8000-00000000000b');
select tests.login('a3300000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip3', public.accept_offer(tests.val('offer3'));
select tests.login('a3300000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.assign_trip(tests.val('trip3'), 'e3300000-0000-4000-8000-00000000000a',
                               'd3300000-0000-4000-8000-00000000000a') $$,
  '55000', 'vehicle is pending release', 'a pending unit cannot be assigned'
);
select is(
  (select count(*)::int from public.match_candidates('e3300000-0000-4000-8000-00000000000a', null, 500, 50)),
  0, 'matching leaves a pending unit out'
);

-- ---------------------------------------------------------------------------
-- 4. Who sees the task and who releases it
-- ---------------------------------------------------------------------------
reset role;
select is(tests.matrix($$ select 1 from public.vehicle_release_tasks $$),
  '0,1,1,0,0,0,1', 'vehicle_release_tasks: the manager, the coordinator of the unit and admins');
set local role authenticated;
select tests.login('a3300000-0000-4000-8000-000000000003');
select results_eq(
  $$ select vehicle_id, trip_id, status::text, round(last_latitude::numeric, 4), origin_city, destination_city
     from public.vehicle_release_context(tests.val('task2')) $$,
  $$ values ('e3300000-0000-4000-8000-00000000000a'::uuid, tests.val('trip2'), 'pending', 25.7817,
             'Monterrey', 'Guadalajara') $$,
  'the coordinator of the unit reads the release context'
);
select tests.login('a3300000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select * from public.vehicle_release_context(tests.val('task2')) $$,
  '42501', 'release task not found', 'the coordinator of another business unit cannot read it'
);
select throws_ok(
  $$ select public.release_vehicle(tests.val('task2'), now(), 25.78, -100.19, 'Apodaca', 'Nuevo León', null) $$,
  '42501', 'release task not found', 'the coordinator of another business unit cannot release the unit'
);
select tests.login('a3300000-0000-4000-8000-000000000006');
select throws_ok(
  $$ select public.release_vehicle(tests.val('task2'), now(), 25.78, -100.19, 'Apodaca', 'Nuevo León', null) $$,
  '42501', 'release task not found', 'the manager of another carrier cannot release the unit'
);
select tests.login('a3300000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.release_vehicle(tests.val('task2'), now(), 25.78, -100.19, 'Apodaca', 'Nuevo León', null) $$,
  '42501', 'release task not found', 'the shipper cannot release the unit'
);
select tests.login('a3300000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select public.release_vehicle(tests.val('task2'), now(), 25.78, -100.19, 'Apodaca', 'Nuevo León', null) $$,
  '42501', 'release task not found', 'the operator cannot release the unit'
);
select tests.login('a3300000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.release_vehicle(tests.val('task2'), now(), 125.78, -100.19, 'Apodaca', 'Nuevo León', null) $$,
  '22023', 'invalid coordinates', 'the release needs valid coordinates'
);
select throws_ok(
  $$ select public.release_vehicle(tests.val('task2'), now(), 25.78, -100.19, ' ', 'Nuevo León', null) $$,
  '22023', 'city and state are required', 'the release needs a city'
);
select throws_ok(
  $$ select public.release_vehicle(tests.val('task2'), null, 25.78, -100.19, 'Apodaca', 'Nuevo León', null) $$,
  '22023', 'p_available_from is required', 'the release needs a moment'
);
select ok(
  not has_table_privilege('authenticated', 'public.vehicle_release_tasks', 'insert,update,delete'),
  'clients cannot write release tasks directly'
);

-- ---------------------------------------------------------------------------
-- 5. The release
-- ---------------------------------------------------------------------------
insert into tests.vals
select 'release2', public.release_vehicle(tests.val('task2'), now(), 25.7817, -100.1886, 'Apodaca', 'Nuevo León',
                                          'Quedó en el patio de Apodaca');
reset role;
select results_eq(
  $$ select source::text, city, archived_at is null, created_by from public.vehicle_availability
     where id = tests.val('release2') $$,
  $$ values ('release', 'Apodaca', true, 'a3300000-0000-4000-8000-000000000003'::uuid) $$,
  'the release writes an active availability with the source release'
);
select results_eq(
  $$ select status::text, released_by, released_city, released_availability_id, notes
     from public.vehicle_release_tasks where id = tests.val('task2') $$,
  $$ values ('released', 'a3300000-0000-4000-8000-000000000003'::uuid, 'Apodaca', tests.val('release2'),
             'Quedó en el patio de Apodaca') $$,
  'the task is closed with who, where and the availability written'
);
select is(
  tests.notified('vehicle_released', 'taskId', tests.val('task2')),
  array['a3300000-0000-4000-8000-000000000002']::uuid[],
  'vehicle_released goes to the staff of the unit, not to who released it'
);
select is(
  tests.notified('load_match', 'loadId', tests.val('load3')),
  '{}'::uuid[],
  'a load the company already negotiates is not recommended'
);
set local role authenticated;
select tests.login('a3300000-0000-4000-8000-000000000001');
insert into tests.vals select 'load4', public.create_load(tests.payload(3));
reset role;
-- Published without the load_match trigger noise: only the release's recommendations count.
delete from public.notifications where type = 'load_match';
set local role authenticated;
select public.publish_load(tests.val('load4'));
reset role;
delete from public.notifications where type = 'load_match';
-- As someone outside the staff, so nobody is left out as the caller.
select tests.login('a3300000-0000-4000-8000-000000000005');
select public.notify_matches_for_vehicle('e3300000-0000-4000-8000-00000000000a');
select is(
  tests.notified('load_match', 'vehicleId', 'e3300000-0000-4000-8000-00000000000a'),
  array['a3300000-0000-4000-8000-000000000002', 'a3300000-0000-4000-8000-000000000003']::uuid[],
  'the released unit''s nearby loads go to the manager and its coordinators as load_match'
);
set local role authenticated;
select tests.login('a3300000-0000-4000-8000-000000000003');
select results_eq(
  $$ select start_city from public.match_candidates('e3300000-0000-4000-8000-00000000000a', null, 150, 50)
     where load_id = tests.val('load4') $$,
  $$ values ('Apodaca'::text) $$,
  'matching starts the released unit where it was released'
);
select throws_ok(
  $$ select public.release_vehicle(tests.val('task2'), now(), 25.78, -100.19, 'Apodaca', 'Nuevo León', null) $$,
  '55000', 'release task is not pending', 'a task is released once'
);
select lives_ok(
  $$ select public.set_vehicle_availability('e3300000-0000-4000-8000-00000000000a', now(), 25.69, -100.32,
                                            'Monterrey', 'Nuevo León') $$,
  'once released the unit can be made available again'
);

-- ---------------------------------------------------------------------------
-- 6. A unit already waiting: a second cancellation adds no task; the admin
--    cancels with the load on board; the estimate at the destination goes.
-- ---------------------------------------------------------------------------
select tests.contract('trip4', 1, 'e3300000-0000-4000-8000-00000000000b');
select tests.contract('trip5', 2, null);
select tests.login('a3300000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('trip4'), 'e3300000-0000-4000-8000-00000000000b',
                          'd3300000-0000-4000-8000-00000000000a');
select public.assign_trip(tests.val('trip5'), 'e3300000-0000-4000-8000-00000000000b',
                          'd3300000-0000-4000-8000-00000000000a');
select tests.login('a3300000-0000-4000-8000-000000000005');
select public.record_trip_event(tests.val('trip4'), 'departed', now() + interval '20 seconds', 25.70, -100.33);
select public.record_trip_event(tests.val('trip4'), 'arrived_at_pickup', now() + interval '21 seconds', 25.70, -100.33);
select public.record_trip_event(tests.val('trip4'), 'loading_started', now() + interval '22 seconds', 25.70, -100.33);
select public.record_trip_event(tests.val('trip4'), 'loading_finished', now() + interval '23 seconds', 25.70, -100.33);
select public.record_trip_event(tests.val('trip4'), 'arrived_at_delivery', now() + interval '24 seconds', 20.66, -103.35);
select public.record_trip_event(tests.val('trip4'), 'unloading_started', now() + interval '25 seconds', 20.66, -103.35,
                                null, now() + interval '3 hours');
reset role;
-- Trip 5 set off too (the same unit on its next trip, as the operator app could record it).
update public.trips set status = 'en_route_to_pickup', started_at = now() where id = tests.val('trip5');
set local role authenticated;
select tests.login('a3300000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.cancel_trip(tests.val('trip4'), 'accident', null) $$,
  '42501', 'trip not found', 'the coordinator of another business unit cannot cancel'
);
select tests.login('a3300000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.cancel_trip(tests.val('trip4'), 'accident', null) $$,
  '55000', 'cannot cancel a trip in status unloading', 'the carrier staff cannot cancel with the load on board'
);
select tests.login('a3300000-0000-4000-8000-000000000007');
select public.cancel_trip(tests.val('trip4'), 'accident', null);
select public.cancel_trip(tests.val('trip5'), 'mechanical_failure', null);
reset role;
select results_eq(
  $$ select trip_id from public.vehicle_release_tasks where vehicle_id = 'e3300000-0000-4000-8000-00000000000b' $$,
  $$ values (tests.val('trip4')) $$,
  'a second cancellation while the unit waits adds no task'
);
select is(
  (select count(*)::int from public.notifications where type = 'vehicle_release_pending'
   and data ->> 'vehicleId' = 'e3300000-0000-4000-8000-00000000000b'),
  2, 'and notifies once (the manager and the coordinator)'
);
select is_empty(
  $$ select * from tests.active_availability('e3300000-0000-4000-8000-00000000000b') $$,
  'the estimate at the destination of the cancelled trip does not survive'
);
select is(
  (select cancelled_by_side::text from public.trips where id = tests.val('trip4')), 'admin',
  'an admin cancellation records the admin side'
);
-- While pending, an estimate is kept archived (D11) and gives nothing back.
select public.set_trip_vehicle_availability(t, now() + interval '5 hours')
from public.trips t where t.id = tests.val('trip5');
select is_empty(
  $$ select * from tests.active_availability('e3300000-0000-4000-8000-00000000000b') $$,
  'a trip estimate written while the unit waits stays archived'
);
-- The manager releases it (any business unit of the company).
set local role authenticated;
select tests.login('a3300000-0000-4000-8000-000000000002');
select lives_ok(
  $$ select public.release_vehicle(
       (select id from public.vehicle_release_tasks where trip_id = tests.val('trip4')),
       now() + interval '1 hour', 20.6597, -103.3496, 'Guadalajara', 'Jalisco', null) $$,
  'the manager releases the unit'
);
reset role;
-- W is still booked by the accepted offer of trip 3, so the release is held
-- back as in F5; when that booking goes, W is available where it was released.
select results_eq(
  $$ select source::text, city, archived_at is not null, ended_by_trip_id from public.vehicle_availability
     where vehicle_id = 'e3300000-0000-4000-8000-00000000000b' order by created_at desc limit 1 $$,
  $$ values ('release', 'Guadalajara', true, tests.val('trip3')) $$,
  'a unit still booked keeps its release held back by that booking'
);
set local role authenticated;
select tests.login('a3300000-0000-4000-8000-000000000001');
select public.cancel_trip(tests.val('trip3'), 'shipper_request', null);
reset role;
select results_eq(
  $$ select * from tests.active_availability('e3300000-0000-4000-8000-00000000000b') $$,
  $$ values ('release', 'Guadalajara') $$,
  'and once that booking is cancelled the unit is available where the manager released it'
);

select * from finish();
rollback;
