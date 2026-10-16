-- Matching (B08): match_candidates (who may call it and every filter),
-- return-trip mode, reverse recommendations (load_match notifications) and
-- route_distance_cache (service role only).
begin;
create extension if not exists pgtap with schema extensions;

select plan(45);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated, service_role;

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

create function tests.place(p_city text)
returns jsonb
language sql
immutable
as $$
  select case p_city
    when 'GDL' then '{"address": "Av. Vallarta 1", "city": "Guadalajara", "state": "Jalisco", "lat": 20.656, "lng": -103.391}'
    when 'MTY' then '{"address": "Av. Constitución 1", "city": "Monterrey", "state": "Nuevo León", "lat": 25.724, "lng": -100.201}'
    when 'LEON' then '{"address": "Blvd. Aeropuerto 1", "city": "León", "state": "Guanajuato", "lat": 21.048, "lng": -101.57}'
    when 'SLW' then '{"address": "Blvd. V. Carranza 1", "city": "Saltillo", "state": "Coahuila", "lat": 25.4232, "lng": -101.0053}'
  end::jsonb;
$$;

-- A load published by the caller (shipper S): dry van GDL -> MTY by default.
create function tests.publish(
  p_name text, p_origin text default 'GDL', p_destination text default 'MTY', p_unit text default 'dry_van',
  p_weight_kg numeric default 18000, p_volume_m3 numeric default 60, p_requirements jsonb default '[]',
  p_pickup_from numeric default 4, p_pickup_to numeric default 30, p_publish boolean default true
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  v_id := public.create_load(jsonb_build_object(
    'origin', tests.place(p_origin), 'destination', tests.place(p_destination),
    'pickupWindow', jsonb_build_object('start', now() + p_pickup_from * interval '1 hour',
                                       'end', now() + p_pickup_to * interval '1 hour'),
    'deliveryWindow', jsonb_build_object('start', now() + p_pickup_to * interval '1 hour',
                                         'end', now() + (p_pickup_to + 6) * interval '1 hour'),
    'cargoType', 'palletized', 'description', 'Tarimas', 'weightKg', p_weight_kg, 'volumeM3', p_volume_m3,
    'unitType', p_unit, 'specialRequirements', p_requirements, 'proposedPriceCents', 3900000
  ));
  if p_publish then
    perform public.publish_load(v_id);
  end if;
  insert into tests.vals values (p_name, v_id);
  return v_id;
end;
$$;

create table tests.vals (name text primary key, id uuid);

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

-- Names of the loads a unit is matched with.
create function tests.matches(p_vehicle uuid, p_max_empty_km integer default 150)
returns text[]
language sql
as $$
  select coalesce(array_agg(v.name order by v.name), '{}')
  from public.match_candidates(p_vehicle, null, p_max_empty_km) m
  join tests.vals v on v.id = m.load_id;
$$;

grant execute on all functions in schema tests to authenticated, service_role;
grant select, insert on tests.vals to authenticated, service_role;

-- Users: ...01 shipper S  ...02 carrier A  ...03 carrier B  ...04 carrier C (in
--        review)  ...05 operator O of A  ...06 admin
select tests.new_user('a8000000-0000-4000-8000-000000000001', 'sara@s.test', 'shipper');
select tests.new_user('a8000000-0000-4000-8000-000000000002', 'ana@a.test', 'carrier');
select tests.new_user('a8000000-0000-4000-8000-000000000003', 'beto@b.test', 'carrier');
select tests.new_user('a8000000-0000-4000-8000-000000000004', 'ciro@c.test', 'carrier');
select tests.new_user('a8000000-0000-4000-8000-000000000005', 'oscar@a.test', 'operator');
select tests.new_user('a8000000-0000-4000-8000-000000000006', 'admin@x.test', 'shipper');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c8000000-0000-4000-8000-000000000001', 'shipper', 'Envíos Sigma SA de CV', 'ESI030303EF3', 'approved'),
  ('c8000000-0000-4000-8000-000000000002', 'carrier', 'Fletes Alfa SA de CV', 'FAL010101AB1', 'approved'),
  ('c8000000-0000-4000-8000-000000000003', 'carrier', 'Transportes Beta SA de CV', 'TBE020202CD2', 'approved'),
  ('c8000000-0000-4000-8000-000000000004', 'carrier', 'Cargas Gama SA de CV', 'CGA040404GH4', 'pending_review');

update public.profiles p set company_id = c.id
from (values
  ('a8000000-0000-4000-8000-000000000001'::uuid, 'c8000000-0000-4000-8000-000000000001'::uuid),
  ('a8000000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000002'),
  ('a8000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000003'),
  ('a8000000-0000-4000-8000-000000000004', 'c8000000-0000-4000-8000-000000000004'),
  ('a8000000-0000-4000-8000-000000000005', 'c8000000-0000-4000-8000-000000000002')
) as c(uid, id)
where p.id = c.uid;
update public.profiles set role = 'admin' where id = 'a8000000-0000-4000-8000-000000000006';

insert into public.operators (id, company_id, profile_id, full_name) values
  ('d8000000-0000-4000-8000-000000000005', 'c8000000-0000-4000-8000-000000000002',
   'a8000000-0000-4000-8000-000000000005', 'Óscar Operador');

-- Units: A1 (dry van 30 t, GDL), A2 (dry van 20 t / 50 m³, GDL from +5 h),
-- A3 (dry van without documents, GDL), B1 (dry van, MTY), C1 (dry van, GDL).
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg, capacity_m3) values
  ('e8000000-0000-4000-8000-0000000000a1', 'c8000000-0000-4000-8000-000000000002', 'trailer', 'AAA1111', 'dry_van', 30000, 100),
  ('e8000000-0000-4000-8000-0000000000a2', 'c8000000-0000-4000-8000-000000000002', 'rigid', 'AAA2222', 'dry_van', 20000, 50),
  ('e8000000-0000-4000-8000-0000000000a3', 'c8000000-0000-4000-8000-000000000002', 'rigid', 'AAA3333', 'dry_van', 30000, 100),
  ('e8000000-0000-4000-8000-0000000000b1', 'c8000000-0000-4000-8000-000000000003', 'trailer', 'BBB1111', 'dry_van', 30000, 100),
  ('e8000000-0000-4000-8000-0000000000c1', 'c8000000-0000-4000-8000-000000000004', 'trailer', 'CCC1111', 'dry_van', 30000, 100);

-- Every required vehicle document approved, except for A3.
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.id::text like 'e8000000-%' and v.id <> 'e8000000-0000-4000-8000-0000000000a3'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

insert into public.vehicle_availability (company_id, vehicle_id, available_from, location, city, state) values
  ('c8000000-0000-4000-8000-000000000002', 'e8000000-0000-4000-8000-0000000000a1', now() + interval '1 hour',
   'SRID=4326;POINT(-103.3496 20.6597)', 'Guadalajara', 'Jalisco'),
  ('c8000000-0000-4000-8000-000000000002', 'e8000000-0000-4000-8000-0000000000a2', now() + interval '5 hours',
   'SRID=4326;POINT(-103.3496 20.6597)', 'Guadalajara', 'Jalisco'),
  ('c8000000-0000-4000-8000-000000000002', 'e8000000-0000-4000-8000-0000000000a3', now(),
   'SRID=4326;POINT(-103.3496 20.6597)', 'Guadalajara', 'Jalisco'),
  ('c8000000-0000-4000-8000-000000000003', 'e8000000-0000-4000-8000-0000000000b1', now(),
   'SRID=4326;POINT(-100.3161 25.6866)', 'Monterrey', 'Nuevo León'),
  ('c8000000-0000-4000-8000-000000000004', 'e8000000-0000-4000-8000-0000000000c1', now(),
   'SRID=4326;POINT(-103.3496 20.6597)', 'Guadalajara', 'Jalisco');

insert into tests.vals
select 'availability_a1', a.id from public.vehicle_availability a where a.vehicle_id = 'e8000000-0000-4000-8000-0000000000a1';

insert into public.carrier_routes (company_id, origin_city, origin_state, origin_location, destination_city,
                                   destination_state, destination_location, unit_types) values
  ('c8000000-0000-4000-8000-000000000002', 'Guadalajara', 'Jalisco', 'SRID=4326;POINT(-103.3496 20.6597)',
   'Monterrey', 'Nuevo León', 'SRID=4326;POINT(-100.3161 25.6866)', '{dry_van}');

-- ---------------------------------------------------------------------------
-- Loads of shipper S
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a8000000-0000-4000-8000-000000000001');
select tests.publish('l1');                                               -- fits A1
select tests.publish('l2', p_unit => 'refrigerated');                     -- other unit type
select tests.publish('l3', p_weight_kg => 25000);                         -- too heavy for A2
select tests.publish('l4', p_origin => 'LEON');                           -- ~190 km from GDL
select tests.publish('l5', p_requirements => '["temperature_control"]');  -- feature A1 lacks
select tests.publish('l6', p_weight_kg => 5000, p_volume_m3 => 20, p_publish => false); -- draft
select tests.publish('l7', p_pickup_from => 2, p_pickup_to => 3);         -- closes before A2 is free
select tests.publish('l8', p_weight_kg => 5000, p_volume_m3 => 20);       -- fits A1 and A2

-- ---------------------------------------------------------------------------
-- Who may call match_candidates
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select * from public.match_candidates('e8000000-0000-4000-8000-0000000000a1') $$,
  '42501', 'vehicle not found', 'a shipper cannot match a unit'
);
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok(
  $$ select * from public.match_candidates('e8000000-0000-4000-8000-0000000000a1') $$,
  '42501', 'not authenticated', 'an anonymous call fails'
);
select tests.login('a8000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select * from public.match_candidates('e8000000-0000-4000-8000-0000000000a1') $$,
  '42501', 'vehicle not found', 'carrier B cannot match a unit of A'
);
select throws_ok(
  $$ select * from public.match_candidates(null, tests.val('availability_a1')) $$,
  '42501', 'vehicle not found', 'carrier B cannot match an availability of A'
);
select tests.login('a8000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select * from public.match_candidates('e8000000-0000-4000-8000-0000000000a1') $$,
  '42501', 'vehicle not found', 'an operator cannot match units'
);
select tests.login('a8000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select * from public.match_candidates('e8000000-0000-4000-8000-0000000000c1') $$,
  '42501', 'company is not approved', 'a carrier in review gets no recommendations'
);

select tests.login('a8000000-0000-4000-8000-000000000002');
select throws_ok($$ select * from public.match_candidates() $$, '22023', null, 'a unit or an availability is required');
select throws_ok(
  $$ select * from public.match_candidates('e8000000-0000-4000-8000-0000000000a1', gen_random_uuid()) $$,
  '22023', null, 'not both'
);
select throws_ok(
  $$ select * from public.match_candidates('e8000000-0000-4000-8000-0000000000a1', p_max_empty_km => 0) $$,
  '22023', null, 'the radius is bounded'
);
select throws_ok(
  $$ select * from public.match_candidates('e8000000-0000-4000-8000-0000000000a1', p_limit => 500) $$,
  '22023', null, 'the limit is bounded'
);

-- ---------------------------------------------------------------------------
-- Filters
-- ---------------------------------------------------------------------------
select is(
  tests.matches('e8000000-0000-4000-8000-0000000000a1'), array['l1', 'l3', 'l7', 'l8'],
  'A1: same unit type, fits, features, open, pickup within 150 km and still reachable'
);
select is(
  tests.matches('e8000000-0000-4000-8000-0000000000a1', 250), array['l1', 'l3', 'l4', 'l7', 'l8'],
  'the radius is configurable (León enters at 250 km)'
);
select is(
  tests.matches('e8000000-0000-4000-8000-0000000000a2'), array['l8'],
  'A2: weight (l3), volume (l1) and the pickup window (l7) leave only l8'
);
select is(tests.matches('e8000000-0000-4000-8000-0000000000a3'), '{}'::text[], 'a unit without its documents is not matched');
select is(
  (select count(*)::int from public.match_candidates('e8000000-0000-4000-8000-0000000000a1', p_limit => 1)), 1,
  'p_limit caps the rows'
);
select results_eq(
  $$ select start_city, is_return_trip, home_distance_km, route_origin_city, route_destination_city
     from public.match_candidates('e8000000-0000-4000-8000-0000000000a1') where load_id = tests.val('l1') $$,
  $$ values ('Guadalajara'::text, false, null::double precision, 'Guadalajara'::text, 'Monterrey'::text) $$,
  'a manual availability is not a return trip; the usual route GDL -> MTY is reported'
);
select ok(
  (select empty_km between 3 and 6 from public.match_candidates('e8000000-0000-4000-8000-0000000000a1')
   where load_id = tests.val('l1')),
  'empty km is the straight line from the availability to the pickup'
);
select is(
  (select array_agg(v.name order by v.name)
   from public.match_candidates(null, tests.val('availability_a1')) m
   join tests.vals v on v.id = m.load_id),
  array['l1', 'l3', 'l7', 'l8'],
  'matching by availability id gives the same candidates'
);

-- A load the carrier already negotiates is not a new recommendation.
insert into tests.vals select 'offer8', public.make_offer(tests.val('l8'), 3800000);
select is(
  tests.matches('e8000000-0000-4000-8000-0000000000a1'), array['l1', 'l3', 'l7'],
  'a load in negotiation with the carrier drops out of its recommendations'
);

select tests.login('a8000000-0000-4000-8000-000000000006');
select is(
  tests.matches('e8000000-0000-4000-8000-0000000000a2'), '{}'::text[],
  'admins can match any unit (A2 lost l8 to the negotiation of its company)'
);

-- ---------------------------------------------------------------------------
-- Return-trip mode: A1 is assigned to l8 (GDL -> MTY)
-- ---------------------------------------------------------------------------
select tests.login('a8000000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip8', public.accept_offer(tests.val('offer8'));
select tests.login('a8000000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('trip8'), 'e8000000-0000-4000-8000-0000000000a1',
                          'd8000000-0000-4000-8000-000000000005');

-- A return load MTY -> GDL after the delivery window of l8 (+30 h .. +36 h).
select tests.login('a8000000-0000-4000-8000-000000000001');
select tests.publish('l9', p_origin => 'MTY', p_destination => 'GDL', p_pickup_from => 37, p_pickup_to => 60);
select tests.publish('l10', p_origin => 'MTY', p_destination => 'GDL', p_pickup_from => 2, p_pickup_to => 20);

select tests.login('a8000000-0000-4000-8000-000000000002');
select is(
  tests.matches('e8000000-0000-4000-8000-0000000000a1'), array['l9'],
  'a unit with a trip starts at its destination and only after the delivery (l10 closes before)'
);
select results_eq(
  $$ select start_city, is_return_trip, available_from = (select delivery_window_end from public.loads where id = tests.val('l8')),
            home_distance_km < 5, availability_id
     from public.match_candidates('e8000000-0000-4000-8000-0000000000a1') $$,
  $$ values ('Monterrey'::text, true, true, true, null::uuid) $$,
  'return-trip mode: destination of the trip, estimated end (delivery window without an estimate), base = trip origin'
);
reset role;
update public.trips set estimated_unload_end_at = now() + interval '50 hours' where id = tests.val('trip8');
set local role authenticated;
select ok(
  (select available_from = now() + interval '50 hours' from public.match_candidates('e8000000-0000-4000-8000-0000000000a1')),
  'the estimated end of unloading is the start time once it exists'
);
select is(
  tests.matches('e8000000-0000-4000-8000-0000000000a2'), '{}'::text[],
  'other units of the carrier keep their own availability'
);
-- F5: assign_trip ends A1's manual availability (GDL), so it can no longer
-- recommend pickups from GDL; asking by it fails like any ended availability.
select throws_ok(
  $$ select * from public.match_candidates(null, tests.val('availability_a1')) $$,
  '42501', 'vehicle not found',
  'the manual availability of a unit assigned to a trip is ended, so it no longer matches'
);

-- ---------------------------------------------------------------------------
-- Reverse recommendations: load_match notifications on publish
-- ---------------------------------------------------------------------------
reset role;
select is(
  (select count(*)::int from public.notifications n
   where n.type = 'load_match' and n.data ->> 'loadId' = tests.val('l1')::text
     and n.user_id = 'a8000000-0000-4000-8000-000000000002'),
  1, 'publishing l1 notifies carrier A once (one notification per company)'
);
select results_eq(
  $$ select data ->> 'vehicleId', data ->> 'originCity', data ->> 'destinationCity', (data ->> 'emptyKm')::int
     from public.notifications
     where type = 'load_match' and user_id::text like 'a8000000-%' and data ->> 'loadId' = tests.val('l1')::text $$,
  $$ values ('e8000000-0000-4000-8000-0000000000a1'::text, 'Guadalajara'::text, 'Monterrey'::text, 4) $$,
  'the notification names the nearest unit, the route and the empty km'
);
select is(
  (select count(*)::int from public.notifications
   where type = 'load_match' and user_id in ('a8000000-0000-4000-8000-000000000003', 'a8000000-0000-4000-8000-000000000004')
     and data ->> 'loadId' in (select id::text from tests.vals where name in ('l1', 'l3', 'l7', 'l8'))),
  0, 'carriers without a compatible unit nearby (B) or in review (C) are not notified'
);
select is(
  (select count(*)::int from public.notifications
   where type = 'load_match' and user_id::text like 'a8000000-%' and data ->> 'loadId' in (select id::text from tests.vals where name in ('l2', 'l5', 'l6'))),
  0, 'incompatible loads and drafts notify nobody'
);
select is(
  (select array_agg(user_id::text order by user_id) from public.notifications
   where type = 'load_match' and user_id::text like 'a8000000-%' and data ->> 'loadId' = tests.val('l9')::text),
  array['a8000000-0000-4000-8000-000000000002', 'a8000000-0000-4000-8000-000000000003'],
  'l9 (MTY) notifies B (unit in MTY) and A (unit returning to MTY)'
);
select is(
  (select count(*)::int from public.notifications
   where type = 'load_match' and user_id = 'a8000000-0000-4000-8000-000000000001'),
  0, 'the shipper is never notified of its own loads'
);

-- Reachability: B1 is free now in Monterrey, ~75 km (straight line) from
-- Saltillo, i.e. ~97 min estimated by road.
set local role authenticated;
select tests.login('a8000000-0000-4000-8000-000000000001');
select tests.publish('l11', p_origin => 'SLW', p_destination => 'GDL', p_pickup_from => 0.1, p_pickup_to => 1);
select tests.publish('l12', p_origin => 'SLW', p_destination => 'GDL', p_pickup_from => 0.1, p_pickup_to => 3);
reset role;
select is(
  (select count(*)::int from public.notifications where type = 'load_match' and user_id::text like 'a8000000-%' and data ->> 'loadId' = tests.val('l11')::text),
  0, 'a pickup that closes before any unit can get there notifies nobody'
);
select is(
  (select array_agg(user_id::text) from public.notifications
   where type = 'load_match' and user_id::text like 'a8000000-%' and data ->> 'loadId' = tests.val('l12')::text),
  array['a8000000-0000-4000-8000-000000000003'],
  'the same pickup with time to get there notifies B'
);
set local role authenticated;
select tests.login('a8000000-0000-4000-8000-000000000003');
select ok(
  tests.val('l11') in (select load_id from public.match_candidates('e8000000-0000-4000-8000-0000000000b1')),
  'match_candidates still lists it: the scoring decides reachability with road distances'
);
reset role;

-- Publishing a draft later notifies too.
set local role authenticated;
select tests.login('a8000000-0000-4000-8000-000000000001');
select public.publish_load(tests.val('l6'));
reset role;
select is(
  (select count(*)::int from public.notifications where type = 'load_match' and user_id::text like 'a8000000-%' and data ->> 'loadId' = tests.val('l6')::text),
  1, 'publishing a draft notifies the compatible carriers'
);

-- ---------------------------------------------------------------------------
-- route_distance_cache: service role only
-- ---------------------------------------------------------------------------
select ok(
  (select relrowsecurity from pg_class where oid = 'public.route_distance_cache'::regclass),
  'route_distance_cache has RLS enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.route_distance_cache', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.route_distance_cache', 'select,insert,update,delete'),
  'clients have no privileges on route_distance_cache'
);
select ok(
  not has_function_privilege('authenticated', 'public.get_route_distances(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.put_route_distances(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.put_route_distances(jsonb)', 'execute'),
  'clients cannot read or write the cache through its functions'
);
select ok(
  not has_function_privilege('authenticated', 'public.match_pairs(uuid, uuid, numeric, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.notify_load_match()', 'execute')
  and not has_function_privilege('anon', 'public.match_candidates(uuid, uuid, integer, integer)', 'execute'),
  'internal matching functions are not exposed'
);

set local role authenticated;
select tests.login('a8000000-0000-4000-8000-000000000002');
select throws_ok($$ select * from public.route_distance_cache $$, '42501', null, 'a carrier cannot read the cache');
select throws_ok(
  $$ select public.put_route_distances('[]') $$, '42501', null, 'a carrier cannot write the cache'
);

set local role service_role;
select public.put_route_distances(
  '[{"originLat": 20.6597, "originLng": -103.3496, "destinationLat": 25.6866, "destinationLng": -100.3161,
     "distanceKm": 820.456, "durationMinutes": 600.4},
    {"originLat": 20.66, "originLng": -103.35, "destinationLat": 25.69, "destinationLng": -100.32,
     "distanceKm": 821, "durationMinutes": 601}]'
);
select results_eq(
  $$ select origin_lat, origin_lng, destination_lat, destination_lng, distance_km between 820 and 821
     from public.get_route_distances('[{"originLat": 20.661, "originLng": -103.349, "destinationLat": 25.6866, "destinationLng": -100.3161}]') $$,
  $$ values (20.66, -103.35, 25.69, -100.32, true) $$,
  'legs are rounded to 2 decimals; duplicates in one write keep a single row'
);
select public.put_route_distances(
  '[{"originLat": 20.66, "originLng": -103.35, "destinationLat": 25.69, "destinationLng": -100.32, "distanceKm": 800, "durationMinutes": 590}]'
);
select is(
  (select distance_km from public.get_route_distances('[{"originLat": 20.66, "originLng": -103.35, "destinationLat": 25.69, "destinationLng": -100.32}]')),
  800.00, 'a new answer from Routes replaces the cached one'
);
reset role;
update public.route_distance_cache set fetched_at = now() - interval '31 days';
set local role service_role;
select is_empty(
  $$ select * from public.get_route_distances('[{"originLat": 20.66, "originLng": -103.35, "destinationLat": 25.69, "destinationLng": -100.32}]') $$,
  'entries older than 30 days are ignored (refetched)'
);
select is_empty($$ select * from public.get_route_distances('{"not": "an array"}') $$, 'a malformed payload matches nothing');

select * from finish();
rollback;
