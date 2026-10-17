-- Shipper trip tracking (B15): role x operation matrix of trip_documents and
-- the `trip-documents` bucket; add_trip_document (carrier only, uploaded file
-- required, idempotent, not on cancelled trips); shipper_trip_parties only
-- answers for the caller's own trips.
begin;
create extension if not exists pgtap with schema extensions;

select plan(36);

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
grant execute on all functions in schema tests to authenticated;

create table tests.vals (name text primary key, id uuid);
grant select, insert on tests.vals to authenticated;

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;
grant execute on function tests.val(text) to authenticated;

-- Path of a document file of a trip.
create function tests.doc_path(p_trip text, p_file text)
returns text
language sql
stable
as $$ select tests.val(p_trip)::text || '/' || p_file $$;
grant execute on function tests.doc_path(text, text) to authenticated;

-- Users: ...01 shipper S   ...02 shipper T   ...03 carrier A   ...04 carrier B
--        ...05 operator O of A   ...07 admin
select tests.new_user('a1500000-0000-4000-8000-000000000001', 'sara@s.test', 'shipper');
select tests.new_user('a1500000-0000-4000-8000-000000000002', 'tomas@t.test', 'shipper');
select tests.new_user('a1500000-0000-4000-8000-000000000003', 'ana@a.test', 'manager');
select tests.new_user('a1500000-0000-4000-8000-000000000004', 'beto@b.test', 'manager');
select tests.new_user('a1500000-0000-4000-8000-000000000005', 'oscar@a.test', 'operator');
select tests.new_user('a1500000-0000-4000-8000-000000000007', 'admin@x.test', 'shipper');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c1500000-0000-4000-8000-000000000001', 'shipper', 'Envíos Sigma SA de CV', 'ESI030303EF3', 'approved'),
  ('c1500000-0000-4000-8000-000000000002', 'shipper', 'Tiendas Tau SA de CV', 'TTA030303EF3', 'approved'),
  ('c1500000-0000-4000-8000-000000000003', 'carrier', 'Fletes Alfa SA de CV', 'FAL010101AB1', 'approved'),
  ('c1500000-0000-4000-8000-000000000004', 'carrier', 'Transportes Beta SA de CV', 'TBE020202CD2', 'approved');

update public.profiles p set company_id = c.id
from (values
  ('a1500000-0000-4000-8000-000000000001'::uuid, 'c1500000-0000-4000-8000-000000000001'::uuid),
  ('a1500000-0000-4000-8000-000000000002', 'c1500000-0000-4000-8000-000000000002'),
  ('a1500000-0000-4000-8000-000000000003', 'c1500000-0000-4000-8000-000000000003'),
  ('a1500000-0000-4000-8000-000000000004', 'c1500000-0000-4000-8000-000000000004'),
  ('a1500000-0000-4000-8000-000000000005', 'c1500000-0000-4000-8000-000000000003')
) as c(uid, id)
where p.id = c.uid;
update public.profiles set role = 'admin' where id = 'a1500000-0000-4000-8000-000000000007';

insert into public.operators (id, company_id, profile_id, full_name) values
  ('d1500000-0000-4000-8000-000000000005', 'c1500000-0000-4000-8000-000000000003',
   'a1500000-0000-4000-8000-000000000005', 'Óscar Operador');
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('e1500000-0000-4000-8000-000000000003', 'c1500000-0000-4000-8000-000000000003', 'rigid', 'AAA1111', 'dry_van', 30000);

-- Trip 1: S x A (assigned to O). Trip 2: T x B.
set local role authenticated;

select tests.login('a1500000-0000-4000-8000-000000000001');
insert into tests.vals select 'load1', public.create_load(tests.payload());
select public.publish_load(tests.val('load1'));
select tests.login('a1500000-0000-4000-8000-000000000002');
insert into tests.vals select 'load2', public.create_load(tests.payload());
select public.publish_load(tests.val('load2'));
select tests.login('a1500000-0000-4000-8000-000000000003');
insert into tests.vals select 'offer1', public.make_offer(tests.val('load1'), 3400000);
select tests.login('a1500000-0000-4000-8000-000000000004');
insert into tests.vals select 'offer2', public.make_offer(tests.val('load2'), 3300000);
select tests.login('a1500000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip1', public.accept_offer(tests.val('offer1'));
select tests.login('a1500000-0000-4000-8000-000000000002');
insert into tests.vals select 'trip2', public.accept_offer(tests.val('offer2'));
select tests.login('a1500000-0000-4000-8000-000000000003');
select public.assign_trip(tests.val('trip1'), 'e1500000-0000-4000-8000-000000000003',
                          'd1500000-0000-4000-8000-000000000005');

-- ---------------------------------------------------------------------------
-- Storage: only the carrier of the trip uploads, to {trip}/{uuid}.{ext}
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id, metadata)
     values ('trip-documents', tests.doc_path('trip1', 'b1500000-0000-4000-8000-000000000001.pdf'),
             'a1500000-0000-4000-8000-000000000003', '{"mimetype": "application/pdf", "size": 4096}') $$,
  'the carrier uploads a document to its trip folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('trip-documents', tests.doc_path('trip2', 'b1500000-0000-4000-8000-000000000002.pdf'),
             'a1500000-0000-4000-8000-000000000003') $$,
  '42501', null, 'a carrier cannot upload to another carrier''s trip'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('trip-documents', tests.doc_path('trip1', 'carta.exe'), 'a1500000-0000-4000-8000-000000000003') $$,
  '42501', null, 'document paths are {trip}/{uuid}.{pdf or image extension}'
);
select tests.login('a1500000-0000-4000-8000-000000000001');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('trip-documents', tests.doc_path('trip1', 'b1500000-0000-4000-8000-000000000003.pdf'),
             'a1500000-0000-4000-8000-000000000001') $$,
  '42501', null, 'the shipper cannot upload trip documents'
);
select tests.login('a1500000-0000-4000-8000-000000000005');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('trip-documents', tests.doc_path('trip1', 'b1500000-0000-4000-8000-000000000004.pdf'),
             'a1500000-0000-4000-8000-000000000005') $$,
  '42501', null, 'the operator cannot upload trip documents'
);

-- ---------------------------------------------------------------------------
-- add_trip_document
-- ---------------------------------------------------------------------------
select tests.login('a1500000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.add_trip_document(tests.val('trip1'), 'carta_porte',
       tests.doc_path('trip1', 'b1500000-0000-4000-8000-000000000001.pdf'), 'carta.pdf') $$,
  '42501', null, 'the shipper cannot register trip documents'
);
select tests.login('a1500000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select public.add_trip_document(tests.val('trip1'), 'carta_porte',
       tests.doc_path('trip1', 'b1500000-0000-4000-8000-000000000001.pdf'), 'carta.pdf') $$,
  '42501', null, 'the operator cannot register trip documents'
);
select tests.login('a1500000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.add_trip_document(tests.val('trip1'), 'carta_porte',
       tests.doc_path('trip1', 'b1500000-0000-4000-8000-000000000001.pdf'), 'carta.pdf') $$,
  '42501', null, 'another carrier cannot register documents of the trip'
);
select tests.login('a1500000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.add_trip_document(tests.val('trip1'), 'carta_porte',
       tests.doc_path('trip1', 'b1500000-0000-4000-8000-000000000009.pdf'), 'carta.pdf') $$,
  '22023', null, 'the file must have been uploaded'
);
select throws_ok(
  $$ select public.add_trip_document(tests.val('trip1'), 'carta_porte',
       tests.doc_path('trip2', 'b1500000-0000-4000-8000-000000000001.pdf'), 'carta.pdf') $$,
  '22023', null, 'the path must be in the trip folder'
);
select throws_ok(
  $$ select public.add_trip_document(tests.val('trip1'), 'carta_porte',
       tests.doc_path('trip1', 'b1500000-0000-4000-8000-000000000001.pdf'), '   ') $$,
  '22023', null, 'a file name is required'
);
select lives_ok(
  $$ insert into tests.vals select 'doc1', public.add_trip_document(tests.val('trip1'), 'carta_porte',
       tests.doc_path('trip1', 'b1500000-0000-4000-8000-000000000001.pdf'), ' Carta Porte.pdf ') $$,
  'the carrier registers the document it uploaded'
);
select results_eq(
  $$ select kind::text, file_name, mime_type, size_bytes, uploaded_by from public.trip_documents
     where id = tests.val('doc1') $$,
  $$ values ('carta_porte', 'Carta Porte.pdf', 'application/pdf', 4096::bigint,
             'a1500000-0000-4000-8000-000000000003'::uuid) $$,
  'the document keeps its kind, trimmed name and the file metadata'
);
select is(
  public.add_trip_document(tests.val('trip1'), 'other',
    tests.doc_path('trip1', 'b1500000-0000-4000-8000-000000000001.pdf'), 'otra.pdf'),
  tests.val('doc1'), 'registering the same file again returns the same document'
);
select throws_ok(
  $$ insert into public.trip_documents (trip_id, kind, storage_path, file_name)
     values (tests.val('trip1'), 'other', 'x', 'x') $$,
  '42501', null, 'clients cannot insert trip documents directly'
);
select throws_ok(
  $$ update public.trip_documents set file_name = 'x' where id = tests.val('doc1') $$,
  '42501', null, 'clients cannot update trip documents'
);
select throws_ok(
  $$ delete from public.trip_documents where id = tests.val('doc1') $$,
  '42501', null, 'clients cannot delete trip documents'
);

-- ---------------------------------------------------------------------------
-- Read matrix: the parties of the trip and admins, nobody else
-- ---------------------------------------------------------------------------
select tests.login('a1500000-0000-4000-8000-000000000001');
select is((select count(*) from public.trip_documents), 1::bigint, 'the shipper sees its trip documents');
select is(
  (select count(*) from storage.objects where bucket_id = 'trip-documents'), 1::bigint,
  'the shipper can read the document file'
);
select tests.login('a1500000-0000-4000-8000-000000000005');
select is((select count(*) from public.trip_documents), 1::bigint, 'the assigned operator sees the documents');
select tests.login('a1500000-0000-4000-8000-000000000007');
select is((select count(*) from public.trip_documents), 1::bigint, 'admins see the documents');
select tests.login('a1500000-0000-4000-8000-000000000002');
select is((select count(*) from public.trip_documents), 0::bigint, 'another shipper does not see them');
select is(
  (select count(*) from storage.objects where bucket_id = 'trip-documents'), 0::bigint,
  'another shipper cannot read the file'
);
select tests.login('a1500000-0000-4000-8000-000000000004');
select is((select count(*) from public.trip_documents), 0::bigint, 'another carrier does not see them');

reset role;
set local role anon;
select throws_ok(
  $$ select count(*) from public.trip_documents $$, '42501', null, 'anon cannot read trip documents'
);
reset role;
set local role authenticated;

-- ---------------------------------------------------------------------------
-- shipper_trip_parties
-- ---------------------------------------------------------------------------
select tests.login('a1500000-0000-4000-8000-000000000001');
select results_eq(
  $$ select trip_id, carrier_legal_name, carrier_status::text, unit_type::text, plate, operator_name
     from public.shipper_trip_parties(array[tests.val('trip1'), tests.val('trip2')]) $$,
  $$ values (tests.val('trip1'), 'Fletes Alfa SA de CV', 'approved', 'dry_van', 'AAA1111', 'Óscar Operador') $$,
  'the shipper gets the carrier, unit and operator of its own trips only'
);
select tests.login('a1500000-0000-4000-8000-000000000003');
select is(
  (select count(*) from public.shipper_trip_parties(array[tests.val('trip1')])), 0::bigint,
  'the carrier gets nothing (it reads its own fleet directly)'
);
select tests.login('a1500000-0000-4000-8000-000000000007');
select is(
  (select count(*) from public.shipper_trip_parties(array[tests.val('trip1'), tests.val('trip2')])), 2::bigint,
  'admins get every trip'
);
select throws_ok(
  $$ select * from public.shipper_trip_parties(array_fill(gen_random_uuid(), array[101])) $$,
  '22023', null, 'at most 100 trips per call'
);

-- ---------------------------------------------------------------------------
-- Immutable for every role, the table owner included
-- ---------------------------------------------------------------------------
reset role;
select throws_ok(
  $$ update public.trip_documents set file_name = 'x' where id = tests.val('doc1') $$,
  '42501', null, 'not even the owner updates a trip document'
);
select throws_ok(
  $$ delete from public.trip_documents where id = tests.val('doc1') $$,
  '42501', null, 'not even the owner deletes a trip document'
);
select throws_ok(
  $$ update public.trip_documents set uploaded_by = null, file_name = 'x' where id = tests.val('doc1') $$,
  '42501', null, 'clearing the uploader does not open the other columns'
);

-- Deleting the uploader's account only clears uploaded_by (on delete set null).
select tests.new_user('a1500000-0000-4000-8000-000000000008', 'eva@a.test', 'manager');
update public.profiles set company_id = 'c1500000-0000-4000-8000-000000000003'
where id = 'a1500000-0000-4000-8000-000000000008';
set local role authenticated;
select tests.login('a1500000-0000-4000-8000-000000000008');
insert into storage.objects (bucket_id, name, owner_id)
values ('trip-documents', tests.doc_path('trip1', 'b1500000-0000-4000-8000-000000000008.pdf'),
        'a1500000-0000-4000-8000-000000000008');
insert into tests.vals select 'doc8', public.add_trip_document(tests.val('trip1'), 'other',
  tests.doc_path('trip1', 'b1500000-0000-4000-8000-000000000008.pdf'), 'factura.pdf');
reset role;
select lives_ok(
  $$ delete from auth.users where id = 'a1500000-0000-4000-8000-000000000008' $$,
  'the uploader''s account can be deleted'
);
select results_eq(
  $$ select uploaded_by, file_name from public.trip_documents where id = tests.val('doc8') $$,
  $$ values (null::uuid, 'factura.pdf') $$,
  'the document stays, without its uploader'
);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Cancelled trips take no new documents
-- ---------------------------------------------------------------------------
select tests.login('a1500000-0000-4000-8000-000000000004');
select public.cancel_trip(tests.val('trip2'), 'Ya no se necesita');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('trip-documents', tests.doc_path('trip2', 'b1500000-0000-4000-8000-000000000005.pdf'),
             'a1500000-0000-4000-8000-000000000004') $$,
  '42501', null, 'nobody uploads documents to a cancelled trip'
);
reset role;
insert into storage.objects (bucket_id, name, owner_id)
values ('trip-documents', tests.doc_path('trip2', 'b1500000-0000-4000-8000-000000000006.pdf'),
        'a1500000-0000-4000-8000-000000000004');
set local role authenticated;
select throws_ok(
  $$ select public.add_trip_document(tests.val('trip2'), 'carta_porte',
       tests.doc_path('trip2', 'b1500000-0000-4000-8000-000000000006.pdf'), 'carta.pdf') $$,
  '55000', null, 'a cancelled trip takes no new documents'
);

select * from finish();
rollback;
