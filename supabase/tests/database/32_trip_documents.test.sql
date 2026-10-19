-- G3 · Documents of each trip (D22): the requirements as data, who uploads
-- each kind (the shipper the service order, the carrier staff the rest), the
-- shipper's upload policy in Storage, blocks_departure in record_trip_event
-- and the trip_checklist RPC.
begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated;

create function tests.new_user(p_id uuid, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@g3.test', now(),
          case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end,
          jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
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

-- Uploads a trip file as the current role (the bucket policies apply).
create function tests.upload(p_trip uuid, p_file uuid)
returns text
language plpgsql
as $$
declare
  v_path text := p_trip || '/' || p_file || '.pdf';
begin
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('trip-documents', v_path, (select auth.uid())::text, '{"mimetype":"application/pdf","size":2048}'::jsonb);
  return v_path;
end;
$$;

-- Uploads and registers a trip document of a kind as the current role.
create function tests.add(p_trip uuid, p_kind public.trip_document_kind, p_file uuid)
returns uuid
language sql
as $$
  select public.add_trip_document(p_trip, p_kind, tests.upload(p_trip, p_file), p_kind::text || '.pdf');
$$;

create function tests.done(p_trip uuid, p_code text)
returns boolean
language sql
as $$
  select c.done_at is not null from public.trip_checklist(p_trip) c where c.code = p_code;
$$;

grant execute on all functions in schema tests to authenticated;

-- Users a30…: 01 shipper S, 02 manager M, 03 coordinator K (of the trip's unit),
-- 04 operator O, 05 another shipper X, 06 coordinator N (no business units).
select tests.new_user('a3000000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a3000000-0000-4000-8000-000000000002', 'manager');
select tests.new_user('a3000000-0000-4000-8000-000000000003', 'coordinator');
select tests.new_user('a3000000-0000-4000-8000-000000000004', 'operator');
select tests.new_user('a3000000-0000-4000-8000-000000000005', 'shipper');
select tests.new_user('a3000000-0000-4000-8000-000000000006', 'coordinator');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c3000000-0000-4000-8000-000000000001', 'shipper', 'Envíos Treinta SA de CV', 'ETR050505GH5', 'approved'),
  ('c3000000-0000-4000-8000-000000000002', 'carrier', 'Fletes Treinta SA de CV', 'FTR040404CD4', 'approved'),
  ('c3000000-0000-4000-8000-000000000003', 'shipper', 'Otro Cliente SA de CV', 'OCL050505GH5', 'approved');
update public.profiles set company_id = 'c3000000-0000-4000-8000-000000000001'
where id = 'a3000000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c3000000-0000-4000-8000-000000000002'
where id in ('a3000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000003',
             'a3000000-0000-4000-8000-000000000004', 'a3000000-0000-4000-8000-000000000006');
update public.profiles set company_id = 'c3000000-0000-4000-8000-000000000003'
where id = 'a3000000-0000-4000-8000-000000000005';

insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id)
select b.id, b.company_id, 'a3000000-0000-4000-8000-000000000003'
from public.business_units b where b.company_id = 'c3000000-0000-4000-8000-000000000002';

insert into public.operators (id, company_id, profile_id, full_name, license_type, license_expires_on) values
  ('d3000000-0000-4000-8000-000000000004', 'c3000000-0000-4000-8000-000000000002',
   'a3000000-0000-4000-8000-000000000004', 'Óscar Operador', 'E', current_date + 365);
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('e3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000002', 'rigid', 'GGA3001', 'dry_van', 12000);
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'c3000000-0000-4000-8000-000000000002'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- ---------------------------------------------------------------------------
-- The requirements as data
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select kind::text, stage::text, uploader_sides::text[], is_required, blocks_departure
     from public.trip_document_requirements order by sort_order $$,
  $$ values ('service_order', 'before_departure', array['shipper', 'carrier'], true, false),
            ('carta_porte', 'before_departure', array['carrier'], true, false),
            ('invoice', 'billing', array['carrier'], true, false),
            ('other', 'before_departure', array['shipper', 'carrier'], false, false) $$,
  'D22: the service order (shipper or carrier), the Carta Porte and the invoice (carrier); nothing blocks the departure'
);
select throws_ok(
  $$ update public.trip_document_requirements set blocks_departure = true where kind = 'invoice' $$,
  '23514', null, 'only a required document due before departure may block it'
);

-- ---------------------------------------------------------------------------
-- A contracted trip
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3000000-0000-4000-8000-000000000001');
insert into tests.vals select 'load', public.create_load(tests.payload(1));
select public.publish_load(tests.val('load'));
select tests.login('a3000000-0000-4000-8000-000000000003');
insert into tests.vals select 'offer', public.make_offer(tests.val('load'), 3000000, null, 'e3000000-0000-4000-8000-000000000001');
select tests.login('a3000000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip', public.accept_offer(tests.val('offer'));

-- Every required item is pending, in stage order.
select results_eq(
  $$ select code, stage, responsible, required, done_at from public.trip_checklist(tests.val('trip')) $$,
  $$ values ('service_order', 'before_departure', 'shipper', true, null::timestamptz),
            ('carta_porte', 'before_departure', 'carrier', true, null),
            ('invoice', 'billing', 'carrier', true, null),
            ('other', 'before_departure', 'shipper', false, null),
            ('pickup_evidence', 'pickup', 'operator', true, null),
            ('delivery_evidence', 'delivery', 'operator', true, null),
            ('delivery_receipt', 'delivery', 'operator', true, null) $$,
  'the checklist lists the documents, the photos and the signed delivery, all pending'
);

-- ---------------------------------------------------------------------------
-- Who uploads what
-- ---------------------------------------------------------------------------
-- The shipper of the trip: the service order, not the Carta Porte.
select lives_ok(
  $$ select tests.add(tests.val('trip'), 'service_order', 'f3000000-0000-4000-8000-000000000001') $$,
  'the shipper uploads the service order'
);
select throws_ok(
  $$ select tests.add(tests.val('trip'), 'carta_porte', 'f3000000-0000-4000-8000-000000000002') $$,
  '42501', 'the shipper side does not upload carta_porte documents',
  'the shipper cannot register a Carta Porte'
);
select throws_ok(
  $$ select tests.add(tests.val('trip'), 'invoice', 'f3000000-0000-4000-8000-000000000003') $$,
  '42501', null, 'nor an invoice'
);
select is(tests.done(tests.val('trip'), 'service_order'), true, 'the service order is done in the checklist');

-- Another shipper: nothing, not even the upload.
select tests.login('a3000000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select tests.upload(tests.val('trip'), 'f3000000-0000-4000-8000-000000000004') $$,
  '42501', null, 'another shipper cannot upload into the trip folder'
);
select throws_ok(
  $$ select public.add_trip_document(tests.val('trip'), 'service_order',
       tests.val('trip') || '/f3000000-0000-4000-8000-000000000001.pdf', 'x.pdf') $$,
  '42501', 'trip not found', 'nor register a file of the trip'
);
select is((select count(*)::int from public.trip_checklist(tests.val('trip'))), 0,
  'the checklist of a trip the caller cannot see is empty');

-- The coordinator of the trip's business unit: the Carta Porte and the invoice.
select tests.login('a3000000-0000-4000-8000-000000000003');
select lives_ok(
  $$ select tests.add(tests.val('trip'), 'carta_porte', 'f3000000-0000-4000-8000-000000000005') $$,
  'the coordinator uploads the Carta Porte'
);
select lives_ok(
  $$ select tests.add(tests.val('trip'), 'service_order', 'f3000000-0000-4000-8000-000000000006') $$,
  'and may upload the service order too'
);
-- A coordinator without business units: nothing.
select tests.login('a3000000-0000-4000-8000-000000000006');
select throws_ok(
  $$ select tests.upload(tests.val('trip'), 'f3000000-0000-4000-8000-000000000007') $$,
  '42501', null, 'a coordinator who does not run the trip''s business unit cannot upload'
);
-- The operator: reads, never uploads.
select tests.login('a3000000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('trip'), 'e3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000004');
select tests.login('a3000000-0000-4000-8000-000000000004');
select is(
  (select array_agg(kind::text order by kind::text) from public.trip_documents where trip_id = tests.val('trip')),
  array['carta_porte', 'service_order', 'service_order'], 'the operator reads the documents of their trip'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'trip-documents' and name like tests.val('trip') || '/%'),
  3, 'and their files'
);
select throws_ok(
  $$ select tests.upload(tests.val('trip'), 'f3000000-0000-4000-8000-000000000008') $$,
  '42501', null, 'the operator cannot upload'
);
select is(
  (select array_agg(code order by code) from public.trip_checklist(tests.val('trip')) where done_at is not null),
  array['carta_porte', 'service_order'], 'the operator sees the same checklist'
);
-- The manager: the invoice (billing).
select tests.login('a3000000-0000-4000-8000-000000000002');
select lives_ok(
  $$ select tests.add(tests.val('trip'), 'invoice', 'f3000000-0000-4000-8000-000000000009') $$,
  'the manager uploads the invoice'
);
select is(
  (select array_agg(code order by code) from public.trip_checklist(tests.val('trip')) where required and done_at is null),
  array['delivery_evidence', 'delivery_receipt', 'pickup_evidence'],
  'only the operator''s part is pending'
);
reset role;

-- ---------------------------------------------------------------------------
-- blocks_departure (D22: none by default; each one can be configured)
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3000000-0000-4000-8000-000000000001');
insert into tests.vals select 'load2', public.create_load(tests.payload(3));
select public.publish_load(tests.val('load2'));
select tests.login('a3000000-0000-4000-8000-000000000002');
insert into tests.vals select 'offer2', public.make_offer(tests.val('load2'), 3000000, null, 'e3000000-0000-4000-8000-000000000001');
select tests.login('a3000000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip2', public.accept_offer(tests.val('offer2'));
select tests.login('a3000000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('trip2'), 'e3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000004');
reset role;

update public.trip_document_requirements set blocks_departure = true where kind = 'carta_porte';
set local role authenticated;
select tests.login('a3000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.record_trip_event(tests.val('trip2'), 'departed', now(), 25.69, -100.32) $$,
  '55000', 'trip documents are missing: carta_porte',
  'with blocks_departure the operator cannot leave without the Carta Porte'
);
select tests.login('a3000000-0000-4000-8000-000000000002');
select tests.add(tests.val('trip2'), 'carta_porte', 'f3000000-0000-4000-8000-000000000010');
select tests.login('a3000000-0000-4000-8000-000000000004');
select lives_ok(
  $$ select public.record_trip_event(tests.val('trip2'), 'departed', now(), 25.69, -100.32) $$,
  'once it is uploaded the operator departs'
);
reset role;
update public.trip_document_requirements set blocks_departure = false where kind = 'carta_porte';

-- ---------------------------------------------------------------------------
-- By default a missing document only warns; a cancelled trip takes nothing;
-- a file must be the caller's
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a3000000-0000-4000-8000-000000000001');
insert into tests.vals select 'load3', public.create_load(tests.payload(5));
select public.publish_load(tests.val('load3'));
select tests.login('a3000000-0000-4000-8000-000000000002');
insert into tests.vals select 'offer3', public.make_offer(tests.val('load3'), 3000000, null, 'e3000000-0000-4000-8000-000000000001');
select tests.login('a3000000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip3', public.accept_offer(tests.val('offer3'));
select tests.login('a3000000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('trip3'), 'e3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000004');
select tests.login('a3000000-0000-4000-8000-000000000004');
select lives_ok(
  $$ select public.record_trip_event(tests.val('trip3'), 'departed', now(), 25.69, -100.32) $$,
  'by default a trip without any document departs: what is missing only warns (D22)'
);
select tests.login('a3000000-0000-4000-8000-000000000001');
select public.cancel_trip(tests.val('trip3'), 'Ya no se necesita');
select throws_ok(
  $$ select tests.upload(tests.val('trip3'), 'f3000000-0000-4000-8000-000000000011') $$,
  '42501', null, 'the shipper cannot upload into a cancelled trip'
);
select tests.login('a3000000-0000-4000-8000-000000000003');
select tests.upload(tests.val('trip'), 'f3000000-0000-4000-8000-000000000013');
select tests.login('a3000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.add_trip_document(tests.val('trip'), 'service_order',
       tests.val('trip') || '/f3000000-0000-4000-8000-000000000013.pdf', 'ajena.pdf') $$,
  '22023', 'file was not uploaded', 'the shipper cannot register a file the coordinator uploaded'
);
reset role;

-- ---------------------------------------------------------------------------
-- Admin edits the requirements (audited); nobody else does
-- ---------------------------------------------------------------------------
select tests.new_user('a3000000-0000-4000-8000-000000000007', 'shipper');
update public.profiles set role = 'admin' where id = 'a3000000-0000-4000-8000-000000000007';
set local role authenticated;
select tests.login('a3000000-0000-4000-8000-000000000002');
select lives_ok(
  $$ update public.trip_document_requirements set is_required = false where kind = 'invoice' $$,
  'a non-admin update runs but matches no rows'
);
select is((select is_required from public.trip_document_requirements where kind = 'invoice'), true, 'nothing changed');
select throws_ok(
  $$ delete from public.trip_document_requirements where kind = 'other' $$, '42501', null, 'nobody deletes kinds'
);
select tests.login('a3000000-0000-4000-8000-000000000007');
select lives_ok(
  $$ update public.trip_document_requirements set uploader_sides = '{carrier}' where kind = 'service_order' $$,
  'an admin changes who uploads the service order'
);
select is(
  (select count(*)::int from public.audit_log where table_name = 'trip_document_requirements' and action = 'update'),
  1, 'the change is audited'
);
select tests.login('a3000000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select tests.upload(tests.val('trip'), 'f3000000-0000-4000-8000-000000000012') $$,
  'the bucket policy still lets the shipper upload into its trip'
);
select throws_ok(
  $$ select public.add_trip_document(tests.val('trip'), 'service_order',
       tests.val('trip') || '/f3000000-0000-4000-8000-000000000012.pdf', 'orden.pdf') $$,
  '42501', 'the shipper side does not upload service_order documents',
  'the data decides: the shipper no longer registers a service order'
);
reset role;

select * from finish();
rollback;
