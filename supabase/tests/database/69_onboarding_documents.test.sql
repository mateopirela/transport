-- R3 · Alta por pasos (D42–D44, D16-E3): the catalog rows of the steps
-- (power of attorney, selfie, the INE no longer optional for shippers) and
-- the operator who uploads their own documents. An operator writes and reads
-- only the operator documents of their own active row, in their company:
-- nothing of the company, the units, other operators or other companies, by
-- submit_document, the documents table or the Storage policies. The selfie
-- is required by the trip gate (R4) without code changes, and the admin
-- reviews it by hand.
begin;
create extension if not exists pgtap with schema extensions;

select plan(48);

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
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@r3.test', now(),
          case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end,
          jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
$$;

create function tests.login(p_id uuid, p_aal text default 'aal2')
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;

create function tests.requirement(p_code text)
returns uuid
language sql
stable
as $$ select id from public.document_requirements where code = p_code $$;

-- {company}/{owner_type}/{owner}/{file}.jpg
create function tests.path(p_company uuid, p_owner_type text, p_owner uuid, p_file uuid)
returns text
language sql
immutable
as $$ select p_company || '/' || p_owner_type || '/' || p_owner || '/' || p_file || '.jpg' $$;

-- Uploads as the current role, so the Storage RLS policies apply.
create function tests.upload(p_name text)
returns void
language sql
as $$
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('documents', p_name, (select auth.uid())::text, '{"mimetype":"image/jpeg","size":2048}'::jsonb);
$$;

-- An approved document written as the owner of the tables.
create function tests.approved(p_owner_id uuid, p_code text)
returns void
language sql
as $$
  insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
  select o.company_id, tests.requirement(p_code), 'operator', o.id,
         o.company_id || '/operator/' || o.id || '/' || gen_random_uuid() || '.pdf', 'approved',
         case when r.requires_expiry then now() + interval '1 year' end
  from public.operators o, public.document_requirements r
  where o.id = p_owner_id and r.code = p_code;
$$;

grant execute on all functions in schema tests to authenticated;

-- Users a69…: 01 manager Mario (Fletes R3), 02 coordinator Coral (BU Norte), 03 operator Olga (Norte),
-- 04 operator Omar (Fletes R3), 05 operator Otto (archived row), 06 manager Xavier (other carrier),
-- 07 operator Xóchitl (other carrier), 08 shipper Sara, 09 admin.
select tests.new_user('a6900000-0000-4000-8000-000000000001', 'manager');
select tests.new_user('a6900000-0000-4000-8000-000000000002', 'coordinator');
select tests.new_user('a6900000-0000-4000-8000-000000000003', 'operator');
select tests.new_user('a6900000-0000-4000-8000-000000000004', 'operator');
select tests.new_user('a6900000-0000-4000-8000-000000000005', 'operator');
select tests.new_user('a6900000-0000-4000-8000-000000000006', 'manager');
select tests.new_user('a6900000-0000-4000-8000-000000000007', 'operator');
select tests.new_user('a6900000-0000-4000-8000-000000000008', 'shipper');
select tests.new_user('a6900000-0000-4000-8000-000000000009', 'shipper');
update public.profiles set role = 'admin' where id = 'a6900000-0000-4000-8000-000000000009';

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c6900000-0000-4000-8000-000000000001', 'carrier', 'Fletes R3 SA de CV', 'FRT040404CD4', 'pending_review'),
  ('c6900000-0000-4000-8000-000000000002', 'carrier', 'Transportes Equis SA de CV', 'TEX030303EF3', 'approved'),
  ('c6900000-0000-4000-8000-000000000003', 'shipper', 'Envíos R3 SA de CV', 'ERT050505GH5', 'pending_review');
update public.profiles p set company_id = v.company_id
from (values
  ('a6900000-0000-4000-8000-000000000001'::uuid, 'c6900000-0000-4000-8000-000000000001'::uuid),
  ('a6900000-0000-4000-8000-000000000002', 'c6900000-0000-4000-8000-000000000001'),
  ('a6900000-0000-4000-8000-000000000003', 'c6900000-0000-4000-8000-000000000001'),
  ('a6900000-0000-4000-8000-000000000004', 'c6900000-0000-4000-8000-000000000001'),
  ('a6900000-0000-4000-8000-000000000005', 'c6900000-0000-4000-8000-000000000001'),
  ('a6900000-0000-4000-8000-000000000006', 'c6900000-0000-4000-8000-000000000002'),
  ('a6900000-0000-4000-8000-000000000007', 'c6900000-0000-4000-8000-000000000002'),
  ('a6900000-0000-4000-8000-000000000008', 'c6900000-0000-4000-8000-000000000003')
) as v(profile_id, company_id)
where p.id = v.profile_id;

insert into public.business_units (id, company_id, name) values
  ('b6900000-0000-4000-8000-000000000001', 'c6900000-0000-4000-8000-000000000001', 'Norte'),
  ('b6900000-0000-4000-8000-000000000002', 'c6900000-0000-4000-8000-000000000001', 'Sur');
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id) values
  ('b6900000-0000-4000-8000-000000000001', 'c6900000-0000-4000-8000-000000000001', 'a6900000-0000-4000-8000-000000000002');

insert into public.operators (id, company_id, business_unit_id, profile_id, full_name, archived_at) values
  ('d6900000-0000-4000-8000-000000000003', 'c6900000-0000-4000-8000-000000000001', 'b6900000-0000-4000-8000-000000000001',
   'a6900000-0000-4000-8000-000000000003', 'Olga Norte', null),
  ('d6900000-0000-4000-8000-000000000004', 'c6900000-0000-4000-8000-000000000001', 'b6900000-0000-4000-8000-000000000002',
   'a6900000-0000-4000-8000-000000000004', 'Omar Sur', null),
  ('d6900000-0000-4000-8000-000000000005', 'c6900000-0000-4000-8000-000000000001', 'b6900000-0000-4000-8000-000000000001',
   'a6900000-0000-4000-8000-000000000005', 'Otto Baja', now()),
  ('d6900000-0000-4000-8000-000000000007', 'c6900000-0000-4000-8000-000000000002', null,
   'a6900000-0000-4000-8000-000000000007', 'Xóchitl Equis', null);
insert into public.vehicles (id, company_id, business_unit_id, kind, plate, unit_type, capacity_kg) values
  ('e6900000-0000-4000-8000-000000000001', 'c6900000-0000-4000-8000-000000000001', 'b6900000-0000-4000-8000-000000000001',
   'rigid', 'RTR3001', 'dry_van', 12000);

-- ---------------------------------------------------------------------------
-- Catalog (D16-E3, D44)
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select owner_type::text, company_type::text, is_required, requires_expiry, shareable_with_shipper, archived_at is null
     from public.document_requirements where code = 'power_of_attorney' $$,
  $$ values ('company', null::text, false, false, false, true) $$,
  'the power of attorney is a company document for shippers and carriers, optional and private'
);
select results_eq(
  $$ select owner_type::text, company_type::text, is_required, requires_expiry, shareable_with_shipper, name
     from public.document_requirements where code = 'operator_selfie' $$,
  $$ values ('operator', 'carrier', true, false, false, 'Selfie') $$,
  'the selfie is a required operator document, private and without expiry (D44)'
);
select results_eq(
  $$ select name, optional_for from public.document_requirements where code = 'legal_representative_id' $$,
  $$ values ('INE del titular o representante legal', '{}'::public.company_type[]) $$,
  'the INE of the holder or the legal representative is no longer optional for shippers'
);
select results_eq(
  $$ select code from public.company_missing_requirements('c6900000-0000-4000-8000-000000000003') $$,
  $$ values ('tax_status_certificate'), ('legal_representative_id') $$,
  'a shipper is missing the constancia and the INE, never the optional power of attorney'
);
select tests.approved('d6900000-0000-4000-8000-000000000003', 'operator_official_id');
select tests.approved('d6900000-0000-4000-8000-000000000003', 'federal_driver_license');
select results_eq(
  $$ select code from public.operator_missing_requirements('d6900000-0000-4000-8000-000000000003') $$,
  $$ values ('operator_selfie') $$,
  'with the id and the license approved, the trip gate (R4) still asks for the selfie'
);

-- ---------------------------------------------------------------------------
-- Storage: the operator's own folder only
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a6900000-0000-4000-8000-000000000003');

select lives_ok(
  $$ select tests.upload(tests.path('c6900000-0000-4000-8000-000000000001', 'operator',
       'd6900000-0000-4000-8000-000000000003', 'f6900000-0000-4000-8000-000000000001')) $$,
  'an operator uploads a file to their own folder'
);
select throws_ok(
  $$ select tests.upload(tests.path('c6900000-0000-4000-8000-000000000001', 'operator',
       'd6900000-0000-4000-8000-000000000004', 'f6900000-0000-4000-8000-000000000002')) $$,
  '42501', null, 'an operator cannot upload to another operator''s folder of the same company'
);
select throws_ok(
  $$ select tests.upload(tests.path('c6900000-0000-4000-8000-000000000001', 'vehicle',
       'e6900000-0000-4000-8000-000000000001', 'f6900000-0000-4000-8000-000000000003')) $$,
  '42501', null, 'an operator cannot upload a unit''s document'
);
select throws_ok(
  $$ select tests.upload(tests.path('c6900000-0000-4000-8000-000000000001', 'company',
       'c6900000-0000-4000-8000-000000000001', 'f6900000-0000-4000-8000-000000000004')) $$,
  '42501', null, 'an operator cannot upload a company document'
);
select throws_ok(
  $$ select tests.upload(tests.path('c6900000-0000-4000-8000-000000000002', 'operator',
       'd6900000-0000-4000-8000-000000000003', 'f6900000-0000-4000-8000-000000000005')) $$,
  '42501', null, 'an operator cannot upload under another company''s folder, even with their own row id'
);
select throws_ok(
  $$ select tests.upload(tests.path('c6900000-0000-4000-8000-000000000002', 'operator',
       'd6900000-0000-4000-8000-000000000007', 'f6900000-0000-4000-8000-000000000006')) $$,
  '42501', null, 'an operator cannot upload to another company''s operator'
);
select throws_ok(
  $$ select tests.upload('c6900000-0000-4000-8000-000000000001/operator/d6900000-0000-4000-8000-000000000003/../x.jpg') $$,
  '42501', null, 'an operator cannot upload a file name outside the {uuid}[.ext] shape'
);

-- ---------------------------------------------------------------------------
-- submit_document as the operator
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.submit_document(tests.requirement('operator_selfie'), 'operator',
       'd6900000-0000-4000-8000-000000000003',
       tests.path('c6900000-0000-4000-8000-000000000001', 'operator', 'd6900000-0000-4000-8000-000000000003',
                  'f6900000-0000-4000-8000-000000000001'), 'selfie.jpg') $$,
  'an operator submits their own selfie'
);
select results_eq(
  $$ select status::text, submitted_by, mime_type from public.documents
     where owner_id = 'd6900000-0000-4000-8000-000000000003' and requirement_id = tests.requirement('operator_selfie') $$,
  $$ values ('pending_review', 'a6900000-0000-4000-8000-000000000003'::uuid, 'image/jpeg') $$,
  'the selfie waits for the admin, sent by the operator'
);
select throws_ok(
  $$ select public.submit_document(tests.requirement('operator_selfie'), 'operator',
       'd6900000-0000-4000-8000-000000000004',
       tests.path('c6900000-0000-4000-8000-000000000001', 'operator', 'd6900000-0000-4000-8000-000000000004',
                  'f6900000-0000-4000-8000-000000000010')) $$,
  '42501', 'owner does not belong to the caller company',
  'an operator cannot submit another operator''s document of the same company'
);
select throws_ok(
  $$ select public.submit_document(tests.requirement('vehicle_permit'), 'vehicle',
       'e6900000-0000-4000-8000-000000000001',
       tests.path('c6900000-0000-4000-8000-000000000001', 'vehicle', 'e6900000-0000-4000-8000-000000000001',
                  'f6900000-0000-4000-8000-000000000011'), null, now() + interval '1 year') $$,
  '42501', 'owner does not belong to the caller company',
  'an operator cannot submit a unit''s document'
);
select throws_ok(
  $$ select public.submit_document(tests.requirement('tax_status_certificate'), 'company',
       'c6900000-0000-4000-8000-000000000001',
       tests.path('c6900000-0000-4000-8000-000000000001', 'company', 'c6900000-0000-4000-8000-000000000001',
                  'f6900000-0000-4000-8000-000000000012')) $$,
  '42501', 'owner does not belong to the caller company',
  'an operator cannot submit a company document'
);
select throws_ok(
  $$ select public.submit_document(tests.requirement('operator_selfie'), 'operator',
       'd6900000-0000-4000-8000-000000000007',
       tests.path('c6900000-0000-4000-8000-000000000002', 'operator', 'd6900000-0000-4000-8000-000000000007',
                  'f6900000-0000-4000-8000-000000000013')) $$,
  '42501', 'owner does not belong to the caller company',
  'an operator cannot submit another company''s operator document (same message: nothing revealed)'
);
select throws_ok(
  $$ select public.submit_document(tests.requirement('tax_status_certificate'), 'operator',
       'd6900000-0000-4000-8000-000000000003',
       tests.path('c6900000-0000-4000-8000-000000000001', 'operator', 'd6900000-0000-4000-8000-000000000003',
                  'f6900000-0000-4000-8000-000000000001')) $$,
  '22023', 'requirement tax_status_certificate does not apply to this owner',
  'a company requirement cannot be filed under the operator'
);
select throws_ok(
  $$ select public.submit_document(tests.requirement('operator_selfie'), 'operator',
       'd6900000-0000-4000-8000-000000000003',
       tests.path('c6900000-0000-4000-8000-000000000001', 'operator', 'd6900000-0000-4000-8000-000000000003',
                  'f6900000-0000-4000-8000-000000000099')) $$,
  '22023', 'file was not uploaded',
  'a path without an uploaded file is refused'
);
select throws_ok(
  $$ select public.review_document((select id from public.documents
       where owner_id = 'd6900000-0000-4000-8000-000000000003' and status = 'pending_review'), 'approve') $$,
  '42501', null, 'an operator cannot review their own document'
);
select throws_ok(
  $$ update public.documents set status = 'approved' where owner_id = 'd6900000-0000-4000-8000-000000000003' $$,
  '42501', null, 'an operator cannot write the documents table'
);

-- What the operator reads.
select results_eq(
  $$ select count(*)::int, count(*) filter (where owner_type = 'operator'
                                              and owner_id = 'd6900000-0000-4000-8000-000000000003')::int
     from public.documents $$,
  $$ values (3, 3) $$,
  'an operator reads only the documents of their own row (id, license and selfie)'
);
select results_eq(
  $$ select count(*)::int from storage.objects where bucket_id = 'documents' $$,
  $$ values (1) $$,
  'and only the files of their own folder'
);
select ok(
  (select count(*) from public.document_requirements where code = 'operator_selfie') = 1,
  'an operator reads the requirement catalog'
);
reset role;

-- The manager uploads a document of Omar and a company document: Olga sees none of it.
select tests.login('a6900000-0000-4000-8000-000000000001');
set local role authenticated;
select tests.upload(tests.path('c6900000-0000-4000-8000-000000000001', 'operator',
  'd6900000-0000-4000-8000-000000000004', 'f6900000-0000-4000-8000-000000000020'));
select tests.upload(tests.path('c6900000-0000-4000-8000-000000000001', 'company',
  'c6900000-0000-4000-8000-000000000001', 'f6900000-0000-4000-8000-000000000021'));
select public.submit_document(tests.requirement('operator_selfie'), 'operator', 'd6900000-0000-4000-8000-000000000004',
  tests.path('c6900000-0000-4000-8000-000000000001', 'operator', 'd6900000-0000-4000-8000-000000000004',
             'f6900000-0000-4000-8000-000000000020'));
select public.submit_document(tests.requirement('tax_status_certificate'), 'company', 'c6900000-0000-4000-8000-000000000001',
  tests.path('c6900000-0000-4000-8000-000000000001', 'company', 'c6900000-0000-4000-8000-000000000001',
             'f6900000-0000-4000-8000-000000000021'));
select is(
  (select count(*)::int from public.documents where owner_id = 'd6900000-0000-4000-8000-000000000003'),
  3, 'the Gerente reads the operator''s documents, the selfie included'
);

select tests.login('a6900000-0000-4000-8000-000000000003');
select is(
  (select count(*)::int from public.documents where owner_id <> 'd6900000-0000-4000-8000-000000000003'),
  0, 'the operator does not read another operator''s or the company''s documents'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'documents'
     and name not like 'c6900000-0000-4000-8000-000000000001/operator/d6900000-0000-4000-8000-000000000003/%'),
  0, 'nor their files'
);

-- Omar (same company, other business unit) does not see Olga's.
select tests.login('a6900000-0000-4000-8000-000000000004');
select results_eq(
  $$ select count(*)::int, count(*) filter (where owner_id = 'd6900000-0000-4000-8000-000000000004')::int
     from public.documents $$,
  $$ values (1, 1) $$,
  'another operator of the company reads only their own selfie'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'documents'
     and name like '%/operator/d6900000-0000-4000-8000-000000000003/%'),
  0, 'and none of Olga''s files'
);

-- The coordinator of Norte reads Olga's selfie (her business unit), not Omar's (Sur).
select tests.login('a6900000-0000-4000-8000-000000000002');
select results_eq(
  $$ select owner_id from public.documents
     where requirement_id = tests.requirement('operator_selfie') order by owner_id $$,
  $$ values ('d6900000-0000-4000-8000-000000000003'::uuid) $$,
  'the coordinator reads the selfie of the operators of their business units only'
);

-- Another company's staff and operator, and a shipper, see nothing of Fletes R3.
select tests.login('a6900000-0000-4000-8000-000000000006');
select is(
  (select count(*)::int from public.documents where company_id = 'c6900000-0000-4000-8000-000000000001'),
  0, 'another carrier''s Gerente reads none of these documents'
);
select tests.login('a6900000-0000-4000-8000-000000000007');
select is(
  (select count(*)::int from public.documents) + (select count(*)::int from storage.objects where bucket_id = 'documents'),
  0, 'another carrier''s operator reads no document and no file'
);
select throws_ok(
  $$ select public.submit_document(tests.requirement('operator_selfie'), 'operator',
       'd6900000-0000-4000-8000-000000000003',
       tests.path('c6900000-0000-4000-8000-000000000001', 'operator', 'd6900000-0000-4000-8000-000000000003',
                  'f6900000-0000-4000-8000-000000000001')) $$,
  '42501', 'owner does not belong to the caller company',
  'another company''s operator cannot submit Olga''s document, even with her uploaded file'
);
select tests.login('a6900000-0000-4000-8000-000000000008');
select is(
  (select count(*)::int from public.documents where company_id = 'c6900000-0000-4000-8000-000000000001')
    + (select count(*)::int from storage.objects where name like 'c6900000-0000-4000-8000-000000000001/%'),
  0, 'a shipper reads none of the carrier''s documents or files'
);

-- An operator whose row was archived uploads and submits nothing.
select tests.login('a6900000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select tests.upload(tests.path('c6900000-0000-4000-8000-000000000001', 'operator',
       'd6900000-0000-4000-8000-000000000005', 'f6900000-0000-4000-8000-000000000030')) $$,
  '42501', null, 'an operator whose row was archived cannot upload'
);
select throws_ok(
  $$ select public.submit_document(tests.requirement('operator_selfie'), 'operator',
       'd6900000-0000-4000-8000-000000000005',
       tests.path('c6900000-0000-4000-8000-000000000001', 'operator', 'd6900000-0000-4000-8000-000000000005',
                  'f6900000-0000-4000-8000-000000000030')) $$,
  '42501', null, 'nor submit'
);
select is(
  (select count(*)::int from public.documents), 0, 'nor read any document'
);
reset role;

-- ---------------------------------------------------------------------------
-- A rejected company: the operator's upload does not send it back to review
-- ---------------------------------------------------------------------------
update public.companies set status = 'rejected', status_reason = 'Falta la constancia'
where id = 'c6900000-0000-4000-8000-000000000001';
select tests.login('a6900000-0000-4000-8000-000000000003');
set local role authenticated;
select tests.upload(tests.path('c6900000-0000-4000-8000-000000000001', 'operator',
  'd6900000-0000-4000-8000-000000000003', 'f6900000-0000-4000-8000-000000000040'));
select lives_ok(
  $$ select public.submit_document(tests.requirement('operator_selfie'), 'operator',
       'd6900000-0000-4000-8000-000000000003',
       tests.path('c6900000-0000-4000-8000-000000000001', 'operator', 'd6900000-0000-4000-8000-000000000003',
                  'f6900000-0000-4000-8000-000000000040')) $$,
  'an operator of a rejected company still sends their selfie'
);
select results_eq(
  $$ select count(*)::int, count(*) filter (where archived_at is null)::int from public.documents
     where owner_id = 'd6900000-0000-4000-8000-000000000003' and requirement_id = tests.requirement('operator_selfie') $$,
  $$ values (2, 1) $$,
  'the new selfie supersedes the pending one'
);
reset role;
select is(
  (select status::text from public.companies where id = 'c6900000-0000-4000-8000-000000000001'),
  'rejected', 'an operator''s upload does not move a rejected company back to review'
);

-- ---------------------------------------------------------------------------
-- The admin reviews the selfie by hand (D44) and the gate opens
-- ---------------------------------------------------------------------------
select tests.login('a6900000-0000-4000-8000-000000000009', 'aal1');
set local role authenticated;
select throws_ok(
  $$ select public.review_document((select id from public.documents
       where owner_id = 'd6900000-0000-4000-8000-000000000003' and requirement_id = tests.requirement('operator_selfie')
         and archived_at is null), 'approve') $$,
  '42501', null, 'an admin without the second factor cannot approve the selfie (R5)'
);
select tests.login('a6900000-0000-4000-8000-000000000009');
select is(
  public.review_document((select id from public.documents
    where owner_id = 'd6900000-0000-4000-8000-000000000003' and requirement_id = tests.requirement('operator_selfie')
      and archived_at is null), 'approve'),
  'approved'::public.verification_status,
  'the admin approves the selfie'
);
select is(
  (select review_source::text from public.documents
   where owner_id = 'd6900000-0000-4000-8000-000000000003' and requirement_id = tests.requirement('operator_selfie')
     and archived_at is null),
  'manual', 'the review is recorded as manual (D10-E1)'
);
select is_empty(
  $$ select code from public.operator_missing_requirements('d6900000-0000-4000-8000-000000000003') $$,
  'with the selfie approved, nothing of the operator is missing'
);
select throws_ok(
  $$ select public.review_document((select id from public.documents
       where owner_id = 'd6900000-0000-4000-8000-000000000004' and requirement_id = tests.requirement('operator_selfie')
         and archived_at is null), 'reject') $$,
  '22023', 'a rejection needs a reason', 'rejecting a selfie needs a reason'
);
select is(
  public.review_document((select id from public.documents
    where owner_id = 'd6900000-0000-4000-8000-000000000004' and requirement_id = tests.requirement('operator_selfie')
      and archived_at is null), 'reject', 'La foto no muestra tu cara'),
  'rejected'::public.verification_status,
  'the admin rejects a selfie with a reason'
);

select tests.login('a6900000-0000-4000-8000-000000000004');
select results_eq(
  $$ select status::text, review_notes from public.documents where requirement_id = tests.requirement('operator_selfie') $$,
  $$ values ('rejected', 'La foto no muestra tu cara') $$,
  'the operator reads the rejection and its reason'
);
reset role;

select * from finish();
rollback;
