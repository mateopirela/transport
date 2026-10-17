-- G1a.2 · Business units (D19): a coordinator sees and operates only the
-- business units assigned to them, and the manager the whole company:
--   * read matrix: manager M, coordinator A (unit A), coordinator B (unit B),
--     a coordinator without units N, the manager X of another carrier, the
--     operator O of unit A and the shipper S, over the fleet, negotiations,
--     offers, loads, trips, their children and the chat;
--   * B cannot offer with, set the availability of, assign, cancel, report on
--     or add documents to the rows of unit A; A can;
--   * one negotiation per load and company: another business unit gets 23505;
--   * the manager assigns a unit of another business unit and the trip moves;
--   * the default and guard triggers of units and operators;
--   * notifications go to the managers and the coordinators of the unit.
begin;
create extension if not exists pgtap with schema extensions;

select plan(62);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated;

create function tests.new_user(p_id uuid, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@g1a2.test', now(),
          jsonb_build_object('role', p_role), now(), now());
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

grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures. Users a26…: 01 S shipper, 02 M manager, 03 A coordinator of unit A,
-- 04 B coordinator of unit B, 05 O operator (unit A), 06 P operator (unit B),
-- 07 N coordinator without units, 08 X manager of another carrier.
-- ---------------------------------------------------------------------------
select tests.new_user('a2600000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a2600000-0000-4000-8000-000000000002', 'manager');
select tests.new_user('a2600000-0000-4000-8000-000000000003', 'coordinator');
select tests.new_user('a2600000-0000-4000-8000-000000000004', 'coordinator');
select tests.new_user('a2600000-0000-4000-8000-000000000005', 'operator');
select tests.new_user('a2600000-0000-4000-8000-000000000006', 'operator');
select tests.new_user('a2600000-0000-4000-8000-000000000007', 'coordinator');
select tests.new_user('a2600000-0000-4000-8000-000000000008', 'manager');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c2600000-0000-4000-8000-000000000001', 'shipper', 'Envíos Uno SA de CV', 'EUN050505GH5', 'approved'),
  ('c2600000-0000-4000-8000-000000000002', 'carrier', 'Fletes Dos SA de CV', 'FDO040404CD4', 'approved'),
  ('c2600000-0000-4000-8000-000000000003', 'carrier', 'Fletes Tres SA de CV', 'FTR040404CD4', 'approved');
update public.profiles set company_id = 'c2600000-0000-4000-8000-000000000001'
where id = 'a2600000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c2600000-0000-4000-8000-000000000002'
where id in ('a2600000-0000-4000-8000-000000000002', 'a2600000-0000-4000-8000-000000000003',
             'a2600000-0000-4000-8000-000000000004', 'a2600000-0000-4000-8000-000000000005',
             'a2600000-0000-4000-8000-000000000006', 'a2600000-0000-4000-8000-000000000007');
update public.profiles set company_id = 'c2600000-0000-4000-8000-000000000003'
where id = 'a2600000-0000-4000-8000-000000000008';

select is(
  (select count(*)::int from public.business_units where company_id = 'c2600000-0000-4000-8000-000000000002'
   and name = 'Principal'),
  1, 'a new carrier company gets its "Principal" business unit'
);
select is(
  (select count(*)::int from public.business_units where company_id = 'c2600000-0000-4000-8000-000000000001'),
  0, 'a shipper company gets none'
);
select throws_ok(
  $$ insert into public.business_units (company_id, name) values ('c2600000-0000-4000-8000-000000000001', 'X') $$,
  '23514', 'business units belong to carrier companies',
  'only carrier companies have business units'
);

update public.business_units set name = 'Unidad A' where company_id = 'c2600000-0000-4000-8000-000000000002';
insert into tests.vals select 'bu_a', id from public.business_units where company_id = 'c2600000-0000-4000-8000-000000000002';
insert into public.business_units (id, company_id, name)
values ('b2600000-0000-4000-8000-00000000000b', 'c2600000-0000-4000-8000-000000000002', 'Unidad B');
insert into tests.vals values ('bu_b', 'b2600000-0000-4000-8000-00000000000b');

insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id) values
  (tests.val('bu_a'), 'c2600000-0000-4000-8000-000000000002', 'a2600000-0000-4000-8000-000000000003'),
  (tests.val('bu_b'), 'c2600000-0000-4000-8000-000000000002', 'a2600000-0000-4000-8000-000000000004');
select throws_ok(
  $$ insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id)
     values (tests.val('bu_a'), 'c2600000-0000-4000-8000-000000000002', 'a2600000-0000-4000-8000-000000000002') $$,
  '23514', 'profile is not a coordinator of the company',
  'only coordinators of the company run business units'
);

insert into public.operators (id, company_id, business_unit_id, profile_id, full_name) values
  ('d2600000-0000-4000-8000-00000000000a', 'c2600000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'a2600000-0000-4000-8000-000000000005', 'Óscar A'),
  ('d2600000-0000-4000-8000-00000000000b', 'c2600000-0000-4000-8000-000000000002', tests.val('bu_b'),
   'a2600000-0000-4000-8000-000000000006', 'Pablo B');
insert into public.vehicles (id, company_id, business_unit_id, kind, plate, unit_type, capacity_kg) values
  ('e2600000-0000-4000-8000-00000000000a', 'c2600000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'rigid', 'GGA2601', 'dry_van', 30000),
  ('e2600000-0000-4000-8000-00000000000b', 'c2600000-0000-4000-8000-000000000002', tests.val('bu_b'),
   'rigid', 'GGB2601', 'dry_van', 30000);
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'c2600000-0000-4000-8000-000000000002'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- ---------------------------------------------------------------------------
-- Load L1: coordinator A offers with unit A, S accepts, A assigns
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a2600000-0000-4000-8000-000000000001');
insert into tests.vals select 'load1', public.create_load(tests.payload(1));
select public.publish_load(tests.val('load1'));
insert into tests.vals select 'load2', public.create_load(tests.payload(2));
select public.publish_load(tests.val('load2'));

select tests.login('a2600000-0000-4000-8000-000000000003');
insert into tests.vals
select 'offer1', public.make_offer(tests.val('load1'), 3000000, null, 'e2600000-0000-4000-8000-00000000000a');
select tests.login('a2600000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip1', public.accept_offer(tests.val('offer1'));
reset role;

select is(
  (select business_unit_id from public.negotiations where load_id = tests.val('load1')),
  tests.val('bu_a'), 'the negotiation takes the business unit of the proposed unit'
);
select is(
  (select business_unit_id from public.trips where id = tests.val('trip1')),
  tests.val('bu_a'), 'the trip takes the business unit of the negotiation'
);
select is(
  (select array_agg(user_id order by user_id) from public.notifications
   where type = 'offer_accepted' and data ->> 'offerId' = tests.val('offer1')::text),
  array['a2600000-0000-4000-8000-000000000002', 'a2600000-0000-4000-8000-000000000003']::uuid[],
  'an accepted offer notifies the managers and the coordinators of its business unit, not the others'
);

set local role authenticated;
select tests.login('a2600000-0000-4000-8000-000000000003');
select lives_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e2600000-0000-4000-8000-00000000000a',
                               'd2600000-0000-4000-8000-00000000000a') $$,
  'A assigns a unit and an operator of their business unit'
);
reset role;

-- ---------------------------------------------------------------------------
-- Read matrix
-- ---------------------------------------------------------------------------
create function tests.matrix(p_sql text)
returns text
language sql
as $$
  select string_agg(tests.sees(u.id, p_sql)::text, ',' order by u.id)
  from (values ('a2600000-0000-4000-8000-000000000001'::uuid), ('a2600000-0000-4000-8000-000000000002'),
               ('a2600000-0000-4000-8000-000000000003'), ('a2600000-0000-4000-8000-000000000004'),
               ('a2600000-0000-4000-8000-000000000005'), ('a2600000-0000-4000-8000-000000000007'),
               ('a2600000-0000-4000-8000-000000000008')) as u(id);
$$;

-- Columns: S, M, A, B, O, N, X.
select is(tests.matrix($$ select 1 from public.vehicles where company_id = 'c2600000-0000-4000-8000-000000000002' $$),
  '0,2,1,1,1,0,0', 'vehicles: M all, A and B their own, O the unit of their trip');
select is(tests.matrix($$ select 1 from public.operators where company_id = 'c2600000-0000-4000-8000-000000000002' $$),
  '0,2,1,1,1,0,0', 'operators: M all, A and B their own, O themself');
select is(tests.matrix($$ select 1 from public.vehicle_availability where company_id = 'c2600000-0000-4000-8000-000000000002' $$),
  '0,0,0,0,0,0,0', 'vehicle_availability: none yet (checked again below)');
select is(tests.matrix($$ select 1 from public.negotiations where load_id = tests.val('load1') $$),
  '1,1,1,0,0,0,0', 'negotiations: the shipper, M and A');
select is(tests.matrix($$ select 1 from public.offers where load_id = tests.val('load1') $$),
  '1,1,1,0,0,0,0', 'offers: the shipper, M and A');
select is(tests.matrix($$ select 1 from public.loads where id = tests.val('load1') $$),
  '1,1,1,0,1,0,0', 'a contracted load: the shipper, M, A and its operator');
select is(tests.matrix($$ select 1 from public.loads where id = tests.val('load2') $$),
  '1,1,1,1,0,1,1', 'a published load: every manager and coordinator of an approved carrier');
select is(tests.matrix($$ select 1 from public.trips where id = tests.val('trip1') $$),
  '1,1,1,0,1,0,0', 'trips: the shipper, M, A and the operator');
select is(tests.matrix($$ select 1 from public.trip_events where trip_id = tests.val('trip1') $$),
  '2,2,2,0,2,0,0', 'trip_events follow the trip');
select is(tests.matrix($$ select 1 from public.conversations where load_id = tests.val('load1') $$),
  '2,2,2,0,1,0,0', 'conversations: the negotiation and the trip, for the shipper, M and A; the trip for O');
select is(tests.matrix($$ select 1 from public.business_units where company_id = 'c2600000-0000-4000-8000-000000000002' $$),
  '0,2,2,2,0,2,0', 'business_units: every manager and coordinator of the company');
select is(tests.matrix($$ select 1 from public.business_unit_coordinators $$),
  '0,2,1,1,0,0,0', 'business_unit_coordinators: M all, each coordinator their own');
select is(tests.matrix($$ select 1 from public.documents where owner_id = 'e2600000-0000-4000-8000-00000000000a' $$),
  '0,' || (select count(*) from public.documents where owner_id = 'e2600000-0000-4000-8000-00000000000a')::text
  || ',' || (select count(*) from public.documents where owner_id = 'e2600000-0000-4000-8000-00000000000a')::text
  || ',0,0,0,0',
  'documents of unit A: M and A');

set local role authenticated;
select tests.login('a2600000-0000-4000-8000-000000000007');
select is(public.auth_business_unit_ids(), '{}'::uuid[], 'a coordinator without business units has none');
select is(public.auth_carrier_company_id(), 'c2600000-0000-4000-8000-000000000002'::uuid,
  'but is staff of the carrier');
select is(public.can_operate_unit(null), false, 'can_operate_unit is false, never null, for a missing unit');
select tests.login('a2600000-0000-4000-8000-000000000002');
select is(public.auth_is_manager(), true, 'the manager is the manager');
select is(public.auth_business_unit_ids(), array(select unnest(array[tests.val('bu_a'), tests.val('bu_b')]) order by 1),
  'the manager has every business unit of the company');
select tests.login('a2600000-0000-4000-8000-000000000003');
select is(public.auth_is_manager(), false, 'a coordinator is not');
select is(public.auth_business_unit_ids(), array[tests.val('bu_a')], 'A has unit A');

-- ---------------------------------------------------------------------------
-- RPCs: B on the rows of unit A
-- ---------------------------------------------------------------------------
select tests.login('a2600000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.set_vehicle_availability('e2600000-0000-4000-8000-00000000000a', now() + interval '1 hour',
                                            25.69, -100.32, 'Monterrey', 'Nuevo León') $$,
  '42501', 'vehicle not found', 'B cannot set the availability of a unit of A'
);
select throws_ok(
  $$ select public.clear_vehicle_availability('e2600000-0000-4000-8000-00000000000a') $$,
  '42501', 'vehicle not found', 'B cannot clear it'
);
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e2600000-0000-4000-8000-00000000000b',
                               'd2600000-0000-4000-8000-00000000000b') $$,
  '42501', 'trip not found', 'B cannot assign a trip of A'
);
select throws_ok(
  $$ select public.cancel_trip(tests.val('trip1'), 'No') $$,
  '42501', 'trip not found', 'B cannot cancel it'
);
select throws_ok(
  $$ select public.report_incident(tests.val('trip1'), 'delay', 'x', now(), null, null) $$,
  '42501', 'trip not found', 'B cannot report on it'
);
select throws_ok(
  $$ select public.add_trip_document(tests.val('trip1'), 'carta_porte',
                                     tests.val('trip1') || '/a2600000-0000-4000-8000-0000000000aa.pdf', 'c.pdf') $$,
  '42501', 'trip not found', 'B cannot add documents to it'
);
select throws_ok(
  $$ select public.make_offer(tests.val('load2'), 3000000, null, 'e2600000-0000-4000-8000-00000000000a') $$,
  '42501', 'business unit not found', 'B cannot offer with a unit of A'
);
select throws_ok(
  $$ select count(*) from public.match_candidates('e2600000-0000-4000-8000-00000000000a', null, 500, 50) $$,
  '42501', 'vehicle not found', 'B cannot match a unit of A'
);
select is(
  (select count(*)::int from public.trip_point_locations(tests.val('trip1'))), 0,
  'B gets no points of the trip of A'
);

-- ---------------------------------------------------------------------------
-- RPCs and triggers: A on their own rows
-- ---------------------------------------------------------------------------
select tests.login('a2600000-0000-4000-8000-000000000003');
select lives_ok(
  $$ select public.set_vehicle_availability('e2600000-0000-4000-8000-00000000000a', now() + interval '1 hour',
                                            25.69, -100.32, 'Monterrey', 'Nuevo León') $$,
  'A sets the availability of their unit'
);
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e2600000-0000-4000-8000-00000000000a',
                               'd2600000-0000-4000-8000-00000000000b') $$,
  '22023', 'operator not found or without account', 'A cannot assign an operator of B'
);
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e2600000-0000-4000-8000-00000000000b',
                               'd2600000-0000-4000-8000-00000000000a') $$,
  '22023', 'vehicle not found', 'A cannot assign a unit of B'
);
select lives_ok(
  $$ insert into public.operators (id, company_id, full_name)
     values ('d2600000-0000-4000-8000-0000000000a2', 'c2600000-0000-4000-8000-000000000002', 'Nuevo A') $$,
  'A adds an operator without saying the business unit'
);
select throws_ok(
  $$ insert into public.operators (company_id, business_unit_id, full_name)
     values ('c2600000-0000-4000-8000-000000000002', tests.val('bu_b'), 'Nuevo B') $$,
  '42501', null, 'A cannot add an operator to B'
);
select throws_ok(
  $$ insert into public.vehicles (company_id, kind, plate, unit_type, capacity_kg)
     values ('c2600000-0000-4000-8000-000000000002', 'rigid', 'GGA2602', 'dry_van', 30000) $$,
  '42501', null, 'adding units is the manager''s'
);
select lives_ok(
  $$ update public.vehicles set plate = 'GGA2699' where id = 'e2600000-0000-4000-8000-00000000000a' $$,
  'A edits a unit of their business unit'
);
select throws_ok(
  $$ update public.vehicles set archived_at = now() where id = 'e2600000-0000-4000-8000-00000000000a' $$,
  '42501', 'only the manager can move or archive units and operators', 'A cannot archive it'
);
select is(
  (select count(*)::int from public.vehicles where id = 'e2600000-0000-4000-8000-00000000000b'), 0,
  'A does not see the units of B'
);
select is(tests.sees('a2600000-0000-4000-8000-000000000004',
  $$ select 1 from public.vehicle_availability where vehicle_id = 'e2600000-0000-4000-8000-00000000000a' $$), 0::bigint,
  'B does not see the availability of A''s unit');

select tests.login('a2600000-0000-4000-8000-000000000002');
select throws_ok(
  $$ insert into public.operators (company_id, full_name) values ('c2600000-0000-4000-8000-000000000002', 'Sin unidad') $$,
  '23502', 'business_unit_id is required', 'with several business units, the manager must choose one'
);
reset role;

select is(
  (select business_unit_id from public.operators where id = 'd2600000-0000-4000-8000-0000000000a2'),
  tests.val('bu_a'), 'the operator added by A goes to the only business unit of A'
);

-- ---------------------------------------------------------------------------
-- One negotiation per load and company
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a2600000-0000-4000-8000-000000000004');
select lives_ok(
  $$ select public.make_offer(tests.val('load2'), 3000000, null, 'e2600000-0000-4000-8000-00000000000b') $$,
  'B offers on L2 with their unit'
);
select tests.login('a2600000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.make_offer(tests.val('load2'), 2900000) $$,
  '23505', 'another business unit of the company already negotiates this load',
  'A cannot open a second negotiation of the company'
);
select tests.login('a2600000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.make_offer(tests.val('load2'), 2900000, null, null, tests.val('bu_a')) $$,
  '23505', 'another business unit of the company already negotiates this load',
  'nor can the manager move it to another business unit'
);
select tests.login('a2600000-0000-4000-8000-000000000008');
select lives_ok(
  $$ select public.make_offer(tests.val('load2'), 2800000) $$,
  'another carrier offers with its only business unit'
);

-- ---------------------------------------------------------------------------
-- The manager assigns a unit of B: the trip moves to B
-- ---------------------------------------------------------------------------
select tests.login('a2600000-0000-4000-8000-000000000002');
select lives_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e2600000-0000-4000-8000-00000000000b',
                               'd2600000-0000-4000-8000-00000000000b') $$,
  'the manager assigns a unit and an operator of B'
);
reset role;
select is(
  (select business_unit_id from public.trips where id = tests.val('trip1')),
  tests.val('bu_b'), 'the trip moves to the business unit of the unit'
);
select is(tests.matrix($$ select 1 from public.trips where id = tests.val('trip1') $$),
  '1,1,0,1,0,0,0', 'now B sees the trip and A does not (nor O, who was unassigned)');
select is(tests.matrix($$ select 1 from public.conversations where trip_id = tests.val('trip1') $$),
  '1,1,0,1,0,0,0', 'and its chat');
select is(tests.matrix($$ select 1 from public.loads where id = tests.val('load1') $$),
  '1,1,1,1,0,0,0', 'B reads the load through the trip; A still through the negotiation');
select is(tests.matrix($$ select 1 from public.trip_events where trip_id = tests.val('trip1') $$),
  '3,3,0,3,0,0,0', 'the trip events follow the moved trip');

-- ---------------------------------------------------------------------------
-- Matching alerts: a coordinator who runs several matching business units
-- gets one alert, with the best of their units; the manager one for the company
-- ---------------------------------------------------------------------------
reset role;
-- A now also runs unit B. Unit A's truck has the availability A set above;
-- unit B's truck is on trip 1, so B gets a second, free truck near MTY.
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id)
values (tests.val('bu_b'), 'c2600000-0000-4000-8000-000000000002', 'a2600000-0000-4000-8000-000000000003');
insert into public.vehicles (id, company_id, business_unit_id, kind, plate, unit_type, capacity_kg) values
  ('e2600000-0000-4000-8000-00000000000c', 'c2600000-0000-4000-8000-000000000002', tests.val('bu_b'),
   'rigid', 'GGB2602', 'dry_van', 30000);
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.id = 'e2600000-0000-4000-8000-00000000000c'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;
insert into public.vehicle_availability (company_id, vehicle_id, available_from, location, city, state, source)
values ('c2600000-0000-4000-8000-000000000002', 'e2600000-0000-4000-8000-00000000000c', now(),
        extensions.st_setsrid(extensions.st_makepoint(-100.3161, 25.6866), 4326)::extensions.geography,
        'Monterrey', 'Nuevo León', 'manual');
set local role authenticated;
select tests.login('a2600000-0000-4000-8000-000000000001');
insert into tests.vals select 'load3', public.create_load(tests.payload(3));
select public.publish_load(tests.val('load3'));
reset role;
select is(
  (select count(*)::int from public.notifications
   where type = 'load_match' and data ->> 'loadId' = tests.val('load3')::text
     and user_id = 'a2600000-0000-4000-8000-000000000003'),
  1, 'a coordinator of two matching business units gets one match alert'
);
select is(
  (select array_agg(user_id order by user_id) from public.notifications
   where type = 'load_match' and data ->> 'loadId' = tests.val('load3')::text
     and user_id::text like 'a2600000-%'),
  array['a2600000-0000-4000-8000-000000000002', 'a2600000-0000-4000-8000-000000000003',
        'a2600000-0000-4000-8000-000000000004']::uuid[],
  'the manager, A and B each get exactly one match alert'
);

-- Carrier notifications go through notify_carrier_staff, so coordinators get them.
select is_empty(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname <> 'notify_carrier_staff'
       and p.prosrc ~* 'notify_company\([^;]*''manager''' $$,
  'only notify_carrier_staff notifies the managers directly'
);

select * from finish();
rollback;
