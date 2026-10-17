-- G3 · Documents per profile (D16): the catalog as data, what each company
-- type is missing (persona moral or física, optional_for), the readiness of a
-- unit without its permit, the license <-> unit kind table and the license
-- checks of assign_trip.
begin;
create extension if not exists pgtap with schema extensions;

select plan(39);

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
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@g3.test', now(),
          jsonb_build_object('role', p_role), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create function tests.requirement(p_code text)
returns uuid
language sql
stable
as $$ select id from public.document_requirements where code = p_code $$;

create function tests.payload(p_days integer, p_requirements jsonb default '[]')
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
    'specialRequirements', p_requirements,
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

-- Uploads a company document as the current role and submits it.
create function tests.submit(p_code text, p_expires_at timestamptz default null)
returns uuid
language plpgsql
as $$
declare
  v_company uuid := public.auth_company_id();
  v_path text := v_company || '/company/' || v_company || '/' || gen_random_uuid() || '.pdf';
begin
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('documents', v_path, (select auth.uid())::text, '{"mimetype":"application/pdf","size":1234}'::jsonb);
  return public.submit_document(tests.requirement(p_code), 'company', v_company, v_path, 'archivo.pdf', p_expires_at);
end;
$$;

-- An approved document written as the owner (what review_document would leave).
create function tests.approve(p_owner_type public.document_owner_type, p_owner_id uuid, p_code text,
                              p_expires_at timestamptz default now() + interval '1 year')
returns void
language sql
as $$
  insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
  select public.document_owner_company_id(p_owner_type, p_owner_id), tests.requirement(p_code), p_owner_type, p_owner_id,
         public.document_owner_company_id(p_owner_type, p_owner_id) || '/' || p_owner_type || '/' || p_owner_id || '/'
           || gen_random_uuid() || '.pdf',
         'approved', case when (select requires_expiry from public.document_requirements where code = p_code)
                          then p_expires_at end;
$$;

grant execute on all functions in schema tests to authenticated;

-- Users a29…: 01 shipper S (moral), 02 shipper F (física), 03 manager M, 04 admin,
-- 05 operator Omar (license C), 06 operator Elena (license E), 07 operator Luis (no license).
select tests.new_user('a2900000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a2900000-0000-4000-8000-000000000002', 'shipper');
select tests.new_user('a2900000-0000-4000-8000-000000000003', 'manager');
select tests.new_user('a2900000-0000-4000-8000-000000000004', 'shipper');
select tests.new_user('a2900000-0000-4000-8000-000000000005', 'operator');
select tests.new_user('a2900000-0000-4000-8000-000000000006', 'operator');
select tests.new_user('a2900000-0000-4000-8000-000000000007', 'operator');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c2900000-0000-4000-8000-000000000001', 'shipper', 'Envíos Moral SA de CV', 'EMO050505GH5', 'pending_review'),
  ('c2900000-0000-4000-8000-000000000002', 'shipper', 'Fernanda Física', 'FEFI800101AB1', 'pending_review'),
  ('c2900000-0000-4000-8000-000000000003', 'carrier', 'Fletes D16 SA de CV', 'FDS040404CD4', 'approved');
update public.profiles set company_id = 'c2900000-0000-4000-8000-000000000001'
where id = 'a2900000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c2900000-0000-4000-8000-000000000002'
where id = 'a2900000-0000-4000-8000-000000000002';
update public.profiles set company_id = 'c2900000-0000-4000-8000-000000000003'
where id in ('a2900000-0000-4000-8000-000000000003', 'a2900000-0000-4000-8000-000000000005',
             'a2900000-0000-4000-8000-000000000006', 'a2900000-0000-4000-8000-000000000007');
update public.profiles set role = 'admin' where id = 'a2900000-0000-4000-8000-000000000004';

insert into public.operators (id, company_id, profile_id, full_name, license_type, license_expires_on) values
  ('d2900000-0000-4000-8000-000000000005', 'c2900000-0000-4000-8000-000000000003',
   'a2900000-0000-4000-8000-000000000005', 'Omar Rígido', 'C', current_date + 365),
  ('d2900000-0000-4000-8000-000000000006', 'c2900000-0000-4000-8000-000000000003',
   'a2900000-0000-4000-8000-000000000006', 'Elena Federal', 'E', current_date - 1),
  ('d2900000-0000-4000-8000-000000000007', 'c2900000-0000-4000-8000-000000000003',
   'a2900000-0000-4000-8000-000000000007', 'Luis Sin Licencia', null, null);
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('e2900000-0000-4000-8000-000000000001', 'c2900000-0000-4000-8000-000000000003', 'trailer', 'GGA2901', 'dry_van', 30000),
  ('e2900000-0000-4000-8000-000000000002', 'c2900000-0000-4000-8000-000000000003', 'rigid', 'GGA2902', 'dry_van', 12000);

-- ---------------------------------------------------------------------------
-- The catalog (D16)
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select code from public.document_requirements where archived_at is not null order by code $$,
  $$ values ('articles_of_incorporation'), ('carrier_insurance_policy'), ('proof_of_address'), ('sct_permit') $$,
  'the acta, the proof of address and the company-level permit and insurance are archived, not deleted'
);
select results_eq(
  $$ select code, owner_type::text from public.document_requirements where archived_at is null order by sort_order, code $$,
  $$ values ('tax_status_certificate', 'company'), ('legal_representative_id', 'company'),
            ('vehicle_registration_card', 'vehicle'), ('vehicle_permit', 'vehicle'), ('vehicle_insurance_policy', 'vehicle'),
            ('operator_official_id', 'operator'), ('federal_driver_license', 'operator') $$,
  'the active catalog is exactly the D16 list'
);
select results_eq(
  $$ select code, name from public.document_requirements
     where code in ('federal_driver_license', 'vehicle_insurance_policy', 'vehicle_permit', 'operator_official_id') order by code $$,
  $$ values ('federal_driver_license', 'Licencia de conducir vigente'), ('operator_official_id', 'Identificación oficial'),
            ('vehicle_insurance_policy', 'Seguro vigente'), ('vehicle_permit', 'Permisos correspondientes') $$,
  'the renamed and new requirements carry JP''s names'
);
select results_eq(
  $$ select code from public.document_requirements where shareable_with_shipper order by code $$,
  $$ values ('federal_driver_license'), ('tax_status_certificate'), ('vehicle_insurance_policy'),
            ('vehicle_permit'), ('vehicle_registration_card') $$,
  'ids are never shareable with the shipper; the fiscal and unit documents and the license are'
);
select is(
  (select optional_for from public.document_requirements where code = 'legal_representative_id'),
  '{shipper}'::public.company_type[],
  'the id of the legal representative is optional for shippers ("cuando se requiera")'
);
select throws_ok(
  $$ insert into public.document_requirements (code, owner_type, company_type, name, optional_for)
     values ('vehicle_extra', 'vehicle', 'carrier', 'X', '{carrier}') $$,
  '23514', null, 'optional_for only applies to company requirements'
);

-- ---------------------------------------------------------------------------
-- What each company is missing
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select code from public.company_missing_requirements('c2900000-0000-4000-8000-000000000001') $$,
  $$ values ('tax_status_certificate') $$,
  'a shipper (persona moral) only needs the constancia: the acta is archived and the id is optional'
);
select results_eq(
  $$ select code from public.company_missing_requirements('c2900000-0000-4000-8000-000000000002') $$,
  $$ values ('tax_status_certificate') $$,
  'a shipper (persona física) needs the same'
);
select results_eq(
  $$ select code from public.company_missing_requirements('c2900000-0000-4000-8000-000000000003') $$,
  $$ values ('tax_status_certificate'), ('legal_representative_id') $$,
  'a carrier needs the constancia and the id of its legal representative'
);

set local role authenticated;
select tests.login('a2900000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select tests.submit('legal_representative_id', now() + interval '2 years') $$,
  'a shipper may still send the optional id of its legal representative'
);
select throws_ok(
  $$ select tests.submit('proof_of_address') $$,
  '22023', 'unknown document requirement',
  'an archived requirement no longer accepts documents'
);
select lives_ok($$ select tests.submit('tax_status_certificate') $$, 'the shipper sends its constancia');
select is(
  (select count(*)::int from public.document_requirements where archived_at is null and owner_type = 'company'
     and (company_type is null or company_type = 'shipper')),
  2, 'the registration lists exactly the D16 company documents (one of them optional)'
);

select tests.login('a2900000-0000-4000-8000-000000000004');
select public.review_document(id, 'approve')
from public.documents
where company_id = 'c2900000-0000-4000-8000-000000000001' and status = 'pending_review'
  and requirement_id = tests.requirement('tax_status_certificate');
select is(
  public.review_company('c2900000-0000-4000-8000-000000000001', 'approve'),
  'approved'::public.verification_status,
  'a shipper with the constancia approved is approved without the optional id'
);
select throws_ok(
  $$ select public.review_company('c2900000-0000-4000-8000-000000000002', 'approve') $$,
  '55000', 'company is missing required documents: tax_status_certificate',
  'a shipper without its constancia is still refused, and only for that document'
);
reset role;

-- ---------------------------------------------------------------------------
-- Units: without the permit they are not ready
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select code from public.vehicle_missing_requirements('e2900000-0000-4000-8000-000000000001') $$,
  $$ values ('vehicle_registration_card'), ('vehicle_permit'), ('vehicle_insurance_policy') $$,
  'a new unit misses its card, its permits and its insurance'
);
select tests.approve('vehicle', 'e2900000-0000-4000-8000-000000000001', 'vehicle_registration_card');
select tests.approve('vehicle', 'e2900000-0000-4000-8000-000000000001', 'vehicle_insurance_policy');
select results_eq(
  $$ select code from public.vehicle_missing_requirements('e2900000-0000-4000-8000-000000000001') $$,
  $$ values ('vehicle_permit') $$,
  'with the card and the insurance approved the unit still misses its permit (not ready for matching)'
);
select tests.approve('vehicle', 'e2900000-0000-4000-8000-000000000001', 'vehicle_permit');
select is(
  (select count(*)::int from public.vehicle_missing_requirements('e2900000-0000-4000-8000-000000000001')),
  0, 'with the permit approved the unit is ready'
);
select results_eq(
  $$ select code from public.document_requirements
     where archived_at is null and owner_type = 'operator' order by sort_order $$,
  $$ values ('operator_official_id'), ('federal_driver_license') $$,
  'an operator sends an official id and a driver''s license'
);

-- ---------------------------------------------------------------------------
-- license_unit_compatibility: data, RLS and audit
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select license_type::text, array_agg(vehicle_kind::text order by vehicle_kind::text) from public.license_unit_compatibility
     where allowed group by license_type order by license_type $$,
  $$ values ('B', array['rigid', 'tractor', 'trailer']), ('C', array['rigid']), ('E', array['rigid', 'tractor', 'trailer']) $$,
  'B drives every kind, C only rigid units, E every kind (provisional, plan §G.2 follow-up 4)'
);
set local role authenticated;
select tests.login('a2900000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.license_unit_compatibility), 7, 'a manager reads the table');
select is((select count(*)::int from public.trip_document_requirements), 4, 'and the trip document requirements');
select lives_ok(
  $$ update public.license_unit_compatibility set allowed = false $$,
  'a non-admin update runs but matches no rows'
);
select is((select count(*)::int from public.license_unit_compatibility where not allowed), 0, 'nothing changed');
select throws_ok(
  $$ insert into public.license_unit_compatibility (license_type, vehicle_kind) values ('C', 'tractor') $$,
  '42501', null, 'a non-admin cannot add pairs'
);
select throws_ok(
  $$ delete from public.license_unit_compatibility $$, '42501', null, 'nobody deletes pairs'
);
select tests.login('a2900000-0000-4000-8000-000000000004');
select lives_ok(
  $$ update public.license_unit_compatibility set allowed = false where license_type = 'B' and vehicle_kind = 'trailer' $$,
  'an admin switches a pair off'
);
select is(
  (select count(*)::int from public.audit_log where table_name = 'license_unit_compatibility' and action = 'update'),
  1, 'the change is audited'
);
reset role;

-- ---------------------------------------------------------------------------
-- assign_trip: a current license of the right type
-- ---------------------------------------------------------------------------
-- The carrier's documents, so the company and the unit are ready.
select tests.approve('company', 'c2900000-0000-4000-8000-000000000003', 'tax_status_certificate');
select tests.approve('company', 'c2900000-0000-4000-8000-000000000003', 'legal_representative_id');
select tests.approve('vehicle', 'e2900000-0000-4000-8000-000000000002', 'vehicle_registration_card');
select tests.approve('vehicle', 'e2900000-0000-4000-8000-000000000002', 'vehicle_permit');
select tests.approve('vehicle', 'e2900000-0000-4000-8000-000000000002', 'vehicle_insurance_policy');

set local role authenticated;
select tests.login('a2900000-0000-4000-8000-000000000001');
insert into tests.vals select 'load1', public.create_load(tests.payload(1));
select public.publish_load(tests.val('load1'));
insert into tests.vals select 'load2', public.create_load(tests.payload(2, '["hazmat_permit"]'));
select public.publish_load(tests.val('load2'));
select tests.login('a2900000-0000-4000-8000-000000000003');
insert into tests.vals select 'offer1', public.make_offer(tests.val('load1'), 3000000, null, 'e2900000-0000-4000-8000-000000000001');
insert into tests.vals select 'offer2', public.make_offer(tests.val('load2'), 3000000, null, 'e2900000-0000-4000-8000-000000000002');
select tests.login('a2900000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip1', public.accept_offer(tests.val('offer1'));
insert into tests.vals select 'trip2', public.accept_offer(tests.val('offer2'));

select tests.login('a2900000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e2900000-0000-4000-8000-000000000001', 'd2900000-0000-4000-8000-000000000005') $$,
  '55000', 'operator license is not suitable for this vehicle: Omar Rígido',
  'an operator with a type C license cannot take a trailer'
);
select lives_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e2900000-0000-4000-8000-000000000002', 'd2900000-0000-4000-8000-000000000005') $$,
  'but may take a rigid unit'
);
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e2900000-0000-4000-8000-000000000002', 'd2900000-0000-4000-8000-000000000006') $$,
  '55000', 'operator license is missing or expired: Elena Federal',
  'an operator whose license date passed and has no approved license document cannot be assigned'
);
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e2900000-0000-4000-8000-000000000002', 'd2900000-0000-4000-8000-000000000007') $$,
  '55000', 'operator license is missing or expired: Luis Sin Licencia',
  'an operator without a license cannot be assigned'
);
reset role;
-- An approved, unexpired license document makes Elena current even though her date passed.
select tests.approve('operator', 'd2900000-0000-4000-8000-000000000006', 'federal_driver_license', now() + interval '6 months');
set local role authenticated;
select tests.login('a2900000-0000-4000-8000-000000000003');
select lives_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e2900000-0000-4000-8000-000000000001', 'd2900000-0000-4000-8000-000000000006') $$,
  'an approved license document counts as current, and type E drives a trailer'
);
select throws_ok(
  $$ select public.assign_trip(tests.val('trip2'), 'e2900000-0000-4000-8000-000000000002', 'd2900000-0000-4000-8000-000000000005') $$,
  '55000', 'operator license is not suitable for hazardous cargo: Omar Rígido',
  'a load with a hazmat permit needs a type E license'
);
select lives_ok(
  $$ select public.assign_trip(tests.val('trip2'), 'e2900000-0000-4000-8000-000000000002', 'd2900000-0000-4000-8000-000000000006') $$,
  'type E takes the hazmat load'
);
reset role;
-- The admin switched B/trailer off above; the table decides.
update public.license_unit_compatibility set allowed = false where license_type = 'E' and vehicle_kind = 'trailer';
set local role authenticated;
select tests.login('a2900000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.assign_trip(tests.val('trip1'), 'e2900000-0000-4000-8000-000000000001', 'd2900000-0000-4000-8000-000000000006') $$,
  '55000', 'operator license is not suitable for this vehicle: Elena Federal',
  'a pair switched off by the admin is refused: the rule lives in the table'
);
reset role;

-- ---------------------------------------------------------------------------
-- process_document_expiry warns the coordinators of the business unit too
-- ---------------------------------------------------------------------------
select tests.new_user('a2900000-0000-4000-8000-000000000008', 'coordinator');
select tests.new_user('a2900000-0000-4000-8000-000000000009', 'coordinator');
update public.profiles set company_id = 'c2900000-0000-4000-8000-000000000003'
where id in ('a2900000-0000-4000-8000-000000000008', 'a2900000-0000-4000-8000-000000000009');
insert into public.business_units (id, company_id, name)
values ('b2900000-0000-4000-8000-000000000002', 'c2900000-0000-4000-8000-000000000003', 'Otra');
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id)
select b.id, b.company_id, 'a2900000-0000-4000-8000-000000000008'
from public.business_units b where b.company_id = 'c2900000-0000-4000-8000-000000000003' and b.name = 'Principal';
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id)
values ('b2900000-0000-4000-8000-000000000002', 'c2900000-0000-4000-8000-000000000003', 'a2900000-0000-4000-8000-000000000009');
-- Elena's license (unit "Principal") expires in 3 days; the company's constancia has no date.
update public.documents set expires_at = now() + interval '3 days'
where owner_id = 'd2900000-0000-4000-8000-000000000006' and status = 'approved';
select set_config('request.jwt.claims', '', true);
select is(public.process_document_expiry(), 1, 'one document is about to expire');
select results_eq(
  $$ select user_id from public.notifications where type = 'document_expiring'
     and data ->> 'ownerLabel' = 'Elena Federal' order by user_id $$,
  $$ values ('a2900000-0000-4000-8000-000000000003'::uuid), ('a2900000-0000-4000-8000-000000000006'),
            ('a2900000-0000-4000-8000-000000000008') $$,
  'the manager, the coordinator of the operator''s business unit and the operator are warned; the other coordinator is not'
);
select is(
  (select data ->> 'requirementName' from public.notifications where type = 'document_expiring'
     and user_id = 'a2900000-0000-4000-8000-000000000006'),
  'Licencia de conducir vigente', 'with the requirement''s new name'
);

select * from finish();
rollback;
