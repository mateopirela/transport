-- I1 · Cargo insurance of the shipper and accepted terms (D35-E1):
--   * the catalog: the annual policy (company, shipper, optional, with
--     expiry) and the policy of the trip (shipper, required, blocks);
--   * the departure is refused without insurance; an approved annual policy
--     valid at the pickup covers the trip, one that expires before the
--     pickup does not, an expired one does not; the policy of the trip does;
--     the admin may switch the block off;
--   * the carrier side reads the state (trip_cargo_insurance, trip_checklist)
--     but never the shipper's file (table and bucket), unless the catalog
--     marks the kind shareable;
--   * cargo_insurance_missing: to the shipper when the offer is accepted (the
--     one who accepted included), and 24 hours before the pickup to the
--     shipper and the carrier staff, once per trip;
--   * terms_acceptances: written at sign-up from the metadata and by
--     accept_terms; per user, immutable, own rows only (admins all).
begin;
create extension if not exists pgtap with schema extensions;

select plan(60);

-- R4 (D45): the units and operators this test creates come with every
-- required document approved and current, so the trip document gate lets
-- them through (68_trip_document_gate tests the gate itself). Rolled back
-- with the transaction.
create schema r4_fixture;
create function r4_fixture.approve_documents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
  select new.company_id, r.id, r.owner_type, new.id,
         new.company_id || '/' || r.owner_type || '/' || new.id || '/' || gen_random_uuid() || '.pdf',
         'approved', now() + interval '1 year'
  from public.document_requirements r
  where r.owner_type = tg_argv[0]::public.document_owner_type and r.is_required and r.archived_at is null;
  return null;
end;
$$;
create trigger r4_fixture_documents after insert on public.vehicles
for each row execute function r4_fixture.approve_documents('vehicle');
create trigger r4_fixture_documents after insert on public.operators
for each row execute function r4_fixture.approve_documents('operator');

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated;

create function tests.new_user(p_id uuid, p_role text, p_terms text default null)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@i1.test', now(),
          case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end,
          jsonb_strip_nulls(jsonb_build_object('role', p_role, 'phone', '+525500000000', 'terms_version', p_terms)),
          now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;

-- A MTY -> GDL load whose pickup opens in p_hours (4 h window).
create function tests.payload(p_hours integer)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'origin', jsonb_build_object('address', 'Av. Constitución 100', 'city', 'Monterrey', 'state', 'Nuevo León',
                                 'lat', 25.6866, 'lng', -100.3161),
    'destination', jsonb_build_object('address', 'Av. Vallarta 200', 'city', 'Guadalajara', 'state', 'Jalisco',
                                      'lat', 20.6597, 'lng', -103.3496),
    'pickupWindow', jsonb_build_object('start', now() + make_interval(hours => p_hours),
                                       'end', now() + make_interval(hours => p_hours + 4)),
    'deliveryWindow', jsonb_build_object('start', now() + make_interval(hours => p_hours + 24),
                                         'end', now() + make_interval(hours => p_hours + 30)),
    'cargoType', 'palletized',
    'description', 'Tarimas',
    'weightKg', 9000,
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

-- The shipper S publishes a load (pickup in p_hours), the manager M offers
-- with p_vehicle and S accepts; the manager assigns p_vehicle and O.
create function tests.contract(p_name text, p_hours integer, p_vehicle uuid)
returns uuid
language plpgsql
as $$
declare
  v_load uuid;
  v_offer uuid;
  v_trip uuid;
begin
  perform tests.login('a5100000-0000-4000-8000-000000000001');
  v_load := public.create_load(tests.payload(p_hours));
  perform public.publish_load(v_load);
  perform tests.login('a5100000-0000-4000-8000-000000000002');
  v_offer := public.make_offer(v_load, 3000000, null, p_vehicle);
  perform tests.login('a5100000-0000-4000-8000-000000000001');
  v_trip := public.accept_offer(v_offer);
  perform tests.login('a5100000-0000-4000-8000-000000000002');
  perform public.assign_trip(v_trip, p_vehicle, 'd5100000-0000-4000-8000-000000000004');
  insert into tests.vals values (p_name, v_trip);
  return v_trip;
end;
$$;

-- The operator O leaves on a trip.
create function tests.depart(p_trip uuid)
returns uuid
language sql
as $$
  select tests.login('a5100000-0000-4000-8000-000000000004');
  select public.record_trip_event(p_trip, 'departed', now(), 25.69, -100.32);
$$;

-- Uploads and registers a trip document of a kind as the current user.
create function tests.add_trip_document(p_trip uuid, p_kind public.trip_document_kind, p_file uuid)
returns uuid
language plpgsql
as $$
declare
  v_path text := p_trip || '/' || p_file || '.pdf';
begin
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('trip-documents', v_path, (select auth.uid())::text, '{"mimetype":"application/pdf","size":2048}'::jsonb);
  return public.add_trip_document(p_trip, p_kind, v_path, p_kind::text || '.pdf');
end;
$$;

-- The shipper S sends its annual policy (expiring p_expires_at, if any).
create function tests.submit_policy(p_file uuid, p_expires_at timestamptz)
returns uuid
language plpgsql
as $$
declare
  v_company uuid := 'c5100000-0000-4000-8000-000000000001';
  v_path text := v_company || '/company/' || v_company || '/' || p_file || '.pdf';
begin
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('documents', v_path, (select auth.uid())::text, '{"mimetype":"application/pdf","size":2048}'::jsonb);
  return public.submit_document(
    (select r.id from public.document_requirements r where r.code = 'cargo_insurance_policy'),
    'company', v_company, v_path, 'poliza.pdf', p_expires_at
  );
end;
$$;

-- cargo_insurance_missing notifications of a user about a trip, by audience.
create function tests.notices(p_user uuid, p_trip uuid, p_audience text)
returns integer
language sql
as $$
  select count(*)::int from public.notifications n
  where n.user_id = p_user and n.type = 'cargo_insurance_missing'
    and n.data ->> 'tripId' = p_trip::text and n.data ->> 'audience' = p_audience;
$$;

grant execute on all functions in schema tests to authenticated;

-- Users a51…: 01 shipper S, 02 manager M, 03 coordinator K (of the trip's
-- business unit), 04 operator O, 05 another shipper X, 06 admin.
select tests.new_user('a5100000-0000-4000-8000-000000000001', 'shipper', '2026-11-10');
select tests.new_user('a5100000-0000-4000-8000-000000000002', 'manager', '2026-11-10');
select tests.new_user('a5100000-0000-4000-8000-000000000003', 'coordinator', '2026-11-10');
select tests.new_user('a5100000-0000-4000-8000-000000000004', 'operator', '2026-11-10');
select tests.new_user('a5100000-0000-4000-8000-000000000005', 'shipper');
select tests.new_user('a5100000-0000-4000-8000-000000000006', 'shipper', 'v2');
update public.profiles set role = 'admin' where id = 'a5100000-0000-4000-8000-000000000006';

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c5100000-0000-4000-8000-000000000001', 'shipper', 'Envíos Cincuenta SA de CV', 'ECI050505GH5', 'approved'),
  ('c5100000-0000-4000-8000-000000000002', 'carrier', 'Fletes Cincuenta SA de CV', 'FCI040404CD4', 'approved'),
  ('c5100000-0000-4000-8000-000000000003', 'shipper', 'Otro Cliente Cincuenta SA de CV', 'OCC050505GH5', 'approved');
update public.profiles set company_id = 'c5100000-0000-4000-8000-000000000001'
where id = 'a5100000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c5100000-0000-4000-8000-000000000002'
where id in ('a5100000-0000-4000-8000-000000000002', 'a5100000-0000-4000-8000-000000000003',
             'a5100000-0000-4000-8000-000000000004');
update public.profiles set company_id = 'c5100000-0000-4000-8000-000000000003'
where id = 'a5100000-0000-4000-8000-000000000005';

insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id)
select b.id, b.company_id, 'a5100000-0000-4000-8000-000000000003'
from public.business_units b where b.company_id = 'c5100000-0000-4000-8000-000000000002';

insert into public.operators (id, company_id, profile_id, full_name, license_type, license_expires_on) values
  ('d5100000-0000-4000-8000-000000000004', 'c5100000-0000-4000-8000-000000000002',
   'a5100000-0000-4000-8000-000000000004', 'Óscar Operador', 'E', current_date + 365);
-- One unit per trip: a unit on its way cannot take another trip.
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg)
select ('e5100000-0000-4000-8000-00000000000' || n)::uuid, 'c5100000-0000-4000-8000-000000000002', 'rigid',
       'GGI510' || n, 'dry_van', 12000
from generate_series(1, 5) n;
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'c5100000-0000-4000-8000-000000000002'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- ---------------------------------------------------------------------------
-- The catalog
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select owner_type::text, company_type::text, optional_for::text[], is_required, requires_expiry, shareable_with_shipper
     from public.document_requirements where code = 'cargo_insurance_policy' and archived_at is null $$,
  $$ values ('company', 'shipper', array['shipper'], true, true, false) $$,
  'the annual policy is a shipper company document, optional, with a mandatory expiry date'
);
select results_eq(
  $$ select stage::text, uploader_sides::text[], is_required, blocks_departure, shareable_with_carrier
     from public.trip_document_requirements where kind = 'cargo_insurance' $$,
  $$ values ('before_departure', array['shipper'], true, true, false) $$,
  'the policy of the trip: the shipper uploads it before leaving, it is required, it blocks and the carrier does not read it'
);
select is(
  (select count(*)::int from public.company_missing_requirements('c5100000-0000-4000-8000-000000000001')
   where code = 'cargo_insurance_policy'),
  0, 'a shipper without an annual policy is not missing anything to be approved'
);
select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
   where c.oid in ('public.terms_acceptances'::regclass, 'public.cargo_insurance_reminders'::regclass)),
  'RLS is on in the new tables'
);

-- ---------------------------------------------------------------------------
-- Accepting an offer without insurance: the shipper is told, the trip cannot leave
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.contract('t1', 72, 'e5100000-0000-4000-8000-000000000001');
reset role;
select is(tests.notices('a5100000-0000-4000-8000-000000000001', tests.val('t1'), 'shipper'), 1,
  'the shipper who accepted the offer is told to prove the insurance');
select is(
  (select count(*)::int from public.notifications n
   where n.type = 'cargo_insurance_missing' and n.user_id = 'a5100000-0000-4000-8000-000000000002'),
  0, 'the carrier is not told at acceptance'
);
set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000001');
select results_eq(
  $$ select required, blocks_departure, trip_policy_at, annual_policy_expires_at
     from public.trip_cargo_insurance(tests.val('t1')) $$,
  $$ values (true, true, null::timestamptz, null::timestamptz) $$,
  'the shipper sees the insurance missing'
);
select is(
  (select done_at from public.trip_checklist(tests.val('t1')) where code = 'cargo_insurance'), null,
  'and pending in the checklist'
);
select throws_ok(
  $$ select tests.depart(tests.val('t1')) $$,
  '55000', 'trip documents are missing: cargo_insurance',
  'without insurance the operator cannot leave'
);

-- ---------------------------------------------------------------------------
-- The annual policy: the admin approves it like any other document
-- ---------------------------------------------------------------------------
select tests.login('a5100000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select tests.submit_policy('f5100000-0000-4000-8000-000000000001', null) $$,
  '22023', 'requirement cargo_insurance_policy needs an expiry date',
  'the annual policy needs its expiry date'
);
insert into tests.vals
select 'policy', tests.submit_policy('f5100000-0000-4000-8000-000000000002', now() + interval '30 days');
select is(
  (select annual_policy_expires_at from public.trip_cargo_insurance(tests.val('t1'))), null,
  'a policy pending review covers nothing'
);
select tests.login('a5100000-0000-4000-8000-000000000006');
select is(public.review_document(tests.val('policy'), 'approve')::text, 'approved', 'the admin approves the policy');

select tests.login('a5100000-0000-4000-8000-000000000001');
select ok(
  (select annual_policy_expires_at > now() + interval '29 days' and annual_policy_approved_at is not null
   from public.trip_cargo_insurance(tests.val('t1'))),
  'an approved policy valid at the pickup covers the trip'
);
select isnt(
  (select done_at from public.trip_checklist(tests.val('t1')) where code = 'cargo_insurance'), null,
  'the checklist shows it done'
);
select lives_ok($$ select tests.depart(tests.val('t1')) $$, 'and the operator leaves');

-- A pickup after the policy expires: not covered, and the shipper is told.
select tests.contract('t2', 24 * 40, 'e5100000-0000-4000-8000-000000000002');
select is(
  (select annual_policy_expires_at from public.trip_cargo_insurance(tests.val('t2'))), null,
  'a policy that expires before the pickup does not cover the trip'
);
reset role;
select is(tests.notices('a5100000-0000-4000-8000-000000000001', tests.val('t2'), 'shipper'), 1,
  'so the shipper is told at acceptance');
select is(tests.notices('a5100000-0000-4000-8000-000000000001', tests.val('t1'), 'shipper'), 1,
  'a covered trip gets no more notices');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- The policy of the trip: the shipper uploads it; the carrier reads the
-- state, not the file
-- ---------------------------------------------------------------------------
select tests.login('a5100000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select tests.add_trip_document(tests.val('t2'), 'cargo_insurance', 'f5100000-0000-4000-8000-000000000003') $$,
  '42501', 'the carrier side does not upload cargo_insurance documents',
  'the carrier cannot upload the policy of the trip'
);
select tests.login('a5100000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select tests.add_trip_document(tests.val('t2'), 'cargo_insurance', 'f5100000-0000-4000-8000-000000000004') $$,
  'the shipper uploads the policy of the trip'
);
select is(
  (select count(*)::int from public.trip_documents where trip_id = tests.val('t2') and kind = 'cargo_insurance'),
  1, 'the shipper reads it'
);
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'trip-documents' and name = tests.val('t2') || '/f5100000-0000-4000-8000-000000000004.pdf'),
  1, 'and its file'
);

select tests.login('a5100000-0000-4000-8000-000000000002');
select is(
  (select count(*)::int from public.trip_documents where trip_id = tests.val('t2') and kind = 'cargo_insurance'),
  0, 'the manager does not read the shipper''s policy'
);
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'trip-documents' and name = tests.val('t2') || '/f5100000-0000-4000-8000-000000000004.pdf'),
  0, 'nor its file'
);
select isnt(
  (select trip_policy_at from public.trip_cargo_insurance(tests.val('t2'))), null,
  'but sees that the trip is covered'
);
select tests.login('a5100000-0000-4000-8000-000000000003');
select is(
  (select count(*)::int from public.trip_documents where trip_id = tests.val('t2') and kind = 'cargo_insurance'),
  0, 'the coordinator does not read it either'
);
select tests.login('a5100000-0000-4000-8000-000000000004');
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'trip-documents' and name = tests.val('t2') || '/f5100000-0000-4000-8000-000000000004.pdf'),
  0, 'nor the operator'
);
select isnt(
  (select done_at from public.trip_checklist(tests.val('t2')) where code = 'cargo_insurance'), null,
  'whose checklist shows it done'
);
select lives_ok($$ select tests.depart(tests.val('t2')) $$, 'with the policy of the trip the operator leaves');
select tests.login('a5100000-0000-4000-8000-000000000005');
select is((select count(*)::int from public.trip_cargo_insurance(tests.val('t2'))), 0,
  'another shipper gets nothing about the trip');

reset role;
update public.trip_document_requirements set shareable_with_carrier = true where kind = 'cargo_insurance';
set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000002');
select is(
  (select count(*)::int from public.trip_documents where trip_id = tests.val('t2') and kind = 'cargo_insurance'),
  1, 'once the catalog marks it shareable, the carrier reads it'
);
reset role;
update public.trip_document_requirements set shareable_with_carrier = false where kind = 'cargo_insurance';

-- ---------------------------------------------------------------------------
-- An expired policy covers nothing; the admin may switch the block off
-- ---------------------------------------------------------------------------
update public.documents
set status = 'expired', expires_at = now() - interval '1 day'
where id = tests.val('policy');
set local role authenticated;
select tests.contract('t3', 24 * 3, 'e5100000-0000-4000-8000-000000000003');
select is(
  (select annual_policy_expires_at from public.trip_cargo_insurance(tests.val('t3'))), null,
  'an expired policy does not cover the trip'
);
select throws_ok(
  $$ select tests.depart(tests.val('t3')) $$,
  '55000', 'trip documents are missing: cargo_insurance',
  'so it cannot leave'
);
select tests.login('a5100000-0000-4000-8000-000000000006');
select lives_ok(
  $$ update public.trip_document_requirements set blocks_departure = false where kind = 'cargo_insurance' $$,
  'the admin switches the block off in the catalog'
);
select lives_ok($$ select tests.depart(tests.val('t3')) $$, 'and the trip leaves without insurance');
select tests.login('a5100000-0000-4000-8000-000000000006');
update public.trip_document_requirements set blocks_departure = true where kind = 'cargo_insurance';

-- A departure recorded offline (B21) is checked at its own time, not at the
-- sync: the policy expired yesterday, the pickup was three days ago.
reset role;
update public.loads
set pickup_window_start = now() - interval '3 days', pickup_window_end = now() - interval '70 hours'
where id = (select load_id from public.trips where id = tests.val('t3'));
select isnt(
  (select expires_at from public.annual_cargo_policy(tests.val('t3'), now() - interval '2 days')), null,
  'a departure recorded while the policy was valid is covered, even when it syncs later'
);
select is(
  (select expires_at from public.annual_cargo_policy(tests.val('t3'))), null,
  'a trip that left after the policy expired is not'
);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- 24 hours before the pickup: the shipper and the carrier staff, once
-- ---------------------------------------------------------------------------
select tests.contract('t4', 12, 'e5100000-0000-4000-8000-000000000004');
reset role;
-- pg_cron runs it without a user (notify_carrier_staff skips the caller).
select set_config('request.jwt.claims', '', true);
select ok(public.remind_cargo_insurance() >= 1, 'the reminder finds the trip without insurance');
select is(tests.notices('a5100000-0000-4000-8000-000000000001', tests.val('t4'), 'shipper'), 1,
  'the shipper, told at acceptance less than 24 hours before, is not told twice');
select is(tests.notices('a5100000-0000-4000-8000-000000000002', tests.val('t4'), 'carrier'), 1,
  'the manager is warned');
select is(tests.notices('a5100000-0000-4000-8000-000000000003', tests.val('t4'), 'carrier'), 1,
  'and the coordinator of the trip''s business unit');
select public.remind_cargo_insurance();
select is(tests.notices('a5100000-0000-4000-8000-000000000002', tests.val('t4'), 'carrier'), 1,
  'once per trip');
select is(
  (select count(*)::int from public.cargo_insurance_reminders
   where trip_id in (tests.val('t1'), tests.val('t2'), tests.val('t3'))),
  0, 'trips that left or are far from their pickup are not reminded'
);
set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select count(*) from public.cargo_insurance_reminders $$,
  '42501', null, 'nobody reads the reminders table'
);
select throws_ok(
  $$ insert into public.cargo_insurance_reminders (trip_id) values (tests.val('t1')) $$,
  '42501', null, 'nor inserts a reminder'
);
select throws_ok($$ update public.cargo_insurance_reminders set sent_at = now() $$, '42501', null,
  'nor updates one');
select throws_ok($$ delete from public.cargo_insurance_reminders $$, '42501', null, 'nor deletes one');

-- ---------------------------------------------------------------------------
-- Accepted terms
-- ---------------------------------------------------------------------------
reset role;
select results_eq(
  $$ select user_id, terms_version from public.terms_acceptances
     where user_id::text like 'a5100000-%' order by user_id $$,
  $$ values ('a5100000-0000-4000-8000-000000000001'::uuid, '2026-11-10'),
            ('a5100000-0000-4000-8000-000000000002'::uuid, '2026-11-10'),
            ('a5100000-0000-4000-8000-000000000003'::uuid, '2026-11-10'),
            ('a5100000-0000-4000-8000-000000000004'::uuid, '2026-11-10') $$,
  'the sign-up keeps the version of the terms in the metadata (none or a malformed one keeps nothing)'
);
set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000005');
select isnt(public.accept_terms('2026-11-10'), null, 'an account accepts the current terms');
select public.accept_terms('2026-11-10');
select is(
  (select count(*)::int from public.terms_acceptances where user_id = 'a5100000-0000-4000-8000-000000000005'),
  1, 'once per version'
);
select throws_ok($$ select public.accept_terms('v2') $$, '22023', 'invalid terms version',
  'a malformed version is refused');
select throws_ok(
  $$ insert into public.terms_acceptances (user_id, terms_version)
     values ('a5100000-0000-4000-8000-000000000001', '2027-01-01') $$,
  '42501', null, 'nobody writes an acceptance directly, not even their own'
);
select is(
  (select count(*)::int from public.terms_acceptances where user_id <> 'a5100000-0000-4000-8000-000000000005'),
  0, 'each account reads only its own acceptances'
);
select throws_ok(
  $$ update public.terms_acceptances set accepted_at = now()
     where user_id = 'a5100000-0000-4000-8000-000000000005' $$,
  '42501', null, 'an account cannot change its acceptance'
);
select throws_ok(
  $$ delete from public.terms_acceptances where user_id = 'a5100000-0000-4000-8000-000000000005' $$,
  '42501', null, 'nor delete it'
);
select throws_ok(
  $$ delete from public.terms_acceptances where user_id = 'a5100000-0000-4000-8000-000000000001' $$,
  '42501', null, 'nor another company''s'
);
select tests.login('a5100000-0000-4000-8000-000000000006');
select is(
  (select count(*)::int from public.terms_acceptances where user_id::text like 'a5100000-%'),
  5, 'admins read every acceptance'
);
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select public.accept_terms('2026-11-10') $$, '42501', 'not authenticated',
  'accepting needs a session');
reset role;
select throws_ok(
  $$ update public.terms_acceptances set terms_version = '2027-01-01'
     where user_id = 'a5100000-0000-4000-8000-000000000005' $$,
  '42501', 'terms_acceptances is immutable', 'an acceptance never changes'
);
set local role anon;
select throws_ok($$ select public.accept_terms('2026-11-10') $$, '42501', null, 'anon cannot accept');
reset role;

select * from finish();
rollback;
