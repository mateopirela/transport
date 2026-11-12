-- R4 · Candado de viajes (D45) and the review source (D10-E1). A unit or an
-- operator without every required document approved and current is not
-- assigned (assign_trip), made available (set_vehicle_availability,
-- release_vehicle) nor recommended (match_pairs, match_candidates); the
-- hombre-camión's units follow his own documents; the errors name catalog
-- codes only, after the caller was authorized; documents.review_source and
-- document_requirements.auto_review_eligible.
--
-- The three gaps of plan-registro.md §R4: (1) a unit missing a document,
-- (2) an operator with a typed license date and no approved license, (3) an
-- operator without an approved official id.
begin;
create extension if not exists pgtap with schema extensions;

select plan(56);

-- I1: the cargo insurance (51_cargo_insurance) takes no part in this test.
update public.trip_document_requirements set is_required = false, blocks_departure = false where kind = 'cargo_insurance';

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.new_user(p_id uuid, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@r4.test', now(),
          case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end,
          jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;

create function tests.requirement(p_code text)
returns uuid
language sql
stable
as $$ select id from public.document_requirements where code = p_code $$;

-- A valid load payload MTY -> GDL (loadFormSchema output).
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

-- A document of the owner in a given state (what submit_document and
-- review_document would leave), written as the owner of the tables.
create function tests.doc(p_owner_type public.document_owner_type, p_owner_id uuid, p_code text,
                          p_status public.verification_status default 'approved',
                          p_expires_at timestamptz default now() + interval '1 year')
returns uuid
language sql
as $$
  insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at,
                                review_notes)
  select public.document_owner_company_id(p_owner_type, p_owner_id), tests.requirement(p_code), p_owner_type, p_owner_id,
         public.document_owner_company_id(p_owner_type, p_owner_id) || '/' || p_owner_type || '/' || p_owner_id || '/'
           || gen_random_uuid() || '.pdf',
         p_status, p_expires_at, case when p_status = 'rejected' then 'Ilegible' end
  returning id;
$$;

grant execute on all functions in schema tests to authenticated;

-- Users a66…: 01 shipper Sara, 02 manager Mario (Fletes R4), 03 admin, 04 manager Xavier (other carrier),
-- 05 Ana (complete), 06 Beto (typed license date, no license document), 07 Carla (no official id),
-- 08 Dora (expired license), 09 José (hombre-camión: manager and his own operator).
select tests.new_user('a6600000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a6600000-0000-4000-8000-000000000002', 'manager');
select tests.new_user('a6600000-0000-4000-8000-000000000003', 'shipper');
select tests.new_user('a6600000-0000-4000-8000-000000000004', 'manager');
select tests.new_user('a6600000-0000-4000-8000-000000000005', 'operator');
select tests.new_user('a6600000-0000-4000-8000-000000000006', 'operator');
select tests.new_user('a6600000-0000-4000-8000-000000000007', 'operator');
select tests.new_user('a6600000-0000-4000-8000-000000000008', 'operator');
select tests.new_user('a6600000-0000-4000-8000-000000000009', 'manager');

insert into public.companies (id, type, legal_name, rfc, status, is_owner_operator) values
  ('c6600000-0000-4000-8000-000000000001', 'shipper', 'Envíos R4 SA de CV', 'ERC050505GH5', 'approved', false),
  ('c6600000-0000-4000-8000-000000000002', 'carrier', 'Fletes R4 SA de CV', 'FRC040404CD4', 'approved', false),
  ('c6600000-0000-4000-8000-000000000003', 'carrier', 'Transportes Equis SA de CV', 'TEQ030303EF3', 'approved', false),
  ('c6600000-0000-4000-8000-000000000004', 'carrier', 'José Sánchez Medina', 'SAMJ800101AB1', 'approved', true);
update public.profiles p set company_id = v.company_id
from (values
  ('a6600000-0000-4000-8000-000000000001'::uuid, 'c6600000-0000-4000-8000-000000000001'::uuid),
  ('a6600000-0000-4000-8000-000000000002', 'c6600000-0000-4000-8000-000000000002'),
  ('a6600000-0000-4000-8000-000000000004', 'c6600000-0000-4000-8000-000000000003'),
  ('a6600000-0000-4000-8000-000000000005', 'c6600000-0000-4000-8000-000000000002'),
  ('a6600000-0000-4000-8000-000000000006', 'c6600000-0000-4000-8000-000000000002'),
  ('a6600000-0000-4000-8000-000000000007', 'c6600000-0000-4000-8000-000000000002'),
  ('a6600000-0000-4000-8000-000000000008', 'c6600000-0000-4000-8000-000000000002'),
  ('a6600000-0000-4000-8000-000000000009', 'c6600000-0000-4000-8000-000000000004')
) as v(profile_id, company_id)
where p.id = v.profile_id;
update public.profiles set role = 'admin' where id = 'a6600000-0000-4000-8000-000000000003';

-- Every operator holds a type E license and, on the row, a license date a year
-- ahead: the date alone must not count (gap 2).
insert into public.operators (id, company_id, profile_id, full_name, license_type, license_expires_on) values
  ('d6600000-0000-4000-8000-000000000005', 'c6600000-0000-4000-8000-000000000002',
   'a6600000-0000-4000-8000-000000000005', 'Ana Completa', 'E', current_date + 365),
  ('d6600000-0000-4000-8000-000000000006', 'c6600000-0000-4000-8000-000000000002',
   'a6600000-0000-4000-8000-000000000006', 'Beto Fecha', 'E', current_date + 365),
  ('d6600000-0000-4000-8000-000000000007', 'c6600000-0000-4000-8000-000000000002',
   'a6600000-0000-4000-8000-000000000007', 'Carla: Sin INE', 'E', current_date + 365),
  ('d6600000-0000-4000-8000-000000000008', 'c6600000-0000-4000-8000-000000000002',
   'a6600000-0000-4000-8000-000000000008', 'Dora Vencida', 'E', current_date + 365),
  ('d6600000-0000-4000-8000-000000000009', 'c6600000-0000-4000-8000-000000000004',
   'a6600000-0000-4000-8000-000000000009', 'José Sánchez Medina', 'E', current_date + 365);

-- Units: 01 complete, 02 without its permit, 03 with its insurance expired,
-- 04 with its card rejected, 05 of the other carrier, 06 the hombre-camión's,
-- 07 complete and 08 the hombre-camión's, both kept out of every trip for the
-- recommendations (a unit on a trip starts where the trip ends, F5).
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('e6600000-0000-4000-8000-000000000001', 'c6600000-0000-4000-8000-000000000002', 'trailer', 'RCU6601', 'dry_van', 30000),
  ('e6600000-0000-4000-8000-000000000002', 'c6600000-0000-4000-8000-000000000002', 'trailer', 'RCU6602', 'dry_van', 30000),
  ('e6600000-0000-4000-8000-000000000003', 'c6600000-0000-4000-8000-000000000002', 'trailer', 'RCU6603', 'dry_van', 30000),
  ('e6600000-0000-4000-8000-000000000004', 'c6600000-0000-4000-8000-000000000002', 'trailer', 'RCU6604', 'dry_van', 30000),
  ('e6600000-0000-4000-8000-000000000005', 'c6600000-0000-4000-8000-000000000003', 'trailer', 'RCU6605', 'dry_van', 30000),
  ('e6600000-0000-4000-8000-000000000006', 'c6600000-0000-4000-8000-000000000004', 'trailer', 'RCU6606', 'dry_van', 30000),
  ('e6600000-0000-4000-8000-000000000007', 'c6600000-0000-4000-8000-000000000002', 'trailer', 'RCU6607', 'dry_van', 30000),
  ('e6600000-0000-4000-8000-000000000008', 'c6600000-0000-4000-8000-000000000004', 'trailer', 'RCU6608', 'dry_van', 30000);

-- Unit documents.
select tests.doc('vehicle', v.id, r.code)
from (values ('e6600000-0000-4000-8000-000000000001'::uuid), ('e6600000-0000-4000-8000-000000000005'),
             ('e6600000-0000-4000-8000-000000000006'), ('e6600000-0000-4000-8000-000000000007'),
             ('e6600000-0000-4000-8000-000000000008')) v(id)
cross join (values ('vehicle_registration_card'), ('vehicle_insurance_policy'), ('vehicle_permit')) r(code);
select tests.doc('vehicle', 'e6600000-0000-4000-8000-000000000002', c)
from unnest(array['vehicle_registration_card', 'vehicle_insurance_policy']) c;
select tests.doc('vehicle', 'e6600000-0000-4000-8000-000000000002', 'vehicle_permit', 'pending_review');
select tests.doc('vehicle', 'e6600000-0000-4000-8000-000000000003', c)
from unnest(array['vehicle_registration_card', 'vehicle_permit']) c;
select tests.doc('vehicle', 'e6600000-0000-4000-8000-000000000003', 'vehicle_insurance_policy', 'approved',
                 now() - interval '1 day');
select tests.doc('vehicle', 'e6600000-0000-4000-8000-000000000004', c)
from unnest(array['vehicle_insurance_policy', 'vehicle_permit']) c;
select tests.doc('vehicle', 'e6600000-0000-4000-8000-000000000004', 'vehicle_registration_card', 'rejected');

-- Operator documents.
select tests.doc('operator', 'd6600000-0000-4000-8000-000000000005', c)
from unnest(array['operator_official_id', 'federal_driver_license']) c;
select tests.doc('operator', 'd6600000-0000-4000-8000-000000000006', 'operator_official_id');
select tests.doc('operator', 'd6600000-0000-4000-8000-000000000007', 'federal_driver_license');
select tests.doc('operator', 'd6600000-0000-4000-8000-000000000008', 'operator_official_id');
select tests.doc('operator', 'd6600000-0000-4000-8000-000000000008', 'federal_driver_license', 'approved',
                 now() - interval '1 day');
-- José has his license; his official id waits for review.
select tests.doc('operator', 'd6600000-0000-4000-8000-000000000009', 'federal_driver_license');
insert into tests.vals select 'jose_id', tests.doc('operator', 'd6600000-0000-4000-8000-000000000009',
                                                   'operator_official_id', 'pending_review');

-- ---------------------------------------------------------------------------
-- Operator readiness, from the catalog
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.operator_missing_requirements('d6600000-0000-4000-8000-000000000005')),
  0, 'an operator with the official id and the license approved misses nothing'
);
select results_eq(
  $$ select code from public.operator_missing_requirements('d6600000-0000-4000-8000-000000000006') $$,
  $$ values ('federal_driver_license') $$,
  'gap 2: a license date typed on the operator does not stand for the approved license'
);
select results_eq(
  $$ select code from public.operator_missing_requirements('d6600000-0000-4000-8000-000000000007') $$,
  $$ values ('operator_official_id') $$,
  'gap 3: the official id counts'
);
select results_eq(
  $$ select code from public.operator_expired_requirements('d6600000-0000-4000-8000-000000000008') $$,
  $$ values ('federal_driver_license') $$,
  'an approved license past its date is expired'
);
select is(
  (select count(*)::int from public.operator_expired_requirements('d6600000-0000-4000-8000-000000000006')),
  0, 'a license never approved is missing, not expired'
);
select ok(
  not public.operator_license_current('d6600000-0000-4000-8000-000000000006')
  and public.operator_license_current('d6600000-0000-4000-8000-000000000005'),
  'operator_license_current reads the approved license document only'
);
select is(
  public.owner_operator_id('c6600000-0000-4000-8000-000000000004'),
  'd6600000-0000-4000-8000-000000000009'::uuid,
  'the hombre-camión''s own operator is the row linked to his manager profile'
);
select is(
  public.owner_operator_id('c6600000-0000-4000-8000-000000000002'), null,
  'a fleet has no own operator'
);
-- A requirement added to the catalog later gates without code changes (R3's selfie).
insert into public.document_requirements (code, owner_type, company_type, name, requires_expiry, sort_order)
values ('r4_probe', 'operator', 'carrier', 'Prueba', false, 999);
select results_eq(
  $$ select code from public.operator_missing_requirements('d6600000-0000-4000-8000-000000000005') $$,
  $$ values ('r4_probe') $$,
  'a new required operator document is required at once'
);
update public.document_requirements set is_required = false where code = 'r4_probe';

-- ---------------------------------------------------------------------------
-- Privileges of the helpers
-- ---------------------------------------------------------------------------
select ok(
  has_function_privilege('authenticated', 'public.operator_missing_requirements(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.operator_expired_requirements(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.operator_missing_requirements(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.operator_expired_requirements(uuid)', 'execute'),
  'the readiness helpers are for signed-in users, like the vehicle ones'
);
select ok(
  not exists (
    select 1 from unnest(array[
      'public.assert_vehicle_documents_ready(uuid)', 'public.assert_operator_documents_ready(uuid)',
      'public.assert_vehicle_can_travel(uuid)', 'public.owner_operator_id(uuid)',
      'public.operator_license_current(uuid)', 'public.owner_operator_ready(uuid)'
    ]) f
    where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')
  ),
  'the gate''s internals are not callable by clients'
);
select ok(
  not exists (
    select 1 from pg_proc p
    where p.oid in ('public.operator_missing_requirements(uuid)'::regprocedure,
                    'public.operator_expired_requirements(uuid)'::regprocedure)
      and p.prosecdef
  ),
  'the readiness helpers run with the caller''s privileges (RLS applies)'
);
set local role authenticated;
select tests.login('a6600000-0000-4000-8000-000000000004');
select is(
  (select count(*)::int from public.operator_missing_requirements('d6600000-0000-4000-8000-000000000006')),
  0, 'another carrier learns nothing about an operator it cannot see'
);
reset role;

-- ---------------------------------------------------------------------------
-- Trips to assign: Fletes R4 (trip1) and the hombre-camión (trip2)
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a6600000-0000-4000-8000-000000000001');
insert into tests.vals select 'load1', public.create_load(tests.payload(1));
select public.publish_load(tests.val('load1'));
insert into tests.vals select 'load2', public.create_load(tests.payload(2));
select public.publish_load(tests.val('load2'));
insert into tests.vals select 'load3', public.create_load(tests.payload(3));
select public.publish_load(tests.val('load3'));
select tests.login('a6600000-0000-4000-8000-000000000002');
insert into tests.vals select 'offer1', public.make_offer(tests.val('load1'), 3000000, null, 'e6600000-0000-4000-8000-000000000001');
select tests.login('a6600000-0000-4000-8000-000000000009');
insert into tests.vals select 'offer2', public.make_offer(tests.val('load2'), 3000000, null, 'e6600000-0000-4000-8000-000000000006');
select tests.login('a6600000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip1', public.accept_offer(tests.val('offer1'));
insert into tests.vals select 'trip2', public.accept_offer(tests.val('offer2'));

-- ---------------------------------------------------------------------------
-- assign_trip
-- ---------------------------------------------------------------------------
select tests.login('a6600000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e6600000-0000-4000-8000-000000000002', 'd6600000-0000-4000-8000-000000000005') $$,
  '55000', 'vehicle has missing documents: vehicle_permit',
  'gap 1: a unit whose permit is still in review is not assigned'
);
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e6600000-0000-4000-8000-000000000003', 'd6600000-0000-4000-8000-000000000005') $$,
  '55000', 'vehicle has expired documents: vehicle_insurance_policy',
  'a unit with its insurance expired is not assigned, and the code says which'
);
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e6600000-0000-4000-8000-000000000004', 'd6600000-0000-4000-8000-000000000005') $$,
  '55000', 'vehicle has missing documents: vehicle_registration_card',
  'a unit whose card was rejected is not assigned'
);
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e6600000-0000-4000-8000-000000000001', 'd6600000-0000-4000-8000-000000000006') $$,
  '55000', 'operator has missing documents: federal_driver_license: Beto Fecha',
  'gap 2: an operator with only a typed license date is not assigned'
);
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e6600000-0000-4000-8000-000000000001', 'd6600000-0000-4000-8000-000000000007') $$,
  '55000', 'operator has missing documents: operator_official_id: Carla: Sin INE',
  'gap 3: an operator without an approved official id is not assigned'
);
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e6600000-0000-4000-8000-000000000001', 'd6600000-0000-4000-8000-000000000008') $$,
  '55000', 'operator has expired documents: federal_driver_license: Dora Vencida',
  'an operator whose license expired is not assigned'
);
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e6600000-0000-4000-8000-000000000005', 'd6600000-0000-4000-8000-000000000005') $$,
  '22023', 'vehicle not found',
  'a unit of another company is not found: its documents are never reported'
);
select is(
  (select status::text from public.trips where id = tests.val('trip1')), 'pending_assignment',
  'nothing was assigned by the refused calls'
);
select lives_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e6600000-0000-4000-8000-000000000001', 'd6600000-0000-4000-8000-000000000005') $$,
  'a complete unit with a complete operator is assigned (control)'
);
select is(
  (select vehicle_id from public.trips where id = tests.val('trip1')),
  'e6600000-0000-4000-8000-000000000001'::uuid, 'with that unit'
);
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e6600000-0000-4000-8000-000000000002', 'd6600000-0000-4000-8000-000000000005') $$,
  '55000', 'vehicle has missing documents: vehicle_permit',
  'a reassignment is gated too'
);
select tests.login('a6600000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e6600000-0000-4000-8000-000000000001', 'd6600000-0000-4000-8000-000000000006') $$,
  '55000', 'operator has missing documents: federal_driver_license: Beto Fecha',
  'an admin cannot skip the gate either'
);

-- The hombre-camión assigns himself (D13): his own documents count.
select tests.login('a6600000-0000-4000-8000-000000000009');
select throws_ok(
  $$ select public.assign_trip(tests.val('trip2'), 'e6600000-0000-4000-8000-000000000006', 'd6600000-0000-4000-8000-000000000009') $$,
  '55000', 'operator has missing documents: operator_official_id: José Sánchez Medina',
  'a hombre-camión with his official id in review cannot take his trip'
);
reset role;

-- ---------------------------------------------------------------------------
-- set_vehicle_availability
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a6600000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.set_vehicle_availability('e6600000-0000-4000-8000-000000000002', now(), 25.6866, -100.3161, 'Monterrey', 'Nuevo León') $$,
  '55000', 'vehicle has missing documents: vehicle_permit',
  'a unit missing a document cannot be made available (before: expired only)'
);
select throws_ok(
  $$ select public.set_vehicle_availability('e6600000-0000-4000-8000-000000000003', now(), 25.6866, -100.3161, 'Monterrey', 'Nuevo León') $$,
  '55000', 'vehicle has expired documents: vehicle_insurance_policy',
  'nor one with an expired document'
);
select lives_ok(
  $$ select public.set_vehicle_availability('e6600000-0000-4000-8000-000000000001', now(), 25.6866, -100.3161, 'Monterrey', 'Nuevo León') $$,
  'a complete unit is made available'
);
select tests.login('a6600000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.set_vehicle_availability('e6600000-0000-4000-8000-000000000002', now(), 25.6866, -100.3161, 'Monterrey', 'Nuevo León') $$,
  '42501', 'vehicle not found',
  'another carrier is refused before any document is read'
);
select tests.login('a6600000-0000-4000-8000-000000000009');
select throws_ok(
  $$ select public.set_vehicle_availability('e6600000-0000-4000-8000-000000000006', now(), 25.6866, -100.3161, 'Monterrey', 'Nuevo León') $$,
  '55000', 'operator has missing documents: operator_official_id: José Sánchez Medina',
  'a hombre-camión''s complete unit waits for his own documents'
);
reset role;

-- ---------------------------------------------------------------------------
-- Recommendations: match_pairs and match_candidates
-- ---------------------------------------------------------------------------
-- Availability written directly (as set_vehicle_availability would, without
-- its gate) for the units the RPC refuses, to see what matching does alone.
insert into public.vehicle_availability (company_id, vehicle_id, available_from, location, city, state, source)
select v.company_id, v.id, now(), 'SRID=4326;POINT(-100.3161 25.6866)'::extensions.geography, 'Monterrey', 'Nuevo León', 'manual'
from public.vehicles v
where v.id in ('e6600000-0000-4000-8000-000000000002', 'e6600000-0000-4000-8000-000000000003',
               'e6600000-0000-4000-8000-000000000004', 'e6600000-0000-4000-8000-000000000007',
               'e6600000-0000-4000-8000-000000000008');
select results_eq(
  $$ select vehicle_id from public.match_pairs(null, tests.val('load3'), 150)
     where vehicle_id::text like 'e6600000-%' order by vehicle_id $$,
  $$ values ('e6600000-0000-4000-8000-000000000007'::uuid) $$,
  'only the complete unit is recommended: missing, expired, rejected and the hombre-camión''s wait'
);
set local role authenticated;
select tests.login('a6600000-0000-4000-8000-000000000002');
select is(
  (select count(*)::int from public.match_candidates('e6600000-0000-4000-8000-000000000002')),
  0, 'match_candidates finds no load for a unit missing a document'
);
select ok(
  (select count(*)::int from public.match_candidates('e6600000-0000-4000-8000-000000000007')) > 0,
  'and finds them for the complete unit'
);
reset role;

-- José's official id is approved by the admin: the review records its source.
set local role authenticated;
select tests.login('a6600000-0000-4000-8000-000000000003');
select is(
  public.review_document(tests.val('jose_id'), 'approve', null, now() + interval '5 years'),
  'approved'::public.verification_status, 'the admin approves José''s official id'
);
reset role;
select is(
  (select review_source::text from public.documents where id = tests.val('jose_id')), 'manual',
  'D10-E1: review_document records a manual review'
);
select results_eq(
  $$ select vehicle_id from public.match_pairs(null, tests.val('load3'), 150)
     where vehicle_id::text like 'e6600000-%' order by vehicle_id $$,
  $$ values ('e6600000-0000-4000-8000-000000000007'::uuid), ('e6600000-0000-4000-8000-000000000008'::uuid) $$,
  'with his documents approved, the hombre-camión''s unit is recommended'
);
set local role authenticated;
select tests.login('a6600000-0000-4000-8000-000000000009');
select lives_ok(
  $$ select public.set_vehicle_availability('e6600000-0000-4000-8000-000000000006', now(), 25.6866, -100.3161, 'Monterrey', 'Nuevo León') $$,
  'and made available'
);
select lives_ok(
  $$ select public.assign_trip(tests.val('trip2'), 'e6600000-0000-4000-8000-000000000006', 'd6600000-0000-4000-8000-000000000009') $$,
  'and he takes his trip'
);
reset role;

-- ---------------------------------------------------------------------------
-- release_vehicle: the same rule as set_vehicle_availability
-- ---------------------------------------------------------------------------
with task as (
  insert into public.vehicle_release_tasks (company_id, vehicle_id, business_unit_id, trip_id)
  select v.company_id, v.id, v.business_unit_id, tests.val('trip1')
  from public.vehicles v where v.id = 'e6600000-0000-4000-8000-000000000002'
  returning id
)
insert into tests.vals select 'task', id from task;
set local role authenticated;
select tests.login('a6600000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.release_vehicle(tests.val('task'), now(), 25.6866, -100.3161, 'Monterrey', 'Nuevo León') $$,
  '55000', 'vehicle has missing documents: vehicle_permit',
  'a unit pending release stays pending while a document is not approved'
);
reset role;
select is(
  (select status::text from public.vehicle_release_tasks where id = tests.val('task')), 'pending',
  'its task is still pending'
);

-- ---------------------------------------------------------------------------
-- D10-E1: review_source and auto_review_eligible
-- ---------------------------------------------------------------------------
select is(
  (select udt_schema || '.' || udt_name || ':' || is_nullable from information_schema.columns
   where table_schema = 'public' and table_name = 'documents' and column_name = 'review_source'),
  'public.document_review_source:NO', 'review_source is its own enum, never null'
);
select is(
  (select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'documents' and column_name = 'review_source'),
  '''manual''::document_review_source', 'documents are manual by default'
);
select enum_has_labels('public', 'document_review_source', array['manual', 'automatic'], 'manual or automatic');
select is(
  (select count(*)::int from public.documents where review_source <> 'manual'), 0,
  'every document so far is a manual review (no RPC writes automatic yet)'
);
select is(
  (select count(*)::int from public.document_requirements where auto_review_eligible), 0,
  'no requirement is marked for an automatic reviewer yet'
);
select ok(
  not has_column_privilege('authenticated', 'public.documents', 'review_source', 'insert')
  and not has_column_privilege('authenticated', 'public.documents', 'review_source', 'update'),
  'clients never write the review source'
);
set local role authenticated;
select tests.login('a6600000-0000-4000-8000-000000000002');
select throws_ok(
  $$ update public.documents set review_source = 'automatic' where owner_id = 'e6600000-0000-4000-8000-000000000001' $$,
  '42501', null, 'a manager cannot mark a review as automatic'
);
select lives_ok(
  $$ update public.document_requirements set auto_review_eligible = true where code = 'vehicle_permit' $$,
  'a manager''s catalog update runs but RLS matches no row'
);
select is(
  (select auto_review_eligible from public.document_requirements where code = 'vehicle_permit'), false,
  'so nothing changed'
);
select tests.login('a6600000-0000-4000-8000-000000000003');
select lives_ok(
  $$ update public.document_requirements set auto_review_eligible = true where code = 'tax_status_certificate' $$,
  'an admin marks what an automatic reviewer could check'
);
select is(
  (select count(*)::int from public.document_requirements where auto_review_eligible), 1, 'and it is kept'
);
reset role;
select ok(
  exists (
    select 1 from public.audit_log
    where table_name = 'document_requirements' and action = 'update'
      and new_data ->> 'auto_review_eligible' = 'true'
  ),
  'the catalog change is audited'
);

-- ---------------------------------------------------------------------------
-- A hombre-camión without an active own operator row (never created, or
-- archived) is blocked, not waved through (owner_operator_ready).
-- ---------------------------------------------------------------------------
-- User 10: Pablo, hombre-camión whose own operator row is archived; unit 09
-- has every document approved.
select tests.new_user('a6600000-0000-4000-8000-000000000010', 'manager');
insert into public.companies (id, type, legal_name, rfc, status, is_owner_operator) values
  ('c6600000-0000-4000-8000-000000000005', 'carrier', 'Pablo Ruiz Treviño', 'RUTP800202CD2', 'approved', true);
update public.profiles set company_id = 'c6600000-0000-4000-8000-000000000005'
where id = 'a6600000-0000-4000-8000-000000000010';
insert into public.operators (id, company_id, profile_id, full_name, license_type, license_expires_on, archived_at) values
  ('d6600000-0000-4000-8000-000000000010', 'c6600000-0000-4000-8000-000000000005',
   'a6600000-0000-4000-8000-000000000010', 'Pablo Ruiz Treviño', 'E', current_date + 365, now());
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('e6600000-0000-4000-8000-000000000009', 'c6600000-0000-4000-8000-000000000005', 'trailer', 'RCU6609', 'dry_van', 30000);
select tests.doc('vehicle', 'e6600000-0000-4000-8000-000000000009', c)
from unnest(array['vehicle_registration_card', 'vehicle_insurance_policy', 'vehicle_permit']) c;
-- His archived row's documents are approved: they must not count.
select tests.doc('operator', 'd6600000-0000-4000-8000-000000000010', c)
from unnest(array['operator_official_id', 'federal_driver_license']) c;

set local role authenticated;
select tests.login('a6600000-0000-4000-8000-000000000010');
select throws_ok(
  $$ select public.set_vehicle_availability('e6600000-0000-4000-8000-000000000009', now(), 25.6866, -100.3161, 'Monterrey', 'Nuevo León') $$,
  '55000', 'owner operator not found',
  'a hombre-camión whose own operator row is archived cannot make his unit available'
);
reset role;
insert into public.vehicle_availability (company_id, vehicle_id, available_from, location, city, state, source)
values ('c6600000-0000-4000-8000-000000000005', 'e6600000-0000-4000-8000-000000000009', now(),
        'SRID=4326;POINT(-100.3161 25.6866)'::extensions.geography, 'Monterrey', 'Nuevo León', 'manual');
select is(
  (select count(*)::int from public.match_pairs(null, tests.val('load3'), 150)
   where vehicle_id = 'e6600000-0000-4000-8000-000000000009'),
  0, 'nor is his unit recommended while he has no active operator row'
);
update public.operators set archived_at = null where id = 'd6600000-0000-4000-8000-000000000010';
select is(
  (select count(*)::int from public.match_pairs(null, tests.val('load3'), 150)
   where vehicle_id = 'e6600000-0000-4000-8000-000000000009'),
  1, 'with his row active and its documents approved, it is recommended (control)'
);

select * from finish();
rollback;
