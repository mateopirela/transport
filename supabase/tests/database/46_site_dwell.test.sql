-- H5 · Waiting times at loading and unloading sites (D32):
--   * the trigger measures waiting and handling at the pickup and the
--     delivery from the trip events (also an offline event that arrives
--     late, by its occurred_at) and excludes the outliers;
--   * site_dwell_estimate: tiers (same site and hour band → same site → same
--     shipper → default 4 h), each from 5 valid measurements, and the privacy
--     rule (others' trips only from 2 carriers up; a shipper only its own);
--   * trip_stop_dwells: read by the trip's staff, its shipper and admins;
--     written by nobody but the trigger;
--   * trip_estimated_end: the measured or default time after the estimated
--     arrival, the operator's estimate, the real end; 42501 for outsiders;
--   * vehicle_trip_chain_end uses the estimate for return trips, also with
--     two booked trips (the delay of the first carries into the second).
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

create schema tests;
grant usage on schema tests to authenticated;

create function tests.new_user(p_id uuid, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@h5.test', now(),
          case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end,
          jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
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

-- A MTY -> GDL load: pickup in p_days (4 h window), delivery the day after
-- (6 h window), both at the hour of the transaction.
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

-- The shipper publishes a load, the carrier's manager offers (naming
-- p_vehicle_id, if any) and the shipper accepts. Returns the trip.
create function tests.contract(p_name text, p_carrier uuid, p_days integer default 1,
                               p_vehicle_id uuid default null,
                               p_shipper uuid default 'a4600000-0000-4000-8000-000000000001')
returns uuid
language plpgsql
as $$
declare
  v_load uuid;
  v_offer uuid;
  v_trip uuid;
begin
  perform tests.login(p_shipper);
  v_load := public.create_load(tests.payload(p_days));
  perform public.publish_load(v_load);
  perform tests.login(p_carrier);
  v_offer := public.make_offer(v_load, 3000000, null, p_vehicle_id);
  perform tests.login(p_shipper);
  v_trip := public.accept_offer(v_offer);
  insert into tests.vals values (p_name, v_trip);
  return v_trip;
end;
$$;

-- A past unloading of a trip, written as the owner (the events of an
-- operator who already did it): arrival, then p_wait minutes of waiting and
-- p_handling minutes of unloading.
create function tests.unloaded(p_trip uuid, p_arrived timestamptz, p_wait integer, p_handling integer)
returns void
language sql
as $$
  insert into public.trip_events (trip_id, event_type, occurred_at, latitude, longitude)
  values (p_trip, 'arrived_at_delivery', p_arrived, 20.6597, -103.3496),
         (p_trip, 'unloading_started', p_arrived + make_interval(mins => p_wait), 20.6597, -103.3496),
         (p_trip, 'unloading_finished', p_arrived + make_interval(mins => p_wait + p_handling), 20.6597, -103.3496);
$$;

-- What the signed-in caller gets for the GDL delivery site.
create function tests.gdl(p_at timestamptz default now(), p_shipper uuid default null)
returns text[]
language sql
as $$
  select array[e.basis, e.sample_size::text, e.total_median_minutes::text]
  from public.site_dwell_estimate('delivery', 20.6597, -103.3496, p_shipper, p_at) e;
$$;

grant execute on all functions in schema tests to authenticated;

-- Users: ...01 shipper S, ...02 manager of carrier A, ...03 manager of B,
-- ...04 manager of C, ...05 operator O of A, ...06 shipper S2, ...07 admin.
select tests.new_user('a4600000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a4600000-0000-4000-8000-000000000002', 'manager');
select tests.new_user('a4600000-0000-4000-8000-000000000003', 'manager');
select tests.new_user('a4600000-0000-4000-8000-000000000004', 'manager');
select tests.new_user('a4600000-0000-4000-8000-000000000005', 'operator');
select tests.new_user('a4600000-0000-4000-8000-000000000006', 'shipper');
select tests.new_user('a4600000-0000-4000-8000-000000000007', 'shipper');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c4600000-0000-4000-8000-000000000001', 'shipper', 'Envíos Sigma SA de CV', 'ESI050505GH5', 'approved'),
  ('c4600000-0000-4000-8000-000000000002', 'carrier', 'Fletes Alfa SA de CV', 'FAL040404CD4', 'approved'),
  ('c4600000-0000-4000-8000-000000000003', 'carrier', 'Fletes Beta SA de CV', 'FBE040404CD4', 'approved'),
  ('c4600000-0000-4000-8000-000000000004', 'carrier', 'Fletes Gama SA de CV', 'FGA040404CD4', 'approved'),
  ('c4600000-0000-4000-8000-000000000006', 'shipper', 'Envíos Tau SA de CV', 'ETA050505GH5', 'approved');
update public.profiles p set company_id = v.company_id::uuid
from (values
  ('a4600000-0000-4000-8000-000000000001', 'c4600000-0000-4000-8000-000000000001'),
  ('a4600000-0000-4000-8000-000000000002', 'c4600000-0000-4000-8000-000000000002'),
  ('a4600000-0000-4000-8000-000000000003', 'c4600000-0000-4000-8000-000000000003'),
  ('a4600000-0000-4000-8000-000000000004', 'c4600000-0000-4000-8000-000000000004'),
  ('a4600000-0000-4000-8000-000000000005', 'c4600000-0000-4000-8000-000000000002'),
  ('a4600000-0000-4000-8000-000000000006', 'c4600000-0000-4000-8000-000000000006')
) as v(id, company_id)
where p.id = v.id::uuid;
update public.profiles set role = 'admin' where id = 'a4600000-0000-4000-8000-000000000007';

insert into public.operators (id, company_id, profile_id, full_name, license_type, license_expires_on)
values ('d4600000-0000-4000-8000-000000000005', 'c4600000-0000-4000-8000-000000000002',
        'a4600000-0000-4000-8000-000000000005', 'Óscar Operador', 'E', current_date + 365);
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg)
values ('e4600000-0000-4000-8000-000000000001', 'c4600000-0000-4000-8000-000000000002', 'rigid', 'HHH5001',
        'dry_van', 30000);
-- Photos and documents are not what these tests are about.
update public.trip_evidence_requirements set min_photos = 0;
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.id = 'e4600000-0000-4000-8000-000000000001'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- ---------------------------------------------------------------------------
-- 1. The trigger measures the stops
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.contract('t1', 'a4600000-0000-4000-8000-000000000002');
select tests.login('a4600000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('t1'), 'e4600000-0000-4000-8000-000000000001',
                          'd4600000-0000-4000-8000-000000000005');
select tests.login('a4600000-0000-4000-8000-000000000005');
select public.record_trip_event(tests.val('t1'), 'departed', now() + interval '1 second', 25.69, -100.32);
select public.record_trip_event(tests.val('t1'), 'arrived_at_pickup', now() + interval '2 seconds', 25.6866, -100.3161);
select public.record_trip_event(tests.val('t1'), 'loading_started', now() + interval '62 seconds',
                                25.6866, -100.3161);
select public.record_trip_event(tests.val('t1'), 'loading_finished', now() + interval '182 seconds',
                                25.6866, -100.3161);
reset role;
select results_eq(
  $$ select site_lat, site_lng, wait_minutes, handling_minutes, excluded, shipper_company_id, carrier_company_id
     from public.trip_stop_dwells where trip_id = tests.val('t1') $$,
  $$ values (25.687::numeric, -100.316::numeric, 1, 2, false,
             'c4600000-0000-4000-8000-000000000001'::uuid, 'c4600000-0000-4000-8000-000000000002'::uuid) $$,
  'the operator''s events measure the waiting and the loading at the pickup, at the rounded site'
);

-- An event that reaches the server hours later counts by when it happened.
set local role authenticated;
select tests.contract('late', 'a4600000-0000-4000-8000-000000000002');
reset role;
insert into public.trip_events (trip_id, event_type, occurred_at, recorded_at, latitude, longitude)
values (tests.val('late'), 'arrived_at_delivery', now() - interval '3 hours', now(), 20.6597, -103.3496);
select is(
  (select array[stop::text, arrived_at::text, coalesce(wait_minutes::text, 'null')]
   from public.trip_stop_dwells where trip_id = tests.val('late')),
  array['delivery', (now() - interval '3 hours')::text, 'null'],
  'an offline event that arrives late is measured by its occurred_at'
);

-- Outliers: unloading started before the arrival, and three days of waiting.
set local role authenticated;
select tests.contract('negative', 'a4600000-0000-4000-8000-000000000002');
select tests.contract('long', 'a4600000-0000-4000-8000-000000000002');
reset role;
select tests.unloaded(tests.val('negative'), now() - interval '20 days', -30, 60);
select tests.unloaded(tests.val('long'), now() - interval '21 days', 73 * 60, 60);
select is(
  (select array_agg(excluded order by trip_id = tests.val('long')) from public.trip_stop_dwells
   where trip_id in (tests.val('negative'), tests.val('long'))),
  array[true, true],
  'negative times and waits of more than 72 h are excluded'
);

-- ---------------------------------------------------------------------------
-- 2. Tiers of site_dwell_estimate
-- ---------------------------------------------------------------------------
-- Carrier A unloads 5 times at GDL at this hour of past days (2 h waiting,
-- 1 h unloading), and once 12 h off (another hour band).
set local role authenticated;
select tests.contract('m' || n, 'a4600000-0000-4000-8000-000000000002') from generate_series(1, 6) n;
reset role;
select tests.unloaded(tests.val('m' || n), now() - make_interval(days => n + 1), 120, 60) from generate_series(1, 5) n;
select tests.unloaded(tests.val('m6'), now() - interval '7 days 12 hours', 120, 60);

set local role authenticated;
select tests.login('a4600000-0000-4000-8000-000000000002');
select is(tests.gdl(), array['site_hour', '5', '180'], 'same site and hour band first, from 5 measurements');
select is(tests.gdl(now() + interval '12 hours'), array['site', '6', '180'],
          'another hour band with fewer than 5: the whole site');
select is(tests.gdl(null), array['site', '6', '180'], 'without an hour: the whole site');
select is(
  (select array[e.basis, e.sample_size::text, e.total_median_minutes::text]
   from public.site_dwell_estimate('delivery', 20.6800, -103.4300, 'c4600000-0000-4000-8000-000000000001') e),
  array['shipper', '6', '180'],
  'a site without measurements: the shipper''s sites'
);
select is(
  (select array[e.basis, e.sample_size::text, e.total_median_minutes::text,
                coalesce(e.wait_median_minutes::text, 'null')]
   from public.site_dwell_estimate('delivery', 20.6800, -103.4300) e),
  array['default', '0', '240', 'null'],
  'nothing measured: the default 4 h'
);
select is(
  (select array[e.wait_median_minutes, e.wait_p75_minutes, e.handling_median_minutes, e.handling_p75_minutes]
   from public.site_dwell_estimate('delivery', 20.6597, -103.3496) e),
  array[120, 120, 60, 60],
  'waiting and handling come separately too'
);
select throws_ok(
  $$ select * from public.site_dwell_estimate('delivery', 95, -103.3496) $$,
  '22023', null, 'a site out of range is refused'
);

-- ---------------------------------------------------------------------------
-- 3. Privacy: others' trips only from 2 carriers up
-- ---------------------------------------------------------------------------
select tests.login('a4600000-0000-4000-8000-000000000003');
select is(tests.gdl(), array['default', '0', '240'], 'carrier B does not see the times of carrier A alone');
select tests.login('a4600000-0000-4000-8000-000000000001');
select is(tests.gdl(), array['site_hour', '5', '180'], 'the shipper sees the times of its own trips');
select tests.login('a4600000-0000-4000-8000-000000000006');
select is(tests.gdl(), array['default', '0', '240'], 'another shipper does not see them');
select tests.login('a4600000-0000-4000-8000-000000000007');
select is(tests.gdl(), array['site_hour', '5', '180'], 'admins see every measurement');

-- Carrier B unloads there once: now the site has trips of 2 carriers.
select tests.contract('b1', 'a4600000-0000-4000-8000-000000000003');
reset role;
select tests.unloaded(tests.val('b1'), now() - interval '9 days', 120, 60);
set local role authenticated;
select tests.login('a4600000-0000-4000-8000-000000000004');
select is(tests.gdl(), array['site_hour', '6', '180'], 'with 2 carriers, a third one sees the statistic');
select tests.login('a4600000-0000-4000-8000-000000000003');
select is(tests.gdl(), array['site_hour', '6', '180'], 'and so does carrier B');

-- ---------------------------------------------------------------------------
-- 4. trip_stop_dwells: who reads it, nobody writes it
-- ---------------------------------------------------------------------------
select tests.login('a4600000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.trip_stop_dwells where carrier_company_id = 'c4600000-0000-4000-8000-000000000002'),
          10, 'the carrier''s staff reads the times of its trips');
select tests.login('a4600000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.trip_stop_dwells), 1, 'another carrier reads only its own');
select tests.login('a4600000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.trip_stop_dwells where shipper_company_id = 'c4600000-0000-4000-8000-000000000001'),
          11, 'the shipper reads the times of its trips');
select tests.login('a4600000-0000-4000-8000-000000000005');
select is((select count(*)::int from public.trip_stop_dwells), 0, 'the operator does not read them');
reset role;
select ok(
  not has_table_privilege('authenticated', 'public.trip_stop_dwells', 'insert, update, delete, truncate')
  and not has_table_privilege('anon', 'public.trip_stop_dwells', 'select'),
  'clients never write trip_stop_dwells and anon does not read it'
);

-- ---------------------------------------------------------------------------
-- 5. trip_estimated_end
-- ---------------------------------------------------------------------------
-- T2: pickup tomorrow; the truck would arrive before the delivery window
-- opens (+2 days), so it unloads from then: + the 3 h measured at GDL.
set local role authenticated;
select tests.contract('t2', 'a4600000-0000-4000-8000-000000000002');
select tests.login('a4600000-0000-4000-8000-000000000002');
select results_eq(
  $$ select ends_at, source, basis, sample_size, arrival_at from public.trip_estimated_end(tests.val('t2')) $$,
  $$ values (now() + interval '2 days 3 hours', 'measured', 'site_hour', 6, now() + interval '2 days') $$,
  'before the trip, the estimated arrival plus the measured time at the delivery site'
);
select tests.login('a4600000-0000-4000-8000-000000000001');
select results_eq(
  $$ select ends_at, source, sample_size from public.trip_estimated_end(tests.val('t2')) $$,
  $$ values (now() + interval '2 days 3 hours', 'measured', 6) $$,
  'the shipper gets it from its own trips'
);
select results_eq(
  $$ select ends_at, source from public.trip_estimated_end(tests.val('m1')) $$,
  $$ values (now() - interval '2 days' + interval '3 hours', 'finished') $$,
  'an unloaded trip ends when the unloading finished'
);
select tests.login('a4600000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select * from public.trip_estimated_end(tests.val('t2')) $$,
  '42501', null, 'another carrier cannot ask for the estimate of a trip'
);

-- ---------------------------------------------------------------------------
-- 6. Return trips: vehicle_trip_chain_end with two booked trips
-- ---------------------------------------------------------------------------
-- V carries T3 (pickup +1 day), already on its way, and is booked for T4
-- (pickup +3 days). Both end 3 h after their delivery windows open.
select tests.contract('t3', 'a4600000-0000-4000-8000-000000000002', 1, 'e4600000-0000-4000-8000-000000000001');
select tests.contract('t4', 'a4600000-0000-4000-8000-000000000002', 3, 'e4600000-0000-4000-8000-000000000001');
select tests.login('a4600000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('t3'), 'e4600000-0000-4000-8000-000000000001',
                          'd4600000-0000-4000-8000-000000000005');
select tests.login('a4600000-0000-4000-8000-000000000005');
select public.record_trip_event(tests.val('t3'), 'departed', now() + interval '1 minute', 25.69, -100.32);
reset role;
select results_eq(
  $$ select c.load_id, c.available_from from public.vehicle_trip_chain_end('e4600000-0000-4000-8000-000000000001') c $$,
  $$ select load_id, now() + interval '4 days 3 hours' from public.trips where id = tests.val('t4') $$,
  'the unit is free when its last booked trip ends, by the measured time at the site'
);
-- T3 runs late (the operator expects to finish at +5 days): T4 starts 2 days
-- late and ends at +6 days 3 hours.
update public.trips set estimated_unload_end_at = now() + interval '5 days' where id = tests.val('t3');
select results_eq(
  $$ select c.load_id, c.available_from from public.vehicle_trip_chain_end('e4600000-0000-4000-8000-000000000001') c $$,
  $$ select load_id, now() + interval '6 days 3 hours' from public.trips where id = tests.val('t4') $$,
  'the delay of the first trip still carries into the second'
);

select * from finish();
rollback;
