-- F7 · add_trip_evidence names the incident of a photo by the key of its
-- report (p_incident_client_event_id), so the phone can queue the photo of an
-- incident reported offline:
--   * the key resolves to the incident that report_incident created with it;
--   * a retry of the same photo returns the same evidence;
--   * an unknown key, or the key of a status event, is refused;
--   * the key goes only with incident photos, and never with an incident id;
--   * the key opens nothing to anyone but the assigned operator.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

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

-- Uploads a photo of the trip as the operator (the file must be theirs) and
-- registers it, naming its incident by id or by the key of its report.
create function tests.add_photo(p_stage text, p_file uuid, p_incident_id uuid, p_incident_key uuid)
returns uuid
language plpgsql
as $$
declare
  v_path text := tests.val('trip') || '/' || p_stage || '/' || p_file || '.jpg';
begin
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('evidence', v_path, 'af700000-0000-4000-8000-000000000003', '{"mimetype": "image/jpeg", "size": 4096}')
  on conflict do nothing;
  return public.add_trip_evidence(
    tests.val('trip'), p_stage::public.evidence_stage, v_path, repeat('cd', 32), now() - interval '1 minute',
    25.7001, -100.2502, p_incident_id, p_incident_key
  );
end;
$$;

grant execute on all functions in schema tests to authenticated;

-- Users: ...01 shipper S   ...02 carrier A   ...03 operator O (of A)
select tests.new_user('af700000-0000-4000-8000-000000000001', 'sara@f7.test', 'shipper');
select tests.new_user('af700000-0000-4000-8000-000000000002', 'ana@f7.test', 'carrier');
select tests.new_user('af700000-0000-4000-8000-000000000003', 'oscar@f7.test', 'operator');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('cf700000-0000-4000-8000-000000000001', 'shipper', 'Envíos Iota SA de CV', 'EIO060606GH6', 'approved'),
  ('cf700000-0000-4000-8000-000000000002', 'carrier', 'Fletes Mu SA de CV', 'FMU050505CD5', 'approved');
update public.profiles set company_id = 'cf700000-0000-4000-8000-000000000001'
where id = 'af700000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'cf700000-0000-4000-8000-000000000002'
where id in ('af700000-0000-4000-8000-000000000002', 'af700000-0000-4000-8000-000000000003');

insert into public.operators (id, company_id, profile_id, full_name) values
  ('df700000-0000-4000-8000-000000000003', 'cf700000-0000-4000-8000-000000000002',
   'af700000-0000-4000-8000-000000000003', 'Óscar Operador');
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('ef700000-0000-4000-8000-000000000001', 'cf700000-0000-4000-8000-000000000002', 'rigid', 'FFF7001', 'dry_van', 30000);
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'cf700000-0000-4000-8000-000000000002'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- ---------------------------------------------------------------------------
-- A trip on its way to the pickup, with an incident reported under a key
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('af700000-0000-4000-8000-000000000001');
insert into tests.vals select 'load', public.create_load(tests.payload());
select public.publish_load(tests.val('load'));
select tests.login('af700000-0000-4000-8000-000000000002');
insert into tests.vals select 'offer', public.make_offer(tests.val('load'), 3400000);
select tests.login('af700000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip', public.accept_offer(tests.val('offer'));
select tests.login('af700000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('trip'), 'ef700000-0000-4000-8000-000000000001',
                          'df700000-0000-4000-8000-000000000003');

select tests.login('af700000-0000-4000-8000-000000000003');
-- The departure carries a key too: a status event, not an incident.
select public.record_trip_event(
  tests.val('trip'), 'departed', now(), 25.6866, -100.3161, null, null, null,
  'bf700000-0000-4000-8000-0000000000d1', null
);
insert into tests.vals select 'incident', public.report_incident(
  tests.val('trip'), 'mechanical_failure', 'Llanta ponchada', now(), 25.70, -100.25,
  'bf700000-0000-4000-8000-000000000001'
);

-- ---------------------------------------------------------------------------
-- The key of the report resolves to its incident
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into tests.vals select 'photo1',
       tests.add_photo('incident', 'a7000000-0000-4000-8000-000000000001', null,
                       'bf700000-0000-4000-8000-000000000001') $$,
  'the operator registers an incident photo by the key of its report'
);
select results_eq(
  $$ select incident_id, stage::text from public.trip_evidence where id = tests.val('photo1') $$,
  $$ values (tests.val('incident'), 'incident') $$,
  'the photo belongs to the incident created with that key'
);
select is(
  tests.add_photo('incident', 'a7000000-0000-4000-8000-000000000001', null, 'bf700000-0000-4000-8000-000000000001'),
  tests.val('photo1'),
  'a retry of the same photo returns the same evidence'
);
select lives_ok(
  $$ select tests.add_photo('incident', 'a7000000-0000-4000-8000-000000000002', tests.val('incident'), null) $$,
  'a photo still registers by the incident id, as before'
);
select is(
  (select count(*) from public.trip_evidence where incident_id = tests.val('incident')),
  2::bigint,
  'two photos of the incident, no duplicate'
);

-- ---------------------------------------------------------------------------
-- Refusals
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select tests.add_photo('incident', 'a7000000-0000-4000-8000-000000000003', null,
                            'bf700000-0000-4000-8000-0000000000ff') $$,
  '22023', 'incident not found',
  'a key with no report behind it is refused (the report did not go through)'
);
select throws_ok(
  $$ select tests.add_photo('incident', 'a7000000-0000-4000-8000-000000000004', null,
                            'bf700000-0000-4000-8000-0000000000d1') $$,
  '22023', 'incident not found',
  'the key of a status event is not an incident'
);
select throws_ok(
  $$ select tests.add_photo('incident', 'a7000000-0000-4000-8000-000000000005', tests.val('incident'),
                            'bf700000-0000-4000-8000-000000000001') $$,
  '22023', 'give the incident or the key of its report, not both',
  'the incident id and the key never go together'
);
select throws_ok(
  $$ select tests.add_photo('pickup', 'a7000000-0000-4000-8000-000000000006', null,
                            'bf700000-0000-4000-8000-000000000001') $$,
  '22023', 'incident evidence needs its incident, and only it',
  'the key goes only with incident photos'
);
select throws_ok(
  $$ select tests.add_photo('incident', 'a7000000-0000-4000-8000-000000000007', null, null) $$,
  '22023', 'incident evidence needs its incident, and only it',
  'an incident photo still needs its incident'
);

-- The key opens nothing: only the assigned operator registers evidence.
select tests.login('af700000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.add_trip_evidence(
       tests.val('trip'), 'incident', tests.val('trip') || '/incident/a7000000-0000-4000-8000-000000000008.jpg',
       repeat('cd', 32), now(), null, null, null, 'bf700000-0000-4000-8000-000000000001') $$,
  '42501', 'trip not found',
  'the carrier cannot register a photo with the key'
);
reset role;
select ok(
  not has_function_privilege(
    'anon',
    'public.add_trip_evidence(uuid, public.evidence_stage, text, text, timestamptz, double precision, double precision, uuid, uuid)',
    'execute'
  ),
  'anon cannot call add_trip_evidence'
);
select is(
  (select count(*) from pg_proc where proname = 'add_trip_evidence' and pronamespace = 'public'::regnamespace),
  1::bigint,
  'a single add_trip_evidence (the old signature is gone)'
);

select * from finish();
rollback;
