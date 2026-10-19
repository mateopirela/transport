-- F8 · confirm_delivery is idempotent on p_client_event_id:
--   * a retry with the same key succeeds and records nothing more;
--   * another key (or none) after the trip is closed fails with the status error;
--   * a key already used by another event of the trip is refused;
--   * the key does not open the trip to anyone outside its shipper.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated;

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

-- Records an operator status event of the trip, p_seconds after the transaction started.
create function tests.step(p_event text, p_seconds integer, p_estimate timestamptz default null,
                           p_receiver text default null, p_client_event_id uuid default null)
returns uuid
language sql
as $$
  select public.record_trip_event(
    tests.val('trip'), p_event::public.trip_event_type, now() + make_interval(secs => p_seconds),
    20.6597, -103.3496, null, p_estimate, null, p_client_event_id, p_receiver
  );
$$;

grant execute on all functions in schema tests to authenticated;

-- Users: ...01 shipper S   ...02 carrier A   ...03 operator O (of A)   ...04 shipper T (another company)
select tests.new_user('af800000-0000-4000-8000-000000000001', 'sara@f8.test', 'shipper');
select tests.new_user('af800000-0000-4000-8000-000000000002', 'ana@f8.test', 'manager');
select tests.new_user('af800000-0000-4000-8000-000000000003', 'oscar@f8.test', 'operator');
select tests.new_user('af800000-0000-4000-8000-000000000004', 'tere@f8.test', 'shipper');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('cf800000-0000-4000-8000-000000000001', 'shipper', 'Envíos Theta SA de CV', 'ETH080808GH8', 'approved'),
  ('cf800000-0000-4000-8000-000000000002', 'carrier', 'Fletes Kappa SA de CV', 'FKA090909CD9', 'approved'),
  ('cf800000-0000-4000-8000-000000000004', 'shipper', 'Envíos Lambda SA de CV', 'ELA070707EF7', 'approved');
update public.profiles set company_id = 'cf800000-0000-4000-8000-000000000001'
where id = 'af800000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'cf800000-0000-4000-8000-000000000002'
where id in ('af800000-0000-4000-8000-000000000002', 'af800000-0000-4000-8000-000000000003');
update public.profiles set company_id = 'cf800000-0000-4000-8000-000000000004'
where id = 'af800000-0000-4000-8000-000000000004';

insert into public.operators (id, company_id, profile_id, full_name) values
  ('df800000-0000-4000-8000-000000000003', 'cf800000-0000-4000-8000-000000000002',
   'af800000-0000-4000-8000-000000000003', 'Óscar Operador');
-- D16 (G3): assign_trip needs a current license of a suitable type.
update public.operators set license_type = 'E', license_expires_on = current_date + 365
where license_type is null;
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('ef800000-0000-4000-8000-000000000001', 'cf800000-0000-4000-8000-000000000002', 'rigid', 'FFF8001', 'dry_van', 30000);

-- Photos are not what these tests are about (B23 covers the gate).
update public.trip_evidence_requirements set min_photos = 0;
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'cf800000-0000-4000-8000-000000000002'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- ---------------------------------------------------------------------------
-- A trip up to delivered
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('af800000-0000-4000-8000-000000000001');
insert into tests.vals select 'load', public.create_load(tests.payload());
select public.publish_load(tests.val('load'));
select tests.login('af800000-0000-4000-8000-000000000002');
insert into tests.vals select 'offer', public.make_offer(tests.val('load'), 3400000);
select tests.login('af800000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip', public.accept_offer(tests.val('offer'));
select tests.login('af800000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('trip'), 'ef800000-0000-4000-8000-000000000001',
                          'df800000-0000-4000-8000-000000000003');

select tests.login('af800000-0000-4000-8000-000000000003');
select lives_ok(
  $$ select tests.step('departed', 1);
     select tests.step('arrived_at_pickup', 2);
     select tests.step('loading_started', 3);
     select tests.step('loading_finished', 4);
     select tests.step('arrived_at_delivery', 5, null, null, 'bf800000-0000-4000-8000-000000000009');
     select tests.step('unloading_started', 6, now() + interval '2 hours');
     select tests.step('unloading_finished', 7, null, 'Rosa Almacén') $$,
  'the operator delivers the cargo'
);

-- ---------------------------------------------------------------------------
-- confirm_delivery with a key
-- ---------------------------------------------------------------------------
select tests.login('af800000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.confirm_delivery(tests.val('trip'), 'Todo en orden', 'bf800000-0000-4000-8000-000000000001') $$,
  'the shipper confirms delivery with the attempt key'
);
select lives_ok(
  $$ select public.confirm_delivery(tests.val('trip'), 'Todo en orden', 'bf800000-0000-4000-8000-000000000001') $$,
  'a second submit with the same key succeeds instead of failing on the closed trip'
);
select lives_ok(
  $$ select public.confirm_delivery(tests.val('trip'), null, 'bf800000-0000-4000-8000-000000000001') $$,
  'a retry with the same key and other notes succeeds too'
);
select results_eq(
  $$ select client_event_id, notes, from_status::text, to_status::text from public.trip_events
     where trip_id = tests.val('trip') and event_type = 'delivery_confirmed' $$,
  $$ values ('bf800000-0000-4000-8000-000000000001'::uuid, 'Todo en orden', 'delivered', 'closed') $$,
  'one delivery_confirmed event, with the key and the notes of the first call'
);
select results_eq(
  $$ select t.status::text, l.status::text
     from public.trips t join public.loads l on l.id = t.load_id where t.id = tests.val('trip') $$,
  $$ values ('closed', 'completed') $$,
  'the trip is closed and the load completed'
);
select throws_ok(
  $$ select public.confirm_delivery(tests.val('trip'), null, 'bf800000-0000-4000-8000-000000000002') $$,
  '55000', 'cannot confirm delivery of a trip in status closed',
  'another key after the trip is closed fails with the status error'
);
select throws_ok(
  $$ select public.confirm_delivery(tests.val('trip')) $$,
  '55000', 'cannot confirm delivery of a trip in status closed',
  'without a key a second confirmation fails as before'
);
select throws_ok(
  $$ select public.confirm_delivery(tests.val('trip'), null, 'bf800000-0000-4000-8000-000000000009') $$,
  '22023', 'client_event_id belongs to another event',
  'a key already used by a status event is refused'
);

-- The key opens nothing: the access check runs before it.
select tests.login('af800000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.confirm_delivery(tests.val('trip'), null, 'bf800000-0000-4000-8000-000000000001') $$,
  '42501', 'trip not found', 'the carrier cannot replay the confirmation key'
);
select tests.login('af800000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.confirm_delivery(tests.val('trip'), null, 'bf800000-0000-4000-8000-000000000001') $$,
  '42501', 'trip not found', 'a shipper of another company cannot replay it either'
);
reset role;
select is(
  (select count(*) from public.trip_events where trip_id = tests.val('trip') and event_type = 'delivery_confirmed'),
  1::bigint,
  'still a single delivery_confirmed event'
);

select * from finish();
rollback;
