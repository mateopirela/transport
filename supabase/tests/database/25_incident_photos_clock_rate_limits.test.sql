-- F12 · Incident photos on an assigned trip, phone clocks ahead of the
-- server, and rate limits on the client RPCs:
--   * an incident photo is taken wherever report_incident takes the incident
--     (an `assigned` trip included), pickup and delivery photos are not;
--   * a report (or incident photo) more than 5 minutes ahead gets the server
--     time and keeps the phone's aside; a time before the trip still fails;
--   * each client RPC has its per-user limit: normal use passes, going over it
--     fails with PT429, a retry by idempotency key costs nothing, and writes
--     without a user (seed, cron) are not limited.
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

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

-- Uploads a file to the trip's evidence folder as the operator.
create function tests.upload(p_stage text, p_file uuid)
returns text
language plpgsql
as $$
declare
  v_path text := tests.val('trip') || '/' || p_stage || '/' || p_file || '.jpg';
begin
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('evidence', v_path, 'af120000-0000-4000-8000-000000000003', '{"mimetype": "image/jpeg", "size": 4096}');
  return v_path;
end;
$$;

-- Uploads and registers a photo of the trip, taken at p_at.
create function tests.add_photo(p_stage text, p_file uuid, p_incident_id uuid, p_at timestamptz)
returns uuid
language plpgsql
as $$
begin
  return public.add_trip_evidence(
    tests.val('trip'), p_stage::public.evidence_stage, tests.upload(p_stage, p_file), repeat('cd', 32), p_at,
    25.7001, -100.2502, p_incident_id
  );
end;
$$;

grant execute on all functions in schema tests to authenticated;

-- Users: ...01 shipper S   ...02 carrier A   ...03 operator O (of A)
select tests.new_user('af120000-0000-4000-8000-000000000001', 'sara@f12.test', 'shipper');
select tests.new_user('af120000-0000-4000-8000-000000000002', 'ana@f12.test', 'manager');
select tests.new_user('af120000-0000-4000-8000-000000000003', 'oscar@f12.test', 'operator');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('cf120000-0000-4000-8000-000000000001', 'shipper', 'Envíos Lambda SA de CV', 'ELA070707JK7', 'approved'),
  ('cf120000-0000-4000-8000-000000000002', 'carrier', 'Fletes Xi SA de CV', 'FXI080808LM8', 'approved');
update public.profiles set company_id = 'cf120000-0000-4000-8000-000000000001'
where id = 'af120000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'cf120000-0000-4000-8000-000000000002'
where id in ('af120000-0000-4000-8000-000000000002', 'af120000-0000-4000-8000-000000000003');

insert into public.operators (id, company_id, profile_id, full_name) values
  ('df120000-0000-4000-8000-000000000003', 'cf120000-0000-4000-8000-000000000002',
   'af120000-0000-4000-8000-000000000003', 'Óscar Operador');
-- D16 (G3): assign_trip needs a current license of a suitable type.
update public.operators set license_type = 'E', license_expires_on = current_date + 365
where license_type is null;
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('ef120000-0000-4000-8000-000000000001', 'cf120000-0000-4000-8000-000000000002', 'rigid', 'FFF1201', 'dry_van', 30000);
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'cf120000-0000-4000-8000-000000000002'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- ---------------------------------------------------------------------------
-- An assigned trip (the operator has not left yet)
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('af120000-0000-4000-8000-000000000001');
insert into tests.vals select 'load', public.create_load(tests.payload());
select public.publish_load(tests.val('load'));
select tests.login('af120000-0000-4000-8000-000000000002');
insert into tests.vals select 'offer', public.make_offer(tests.val('load'), 3400000);
select tests.login('af120000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip', public.accept_offer(tests.val('offer'));
select tests.login('af120000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('trip'), 'ef120000-0000-4000-8000-000000000001',
                          'df120000-0000-4000-8000-000000000003');

-- ---------------------------------------------------------------------------
-- 1. Incident photos on an assigned trip
-- ---------------------------------------------------------------------------
select tests.login('af120000-0000-4000-8000-000000000003');
insert into tests.vals select 'incident', public.report_incident(
  tests.val('trip'), 'delay', 'Retraso en la salida', now(), null, null, 'bf120000-0000-4000-8000-000000000001'
);
select is(
  (select status::text from public.trips where id = tests.val('trip')), 'assigned',
  'the trip is assigned and report_incident took the incident'
);
select lives_ok(
  $$ select tests.upload('incident', 'a1200000-0000-4000-8000-000000000001') $$,
  'the operator uploads an incident photo of an assigned trip'
);
select lives_ok(
  $$ insert into tests.vals select 'photo1', public.add_trip_evidence(
       tests.val('trip'), 'incident',
       tests.val('trip') || '/incident/a1200000-0000-4000-8000-000000000001.jpg', repeat('cd', 32),
       now() - interval '1 minute', null, null, null, 'bf120000-0000-4000-8000-000000000001') $$,
  'add_trip_evidence registers it on the assigned trip (by the key of its report)'
);
select is(
  (select incident_id from public.trip_evidence where id = tests.val('photo1')), tests.val('incident'),
  'the photo belongs to its incident'
);
select throws_ok(
  $$ select tests.upload('pickup', 'a1200000-0000-4000-8000-000000000002') $$,
  '42501', null,
  'a pickup photo cannot be uploaded before the departure'
);
select throws_ok(
  $$ select public.add_trip_evidence(
       tests.val('trip'), 'pickup', tests.val('trip') || '/pickup/a1200000-0000-4000-8000-000000000002.jpg',
       repeat('cd', 32), now(), null, null, null, null) $$,
  '55000', 'trip is not active (status assigned)',
  'nor registered: pickup and delivery photos keep their rule'
);

-- ---------------------------------------------------------------------------
-- 2. Phone clock ahead of the server
-- ---------------------------------------------------------------------------
insert into tests.vals select 'ahead', public.report_incident(
  tests.val('trip'), 'other', 'Reloj adelantado', now() + interval '1 hour', null, null,
  'bf120000-0000-4000-8000-000000000002'
);
select ok(
  (select occurred_at between now() and clock_timestamp() and device_occurred_at = now() + interval '1 hour'
   from public.incidents where id = tests.val('ahead')),
  'a report an hour ahead gets the server time and keeps the phone time aside'
);
select is(
  (select e.occurred_at from public.trip_events e where e.incident_id = tests.val('ahead')),
  (select i.occurred_at from public.incidents i where i.id = tests.val('ahead')),
  'its timeline event has the same server time'
);
select is(
  public.report_incident(
    tests.val('trip'), 'other', 'Reloj adelantado', now() + interval '1 hour', null, null,
    'bf120000-0000-4000-8000-000000000002'
  ),
  tests.val('ahead'),
  'a retry of that report returns the same incident'
);
insert into tests.vals select 'skew', public.report_incident(
  tests.val('trip'), 'other', 'Desfase tolerado', now() + interval '2 minutes'
);
select ok(
  (select occurred_at = now() + interval '2 minutes' and device_occurred_at is null
   from public.incidents where id = tests.val('skew')),
  'within the 5-minute tolerance the phone time stands'
);
select throws_ok(
  $$ select public.report_incident(tests.val('trip'), 'other', 'Del pasado', now() - interval '30 days') $$,
  '22023', 'occurred_at is out of range',
  'a time before the trip is still refused'
);
insert into tests.vals select 'photo_ahead',
  tests.add_photo('incident', 'a1200000-0000-4000-8000-000000000003', tests.val('incident'), now() + interval '1 hour');
select ok(
  (select captured_at between now() and clock_timestamp() and device_captured_at = now() + interval '1 hour'
   from public.trip_evidence where id = tests.val('photo_ahead')),
  'an incident photo an hour ahead gets the server time and keeps the phone time aside'
);
select throws_ok(
  $$ select tests.add_photo('incident', 'a1200000-0000-4000-8000-000000000004', tests.val('incident'),
                            now() - interval '30 days') $$,
  '22023', 'captured_at is out of range',
  'an incident photo from before the trip is still refused'
);

-- Pickup photos keep the strict check (out of scope of F12).
select public.record_trip_event(tests.val('trip'), 'departed', now(), 25.6866, -100.3161);
select public.record_trip_event(tests.val('trip'), 'arrived_at_pickup', now(), 25.6866, -100.3161);
select throws_ok(
  $$ select tests.add_photo('pickup', 'a1200000-0000-4000-8000-000000000005', null, now() + interval '1 hour') $$,
  '22023', 'captured_at is out of range',
  'a pickup photo ahead of the server is still refused'
);

-- ---------------------------------------------------------------------------
-- 3. Rate limits
-- ---------------------------------------------------------------------------
reset role;
select is(
  (select array_agg(c.relname::text || ':' || t.tgname::text order by c.relname)
   from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where t.tgfoid = 'public.enforce_rate_limit()'::regprocedure and t.tgenabled = 'O'),
  array[
    'incidents:incidents_rate_limit', 'invitations:invitations_rate_limit', 'loads:loads_rate_limit',
    'messages:messages_rate_limit', 'offers:offers_rate_limit', 'trip_evidence:trip_evidence_rate_limit',
    'trip_locations:trip_locations_rate_limit'
  ],
  'every write of the limited RPCs goes through the rate-limit trigger (invitations since G1b)'
);
select ok(
  not has_function_privilege('authenticated', 'public.enforce_rate_limit()', 'execute')
  and not has_function_privilege('authenticated', 'public.device_time_ahead(timestamptz)', 'execute'),
  'clients cannot call the internal helpers'
);
select is(
  (select array_agg(format('%s:%s/%s', b, (public.rate_limit_policy(b)).max_hits,
                           (public.rate_limit_policy(b)).window_seconds) order by b)
   from unnest(array['add_trip_evidence', 'create_load', 'offers', 'record_trip_locations', 'report_incident',
                     'send_message']) b),
  array['add_trip_evidence:120/60', 'create_load:30/60', 'offers:60/60', 'record_trip_locations:120/60',
        'report_incident:20/60', 'send_message:60/60'],
  'the limits documented in docs/seguridad.md'
);
-- Start the buckets from zero (the writes above counted) in a window that
-- the real clock cannot leave during the test: the window never moves
-- backward, so every hit below counts in it, whenever the minute changes.
delete from public.rate_limit_counters;
insert into public.rate_limit_counters (bucket, subject, window_start, hits) values
  ('report_incident', 'af120000-0000-4000-8000-000000000003', now() + interval '1 hour', 0),
  ('send_message', 'af120000-0000-4000-8000-000000000001', now() + interval '1 hour', 0),
  ('create_load', 'af120000-0000-4000-8000-000000000001', now() + interval '1 hour', 0);

set local role authenticated;
select tests.login('af120000-0000-4000-8000-000000000003');
select lives_ok(
  $$ select public.report_incident(tests.val('trip'), 'delay', 'Reporte ' || i, now()) from generate_series(1, 20) i $$,
  'normal use passes: 20 reports in a minute'
);
select throws_ok(
  $$ select public.report_incident(tests.val('trip'), 'delay', 'Uno más', now()) $$,
  'PT429', 'rate limit exceeded',
  'the 21st report of the minute fails with PT429'
);
select is(
  public.report_incident(
    tests.val('trip'), 'other', 'Reloj adelantado', now() + interval '1 hour', null, null,
    'bf120000-0000-4000-8000-000000000002'
  ),
  tests.val('ahead'),
  'a retry by idempotency key still answers over the limit (it writes nothing)'
);
select tests.login('af120000-0000-4000-8000-000000000002');
select lives_ok(
  $$ select public.report_incident(tests.val('trip'), 'delay', 'Desde la flota', now()) $$,
  'each user has their own counter'
);
select throws_ok(
  $$ select public.consume_rate_limit('report_incident') $$,
  '22023', 'unknown rate limit bucket',
  'a client cannot spend or probe an RPC bucket through consume_rate_limit'
);

-- The window passes: the operator can report again.
reset role;
update public.rate_limit_counters set window_start = now() - interval '1 hour'
where bucket = 'report_incident' and subject = 'af120000-0000-4000-8000-000000000003';
set local role authenticated;
select tests.login('af120000-0000-4000-8000-000000000003');
select lives_ok(
  $$ select public.report_incident(tests.val('trip'), 'delay', 'Al minuto siguiente', now()) $$,
  'the next window accepts reports again'
);

-- A location batch counts once, whatever its size.
select public.record_location_consent('2026-10-15', 'android');
select is(
  public.record_trip_locations(
    tests.val('trip'),
    (select jsonb_agg(jsonb_build_object('recordedAt', now() + make_interval(secs => i), 'lat', 25.7, 'lng', -100.3))
     from generate_series(1, 50) i)
  ),
  50,
  'a batch of 50 points is recorded'
);
reset role;
select is(
  (select hits from public.rate_limit_counters
   where bucket = 'record_trip_locations' and subject = 'af120000-0000-4000-8000-000000000003'),
  1,
  'and counts as one call'
);

-- Messages: 60 a minute, then PT429.
set local role authenticated;
select tests.login('af120000-0000-4000-8000-000000000001');
insert into tests.vals select 'conversation', c.id from public.conversations c limit 1;
select lives_ok(
  $$ select public.send_message(tests.val('conversation'), 'Hola ' || i) from generate_series(1, 60) i $$,
  'normal use passes: 60 messages in a minute'
);
select throws_ok(
  $$ select public.send_message(tests.val('conversation'), 'Uno más') $$,
  'PT429', 'rate limit exceeded',
  'the 61st message of the minute fails with PT429'
);

-- Loads: 30 a minute, then PT429.
select lives_ok(
  $$ select public.create_load(tests.payload()) from generate_series(1, 30) $$,
  'normal use passes: 30 loads in a minute'
);
select throws_ok(
  $$ select public.create_load(tests.payload()) $$,
  'PT429', 'rate limit exceeded',
  'the 31st load of the minute fails with PT429'
);

-- Writes without a user (seed, cron, service role) are not limited.
reset role;
select set_config('request.jwt.claims', '', true);
select lives_ok(
  $$ insert into public.incidents (trip_id, kind, description, occurred_at, reporter_role)
     select tests.val('trip'), 'other', 'Sin usuario ' || i, now(), 'admin' from generate_series(1, 30) i $$,
  'writes without a user are not limited'
);

-- ---------------------------------------------------------------------------
-- 4. A cancelled trip takes no incident photo (nor incident)
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('af120000-0000-4000-8000-000000000002');
select public.cancel_trip(tests.val('trip'), 'Prueba');
select tests.login('af120000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select tests.add_photo('incident', 'a1200000-0000-4000-8000-000000000006', tests.val('incident'), now()) $$,
  '42501', null,
  'an incident photo of a cancelled trip cannot be uploaded'
);
select throws_ok(
  $$ select public.add_trip_evidence(
       tests.val('trip'), 'incident', tests.val('trip') || '/incident/a1200000-0000-4000-8000-000000000006.jpg',
       repeat('cd', 32), now(), null, null, tests.val('incident'), null) $$,
  '55000', 'trip is cancelled',
  'nor registered, like report_incident'
);

select * from finish();
rollback;
