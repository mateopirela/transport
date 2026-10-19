-- G6 · Documents shared with the shipper (D21): shared on accepting the offer
-- (only approved and shareable ones), more on assigning, revoked on
-- reassigning, on replacing a document, by the manager and on closing or
-- cancelling; the shipper never reads Storage directly, another shipper
-- cannot, every view is logged and nothing opens after a revocation. Also
-- the notices of the flow: documents_shared, trip_document_added, load_match
-- by business unit and trip_assigned to the operator.
begin;
create extension if not exists pgtap with schema extensions;

select plan(58);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated, service_role;

create function tests.new_user(p_id uuid, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@g6.test', now(),
          case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end,
          jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create function tests.payload(p_days integer, p_unit text default 'dry_van')
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
    'weightKg', 10000,
    'unitType', p_unit,
    'specialRequirements', jsonb_build_array(),
    'proposedPriceCents', 3500000
  );
$$;

create table tests.vals (name text primary key, id uuid);
grant select, insert on tests.vals to authenticated, service_role;

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

-- Active shares of the trip, as requirement codes (as the database owner).
create function tests.active(p_trip uuid)
returns text[]
language sql
security definer
set search_path = ''
as $$
  select coalesce(array_agg(r.code order by r.code), '{}')
  from public.document_shares s
  join public.documents d on d.id = s.document_id
  join public.document_requirements r on r.id = d.requirement_id
  where s.trip_id = p_trip and s.revoked_at is null;
$$;

-- The share of a requirement for an owner on a trip (as the database owner).
create function tests.share(p_trip uuid, p_code text, p_owner uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select s.id
  from public.document_shares s
  join public.documents d on d.id = s.document_id
  join public.document_requirements r on r.id = d.requirement_id
  where s.trip_id = p_trip and r.code = p_code and s.owner_id = p_owner
  order by s.granted_at desc
  limit 1;
$$;

create function tests.notified(p_user uuid, p_type public.notification_type)
returns integer
language sql
security definer
set search_path = ''
as $$ select count(*)::integer from public.notifications where user_id = p_user and type = p_type $$;

-- Uploads and registers a trip document as the current role.
create function tests.add(p_trip uuid, p_kind public.trip_document_kind, p_file uuid)
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

grant execute on all functions in schema tests to authenticated, service_role;

-- Users a34…: 01 shipper S (accepts), 02 manager M, 03 coordinator K (business
-- unit "Principal"), 04 operator O1, 05 operator O2, 06 another shipper X,
-- 07 coordinator N ("Norte"), 08 shipper S2 (same company as S), 09 admin,
-- 10 manager of another carrier Y.
select tests.new_user('a3400000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a3400000-0000-4000-8000-000000000002', 'manager');
select tests.new_user('a3400000-0000-4000-8000-000000000003', 'coordinator');
select tests.new_user('a3400000-0000-4000-8000-000000000004', 'operator');
select tests.new_user('a3400000-0000-4000-8000-000000000005', 'operator');
select tests.new_user('a3400000-0000-4000-8000-000000000006', 'shipper');
select tests.new_user('a3400000-0000-4000-8000-000000000007', 'coordinator');
select tests.new_user('a3400000-0000-4000-8000-000000000008', 'shipper');
select tests.new_user('a3400000-0000-4000-8000-000000000009', 'shipper');
select tests.new_user('a3400000-0000-4000-8000-000000000010', 'manager');
update public.profiles set role = 'admin' where id = 'a3400000-0000-4000-8000-000000000009';

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c3400000-0000-4000-8000-000000000001', 'shipper', 'Envíos Treinta y Cuatro SA de CV', 'ETC050505GH5', 'approved'),
  ('c3400000-0000-4000-8000-000000000002', 'carrier', 'Fletes Treinta y Cuatro SA de CV', 'FTC040404CD4', 'approved'),
  ('c3400000-0000-4000-8000-000000000003', 'shipper', 'Otro Cliente SA de CV', 'OCL050505GH6', 'approved'),
  ('c3400000-0000-4000-8000-000000000004', 'carrier', 'Otros Fletes SA de CV', 'OFL040404CD5', 'approved');
update public.profiles set company_id = 'c3400000-0000-4000-8000-000000000001'
where id in ('a3400000-0000-4000-8000-000000000001', 'a3400000-0000-4000-8000-000000000008');
update public.profiles set company_id = 'c3400000-0000-4000-8000-000000000002'
where id in ('a3400000-0000-4000-8000-000000000002', 'a3400000-0000-4000-8000-000000000003',
             'a3400000-0000-4000-8000-000000000004', 'a3400000-0000-4000-8000-000000000005',
             'a3400000-0000-4000-8000-000000000007');
update public.profiles set company_id = 'c3400000-0000-4000-8000-000000000003'
where id = 'a3400000-0000-4000-8000-000000000006';
update public.profiles set company_id = 'c3400000-0000-4000-8000-000000000004'
where id = 'a3400000-0000-4000-8000-000000000010';

insert into public.business_units (id, company_id, name) values
  ('b3400000-0000-4000-8000-000000000002', 'c3400000-0000-4000-8000-000000000002', 'Norte');
insert into tests.vals select 'unit_main', id from public.business_units
where company_id = 'c3400000-0000-4000-8000-000000000002' and name = 'Principal';
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id) values
  (tests.val('unit_main'), 'c3400000-0000-4000-8000-000000000002', 'a3400000-0000-4000-8000-000000000003'),
  ('b3400000-0000-4000-8000-000000000002', 'c3400000-0000-4000-8000-000000000002', 'a3400000-0000-4000-8000-000000000007');

insert into public.operators (id, company_id, business_unit_id, profile_id, full_name, license_type, license_expires_on) values
  ('d3400000-0000-4000-8000-000000000004', 'c3400000-0000-4000-8000-000000000002', tests.val('unit_main'),
   'a3400000-0000-4000-8000-000000000004', 'Óscar Uno', 'E', current_date + 365),
  ('d3400000-0000-4000-8000-000000000005', 'c3400000-0000-4000-8000-000000000002', tests.val('unit_main'),
   'a3400000-0000-4000-8000-000000000005', 'Óscar Dos', 'E', current_date + 365);
-- V1 and V2 in "Principal"; V3 in "Norte" (ready, a refrigerated box) and V4
-- in "Norte" (a dry van without documents).
insert into public.vehicles (id, company_id, business_unit_id, kind, plate, unit_type, capacity_kg) values
  ('e3400000-0000-4000-8000-000000000001', 'c3400000-0000-4000-8000-000000000002', tests.val('unit_main'),
   'rigid', 'GGA3401', 'dry_van', 20000),
  ('e3400000-0000-4000-8000-000000000002', 'c3400000-0000-4000-8000-000000000002', tests.val('unit_main'),
   'rigid', 'GGA3402', 'dry_van', 20000),
  ('e3400000-0000-4000-8000-000000000003', 'c3400000-0000-4000-8000-000000000002', 'b3400000-0000-4000-8000-000000000002',
   'rigid', 'GGA3403', 'refrigerated', 20000),
  ('e3400000-0000-4000-8000-000000000004', 'c3400000-0000-4000-8000-000000000002', 'b3400000-0000-4000-8000-000000000002',
   'rigid', 'GGA3404', 'dry_van', 20000);

-- Every requirement approved: the company's, V1–V3's and the operators'.
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select 'c3400000-0000-4000-8000-000000000002', r.id, r.owner_type, o.id,
       'c3400000-0000-4000-8000-000000000002/' || r.owner_type || '/' || o.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.document_requirements r
join (values
  ('company'::public.document_owner_type, 'c3400000-0000-4000-8000-000000000002'::uuid),
  ('vehicle', 'e3400000-0000-4000-8000-000000000001'), ('vehicle', 'e3400000-0000-4000-8000-000000000002'),
  ('vehicle', 'e3400000-0000-4000-8000-000000000003'),
  ('operator', 'd3400000-0000-4000-8000-000000000004'), ('operator', 'd3400000-0000-4000-8000-000000000005')
) as o(owner_type, id) on o.owner_type = r.owner_type
where r.archived_at is null and (r.company_type is null or r.company_type = 'carrier');
insert into tests.vals
select 'tax_doc', d.id from public.documents d join public.document_requirements r on r.id = d.requirement_id
where d.company_id = 'c3400000-0000-4000-8000-000000000002' and r.code = 'tax_status_certificate';
-- A file of the carrier's in Storage, to prove the shipper cannot read it.
insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'documents', d.storage_path, 'a3400000-0000-4000-8000-000000000002', '{"mimetype":"application/pdf","size":2048}'
from public.documents d where d.id = tests.val('tax_doc');

-- ---------------------------------------------------------------------------
-- Accepting the offer shares the approved, shareable company documents
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3400000-0000-4000-8000-000000000001');
insert into tests.vals select 'load', public.create_load(tests.payload(1));
select public.publish_load(tests.val('load'));
select tests.login('a3400000-0000-4000-8000-000000000003');
insert into tests.vals select 'offer', public.make_offer(tests.val('load'), 3000000, null, 'e3400000-0000-4000-8000-000000000001');
select tests.login('a3400000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip', public.accept_offer(tests.val('offer'));
reset role;

select is(tests.active(tests.val('trip')), array['tax_status_certificate'],
  'accepting shares the Constancia, never the id of the legal representative');
select is(
  (select granted_reason::text from public.document_shares where trip_id = tests.val('trip')),
  'offer_accepted', 'with the reason offer_accepted');
select is(tests.notified('a3400000-0000-4000-8000-000000000008', 'documents_shared'), 1,
  'the shipper''s other members are told (documents_shared)');
select is(
  (select (data ->> 'count')::int from public.notifications
   where user_id = 'a3400000-0000-4000-8000-000000000008' and type = 'documents_shared'),
  1, 'with how many documents were shared');

-- ---------------------------------------------------------------------------
-- Who reads the shares
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3400000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.document_shares), 1, 'the shipper reads the share');
select is(
  (select array_agg(requirement_code || ':' || active) from public.trip_shared_documents(tests.val('trip'))),
  array['tax_status_certificate:true'], 'and lists it with trip_shared_documents');
select is((select count(*)::int from public.documents where company_id = 'c3400000-0000-4000-8000-000000000002'), 0,
  'the shipper still cannot read the carrier''s documents');
select is((select count(*)::int from storage.objects where bucket_id = 'documents'
           and name like 'c3400000-0000-4000-8000-000000000002/%'), 0,
  'nor its files in Storage: the shipper never gets Storage permissions on documents');

select tests.login('a3400000-0000-4000-8000-000000000006');
select is((select count(*)::int from public.document_shares), 0, 'another shipper reads no share');
select throws_ok($$ select * from public.trip_shared_documents(tests.val('trip')) $$, '42501', 'trip not found',
  'nor lists the trip''s');

select tests.login('a3400000-0000-4000-8000-000000000007');
select is((select count(*)::int from public.document_shares), 0,
  'a coordinator of another business unit reads none');
select throws_ok($$ select * from public.trip_shared_documents(tests.val('trip')) $$, '42501', 'trip not found',
  'nor lists them');
select tests.login('a3400000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.document_shares), 0, 'nor does an operator');

select tests.login('a3400000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.document_shares), 1, 'the coordinator of the trip''s business unit sees it');
select tests.login('a3400000-0000-4000-8000-000000000009');
select is((select count(*)::int from public.trip_shared_documents(tests.val('trip'))), 1, 'and so does an admin');
reset role;

select ok(
  (select pg_get_function_result('public.trip_shared_documents(uuid)'::regprocedure) not like '%storage_path%')
  and not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'document_shares' and column_name = 'storage_path'),
  'neither the table nor the RPC carry a storage path');

-- ---------------------------------------------------------------------------
-- Assigning shares the unit's and the operator's (not the operator's id)
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3400000-0000-4000-8000-000000000003');
select public.assign_trip(tests.val('trip'), 'e3400000-0000-4000-8000-000000000001', 'd3400000-0000-4000-8000-000000000004');
reset role;

select is(tests.active(tests.val('trip')),
  array['federal_driver_license', 'tax_status_certificate', 'vehicle_insurance_policy', 'vehicle_permit',
        'vehicle_registration_card'],
  'assigning adds the unit''s card, permit and insurance and the operator''s license');
select is(tests.notified('a3400000-0000-4000-8000-000000000001', 'documents_shared'), 1,
  'the shipper is told about the new ones');
select is(tests.notified('a3400000-0000-4000-8000-000000000004', 'trip_assigned'), 1,
  'trip_assigned reaches the operator''s profile (also an operator who signs in with a phone, G2)');

-- ---------------------------------------------------------------------------
-- Viewing: only through the service-role RPC, logged, for the trip's shipper
-- ---------------------------------------------------------------------------
insert into tests.vals values
  ('tax_share', tests.share(tests.val('trip'), 'tax_status_certificate', 'c3400000-0000-4000-8000-000000000002')),
  ('v1_card', tests.share(tests.val('trip'), 'vehicle_registration_card', 'e3400000-0000-4000-8000-000000000001')),
  ('o1_license', tests.share(tests.val('trip'), 'federal_driver_license', 'd3400000-0000-4000-8000-000000000004'));

set local role authenticated;
select tests.login('a3400000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.authorize_shared_document_view_service(tests.val('tax_share'), 'a3400000-0000-4000-8000-000000000001') $$,
  '42501', null, 'a signed-in user cannot call the service RPC');
reset role;

set local role service_role;
select is(
  public.authorize_shared_document_view_service(tests.val('tax_share'), 'a3400000-0000-4000-8000-000000000001'),
  (select storage_path from public.documents where id = tests.val('tax_doc')),
  'the shipper''s view returns the path to sign');
select lives_ok(
  $$ select public.authorize_shared_document_view_service(tests.val('v1_card'), 'a3400000-0000-4000-8000-000000000008') $$,
  'any member of the trip''s shipper may open it');
select throws_ok(
  $$ select public.authorize_shared_document_view_service(tests.val('tax_share'), 'a3400000-0000-4000-8000-000000000006') $$,
  '42501', 'shared document not available', 'another shipper cannot');
select throws_ok(
  $$ select public.authorize_shared_document_view_service(tests.val('tax_share'), 'a3400000-0000-4000-8000-000000000002') $$,
  '42501', 'shared document not available', 'nor the carrier''s staff (they have their own access)');
select throws_ok(
  $$ select public.authorize_shared_document_view_service(gen_random_uuid(), 'a3400000-0000-4000-8000-000000000001') $$,
  '42501', 'shared document not available', 'an unknown share fails the same way');
reset role;

select is(
  (select array_agg(viewer_id::text order by viewer_id) from public.document_share_views),
  array['a3400000-0000-4000-8000-000000000001', 'a3400000-0000-4000-8000-000000000008'],
  'every authorized view is logged, and only those');
select throws_ok($$ update public.document_share_views set viewed_at = now() $$, '42501', null,
  'the log is immutable');
select throws_ok($$ delete from public.document_share_views $$, '42501', null, 'and cannot be deleted');

set local role authenticated;
select tests.login('a3400000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.document_share_views), 2, 'the manager reads the log');
select tests.login('a3400000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.document_share_views), 0, 'a coordinator does not');
select tests.login('a3400000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.document_share_views), 0, 'nor the shipper');
select throws_ok(
  $$ insert into public.document_shares (trip_id, document_id, shipper_company_id, carrier_company_id, owner_type, owner_id, granted_reason)
     values (tests.val('trip'), tests.val('tax_doc'), 'c3400000-0000-4000-8000-000000000001',
             'c3400000-0000-4000-8000-000000000002', 'company', 'c3400000-0000-4000-8000-000000000002', 'offer_accepted') $$,
  '42501', null, 'clients never write shares');
reset role;

-- ---------------------------------------------------------------------------
-- Reassigning revokes the previous unit's and operator's
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3400000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('trip'), 'e3400000-0000-4000-8000-000000000002', 'd3400000-0000-4000-8000-000000000005');
reset role;

select is(
  (select array_agg(distinct revoked_reason::text) from public.document_shares
   where trip_id = tests.val('trip') and owner_id in ('e3400000-0000-4000-8000-000000000001', 'd3400000-0000-4000-8000-000000000004')),
  array['reassigned'], 'the previous unit''s and operator''s shares are revoked as reassigned');
select is(
  (select count(*)::int from public.document_shares
   where trip_id = tests.val('trip') and revoked_at is null
     and owner_id in ('e3400000-0000-4000-8000-000000000002', 'd3400000-0000-4000-8000-000000000005')),
  4, 'and the new ones are shared');
set local role service_role;
select throws_ok(
  $$ select public.authorize_shared_document_view_service(tests.val('v1_card'), 'a3400000-0000-4000-8000-000000000001') $$,
  '42501', 'shared document not available', 'a revoked share no longer opens');
reset role;

-- ---------------------------------------------------------------------------
-- A replaced document: the old one is revoked, the new one shared once approved
-- ---------------------------------------------------------------------------
insert into public.documents (id, company_id, requirement_id, owner_type, owner_id, storage_path)
select 'f3400000-0000-4000-8000-000000000001', d.company_id, d.requirement_id, d.owner_type, d.owner_id,
       d.company_id || '/company/' || d.owner_id || '/f3400000-0000-4000-8000-000000000001.pdf'
from public.documents d where d.id = tests.val('tax_doc');
update public.documents set archived_at = now() where id = tests.val('tax_doc');

select is((select revoked_reason::text from public.document_shares where id = tests.val('tax_share')),
  'document_replaced', 'superseding a document revokes its share');
select is(tests.active(tests.val('trip')) @> array['tax_status_certificate'], false,
  'the new version is not shared while it waits for review');
update public.documents set status = 'approved', reviewed_at = now() where id = 'f3400000-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.document_shares
   where document_id = 'f3400000-0000-4000-8000-000000000001' and revoked_at is null and trip_id = tests.val('trip')),
  1, 'it is shared once approved, while the trip is open');

-- ---------------------------------------------------------------------------
-- The manager revokes by hand
-- ---------------------------------------------------------------------------
insert into tests.vals values
  ('v2_card', tests.share(tests.val('trip'), 'vehicle_registration_card', 'e3400000-0000-4000-8000-000000000002'));
set local role authenticated;
select tests.login('a3400000-0000-4000-8000-000000000003');
select throws_ok($$ select public.revoke_document_share(tests.val('v2_card')) $$, '42501',
  'only the manager revokes a shared document', 'a coordinator cannot revoke');
select tests.login('a3400000-0000-4000-8000-000000000010');
select throws_ok($$ select public.revoke_document_share(tests.val('v2_card')) $$, '42501', 'share not found',
  'nor the manager of another carrier');
select tests.login('a3400000-0000-4000-8000-000000000001');
select throws_ok($$ select public.revoke_document_share(tests.val('v2_card')) $$, '42501', null,
  'nor the shipper');
select tests.login('a3400000-0000-4000-8000-000000000002');
select lives_ok($$ select public.revoke_document_share(tests.val('v2_card')) $$, 'the manager revokes it');
select lives_ok($$ select public.revoke_document_share(tests.val('v2_card')) $$, 'twice is harmless');
select is(
  (select revoked_reason::text || ':' || (revoked_by = 'a3400000-0000-4000-8000-000000000002')
   from public.document_shares where id = tests.val('v2_card')),
  'manager_revoked:true', 'with the reason and who did it');
select is(
  (select active from public.trip_shared_documents(tests.val('trip')) where share_id = tests.val('v2_card')),
  false, 'the staff still lists it, inactive');
select tests.login('a3400000-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from public.trip_shared_documents(tests.val('trip')) where share_id = tests.val('v2_card')),
  0, 'the shipper only lists the shares in force');
reset role;

-- ---------------------------------------------------------------------------
-- trip_document_added: to the other side of the trip
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3400000-0000-4000-8000-000000000001');
select tests.add(tests.val('trip'), 'service_order', 'f3400000-0000-4000-8000-000000000011');
select tests.login('a3400000-0000-4000-8000-000000000003');
select tests.add(tests.val('trip'), 'carta_porte', 'f3400000-0000-4000-8000-000000000012');
reset role;
select is(
  array[tests.notified('a3400000-0000-4000-8000-000000000002', 'trip_document_added'),
        tests.notified('a3400000-0000-4000-8000-000000000003', 'trip_document_added'),
        tests.notified('a3400000-0000-4000-8000-000000000007', 'trip_document_added')],
  array[1, 1, 0],
  'the service order goes to the trip''s staff (the manager and its business unit''s coordinator, not "Norte")');
select is(
  array[tests.notified('a3400000-0000-4000-8000-000000000001', 'trip_document_added'),
        tests.notified('a3400000-0000-4000-8000-000000000008', 'trip_document_added')],
  array[1, 1], 'the Carta Porte goes to the shipper''s members');
select is(
  (select data ->> 'documentKind' from public.notifications
   where user_id = 'a3400000-0000-4000-8000-000000000001' and type = 'trip_document_added'),
  'carta_porte', 'with the kind of document');

-- ---------------------------------------------------------------------------
-- Upgrade: trips that predate the migration get their shares from the backfill
-- (simulated by deleting the active shares of the open trip)
-- ---------------------------------------------------------------------------
create table tests.before_backfill as select tests.active(tests.val('trip')) as codes;
delete from public.document_shares where trip_id = tests.val('trip') and revoked_at is null;
select is(tests.active(tests.val('trip')), '{}'::text[], 'without shares, as an open trip before the migration');
select ok(public.backfill_document_shares() >= 4, 'the backfill shares the documents of the open trips');
select is(tests.active(tests.val('trip')), (select codes from tests.before_backfill),
  'the trip gets back exactly the shares it had (the backfill is the same rule)');

-- ---------------------------------------------------------------------------
-- Closing or cancelling revokes everything
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3400000-0000-4000-8000-000000000001');
select public.cancel_trip(tests.val('trip'), 'Ya no se necesita');
reset role;
select is(tests.active(tests.val('trip')), '{}'::text[], 'cancelling revokes every share');
select is(
  (select array_agg(distinct revoked_reason::text) from public.document_shares
   where trip_id = tests.val('trip') and revoked_reason not in ('reassigned', 'document_replaced', 'manager_revoked')),
  array['trip_cancelled'], 'as trip_cancelled');
set local role service_role;
select throws_ok(
  $$ select public.authorize_shared_document_view_service(tests.val('o1_license'), 'a3400000-0000-4000-8000-000000000001') $$,
  '42501', 'shared document not available', 'nothing opens after the trip ends');
reset role;

-- A second trip, closed by the database owner as confirm_delivery would.
set local role authenticated;
select tests.login('a3400000-0000-4000-8000-000000000001');
insert into tests.vals select 'load2', public.create_load(tests.payload(3));
select public.publish_load(tests.val('load2'));
select tests.login('a3400000-0000-4000-8000-000000000002');
insert into tests.vals select 'offer2', public.make_offer(tests.val('load2'), 3000000, null, 'e3400000-0000-4000-8000-000000000001');
select tests.login('a3400000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip2', public.accept_offer(tests.val('offer2'));
reset role;
select is(cardinality(tests.active(tests.val('trip2'))), 1, 'the second trip shares the company document');
update public.trips
set status = 'closed', closed_at = now(), assigned_at = now(),
    vehicle_id = 'e3400000-0000-4000-8000-000000000001', operator_id = 'd3400000-0000-4000-8000-000000000004'
where id = tests.val('trip2');
select is(
  (select array_agg(revoked_reason::text) from public.document_shares where trip_id = tests.val('trip2')),
  array['trip_closed'], 'closing it revokes as trip_closed');

-- ---------------------------------------------------------------------------
-- load_match by business unit: only to coordinators with a ready, available
-- and compatible unit, and to the manager, once each
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3400000-0000-4000-8000-000000000002');
select public.set_vehicle_availability(v.id, now(), 25.70, -100.30, 'Monterrey', 'Nuevo León')
from (values ('e3400000-0000-4000-8000-000000000002'::uuid), ('e3400000-0000-4000-8000-000000000003'),
             ('e3400000-0000-4000-8000-000000000004')) as v(id);
select tests.login('a3400000-0000-4000-8000-000000000001');
insert into tests.vals select 'load3', public.create_load(tests.payload(2));
select public.publish_load(tests.val('load3'));
reset role;
select is(
  (select array_agg(n.user_id::text || ':' || (n.data ->> 'vehicleId') order by n.user_id)
   from public.notifications n where n.type = 'load_match' and n.data ->> 'loadId' = tests.val('load3')::text),
  array['a3400000-0000-4000-8000-000000000002:e3400000-0000-4000-8000-000000000002',
        'a3400000-0000-4000-8000-000000000003:e3400000-0000-4000-8000-000000000002'],
  'the manager and the coordinator of the ready dry van get it once; "Norte" (a reefer and a unit without documents) does not');

select * from finish();
rollback;
