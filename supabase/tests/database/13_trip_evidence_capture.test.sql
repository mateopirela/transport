-- Photo evidence (B23): role x operation matrix of trip_evidence_requirements,
-- the minimum pickup and delivery photos that gate record_trip_event, and the
-- receiver's name kept with the end of unloading.
begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

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

create table tests.vals (name text primary key, id uuid);
grant select, insert on tests.vals to authenticated;

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

-- Uploads a photo of the trip (as the signed-in operator) and registers it.
create function tests.add_photo(p_stage text, p_file uuid)
returns uuid
language plpgsql
as $$
declare
  v_path text := tests.val('trip') || '/' || p_stage || '/' || p_file || '.jpg';
begin
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('evidence', v_path, 'a2300000-0000-4000-8000-000000000003', '{"mimetype": "image/jpeg", "size": 4096}');
  return public.add_trip_evidence(
    tests.val('trip'), p_stage::public.evidence_stage, v_path, repeat('cd', 32), now() - interval '1 minute',
    25.7001, -100.2502
  );
end;
$$;
grant execute on all functions in schema tests to authenticated;

-- Users: ...01 shipper S   ...02 carrier A   ...03 operator O of A   ...04 admin
select tests.new_user('a2300000-0000-4000-8000-000000000001', 'sara@s23.test', 'shipper');
select tests.new_user('a2300000-0000-4000-8000-000000000002', 'ana@a23.test', 'carrier');
select tests.new_user('a2300000-0000-4000-8000-000000000003', 'oscar@a23.test', 'operator');
select tests.new_user('a2300000-0000-4000-8000-000000000004', 'admin@x23.test', 'shipper');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c2300000-0000-4000-8000-000000000001', 'shipper', 'Envíos Sigma SA de CV', 'ESI030303EF3', 'approved'),
  ('c2300000-0000-4000-8000-000000000002', 'carrier', 'Fletes Alfa SA de CV', 'FAL010101AB1', 'approved');
update public.profiles set company_id = 'c2300000-0000-4000-8000-000000000001'
where id = 'a2300000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c2300000-0000-4000-8000-000000000002'
where id in ('a2300000-0000-4000-8000-000000000002', 'a2300000-0000-4000-8000-000000000003');
update public.profiles set role = 'admin' where id = 'a2300000-0000-4000-8000-000000000004';

insert into public.operators (id, company_id, profile_id, full_name) values
  ('d2300000-0000-4000-8000-000000000003', 'c2300000-0000-4000-8000-000000000002',
   'a2300000-0000-4000-8000-000000000003', 'Óscar Operador');
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('e2300000-0000-4000-8000-000000000002', 'c2300000-0000-4000-8000-000000000002', 'rigid', 'AAA2323', 'dry_van', 30000);

-- ---------------------------------------------------------------------------
-- trip_evidence_requirements: role x operation
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select stage::text, min_photos from public.trip_evidence_requirements order by stage::text desc $$,
  $$ values ('pickup', 2::smallint), ('delivery', 2::smallint) $$,
  'pickup and delivery start with a minimum of two photos'
);
select ok(
  not has_table_privilege('anon', 'public.trip_evidence_requirements', 'select,insert,update,delete'),
  'anon has no privileges on the evidence minimums'
);
select ok(
  not has_function_privilege('authenticated', 'public.trip_evidence_missing(uuid, public.evidence_stage)', 'execute'),
  'clients cannot call the internal evidence counter'
);

set local role authenticated;

select tests.login('a2300000-0000-4000-8000-000000000001');
select is((select count(*) from public.trip_evidence_requirements), 2::bigint, 'a shipper reads the minimums');
select tests.login('a2300000-0000-4000-8000-000000000003');
select is((select count(*) from public.trip_evidence_requirements), 2::bigint, 'an operator reads the minimums');

select tests.login('a2300000-0000-4000-8000-000000000002');
select is((select count(*) from public.trip_evidence_requirements), 2::bigint, 'a carrier reads the minimums');
select is_empty(
  $$ update public.trip_evidence_requirements set min_photos = 0 returning 1 $$,
  'a carrier cannot lower the minimums'
);
select throws_ok(
  $$ insert into public.trip_evidence_requirements (stage, min_photos) values ('incident', 1) $$, '42501', null,
  'clients cannot add minimums'
);
select throws_ok(
  $$ delete from public.trip_evidence_requirements $$, '42501', null, 'clients cannot delete minimums'
);

select tests.login('a2300000-0000-4000-8000-000000000004');
select throws_ok(
  $$ update public.trip_evidence_requirements set stage = 'incident' where stage = 'pickup' $$, '42501', null,
  'not even an admin changes the stage of a minimum'
);
select throws_ok(
  $$ update public.trip_evidence_requirements set min_photos = 21 where stage = 'pickup' $$, '23514', null,
  'a minimum is between 0 and 20 photos'
);
select results_eq(
  $$ update public.trip_evidence_requirements set min_photos = 3 where stage = 'delivery' returning min_photos $$,
  $$ values (3::smallint) $$,
  'an admin changes a minimum'
);
reset role;
select is(
  (select count(*) from public.audit_log where table_name = 'trip_evidence_requirements'), 1::bigint,
  'the admin change is audited'
);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- A trip assigned to O, up to loading
-- ---------------------------------------------------------------------------
select tests.login('a2300000-0000-4000-8000-000000000001');
insert into tests.vals select 'load', public.create_load(tests.payload());
select public.publish_load(tests.val('load'));
select tests.login('a2300000-0000-4000-8000-000000000002');
insert into tests.vals select 'offer', public.make_offer(tests.val('load'), 3400000);
select tests.login('a2300000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip', public.accept_offer(tests.val('offer'));
select tests.login('a2300000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('trip'), 'e2300000-0000-4000-8000-000000000002',
                          'd2300000-0000-4000-8000-000000000003');

select tests.login('a2300000-0000-4000-8000-000000000003');
select lives_ok(
  $$ select public.record_trip_event(tests.val('trip'), 'departed', now() - interval '270 seconds', 25.6866, -100.3161);
     select public.record_trip_event(tests.val('trip'), 'arrived_at_pickup', now() - interval '240 seconds',
                                     25.7001, -100.2502);
     select public.record_trip_event(tests.val('trip'), 'loading_started', now() - interval '210 seconds',
                                     25.7001, -100.2502) $$,
  'the operator reaches the pickup and starts loading'
);

-- ---------------------------------------------------------------------------
-- Pickup: no leaving without the minimum photos
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip'), 'loading_finished', now() - interval '180 seconds',
                                     25.7001, -100.2502) $$,
  '55000', 'evidence is missing: 2 more photos are required',
  'loading cannot finish without pickup photos'
);
select lives_ok(
  $$ select tests.add_photo('pickup', 'b2300000-0000-4000-8000-000000000001') $$,
  'the operator registers a pickup photo'
);
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip'), 'loading_finished', now() - interval '180 seconds',
                                     25.7001, -100.2502) $$,
  '55000', 'evidence is missing: 1 more photos are required',
  'one photo is not enough when two are required'
);
select lives_ok(
  $$ select tests.add_photo('delivery', 'b2300000-0000-4000-8000-000000000009') $$,
  'a delivery photo can be registered at any active status'
);
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip'), 'loading_finished', now() - interval '180 seconds',
                                     25.7001, -100.2502) $$,
  '55000', 'evidence is missing: 1 more photos are required',
  'photos of another stage do not count for the pickup'
);
select lives_ok(
  $$ select tests.add_photo('pickup', 'b2300000-0000-4000-8000-000000000002') $$,
  'the operator registers a second pickup photo'
);
select lives_ok(
  $$ select public.record_trip_event(tests.val('trip'), 'loading_finished', now() - interval '180 seconds',
                                     25.7001, -100.2502) $$,
  'with the minimum pickup photos the operator leaves with the cargo'
);

-- ---------------------------------------------------------------------------
-- Delivery: the receiver's name and the minimum photos
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip'), 'arrived_at_delivery', now() - interval '150 seconds',
                                     20.6597, -103.3496, p_received_by_name => 'Rosa Almacén') $$,
  '22023', null, 'the receiver''s name only goes with the end of unloading'
);
select lives_ok(
  $$ select public.record_trip_event(tests.val('trip'), 'arrived_at_delivery', now() - interval '150 seconds',
                                     20.6597, -103.3496);
     select public.record_trip_event(tests.val('trip'), 'unloading_started', now() - interval '120 seconds',
                                     20.6597, -103.3496, null, now() + interval '2 hours') $$,
  'the operator arrives and starts unloading'
);
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip'), 'unloading_finished', now() - interval '1 minute',
                                     20.6597, -103.3496) $$,
  '22023', 'the name of the receiver goes only with unloading_finished, and is required there',
  'unloading cannot finish without the receiver''s name'
);
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip'), 'unloading_finished', now() - interval '1 minute',
                                     20.6597, -103.3496, p_received_by_name => '   ') $$,
  '22023', null, 'a blank name does not count'
);
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip'), 'unloading_finished', now() - interval '1 minute',
                                     20.6597, -103.3496, p_received_by_name => repeat('x', 201)) $$,
  '22023', 'the name of the receiver is too long', 'the name is at most 200 characters'
);
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip'), 'unloading_finished', now() - interval '1 minute',
                                     20.6597, -103.3496, p_received_by_name => 'Rosa Almacén') $$,
  '55000', 'evidence is missing: 2 more photos are required',
  'the trip cannot be delivered without the minimum delivery photos (the admin raised it to three)'
);
select lives_ok(
  $$ select tests.add_photo('delivery', 'b2300000-0000-4000-8000-000000000003');
     select tests.add_photo('delivery', 'b2300000-0000-4000-8000-000000000004') $$,
  'the operator registers the delivery photos'
);
select is(
  public.record_trip_event(tests.val('trip'), 'unloading_finished', now() - interval '1 minute',
                           20.6597, -103.3496, p_received_by_name => '  Rosa Almacén ',
                           p_client_event_id => 'f2300000-0000-4000-8000-000000000001') is not null,
  true,
  'with the photos and the name the operator marks the trip delivered'
);
select is(
  (select status::text from public.trips where id = tests.val('trip')), 'delivered', 'the trip is delivered'
);
select is(
  public.record_trip_event(tests.val('trip'), 'unloading_finished', now() - interval '1 minute',
                           20.6597, -103.3496, p_client_event_id => 'f2300000-0000-4000-8000-000000000001'),
  (select id from public.trip_events where client_event_id = 'f2300000-0000-4000-8000-000000000001'),
  'a retried delivery returns the stored event'
);

-- The receiver is part of the timeline that the trip parties read.
select tests.login('a2300000-0000-4000-8000-000000000001');
select is(
  (select received_by_name from public.trip_events
   where trip_id = tests.val('trip') and event_type = 'unloading_finished'),
  'Rosa Almacén',
  'the shipper reads who received the cargo, trimmed'
);
select tests.login('a2300000-0000-4000-8000-000000000002');
select is(
  (select count(*) from public.trip_evidence where trip_id = tests.val('trip')), 5::bigint,
  'the carrier sees every photo of the trip'
);

reset role;
select throws_ok(
  $$ insert into public.trip_events (trip_id, event_type, occurred_at, received_by_name)
     values ((select id from tests.vals where name = 'trip'), 'departed', now(), 'Rosa') $$,
  '23514', null, 'the table itself keeps the name on the end of unloading only'
);

select * from finish();
rollback;
