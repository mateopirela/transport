-- I7 · Carga de regreso (D40): when a trip reaches its destination, or its
-- operator comes within 50 km of it, the managers and the coordinators of the
-- trip's business unit get one `backhaul_suggestions` notification with the
-- compatible loads near the destination for when the unit is free.
--   * proximity: a batch of GPS points farther than 50 km checks nothing; the
--     first one within 50 km checks and notifies; later batches and the
--     arrival do not notify again (one notification per trip);
--   * arrival: checks a trip that was never checked, or that proximity checked
--     without loads (they may have appeared since), and notifies once;
--   * nothing when there is no compatible load, when the unit already has its
--     next trip, or before the trip left the pickup;
--   * recipients: the managers and the coordinators of the trip's business
--     unit; never the operator, the coordinator of another unit, the shipper,
--     another carrier or the admin;
--   * data: trip, unit, city, count and when the unit is free; no money (I.0.3);
--   * trip_backhaul_checks: RLS by role (staff of the unit, admin) and no
--     client writes.
begin;
create extension if not exists pgtap with schema extensions;

select plan(36);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated;

create function tests.new_user(p_id uuid, p_role text, p_name text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@backhaul.test', now(),
          case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end,
          jsonb_build_object('role', p_role, 'phone', '+525500000000', 'full_name', p_name), now(), now());
  update public.profiles set full_name = p_name where id = p_id;
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;

create table tests.vals (name text primary key, id uuid);
grant select, insert on tests.vals to authenticated;

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

-- A published load of the shipper (create_load + publish_load, as S).
create function tests.load(p_name text, p_from jsonb, p_to jsonb, p_unit text, p_pickup_days integer)
returns void
language plpgsql
as $$
begin
  perform tests.login('a5100000-0000-4000-8000-000000000001');
  insert into tests.vals select p_name, public.create_load(jsonb_build_object(
    'origin', p_from, 'destination', p_to,
    'pickupWindow', jsonb_build_object('start', now() + make_interval(days => p_pickup_days),
                                       'end', now() + make_interval(days => p_pickup_days + 3)),
    'deliveryWindow', jsonb_build_object('start', now() + make_interval(days => p_pickup_days + 4),
                                         'end', now() + make_interval(days => p_pickup_days + 5)),
    'cargoType', 'palletized', 'description', 'Tarimas', 'weightKg', 12000, 'unitType', p_unit,
    'specialRequirements', jsonb_build_array(), 'proposedPriceCents', 3500000
  ));
  perform public.publish_load(tests.val(p_name));
end;
$$;

-- Who has backhaul_suggestions of a trip (one letter each, sorted).
create function tests.recipients(p_trip text)
returns text
language sql
as $$
  select coalesce(string_agg(u.letter, ',' order by u.letter), '')
  from public.notifications n
  join (values ('a5100000-0000-4000-8000-000000000001'::uuid, 'S'), ('a5100000-0000-4000-8000-000000000002', 'M'),
               ('a5100000-0000-4000-8000-000000000003', 'A'), ('a5100000-0000-4000-8000-000000000004', 'B'),
               ('a5100000-0000-4000-8000-000000000005', 'O'), ('a5100000-0000-4000-8000-000000000007', 'X'),
               ('a5100000-0000-4000-8000-000000000008', 'Z'))
       as u(id, letter) on u.id = n.user_id
  where n.type = 'backhaul_suggestions' and n.data ->> 'tripId' = tests.val(p_trip)::text;
$$;

-- The trips whose check a user reads (RLS), by name, sorted.
create function tests.visible_checks()
returns text
language sql
as $$
  select coalesce(string_agg(v.name, ',' order by v.name), '')
  from public.trip_backhaul_checks c
  join tests.vals v on v.id = c.trip_id;
$$;

grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures. Users a51…: 01 S shipper, 02 M manager, 03 A coordinator of unit
-- A, 04 B coordinator of unit B, 05 O operator (unit A), 07 X manager of
-- another carrier, 08 Z admin. Units: V dry van (A), W flatbed (B), Y dry van
-- (A) whose next trip is already won.
-- ---------------------------------------------------------------------------
select tests.new_user('a5100000-0000-4000-8000-000000000001', 'shipper', 'Sara Cliente');
select tests.new_user('a5100000-0000-4000-8000-000000000002', 'manager', 'Mario Gerente');
select tests.new_user('a5100000-0000-4000-8000-000000000003', 'coordinator', 'Andrea Coordinadora');
select tests.new_user('a5100000-0000-4000-8000-000000000004', 'coordinator', 'Beto Coordinador');
select tests.new_user('a5100000-0000-4000-8000-000000000005', 'operator', 'Óscar Operador');
select tests.new_user('a5100000-0000-4000-8000-000000000007', 'manager', 'Ximena Ajena');
select tests.new_user('a5100000-0000-4000-8000-000000000008', 'shipper', 'Admin');
update public.profiles set role = 'admin' where id = 'a5100000-0000-4000-8000-000000000008';

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c5100000-0000-4000-8000-000000000001', 'shipper', 'Envíos Regreso SA de CV', 'ERE050505GH5', 'approved'),
  ('c5100000-0000-4000-8000-000000000002', 'carrier', 'Fletes Regreso SA de CV', 'FRE040404CD4', 'approved'),
  ('c5100000-0000-4000-8000-000000000003', 'carrier', 'Fletes Ajenos SA de CV', 'FAJ040404CD5', 'approved');
update public.profiles set company_id = 'c5100000-0000-4000-8000-000000000001'
where id = 'a5100000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c5100000-0000-4000-8000-000000000002'
where id in ('a5100000-0000-4000-8000-000000000002', 'a5100000-0000-4000-8000-000000000003',
             'a5100000-0000-4000-8000-000000000004', 'a5100000-0000-4000-8000-000000000005');
update public.profiles set company_id = 'c5100000-0000-4000-8000-000000000003'
where id = 'a5100000-0000-4000-8000-000000000007';

update public.business_units set name = 'Unidad A' where company_id = 'c5100000-0000-4000-8000-000000000002';
insert into tests.vals select 'bu_a', id from public.business_units where company_id = 'c5100000-0000-4000-8000-000000000002';
insert into public.business_units (id, company_id, name)
values ('b5100000-0000-4000-8000-00000000000b', 'c5100000-0000-4000-8000-000000000002', 'Unidad B');
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id) values
  (tests.val('bu_a'), 'c5100000-0000-4000-8000-000000000002', 'a5100000-0000-4000-8000-000000000003'),
  ('b5100000-0000-4000-8000-00000000000b', 'c5100000-0000-4000-8000-000000000002', 'a5100000-0000-4000-8000-000000000004');

insert into public.operators (id, company_id, business_unit_id, profile_id, full_name, license_type, license_expires_on) values
  ('d5100000-0000-4000-8000-000000000005', 'c5100000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'a5100000-0000-4000-8000-000000000005', 'Óscar Operador', 'E', current_date + 365),
  ('d5100000-0000-4000-8000-000000000006', 'c5100000-0000-4000-8000-000000000002', 'b5100000-0000-4000-8000-00000000000b',
   null, 'Pablo Operador', 'E', current_date + 365),
  ('d5100000-0000-4000-8000-000000000009', 'c5100000-0000-4000-8000-000000000002', tests.val('bu_a'),
   null, 'Yolanda Operadora', 'E', current_date + 365);
-- O shares the location (B22: record_trip_locations requires the consent).
insert into public.location_consents (user_id, policy_version, platform)
values ('a5100000-0000-4000-8000-000000000005', '2026-10-15', 'android');
insert into public.vehicles (id, company_id, business_unit_id, kind, plate, fleet_number, unit_type, capacity_kg) values
  ('e5100000-0000-4000-8000-00000000000a', 'c5100000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'rigid', 'REG5101', 'U-12', 'dry_van', 30000),
  ('e5100000-0000-4000-8000-00000000000b', 'c5100000-0000-4000-8000-000000000002', 'b5100000-0000-4000-8000-00000000000b',
   'rigid', 'REG5102', null, 'flatbed', 30000),
  ('e5100000-0000-4000-8000-00000000000c', 'c5100000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'rigid', 'REG5103', null, 'dry_van', 30000);
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'c5100000-0000-4000-8000-000000000002'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- Places: Monterrey, Guadalajara (the destination) and two points north of it.
insert into tests.vals values ('_', null);
create temp table places (name text primary key, place jsonb);
insert into places values
  ('mty', '{"address": "Av. Constitución 100", "city": "Monterrey", "state": "Nuevo León", "lat": 25.6866, "lng": -100.3161}'),
  ('gdl', '{"address": "Av. Vallarta 200", "city": "Guadalajara", "state": "Jalisco", "lat": 20.6597, "lng": -103.3496}'),
  ('gdl_pickup', '{"address": "Av. Lázaro Cárdenas 3420", "city": "Guadalajara", "state": "Jalisco", "lat": 20.6560, "lng": -103.3910}');
grant select on places to authenticated;

-- The trips MTY → GDL (won by the carrier, each with its unit) and the next
-- trip of Y, GDL → MTY, already won (pending assignment).
set local role authenticated;
select tests.load('load_v', (select place from places where name = 'mty'), (select place from places where name = 'gdl'), 'dry_van', 1);
select tests.load('load_w', (select place from places where name = 'mty'), (select place from places where name = 'gdl'), 'flatbed', 1);
select tests.load('load_y', (select place from places where name = 'mty'), (select place from places where name = 'gdl'), 'dry_van', 1);
select tests.load('load_y_next', (select place from places where name = 'gdl_pickup'), (select place from places where name = 'mty'), 'dry_van', 3);
select tests.login('a5100000-0000-4000-8000-000000000002');
insert into tests.vals select 'offer_v', public.make_offer(tests.val('load_v'), 3000000, null, 'e5100000-0000-4000-8000-00000000000a');
insert into tests.vals select 'offer_w', public.make_offer(tests.val('load_w'), 3000000, null, 'e5100000-0000-4000-8000-00000000000b');
insert into tests.vals select 'offer_y', public.make_offer(tests.val('load_y'), 3000000, null, 'e5100000-0000-4000-8000-00000000000c');
insert into tests.vals select 'offer_y_next', public.make_offer(tests.val('load_y_next'), 3000000, null, 'e5100000-0000-4000-8000-00000000000c');
select tests.login('a5100000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip_v', public.accept_offer(tests.val('offer_v'));
insert into tests.vals select 'trip_w', public.accept_offer(tests.val('offer_w'));
insert into tests.vals select 'trip_y', public.accept_offer(tests.val('offer_y'));
insert into tests.vals select 'trip_y_next', public.accept_offer(tests.val('offer_y_next'));
-- The return load of V: GDL → MTY, dry van, published.
select tests.load('return_v', (select place from places where name = 'gdl_pickup'), (select place from places where name = 'mty'), 'dry_van', 5);
reset role;

update public.trips t
set vehicle_id = x.vehicle_id, operator_id = x.operator_id, status = 'assigned', assigned_at = now() - interval '12 hours'
from (values
  (tests.val('trip_v'), 'e5100000-0000-4000-8000-00000000000a'::uuid, 'd5100000-0000-4000-8000-000000000005'::uuid),
  (tests.val('trip_w'), 'e5100000-0000-4000-8000-00000000000b', 'd5100000-0000-4000-8000-000000000006'),
  (tests.val('trip_y'), 'e5100000-0000-4000-8000-00000000000c', 'd5100000-0000-4000-8000-000000000009')
) as x(trip_id, vehicle_id, operator_id)
where t.id = x.trip_id;
-- Notifications before the trips leave, to tell the new ones apart.
delete from public.notifications where user_id::text like 'a5100000-%';

-- ---------------------------------------------------------------------------
-- Before leaving the pickup, nothing is checked
-- ---------------------------------------------------------------------------
select public.check_backhaul(tests.val('trip_v'), 'arrival');
select is((select count(*)::int from public.trip_backhaul_checks where trip_id = tests.val('trip_v')), 0,
  'a trip that has not left the pickup is not checked');

update public.trips set status = 'in_transit', started_at = now() - interval '10 hours'
where id in (tests.val('trip_v'), tests.val('trip_w'), tests.val('trip_y'));

-- ---------------------------------------------------------------------------
-- Proximity (trip V, by the operator's app)
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000005');
-- ~60 km north of the destination.
select public.record_trip_locations(tests.val('trip_v'), jsonb_build_array(
  jsonb_build_object('recordedAt', now() - interval '20 minutes', 'lat', 21.1993, 'lng', -103.3496)));
reset role;
select is((select count(*)::int from public.trip_backhaul_checks where trip_id = tests.val('trip_v')), 0,
  'a point farther than 50 km from the destination checks nothing');

set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000005');
-- ~45 km north of the destination.
select public.record_trip_locations(tests.val('trip_v'), jsonb_build_array(
  jsonb_build_object('recordedAt', now() - interval '10 minutes', 'lat', 21.0644, 'lng', -103.3496),
  jsonb_build_object('recordedAt', now() - interval '9 minutes', 'lat', 21.0600, 'lng', -103.3496)));
reset role;
select results_eq(
  $$ select source, load_count, notified_at is not null, available_from is not null
     from public.trip_backhaul_checks where trip_id = tests.val('trip_v') $$,
  $$ values ('proximity', 1, true, true) $$,
  'the first batch within 50 km checks the trip: one compatible load, notified'
);
select is(tests.recipients('trip_v'), 'A,M',
  'the manager and the coordinator of the unit are notified; not the operator, unit B, the shipper, another carrier or the admin');
select results_eq(
  $$ select n.data from public.notifications n
     where n.user_id = 'a5100000-0000-4000-8000-000000000003' and n.type = 'backhaul_suggestions' $$,
  $$ select jsonb_build_object('tripId', tests.val('trip_v'), 'vehicleId', 'e5100000-0000-4000-8000-00000000000a'::uuid,
                               'vehicleLabel', 'U-12', 'city', 'Guadalajara', 'loadCount', 1,
                               'availableFrom', c.available_from)
     from public.trip_backhaul_checks c where c.trip_id = tests.val('trip_v') $$,
  'the data: trip, unit, city, how many loads and when the unit is free'
);
select ok(
  not exists (
    select 1 from public.notifications n
    where n.type = 'backhaul_suggestions'
      and (n.data::text ilike '%cents%' or n.data::text ilike '%price%' or n.data::text ilike '%amount%')
  ),
  'no money travels in the notification (I.0.3)'
);

-- Another batch within 50 km and the arrival do not notify again.
set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000005');
select public.record_trip_locations(tests.val('trip_v'), jsonb_build_array(
  jsonb_build_object('recordedAt', now() - interval '5 minutes', 'lat', 20.7000, 'lng', -103.3496)));
select public.record_trip_event(tests.val('trip_v'), 'arrived_at_delivery', now(), 20.6597, -103.3496);
reset role;
select is((select count(*)::int from public.notifications
           where type = 'backhaul_suggestions' and data ->> 'tripId' = tests.val('trip_v')::text), 2,
  'later batches and the arrival do not notify again: one notification per recipient and trip');
select is((select source from public.trip_backhaul_checks where trip_id = tests.val('trip_v')), 'proximity',
  'the check of the trip is the first one');
select is((select status::text from public.trips where id = tests.val('trip_v')), 'at_delivery',
  'the arrival was recorded');

-- ---------------------------------------------------------------------------
-- Arrival after a proximity check without loads (trip W, unit B)
-- ---------------------------------------------------------------------------
insert into public.trip_locations (trip_id, recorded_at, latitude, longitude)
values (tests.val('trip_w'), now() - interval '30 minutes', 20.9000, -103.3496);
select results_eq(
  $$ select source, load_count, notified_at from public.trip_backhaul_checks where trip_id = tests.val('trip_w') $$,
  $$ values ('proximity', 0, null::timestamptz) $$,
  'without a compatible load the check is recorded and nobody is notified'
);
select is(tests.recipients('trip_w'), '', 'no notification without loads');

-- A flatbed load GDL → MTY appears; then W arrives.
set local role authenticated;
select tests.load('return_w', (select place from places where name = 'gdl_pickup'), (select place from places where name = 'mty'), 'flatbed', 5);
reset role;
insert into public.trip_events (trip_id, event_type, from_status, to_status, occurred_at, latitude, longitude, actor_role)
values (tests.val('trip_w'), 'arrived_at_delivery', 'in_transit', 'at_delivery', now(), 20.6597, -103.3496, 'operator');
update public.trips set status = 'at_delivery' where id = tests.val('trip_w');
select results_eq(
  $$ select source, load_count, notified_at is not null from public.trip_backhaul_checks where trip_id = tests.val('trip_w') $$,
  $$ values ('arrival', 1, true) $$,
  'the arrival checks again a trip whose proximity check found nothing, and notifies'
);
select is(tests.recipients('trip_w'), 'B,M', 'unit B''s trip goes to its coordinator and the manager, not to A');
select ok(
  (select available_from between now() and now() + interval '1 day'
   from public.trip_backhaul_checks where trip_id = tests.val('trip_w')),
  'the unit is free from the real arrival plus the unloading (H5), not from the delivery window days ahead'
);

-- A second arrival-like event cannot notify twice.
select public.check_backhaul(tests.val('trip_w'), 'arrival');
select is(tests.recipients('trip_w'), 'B,M', 'a notified trip is never checked again');

-- ---------------------------------------------------------------------------
-- The unit already has its next trip (trip Y)
-- ---------------------------------------------------------------------------
insert into public.trip_events (trip_id, event_type, from_status, to_status, occurred_at, latitude, longitude, actor_role)
values (tests.val('trip_y'), 'arrived_at_delivery', 'in_transit', 'at_delivery', now(), 20.6597, -103.3496, 'operator');
select results_eq(
  $$ select source, load_count, available_from, notified_at from public.trip_backhaul_checks where trip_id = tests.val('trip_y') $$,
  $$ values ('arrival', 0, null::timestamptz, null::timestamptz) $$,
  'a unit whose next trip is already won does not go back empty: nothing to suggest'
);
select is(tests.recipients('trip_y'), '', 'and nobody is notified');

-- ---------------------------------------------------------------------------
-- trip_backhaul_checks: who reads it, nobody writes it
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000002');
select is(tests.visible_checks(), 'trip_v,trip_w,trip_y', 'the manager reads the checks of every unit');
select tests.login('a5100000-0000-4000-8000-000000000003');
select is(tests.visible_checks(), 'trip_v,trip_y', 'the coordinator of unit A reads only unit A''s');
select tests.login('a5100000-0000-4000-8000-000000000004');
select is(tests.visible_checks(), 'trip_w', 'the coordinator of unit B reads only unit B''s');
select tests.login('a5100000-0000-4000-8000-000000000005');
select is(tests.visible_checks(), '', 'the operator reads none');
select tests.login('a5100000-0000-4000-8000-000000000001');
select is(tests.visible_checks(), '', 'the shipper reads none');
select tests.login('a5100000-0000-4000-8000-000000000007');
select is(tests.visible_checks(), '', 'another carrier reads none');
select tests.login('a5100000-0000-4000-8000-000000000008');
select is(tests.visible_checks(), 'trip_v,trip_w,trip_y', 'the admin reads them all');
select tests.login('a5100000-0000-4000-8000-000000000002');
select throws_ok(
  $$ insert into public.trip_backhaul_checks (trip_id, vehicle_id, source, load_count)
     values (tests.val('trip_y'), 'e5100000-0000-4000-8000-00000000000c', 'arrival', 3) $$,
  '42501', null, 'nobody inserts a check by hand'
);
reset role;

select ok(
  not has_table_privilege('authenticated', 'public.trip_backhaul_checks', 'insert')
  and not has_table_privilege('authenticated', 'public.trip_backhaul_checks', 'update')
  and not has_table_privilege('authenticated', 'public.trip_backhaul_checks', 'delete')
  and not has_table_privilege('anon', 'public.trip_backhaul_checks', 'select'),
  'clients only read trip_backhaul_checks, through RLS'
);
select ok(
  not has_function_privilege('authenticated', 'public.check_backhaul(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.trip_events_suggest_backhaul()', 'execute')
  and not has_function_privilege('authenticated', 'public.trip_locations_suggest_backhaul()', 'execute'),
  'clients cannot run the check nor its triggers'
);

-- ---------------------------------------------------------------------------
-- trip_backhaul: what "Para el regreso" shows, and to whom
-- ---------------------------------------------------------------------------
create function tests.backhaul_of(p_trip text)
returns text
language sql
as $$
  select case when count(*) = 0 then 'none'
              when bool_and(b.available_from is not null) then 'free'
              else 'unknown' end
  from public.trip_backhaul(tests.val(p_trip)) b;
$$;
grant execute on function tests.backhaul_of(text) to authenticated;

set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000002');
select is(tests.backhaul_of('trip_v') || ',' || tests.backhaul_of('trip_w'), 'free,free',
  'the manager sees "Para el regreso" of the checked trips that end their unit''s chain');
select is(tests.backhaul_of('trip_y'), 'none',
  'nor of a trip whose unit already has its next trip: its recommendations start elsewhere');
select tests.login('a5100000-0000-4000-8000-000000000003');
select is(tests.backhaul_of('trip_v') || ',' || tests.backhaul_of('trip_w'), 'free,none',
  'the coordinator of unit A sees unit A''s only');
select tests.login('a5100000-0000-4000-8000-000000000005');
select is(tests.backhaul_of('trip_v'), 'none', 'the operator sees none');
select tests.login('a5100000-0000-4000-8000-000000000001');
select is(tests.backhaul_of('trip_v'), 'none', 'the shipper sees none');
select tests.login('a5100000-0000-4000-8000-000000000007');
select is(tests.backhaul_of('trip_v'), 'none', 'another carrier sees none');
select tests.login('a5100000-0000-4000-8000-000000000008');
select is(tests.backhaul_of('trip_v'), 'free', 'the admin sees it');

-- V wins its next trip (GDL → MTY) while still at the delivery: the trip no
-- longer ends the unit's chain, so its return loads are gone.
select tests.login('a5100000-0000-4000-8000-000000000002');
insert into tests.vals select 'offer_v_next', public.make_offer(tests.val('return_v'), 3000000, null, 'e5100000-0000-4000-8000-00000000000a');
select tests.login('a5100000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip_v_next', public.accept_offer(tests.val('offer_v_next'));
select tests.login('a5100000-0000-4000-8000-000000000002');
select is(tests.backhaul_of('trip_v'), 'none',
  'once the unit wins its next trip, the trip it is finishing shows no return loads');
reset role;

select ok(
  not has_function_privilege('anon', 'public.trip_backhaul(uuid)', 'execute'),
  'trip_backhaul needs a session'
);

select * from finish();
rollback;
