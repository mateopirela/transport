-- Trips (B06): role x operation RLS matrix for trips, trip_events,
-- trip_locations, trip_evidence and incidents; isolation between companies;
-- only the assigned operator records events, locations and evidence; the
-- shipper sees locations only while the trip is active; the timeline is
-- immutable; every RPC transition, including the availability it feeds.
begin;
create extension if not exists pgtap with schema extensions;

select plan(122);

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

-- A valid load payload MTY -> GDL (loadFormSchema output).
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
grant execute on all functions in schema tests to authenticated;

create table tests.vals (name text primary key, id uuid);
grant select, insert on tests.vals to authenticated;

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;
grant execute on function tests.val(text) to authenticated;

-- Visible rows of a table for the current user, among the two test trips.
create function tests.visible(p_table text)
returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  execute format(
    'select count(*) from public.%I where %s in (tests.val(''trip1''), tests.val(''trip2''))',
    p_table, case p_table when 'trips' then 'id' else 'trip_id' end
  ) into v_count;
  return v_count;
end;
$$;
grant execute on function tests.visible(text) to authenticated;

-- Users: ...01 shipper S   ...02 shipper T (other company)
--        ...03 carrier A   ...04 carrier B (other company)
--        ...05 operator O of A   ...06 operator P of A   ...07 admin
select tests.new_user('a6000000-0000-4000-8000-000000000001', 'sara@s.test', 'shipper');
select tests.new_user('a6000000-0000-4000-8000-000000000002', 'tomas@t.test', 'shipper');
select tests.new_user('a6000000-0000-4000-8000-000000000003', 'ana@a.test', 'manager');
select tests.new_user('a6000000-0000-4000-8000-000000000004', 'beto@b.test', 'manager');
select tests.new_user('a6000000-0000-4000-8000-000000000005', 'oscar@a.test', 'operator');
select tests.new_user('a6000000-0000-4000-8000-000000000006', 'pedro@a.test', 'operator');
select tests.new_user('a6000000-0000-4000-8000-000000000007', 'admin@x.test', 'shipper');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c6000000-0000-4000-8000-000000000001', 'shipper', 'Envíos Sigma SA de CV', 'ESI030303EF3', 'approved'),
  ('c6000000-0000-4000-8000-000000000002', 'shipper', 'Tiendas Tau SA de CV', 'TTA030303EF3', 'approved'),
  ('c6000000-0000-4000-8000-000000000003', 'carrier', 'Fletes Alfa SA de CV', 'FAL010101AB1', 'approved'),
  ('c6000000-0000-4000-8000-000000000004', 'carrier', 'Transportes Beta SA de CV', 'TBE020202CD2', 'approved');

update public.profiles p set company_id = c.id
from (values
  ('a6000000-0000-4000-8000-000000000001'::uuid, 'c6000000-0000-4000-8000-000000000001'::uuid),
  ('a6000000-0000-4000-8000-000000000002', 'c6000000-0000-4000-8000-000000000002'),
  ('a6000000-0000-4000-8000-000000000003', 'c6000000-0000-4000-8000-000000000003'),
  ('a6000000-0000-4000-8000-000000000004', 'c6000000-0000-4000-8000-000000000004'),
  ('a6000000-0000-4000-8000-000000000005', 'c6000000-0000-4000-8000-000000000003'),
  ('a6000000-0000-4000-8000-000000000006', 'c6000000-0000-4000-8000-000000000003')
) as c(uid, id)
where p.id = c.uid;
update public.profiles set role = 'admin' where id = 'a6000000-0000-4000-8000-000000000007';

-- Operators: O and P of A (with accounts), U of A (no account), Q of B.
insert into public.operators (id, company_id, profile_id, full_name) values
  ('d6000000-0000-4000-8000-000000000005', 'c6000000-0000-4000-8000-000000000003',
   'a6000000-0000-4000-8000-000000000005', 'Óscar Operador'),
  ('d6000000-0000-4000-8000-000000000006', 'c6000000-0000-4000-8000-000000000003',
   'a6000000-0000-4000-8000-000000000006', 'Pedro Operador'),
  ('d6000000-0000-4000-8000-000000000009', 'c6000000-0000-4000-8000-000000000003', null, 'Ulises Sin Cuenta'),
  ('d6000000-0000-4000-8000-000000000008', 'c6000000-0000-4000-8000-000000000004', null, 'Quique Operador');
-- D16 (G3): assign_trip needs a current license of a suitable type.
update public.operators set license_type = 'E', license_expires_on = current_date + 365
where license_type is null;
-- O and P consented to share their location (B22: record_trip_locations
-- requires it; 13_location_consents covers the consent itself).
insert into public.location_consents (user_id, policy_version, platform) values
  ('a6000000-0000-4000-8000-000000000005', '2026-10-15', 'android'),
  ('a6000000-0000-4000-8000-000000000006', '2026-10-15', 'ios');
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('e6000000-0000-4000-8000-000000000003', 'c6000000-0000-4000-8000-000000000003', 'rigid', 'AAA1111', 'dry_van', 30000),
  ('e6000000-0000-4000-8000-000000000004', 'c6000000-0000-4000-8000-000000000004', 'rigid', 'BBB1111', 'dry_van', 30000);

-- The photo minimums of B23 are covered by 13_trip_evidence_capture; here the
-- trip moves through its statuses without them.
update public.trip_evidence_requirements set min_photos = 0;

-- ---------------------------------------------------------------------------
-- accept_offer creates the trip. Trip 1: S x A. Trip 2: T x B.
-- ---------------------------------------------------------------------------
set local role authenticated;

select tests.login('a6000000-0000-4000-8000-000000000001');
insert into tests.vals select 'load1', public.create_load(tests.payload());
select public.publish_load(tests.val('load1'));
select tests.login('a6000000-0000-4000-8000-000000000002');
insert into tests.vals select 'load2', public.create_load(tests.payload());
select public.publish_load(tests.val('load2'));

select tests.login('a6000000-0000-4000-8000-000000000003');
insert into tests.vals select 'offer1', public.make_offer(tests.val('load1'), 3400000);
select tests.login('a6000000-0000-4000-8000-000000000004');
insert into tests.vals select 'offer2', public.make_offer(tests.val('load2'), 3300000);

select tests.login('a6000000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip1', public.accept_offer(tests.val('offer1'));
select tests.login('a6000000-0000-4000-8000-000000000002');
insert into tests.vals select 'trip2', public.accept_offer(tests.val('offer2'));

select tests.login('a6000000-0000-4000-8000-000000000001');
select results_eq(
  $$ select load_id, offer_id, shipper_company_id, carrier_company_id, status::text, vehicle_id, operator_id
     from public.trips where id = tests.val('trip1') $$,
  $$ values (tests.val('load1'), tests.val('offer1'), 'c6000000-0000-4000-8000-000000000001'::uuid,
             'c6000000-0000-4000-8000-000000000003'::uuid, 'pending_assignment', null::uuid, null::uuid) $$,
  'accept_offer creates a trip pending assignment for the load, the offer and both companies'
);
select results_eq(
  $$ select event_type::text, to_status::text, actor_role::text from public.trip_events where trip_id = tests.val('trip1') $$,
  $$ values ('created', 'pending_assignment', 'shipper') $$,
  'the timeline starts with a created event'
);

-- ---------------------------------------------------------------------------
-- Visibility matrix of trips
-- ---------------------------------------------------------------------------
select is(tests.visible('trips'), 1::bigint, 'shipper S sees only its trip');
select is((select count(*) from public.trips where id = tests.val('trip2')), 0::bigint, 'S does not see T''s trip');
select tests.login('a6000000-0000-4000-8000-000000000002');
select is(tests.visible('trips'), 1::bigint, 'shipper T sees only its trip');
select tests.login('a6000000-0000-4000-8000-000000000003');
select is((select count(*) from public.trips where id = tests.val('trip1')), 1::bigint, 'carrier A sees its trip');
select is((select count(*) from public.trips where id = tests.val('trip2')), 0::bigint, 'A does not see B''s trip');
select tests.login('a6000000-0000-4000-8000-000000000004');
select is((select count(*) from public.trips where id = tests.val('trip1')), 0::bigint, 'B does not see A''s trip');
select tests.login('a6000000-0000-4000-8000-000000000005');
select is(tests.visible('trips'), 0::bigint, 'an operator sees no trip before it is assigned to it');
select tests.login('a6000000-0000-4000-8000-000000000007');
select is(tests.visible('trips'), 2::bigint, 'admins see every trip');

select throws_ok(
  $$ update public.trips set status = 'closed' where id = tests.val('trip1') $$, '42501', null,
  'clients cannot update trips directly'
);
select throws_ok(
  $$ insert into public.trip_events (trip_id, event_type, occurred_at) values (tests.val('trip1'), 'departed', now()) $$,
  '42501', null, 'clients cannot insert trip events directly'
);

-- ---------------------------------------------------------------------------
-- assign_trip
-- ---------------------------------------------------------------------------
select tests.login('a6000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip1'), 'departed', now()) $$, '42501', null,
  'an operator cannot record events of a trip it is not assigned to'
);
select tests.login('a6000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e6000000-0000-4000-8000-000000000003',
                               'd6000000-0000-4000-8000-000000000005') $$,
  '42501', null, 'the shipper cannot assign the trip'
);
select tests.login('a6000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e6000000-0000-4000-8000-000000000004',
                               'd6000000-0000-4000-8000-000000000008') $$,
  '42501', null, 'another carrier cannot assign the trip'
);
select tests.login('a6000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e6000000-0000-4000-8000-000000000004',
                               'd6000000-0000-4000-8000-000000000005') $$,
  '22023', null, 'the unit must belong to the carrier'
);
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e6000000-0000-4000-8000-000000000003',
                               'd6000000-0000-4000-8000-000000000008') $$,
  '22023', null, 'the operator must belong to the carrier'
);
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e6000000-0000-4000-8000-000000000003',
                               'd6000000-0000-4000-8000-000000000009') $$,
  '22023', null, 'the operator must have an account'
);
select lives_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e6000000-0000-4000-8000-000000000003',
                               'd6000000-0000-4000-8000-000000000006') $$,
  'the carrier assigns its unit and operator'
);
select lives_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e6000000-0000-4000-8000-000000000003',
                               'd6000000-0000-4000-8000-000000000005') $$,
  'the carrier can reassign before departure'
);
select results_eq(
  $$ select status::text, vehicle_id, operator_id, assigned_at is not null from public.trips where id = tests.val('trip1') $$,
  $$ values ('assigned', 'e6000000-0000-4000-8000-000000000003'::uuid, 'd6000000-0000-4000-8000-000000000005'::uuid,
             true) $$,
  'the trip is assigned to the unit and the last operator'
);
select is(
  (select count(*) from public.trip_events where trip_id = tests.val('trip1') and event_type = 'assigned'), 2::bigint,
  'each assignment is recorded in the timeline'
);

select tests.login('a6000000-0000-4000-8000-000000000006');
select is(tests.visible('trips'), 0::bigint, 'a reassigned operator no longer sees the trip');
select tests.login('a6000000-0000-4000-8000-000000000005');
select is(tests.visible('trips'), 1::bigint, 'the assigned operator sees its trip');
select is(
  (select count(*) from public.loads where id in (tests.val('load1'), tests.val('load2'))), 1::bigint,
  'the assigned operator sees the load of its trip, and no other'
);
select is(
  (select count(*) from public.vehicles
   where id in ('e6000000-0000-4000-8000-000000000003', 'e6000000-0000-4000-8000-000000000004')),
  1::bigint,
  'the assigned operator sees the unit of its trip without the fleet assignment'
);
select tests.login('a6000000-0000-4000-8000-000000000006');
select is(
  (select count(*) from public.vehicles where id = 'e6000000-0000-4000-8000-000000000003'), 0::bigint,
  'a reassigned operator no longer sees the unit of the trip'
);

select tests.login('a6000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ update public.operators set archived_at = now() where id = 'd6000000-0000-4000-8000-000000000005' $$,
  '55000', 'cannot archive: it is assigned to a trip in progress',
  'the carrier cannot archive the operator of a trip in progress'
);
select throws_ok(
  $$ update public.vehicles set archived_at = now() where id = 'e6000000-0000-4000-8000-000000000003' $$,
  '55000', 'cannot archive: it is assigned to a trip in progress',
  'the carrier cannot archive the unit of a trip in progress'
);
select lives_ok(
  $$ update public.operators set archived_at = now() where id = 'd6000000-0000-4000-8000-000000000009' $$,
  'operators without a trip in progress can still be archived'
);
select tests.login('a6000000-0000-4000-8000-000000000005');

-- ---------------------------------------------------------------------------
-- record_trip_event: only the assigned operator, in order
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip1'), 'arrived_at_pickup', now()) $$, '55000', null,
  'states cannot be skipped'
);
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip1'), 'delivery_confirmed', now()) $$, '22023', null,
  'only operator status events are accepted'
);
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip1'), 'departed', now() + interval '1 hour') $$, '22023', null,
  'occurred_at cannot be in the future'
);
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip1'), 'departed', now(), 25.6) $$, '22023', null,
  'a location needs both coordinates'
);
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip1'), 'departed', now()) $$, '22023',
  'the location of the event is required',
  'every operator status event needs its location (D11)'
);
select tests.login('a6000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip1'), 'departed', now()) $$, '42501', null,
  'the carrier does not record operator events'
);
select tests.login('a6000000-0000-4000-8000-000000000006');
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip1'), 'departed', now()) $$, '42501', null,
  'another operator of the carrier cannot record events'
);

select tests.login('a6000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select public.record_trip_locations(tests.val('trip1'),
       jsonb_build_array(jsonb_build_object('recordedAt', now(), 'lat', 25.7, 'lng', -100.3))) $$,
  '55000', null, 'no location is accepted before the departure'
);
insert into tests.vals select 'ev_departed', public.record_trip_event(
  tests.val('trip1'), 'departed', now() - interval '4 minutes', 25.6866, -100.3161, 12, null, null,
  'f6000000-0000-4000-8000-0000000000e1'
);
select is(
  public.record_trip_event(tests.val('trip1'), 'departed', now() - interval '4 minutes', 25.6866, -100.3161, 12, null,
                           null, 'f6000000-0000-4000-8000-0000000000e1'),
  tests.val('ev_departed'),
  'a retried event (same client_event_id) returns the stored event'
);
select results_eq(
  $$ select status::text, started_at from public.trips where id = tests.val('trip1') $$,
  $$ values ('en_route_to_pickup', now() - interval '4 minutes') $$,
  'departing starts the trip with the device time'
);
select results_eq(
  $$ select from_status::text, to_status::text, occurred_at, recorded_at, actor_role::text
     from public.trip_events where id = tests.val('ev_departed') $$,
  $$ values ('assigned', 'en_route_to_pickup', now() - interval '4 minutes', now(), 'operator') $$,
  'the event keeps the transition, occurred_at and the actor'
);
select results_eq(
  $$ select source, round(latitude::numeric, 4), accuracy_m from public.trip_point_locations(tests.val('trip1'))
     where record_id = tests.val('ev_departed') $$,
  $$ values ('event', 25.6866, 12::real) $$,
  'the event keeps its location, readable through trip_point_locations'
);
select throws_ok(
  $$ select latitude from public.trip_events where id = tests.val('ev_departed') $$, '42501', null,
  'event coordinates are not readable as columns'
);
select is(
  (select status::text from public.loads where id = tests.val('load1')), 'in_progress',
  'departing puts the load in progress'
);
select lives_ok(
  $$ select public.record_trip_event(tests.val('trip1'), 'arrived_at_pickup', now() - interval '210 seconds',
                                     25.7001, -100.2502);
     select public.record_trip_event(tests.val('trip1'), 'loading_started', now() - interval '180 seconds',
                                     25.7001, -100.2502);
     select public.record_trip_event(tests.val('trip1'), 'loading_finished', now() - interval '150 seconds',
                                     25.7001, -100.2502);
     select public.record_trip_event(tests.val('trip1'), 'arrived_at_delivery', now() - interval '120 seconds',
                                     20.6597, -103.3496) $$,
  'the operator advances the trip in order'
);
select is(
  (select status::text from public.trips where id = tests.val('trip1')), 'at_delivery', 'the trip is at delivery'
);

-- ---------------------------------------------------------------------------
-- record_trip_locations
-- ---------------------------------------------------------------------------
select is(
  public.record_trip_locations(tests.val('trip1'), jsonb_build_array(
    jsonb_build_object('recordedAt', now() - interval '10 minutes', 'lat', 25.6, 'lng', -100.3),
    jsonb_build_object('recordedAt', now() - interval '3 minutes', 'lat', 25.0, 'lng', -101.0, 'accuracyM', 8,
                       'speedMps', 25.5, 'headingDeg', 220),
    jsonb_build_object('recordedAt', now() - interval '2 minutes', 'lat', 21.0, 'lng', -103.0),
    jsonb_build_object('recordedAt', now() - interval '2 minutes', 'lat', 21.0, 'lng', -103.0)
  )),
  2,
  'a batch stores the points inside the trip window once (before departure and duplicates are dropped)'
);
select is(
  public.record_trip_locations(tests.val('trip1'), jsonb_build_array(
    jsonb_build_object('recordedAt', now() - interval '2 minutes', 'lat', 21.0, 'lng', -103.0)
  )),
  0,
  'retrying a batch stores nothing new'
);
select throws_ok(
  $$ select public.record_trip_locations(tests.val('trip1'), jsonb_build_array(
       jsonb_build_object('recordedAt', now(), 'lat', 'norte', 'lng', -100.3))) $$,
  '22023', null, 'malformed points are rejected'
);
select throws_ok(
  $$ select public.record_trip_locations(tests.val('trip1'), jsonb_build_array(
       jsonb_build_object('recordedAt', now(), 'lat', 95, 'lng', -100.3))) $$,
  '22023', null, 'out-of-range coordinates are rejected'
);
select throws_ok(
  $$ select public.record_trip_locations(tests.val('trip1'),
       (select jsonb_agg(jsonb_build_object('recordedAt', now() - i * interval '1 second', 'lat', 25, 'lng', -100))
        from generate_series(1, 501) i)) $$,
  '22023', null, 'a batch has at most 500 points'
);
select tests.login('a6000000-0000-4000-8000-000000000006');
select throws_ok(
  $$ select public.record_trip_locations(tests.val('trip1'),
       jsonb_build_array(jsonb_build_object('recordedAt', now(), 'lat', 25.7, 'lng', -100.3))) $$,
  '42501', null, 'only the assigned operator sends locations'
);
select is(tests.visible('trip_locations'), 0::bigint, 'another operator does not see the locations');

select tests.login('a6000000-0000-4000-8000-000000000001');
select is(tests.visible('trip_locations'), 2::bigint, 'the shipper sees the locations while the trip is active');
select is(
  (select count(*) from public.trip_point_locations(tests.val('trip1'))), 5::bigint,
  'the shipper sees the event locations while the trip is active'
);
select tests.login('a6000000-0000-4000-8000-000000000002');
select is(tests.visible('trip_locations'), 0::bigint, 'another shipper does not see them');
select is(
  (select count(*) from public.trip_point_locations(tests.val('trip1'))), 0::bigint,
  'another shipper gets no event locations'
);
select tests.login('a6000000-0000-4000-8000-000000000004');
select is(tests.visible('trip_locations'), 0::bigint, 'another carrier does not see them');
select tests.login('a6000000-0000-4000-8000-000000000003');
select is(tests.visible('trip_locations'), 2::bigint, 'the carrier sees its trip locations');

-- ---------------------------------------------------------------------------
-- Unloading: estimated end and availability (return-trip mode)
-- ---------------------------------------------------------------------------
select tests.login('a6000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip1'), 'unloading_started', now() - interval '130 seconds',
                                     20.6597, -103.3496, null, now() + interval '3 days') $$,
  '22023', 'occurred_at is before the previous event of the trip',
  'an event cannot happen before the previous one (device clock moved back)'
);
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip1'), 'unloading_started', now() - interval '90 seconds',
                                     20.6597, -103.3496) $$,
  '22023', null, 'starting to unload needs the estimated end of unloading'
);
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip1'), 'unloading_started', now() - interval '90 seconds',
                                     20.6597, -103.3496, null, now() + interval '60 days') $$,
  '22023', null, 'the estimate must be plausible'
);
select lives_ok(
  $$ select public.record_trip_event(tests.val('trip1'), 'unloading_started', now() + interval '30 seconds',
                                     20.6597, -103.3496, null, now() + interval '3 days') $$,
  'the operator starts unloading with an estimated end (device clock 30 s ahead)'
);
select is(
  (select estimated_unload_end_at from public.trips where id = tests.val('trip1')), now() + interval '3 days',
  'the trip keeps the current estimate'
);
reset role;
select results_eq(
  $$ select available_from, city, state, source::text, round(extensions.st_y(location::extensions.geometry)::numeric, 4)
     from public.vehicle_availability
     where vehicle_id = 'e6000000-0000-4000-8000-000000000003' and archived_at is null $$,
  $$ values (now() + interval '3 days', 'Guadalajara', 'Jalisco', 'trip_estimate', 20.6597) $$,
  'the unit becomes available at the destination from the estimated end'
);
set local role authenticated;

select lives_ok(
  $$ select public.set_estimated_unload_end(tests.val('trip1'), now() + interval '5 days', null,
                                            'f6000000-0000-4000-8000-0000000000e2') $$,
  'the operator updates the estimate without a device time while the device clock is ahead'
);
select lives_ok(
  $$ select public.set_estimated_unload_end(tests.val('trip1'), now() + interval '5 days', null,
                                            'f6000000-0000-4000-8000-0000000000e2') $$,
  'updating the estimate is idempotent'
);
select results_eq(
  $$ select count(*), max(estimated_unload_end_at) from public.trip_events
     where trip_id = tests.val('trip1') and event_type = 'unload_estimate_updated' $$,
  $$ values (1::bigint, now() + interval '5 days') $$,
  'every estimate is kept in the timeline'
);
select is(
  (select occurred_at from public.trip_events
   where trip_id = tests.val('trip1') and event_type = 'unload_estimate_updated'),
  now() + interval '30 seconds',
  'without a device time the estimate is not dated before the start of unloading'
);
reset role;
select results_eq(
  $$ select count(*) filter (where archived_at is null),
            max(available_from) filter (where archived_at is null)
     from public.vehicle_availability where vehicle_id = 'e6000000-0000-4000-8000-000000000003' $$,
  $$ values (1::bigint, now() + interval '5 days') $$,
  'the new estimate replaces the unit availability'
);
set local role authenticated;
select tests.login('a6000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.set_estimated_unload_end(tests.val('trip1'), now() + interval '2 days') $$, '42501', null,
  'only the assigned operator updates the estimate'
);

-- ---------------------------------------------------------------------------
-- Evidence (bucket `evidence`)
-- ---------------------------------------------------------------------------
select tests.login('a6000000-0000-4000-8000-000000000005');
insert into tests.vals values ('photo1', 'b6000000-0000-4000-8000-000000000001');
select lives_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, owner_id, metadata)
       values ('evidence', '%s/delivery/b6000000-0000-4000-8000-000000000001.jpg',
               'a6000000-0000-4000-8000-000000000005', '{"mimetype": "image/jpeg", "size": 2048}') $$,
    tests.val('trip1')
  ),
  'the assigned operator uploads a photo to its trip folder'
);
select throws_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, owner_id)
       values ('evidence', '%s/delivery/b6000000-0000-4000-8000-000000000002.jpg', 'a6000000-0000-4000-8000-000000000005') $$,
    tests.val('trip2')
  ),
  '42501', null, 'an operator cannot upload to another trip folder'
);
select throws_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, owner_id)
       values ('evidence', '%s/delivery/notes.txt', 'a6000000-0000-4000-8000-000000000005') $$,
    tests.val('trip1')
  ),
  '42501', null, 'evidence paths are {trip}/{stage}/{uuid}.{image extension}'
);
select throws_ok(
  format(
    $$ select public.add_trip_evidence(%L, 'delivery', '%s/delivery/b6000000-0000-4000-8000-000000000001.jpg',
                                       'not-a-hash', now()) $$,
    tests.val('trip1'), tests.val('trip1')
  ),
  '22023', null, 'the hash must be a SHA-256 hex digest'
);
select throws_ok(
  format(
    $$ select public.add_trip_evidence(%L, 'pickup', '%s/delivery/b6000000-0000-4000-8000-000000000001.jpg',
                                       repeat('a', 64), now()) $$,
    tests.val('trip1'), tests.val('trip1')
  ),
  '22023', null, 'the stage must match the path'
);
select throws_ok(
  format(
    $$ select public.add_trip_evidence(%L, 'delivery', '%s/delivery/b6000000-0000-4000-8000-0000000000ff.jpg',
                                       repeat('a', 64), now()) $$,
    tests.val('trip1'), tests.val('trip1')
  ),
  '22023', null, 'the file must have been uploaded'
);
insert into tests.vals select 'evidence1', public.add_trip_evidence(
  tests.val('trip1'), 'delivery', tests.val('trip1') || '/delivery/b6000000-0000-4000-8000-000000000001.jpg',
  repeat('ab', 32), now() - interval '1 minute', 20.6597, -103.3496
);
select results_eq(
  $$ select stage::text, sha256, mime_type, size_bytes, captured_at from public.trip_evidence where id = tests.val('evidence1') $$,
  $$ values ('delivery', repeat('ab', 32), 'image/jpeg', 2048::bigint, now() - interval '1 minute') $$,
  'evidence keeps the stage, hash, capture time and file metadata'
);
select is(
  public.add_trip_evidence(
    tests.val('trip1'), 'delivery', tests.val('trip1') || '/delivery/b6000000-0000-4000-8000-000000000001.jpg',
    repeat('ab', 32), now() - interval '1 minute'
  ),
  tests.val('evidence1'),
  'registering the same file again returns the stored evidence'
);
select tests.login('a6000000-0000-4000-8000-000000000001');
select is(tests.visible('trip_evidence'), 1::bigint, 'the shipper sees the evidence of its trip');
select is(
  (select count(*) from storage.objects where bucket_id = 'evidence'), 1::bigint,
  'the shipper can read the evidence file'
);
select tests.login('a6000000-0000-4000-8000-000000000002');
select is(tests.visible('trip_evidence'), 0::bigint, 'another shipper does not see the evidence');
select is(
  (select count(*) from storage.objects where bucket_id = 'evidence'), 0::bigint,
  'another shipper cannot read the evidence file'
);

-- ---------------------------------------------------------------------------
-- Incidents
-- ---------------------------------------------------------------------------
select tests.login('a6000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.report_incident(tests.val('trip1'), 'delay', 'Retraso') $$, '42501', null,
  'another shipper cannot report incidents on the trip'
);
select tests.login('a6000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.report_incident(tests.val('trip1'), 'delay', '   ') $$, '22023', null,
  'an incident needs a description'
);
insert into tests.vals select 'incident1', public.report_incident(tests.val('trip1'), 'delay', 'La descarga se retrasó');
select results_eq(
  $$ select kind::text, status::text, reporter_role::text from public.incidents where id = tests.val('incident1') $$,
  $$ values ('delay', 'open', 'shipper') $$,
  'the shipper reports an incident'
);
select tests.login('a6000000-0000-4000-8000-000000000003');
select is(tests.visible('incidents'), 1::bigint, 'the carrier sees the incident');
select throws_ok(
  $$ select public.resolve_incident(tests.val('incident1'), 'Resuelto') $$, '42501', null,
  'only admins resolve incidents'
);
select tests.login('a6000000-0000-4000-8000-000000000004');
select is(tests.visible('incidents'), 0::bigint, 'another carrier does not see the incident');
select tests.login('a6000000-0000-4000-8000-000000000007');
select throws_ok(
  $$ select public.resolve_incident(tests.val('incident1'), rpad('Se reprogramó la cita de descarga', 2001, '.')) $$,
  '22023', null, 'a resolution is at most 2000 characters'
);
select lives_ok(
  $$ select public.resolve_incident(tests.val('incident1'), rpad('Se reprogramó la cita de descarga', 2000, '.')) $$,
  'an admin resolves the incident (2000 characters fit)'
);
select is(
  (select char_length(notes) from public.trip_events
   where incident_id = tests.val('incident1') and event_type = 'incident_resolved'),
  2000,
  'the whole resolution is kept in the timeline'
);
select throws_ok(
  $$ select public.resolve_incident(tests.val('incident1'), 'Otra vez') $$, '55000', null,
  'a resolved incident cannot be resolved again'
);
reset role;
select is(
  (select count(*) from public.audit_log where table_name = 'incidents' and record_id = tests.val('incident1')),
  1::bigint,
  'the admin resolution is audited'
);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Delivery: locations stop, the shipper loses them, confirmation closes
-- ---------------------------------------------------------------------------
select tests.login('a6000000-0000-4000-8000-000000000005');
select lives_ok(
  $$ select public.record_trip_event(tests.val('trip1'), 'unloading_finished', now() + interval '1 minute',
                                     20.6597, -103.3496, p_received_by_name => 'Rosa Almacén') $$,
  'the operator finishes unloading'
);
select results_eq(
  $$ select status::text, delivered_at from public.trips where id = tests.val('trip1') $$,
  $$ values ('delivered', now() + interval '1 minute') $$,
  'the trip is delivered at the device time'
);
reset role;
select is(
  (select available_from from public.vehicle_availability
   where vehicle_id = 'e6000000-0000-4000-8000-000000000003' and archived_at is null),
  now() + interval '1 minute',
  'the real end of unloading replaces the estimate in the availability'
);
set local role authenticated;
select is(
  public.record_trip_locations(tests.val('trip1'), jsonb_build_array(
    jsonb_build_object('recordedAt', now() + interval '2 minutes', 'lat', 20.66, 'lng', -103.35),
    jsonb_build_object('recordedAt', now() - interval '1 minute', 'lat', 20.66, 'lng', -103.35)
  )),
  1,
  'after delivery only queued points from before the delivery are stored'
);
select tests.login('a6000000-0000-4000-8000-000000000001');
select is(tests.visible('trip_locations'), 0::bigint, 'the shipper no longer sees locations once the trip is not active');
select is(
  (select count(*) from public.trip_point_locations(tests.val('trip1'))), 0::bigint,
  'nor the locations of events and evidence'
);
select tests.login('a6000000-0000-4000-8000-000000000003');
select is(tests.visible('trip_locations'), 3::bigint, 'the carrier keeps the trip locations');
select is(
  (select array_agg(source order by source) from public.trip_point_locations(tests.val('trip1'))),
  array['event', 'event', 'event', 'event', 'event', 'event', 'event', 'evidence'],
  'the carrier keeps the event and evidence locations'
);
select throws_ok(
  $$ select public.confirm_delivery(tests.val('trip1')) $$, '42501', null, 'the carrier cannot confirm delivery'
);
select tests.login('a6000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.confirm_delivery(tests.val('trip1'), 'Todo en orden') $$, 'the shipper confirms delivery');
select results_eq(
  $$ select t.status::text, t.closed_at is not null, l.status::text
     from public.trips t join public.loads l on l.id = t.load_id where t.id = tests.val('trip1') $$,
  $$ values ('closed', true, 'completed') $$,
  'confirming closes the trip and completes the load'
);
select is(
  (select array_agg(event_type::text order by event_type)
   from public.trip_events where trip_id = tests.val('trip1') and event_type not in ('assigned', 'created')),
  array['departed', 'arrived_at_pickup', 'loading_started', 'loading_finished', 'arrived_at_delivery',
        'unloading_started', 'unloading_finished', 'delivery_confirmed', 'unload_estimate_updated',
        'incident_reported', 'incident_resolved'],
  'the timeline holds every event once'
);
select tests.login('a6000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select public.record_trip_locations(tests.val('trip1'),
       jsonb_build_array(jsonb_build_object('recordedAt', now(), 'lat', 20.66, 'lng', -103.35))) $$,
  '55000', null, 'no location is accepted once the trip is closed'
);
select is(
  (select count(*) from public.vehicles where id = 'e6000000-0000-4000-8000-000000000003'), 0::bigint,
  'once the trip is closed the operator no longer sees the unit through it'
);

-- ---------------------------------------------------------------------------
-- Cancellation (trip 2: T x B)
-- ---------------------------------------------------------------------------
select tests.login('a6000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.cancel_trip(tests.val('trip2'), 'No') $$, '42501', null, 'a stranger cannot cancel the trip'
);
select tests.login('a6000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.cancel_trip(tests.val('trip2'), '  ') $$, '22023', null, 'cancelling needs a reason'
);
select lives_ok(
  $$ select public.cancel_trip(tests.val('trip2'), 'Unidad descompuesta') $$, 'the carrier cancels before departure'
);
select results_eq(
  $$ select t.status::text, t.cancellation_reason, l.status::text
     from public.trips t join public.loads l on l.id = t.load_id where t.id = tests.val('trip2') $$,
  $$ values ('cancelled', 'Unidad descompuesta', 'cancelled') $$,
  'cancelling the trip cancels the load'
);
select throws_ok(
  $$ select public.report_incident(tests.val('trip2'), 'other', 'Algo') $$, '55000', null,
  'no incidents on a cancelled trip'
);
select tests.login('a6000000-0000-4000-8000-000000000007');
select throws_ok(
  $$ select public.cancel_trip(tests.val('trip1'), 'Tarde') $$, '55000', null, 'a closed trip cannot be cancelled'
);

-- ---------------------------------------------------------------------------
-- Immutability and privileges (as table owner)
-- ---------------------------------------------------------------------------
reset role;
select throws_ok(
  $$ update public.trip_events set occurred_at = now() where trip_id = tests.val('trip1') $$, '42501', null,
  'trip events cannot be updated, not even by the owner'
);
select throws_ok(
  $$ delete from public.trip_events where trip_id = tests.val('trip1') $$, '42501', null,
  'trip events cannot be deleted'
);
select throws_ok($$ truncate public.trip_events cascade $$, '42501', null, 'trip events cannot be truncated');
select throws_ok(
  $$ update public.trip_locations set latitude = 0 where trip_id = tests.val('trip1') $$, '42501', null,
  'locations cannot be updated'
);
select throws_ok(
  $$ delete from public.trip_evidence where trip_id = tests.val('trip1') $$, '42501', null,
  'evidence cannot be deleted'
);
select ok(
  not has_table_privilege('anon', 'public.trips', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.trip_events', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.trip_locations', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.trip_evidence', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.incidents', 'select,insert,update,delete'),
  'anon has no privileges on the trip tables'
);
select ok(
  not has_table_privilege('authenticated', 'public.trips', 'insert,update,delete')
  and not has_table_privilege('authenticated', 'public.trip_events', 'insert,update,delete')
  and not has_table_privilege('authenticated', 'public.trip_locations', 'insert,update,delete')
  and not has_table_privilege('authenticated', 'public.trip_evidence', 'insert,update,delete')
  and not has_table_privilege('authenticated', 'public.incidents', 'insert,update,delete'),
  'clients only read the trip tables'
);
select ok(
  not has_function_privilege('authenticated', 'public.lock_trip_as_operator(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.set_trip_vehicle_availability(public.trips, timestamptz)',
                                 'execute')
  and not has_function_privilege('authenticated', 'public.trip_event_transition(public.trip_event_type)', 'execute')
  and not has_function_privilege('authenticated', 'public.reject_mutation()', 'execute'),
  'internal helpers are not callable by clients'
);

select * from finish();
rollback;
