-- I5 · Freight invoices (CFDI) (D37):
--   * privileges: no client writes; the uploader column out of reach; not in
--     Realtime; the service RPCs only for the service role;
--   * Fulmis' fiscal data: read by every signed-in user, written by admins,
--     validated and normalized;
--   * who uploads: the carrier's CFDI, the Gerente or a Coordinador of the
--     trip's business unit (not another unit, the operator, another carrier,
--     the shipper nor the admin); Fulmis' CFDI, only the admin;
--   * the rules: issuer, receiver (only with fulmis.rfc; else "Sin
--     validar"), total ± 1 cent, MXN, unique UUID, one per side, no
--     cancelled trip, client terms first; checked again when recording;
--   * the client's side: pending → invoiced; overdue, paid and written_off
--     keep their status; the admin's upload is audited;
--   * the read matrix by side and role, for the rows and the bucket: each
--     side only its own direction (I.0.3); no client uploads to the bucket.
begin;
create extension if not exists pgtap with schema extensions;

select plan(75);

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
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@i5.test', now(),
          case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end,
          jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create table tests.vals (name text primary key, id uuid);
grant select, insert on tests.vals to authenticated, service_role;

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

-- A contracted trip: p_shipper publishes a load, p_offerer offers p_amount
-- with p_vehicle and p_shipper accepts. Returns the trip.
create function tests.trip(p_shipper uuid, p_offerer uuid, p_vehicle uuid, p_amount bigint)
returns uuid
language plpgsql
as $$
declare
  v_load uuid;
  v_offer uuid;
  v_trip uuid;
begin
  perform tests.login(p_shipper);
  execute 'set local role authenticated';
  v_load := public.create_load(jsonb_build_object(
    'origin', jsonb_build_object('address', 'Av. Constitución 100', 'city', 'Monterrey', 'state', 'Nuevo León',
                                 'lat', 25.6866, 'lng', -100.3161),
    'destination', jsonb_build_object('address', 'Blvd. Venustiano Carranza 200', 'city', 'Saltillo',
                                      'state', 'Coahuila', 'lat', 25.4383, 'lng', -100.9737),
    'pickupWindow', jsonb_build_object('start', now() + interval '1 day', 'end', now() + interval '1 day 4 hours'),
    'deliveryWindow', jsonb_build_object('start', now() + interval '2 days', 'end', now() + interval '2 days 6 hours'),
    'cargoType', 'palletized', 'description', 'Tarimas', 'weightKg', 8000, 'unitType', 'dry_van',
    'specialRequirements', jsonb_build_array(), 'proposedPriceCents', p_amount
  ));
  perform public.publish_load(v_load);
  perform tests.login(p_offerer);
  v_offer := public.make_offer(v_load, p_amount, null, p_vehicle);
  perform tests.login(p_shipper);
  v_trip := public.accept_offer(v_offer);
  execute 'reset role';
  return v_trip;
end;
$$;

-- How many rows of p_sql p_uid sees.
create function tests.sees(p_uid uuid, p_sql text)
returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  perform tests.login(p_uid);
  execute 'set local role authenticated';
  execute format('select count(*) from (%s) x', p_sql) into v_count;
  execute 'reset role';
  return v_count;
end;
$$;

-- As the Edge Functions: the service role.
create function tests.as_service()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  execute 'set local role service_role';
end;
$$;

-- The failures check_freight_invoice_service gives (as the service role).
create function tests.check(p_user uuid, p_trip uuid, p_direction text, p_uuid uuid, p_issuer text,
                            p_receiver text, p_total bigint, p_currency text default 'MXN')
returns text
language plpgsql
as $$
declare
  v jsonb;
begin
  perform tests.as_service();
  v := public.check_freight_invoice_service(p_user, p_trip, p_direction::public.freight_invoice_direction, p_uuid,
                                            p_issuer, p_receiver, p_total, p_currency);
  execute 'reset role';
  return (v -> 'failures')::text || ' ' || (v ->> 'validation');
end;
$$;

-- Records an invoice as the service role; returns its validation.
create function tests.record(p_user uuid, p_trip uuid, p_direction text, p_uuid uuid, p_issuer text,
                             p_receiver text, p_total bigint, p_pdf boolean default true)
returns text
language plpgsql
as $$
declare
  v jsonb;
begin
  perform tests.as_service();
  v := public.record_freight_invoice_service(
    p_user, p_trip, p_direction::public.freight_invoice_direction, p_uuid, p_issuer, p_receiver, p_total, 'MXN',
    '2026-11-06T10:00:00', p_trip || '/' || p_direction || '/' || gen_random_uuid() || '.xml',
    case when p_pdf then p_trip || '/' || p_direction || '/' || gen_random_uuid() || '.pdf' end
  );
  execute 'reset role';
  return v ->> 'validation';
end;
$$;

-- The admin records Fulmis' CFDI of p_trip dated p_issued_at, as the service
-- role; returns the SQLSTATE and detail of the refusal ('ok' if taken).
create function tests.record_at(p_trip uuid, p_issued_at timestamp)
returns text
language plpgsql
as $$
declare
  v_state text;
  v_detail text;
begin
  perform tests.as_service();
  begin
    perform public.record_freight_invoice_service(
      'a5500000-0000-4000-8000-000000000008', p_trip, 'fulmis_to_client', gen_random_uuid(), 'FUL201015AB1',
      'EFA050505GH5', 1000000, 'MXN', p_issued_at,
      p_trip || '/fulmis_to_client/' || gen_random_uuid() || '.xml',
      p_trip || '/fulmis_to_client/' || gen_random_uuid() || '.pdf'
    );
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_detail = pg_exception_detail;
    execute 'reset role';
    return v_state || ' ' || coalesce(v_detail, '');
  end;
  execute 'reset role';
  return 'ok';
end;
$$;

-- A column of a trip's ledger, as the owner.
create function tests.ledger(p_trip uuid, p_column text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  execute format('select (%I)::text from public.freight_ledgers where trip_id = $1', p_column) into v using p_trip;
  return v;
end;
$$;

grant execute on all functions in schema tests to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures. Users a55…: 01 S shipper, 02 T another shipper, 03 M manager,
-- 04 A coordinator of unit A, 05 B coordinator of unit B, 06 O operator
-- (unit A), 07 X manager of another carrier, 08 Z admin.
-- ---------------------------------------------------------------------------
select tests.new_user('a5500000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a5500000-0000-4000-8000-000000000002', 'shipper');
select tests.new_user('a5500000-0000-4000-8000-000000000003', 'manager');
select tests.new_user('a5500000-0000-4000-8000-000000000004', 'coordinator');
select tests.new_user('a5500000-0000-4000-8000-000000000005', 'coordinator');
select tests.new_user('a5500000-0000-4000-8000-000000000006', 'operator');
select tests.new_user('a5500000-0000-4000-8000-000000000007', 'manager');
select tests.new_user('a5500000-0000-4000-8000-000000000008', 'shipper');
update public.profiles set role = 'admin' where id = 'a5500000-0000-4000-8000-000000000008';

insert into public.companies (id, type, legal_name, rfc, status, payment_terms_days) values
  ('c5500000-0000-4000-8000-000000000001', 'shipper', 'Envíos Factura SA de CV', 'EFA050505GH5', 'approved', 30),
  ('c5500000-0000-4000-8000-000000000004', 'shipper', 'Envíos Otros SA de CV', 'EOF050505GH6', 'approved', 30),
  ('c5500000-0000-4000-8000-000000000005', 'shipper', 'Envíos Sin Plazo SA de CV', 'ESP050505GH7', 'approved', null);
insert into public.companies (id, type, legal_name, rfc, status) values
  ('c5500000-0000-4000-8000-000000000002', 'carrier', 'Fletes Factura SA de CV', 'FFA040404CD4', 'approved'),
  ('c5500000-0000-4000-8000-000000000003', 'carrier', 'Fletes Ajenos SA de CV', 'FAF040404CD5', 'approved');
update public.profiles set company_id = 'c5500000-0000-4000-8000-000000000001'
where id = 'a5500000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c5500000-0000-4000-8000-000000000004'
where id = 'a5500000-0000-4000-8000-000000000002';
update public.profiles set company_id = 'c5500000-0000-4000-8000-000000000002'
where id in ('a5500000-0000-4000-8000-000000000003', 'a5500000-0000-4000-8000-000000000004',
             'a5500000-0000-4000-8000-000000000005', 'a5500000-0000-4000-8000-000000000006');
update public.profiles set company_id = 'c5500000-0000-4000-8000-000000000003'
where id = 'a5500000-0000-4000-8000-000000000007';

insert into tests.vals select 'bu_a', id from public.business_units where company_id = 'c5500000-0000-4000-8000-000000000002';
insert into public.business_units (id, company_id, name)
values ('b5500000-0000-4000-8000-00000000000b', 'c5500000-0000-4000-8000-000000000002', 'Unidad B');
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id) values
  (tests.val('bu_a'), 'c5500000-0000-4000-8000-000000000002', 'a5500000-0000-4000-8000-000000000004'),
  ('b5500000-0000-4000-8000-00000000000b', 'c5500000-0000-4000-8000-000000000002', 'a5500000-0000-4000-8000-000000000005');

insert into public.operators (id, company_id, business_unit_id, profile_id, full_name, license_type, license_expires_on) values
  ('d5500000-0000-4000-8000-000000000006', 'c5500000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'a5500000-0000-4000-8000-000000000006', 'Óscar Factura', 'E', current_date + 365);
insert into public.vehicles (id, company_id, business_unit_id, kind, plate, unit_type, capacity_kg) values
  ('e5500000-0000-4000-8000-00000000000a', 'c5500000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'rigid', 'HFA5501', 'dry_van', 30000);
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'c5500000-0000-4000-8000-000000000002'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- Trips of $10,000 (3 %: $9,700 net) in unit A; one of a shipper without terms.
insert into tests.vals select 'trip1', tests.trip('a5500000-0000-4000-8000-000000000001',
  'a5500000-0000-4000-8000-000000000004', 'e5500000-0000-4000-8000-00000000000a', 1000000);
insert into tests.vals select 'trip2', tests.trip('a5500000-0000-4000-8000-000000000001',
  'a5500000-0000-4000-8000-000000000004', 'e5500000-0000-4000-8000-00000000000a', 1000000);
insert into tests.vals select 'trip3', tests.trip('a5500000-0000-4000-8000-000000000001',
  'a5500000-0000-4000-8000-000000000004', 'e5500000-0000-4000-8000-00000000000a', 1000000);
insert into tests.vals select 'trip4', tests.trip('a5500000-0000-4000-8000-000000000001',
  'a5500000-0000-4000-8000-000000000004', 'e5500000-0000-4000-8000-00000000000a', 1000000);
update public.profiles set company_id = 'c5500000-0000-4000-8000-000000000005'
where id = 'a5500000-0000-4000-8000-000000000002';
insert into tests.vals select 'trip_noterms', tests.trip('a5500000-0000-4000-8000-000000000002',
  'a5500000-0000-4000-8000-000000000004', 'e5500000-0000-4000-8000-00000000000a', 1000000);
update public.profiles set company_id = 'c5500000-0000-4000-8000-000000000004'
where id = 'a5500000-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select ok(
  not has_table_privilege('anon', 'public.freight_invoices', 'select,insert,update,delete'),
  'anon has no privileges on freight_invoices'
);
select ok(
  not has_table_privilege('authenticated', 'public.freight_invoices', 'insert,update,delete,truncate'),
  'signed-in users cannot write freight_invoices (only the service RPC)'
);
select ok(
  not has_column_privilege('authenticated', 'public.freight_invoices', 'uploaded_by', 'select')
  and has_column_privilege('authenticated', 'public.freight_invoices', 'cfdi_uuid', 'select'),
  'the uploader is out of the clients'' reach'
);
select is_empty(
  $$ select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'freight_invoices' $$,
  'freight_invoices is not sent by Realtime'
);
select ok(
  not has_function_privilege('authenticated',
    'public.record_freight_invoice_service(uuid, uuid, public.freight_invoice_direction, uuid, text, text, bigint, text, timestamp, text, text, text)', 'execute')
  and not has_function_privilege('authenticated',
    'public.check_freight_invoice_service(uuid, uuid, public.freight_invoice_direction, uuid, text, text, bigint, text)', 'execute')
  and not has_function_privilege('anon',
    'public.record_freight_invoice_service(uuid, uuid, public.freight_invoice_direction, uuid, text, text, bigint, text, timestamp, text, text, text)', 'execute')
  and has_function_privilege('service_role',
    'public.record_freight_invoice_service(uuid, uuid, public.freight_invoice_direction, uuid, text, text, bigint, text, timestamp, text, text, text)', 'execute'),
  'only the service role runs the invoice RPCs'
);

-- Even the admin cannot register an invoice without the Edge Function.
set local role authenticated;
select tests.login('a5500000-0000-4000-8000-000000000008');
select throws_ok(
  format($$ select public.record_freight_invoice_service('a5500000-0000-4000-8000-000000000008', %L,
       'fulmis_to_client', gen_random_uuid(), 'FUL201015AB1', 'EFA050505GH5', 1000000, 'MXN',
       '2026-11-06T10:00:00', %L, %L) $$,
    tests.val('trip1'), tests.val('trip1') || '/fulmis_to_client/' || gen_random_uuid() || '.xml',
    tests.val('trip1') || '/fulmis_to_client/' || gen_random_uuid() || '.pdf'),
  '42501', null, 'a signed-in admin cannot call the record RPC directly'
);
reset role;
-- The service role check inside the function, on top of the grant.
select throws_ok(
  format($$ select public.check_freight_invoice_service('a5500000-0000-4000-8000-000000000008', %L,
       'fulmis_to_client', gen_random_uuid(), 'X', 'Y', 1, 'MXN') $$, tests.val('trip1')),
  '42501', null, 'the RPCs check the service role claim themselves'
);

-- ---------------------------------------------------------------------------
-- Fulmis' fiscal data
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.platform_settings where key like 'fulmis.%' and value = 'null'::jsonb), 4,
  'the four fulmis.* settings start empty (the legal entity is in process)'
);
select is(tests.sees('a5500000-0000-4000-8000-000000000003',
  $$ select 1 from public.platform_settings where key like 'fulmis.%' $$), 4::bigint,
  'a carrier reads Fulmis'' fiscal data (it invoices Fulmis)');

set local role authenticated;
select tests.login('a5500000-0000-4000-8000-000000000003');
select throws_ok($$ select public.admin_set_platform_setting('fulmis.rfc', '"FUL201015AB1"') $$, '42501', null,
  'only admins set Fulmis'' fiscal data');
select tests.login('a5500000-0000-4000-8000-000000000008');
select throws_ok($$ select public.admin_set_platform_setting('fulmis.rfc', '"FUL2010"') $$, '22023', null,
  'a malformed RFC is refused');
select throws_ok($$ select public.admin_set_platform_setting('fulmis.tax_regime', '"60"') $$, '22023', null,
  'a tax regime is three digits');
select throws_ok($$ select public.admin_set_platform_setting('fulmis.zip', '64000') $$, '22023', null,
  'a zip is a string of five digits');
select throws_ok(format($$ select public.admin_set_platform_setting('fulmis.legal_name', %L) $$,
    to_jsonb(repeat('x', 301))::text), '22023', null,
  'a legal name has at most 300 characters');
select lives_ok($$ select public.admin_set_platform_setting('fulmis.legal_name', '"  Fulmis, S.A.P.I. de C.V. "') $$,
  'the admin sets the legal name');
select lives_ok($$ select public.admin_set_platform_setting('fulmis.zip', '"64000"') $$, 'the admin sets the zip');
reset role;
select is((select value #>> '{}' from public.platform_settings where key = 'fulmis.legal_name'),
  'Fulmis, S.A.P.I. de C.V.', 'the legal name is saved trimmed');

-- ---------------------------------------------------------------------------
-- The carrier's CFDI to Fulmis, without Fulmis' RFC: "Sin validar"
-- ---------------------------------------------------------------------------
select is(
  tests.check('a5500000-0000-4000-8000-000000000004', tests.val('trip1'), 'carrier_to_fulmis',
              'f5500000-0000-4000-8000-000000000001', 'FFA040404CD4', 'XAXX010101000', 970000),
  '[] unvalidated',
  'without fulmis.rfc the receiver is not checked and the invoice would be "Sin validar"'
);
select is(
  tests.check('a5500000-0000-4000-8000-000000000004', tests.val('trip1'), 'carrier_to_fulmis',
              'f5500000-0000-4000-8000-000000000001', 'FAF040404CD5', 'XAXX010101000', 970002, 'USD'),
  '["issuer_mismatch", "total_mismatch", "currency"] unvalidated',
  'another issuer, a total 2 cents off and another currency are each refused'
);
select is(
  tests.check('a5500000-0000-4000-8000-000000000003', tests.val('trip1'), 'carrier_to_fulmis',
              'f5500000-0000-4000-8000-000000000001', 'ffa040404cd4', 'XAXX010101000', 969999),
  '[] unvalidated',
  'one cent off is accepted, and the RFC is compared in capitals'
);

-- Who may upload it.
select throws_ok(
  format($$ select tests.check('a5500000-0000-4000-8000-000000000005', %L, 'carrier_to_fulmis',
         gen_random_uuid(), 'FFA040404CD4', 'X', 970000) $$, tests.val('trip1')),
  '42501', null, 'a coordinator of another business unit cannot upload it'
);
select throws_ok(
  format($$ select tests.check('a5500000-0000-4000-8000-000000000006', %L, 'carrier_to_fulmis',
         gen_random_uuid(), 'FFA040404CD4', 'X', 970000) $$, tests.val('trip1')),
  '42501', null, 'the operator cannot upload it'
);
select throws_ok(
  format($$ select tests.check('a5500000-0000-4000-8000-000000000007', %L, 'carrier_to_fulmis',
         gen_random_uuid(), 'FFA040404CD4', 'X', 970000) $$, tests.val('trip1')),
  '42501', null, 'the manager of another carrier cannot upload it'
);
select throws_ok(
  format($$ select tests.check('a5500000-0000-4000-8000-000000000001', %L, 'carrier_to_fulmis',
         gen_random_uuid(), 'FFA040404CD4', 'X', 970000) $$, tests.val('trip1')),
  '42501', null, 'the shipper cannot upload the carrier''s invoice'
);
select throws_ok(
  format($$ select tests.check('a5500000-0000-4000-8000-000000000008', %L, 'carrier_to_fulmis',
         gen_random_uuid(), 'FFA040404CD4', 'X', 970000) $$, tests.val('trip1')),
  '42501', null, 'the admin does not upload the carrier''s invoice for it'
);
select throws_ok(
  $$ select tests.check('a5500000-0000-4000-8000-000000000003', gen_random_uuid(), 'carrier_to_fulmis',
         gen_random_uuid(), 'FFA040404CD4', 'X', 970000) $$,
  '42501', null, 'an unknown trip gets the same answer'
);

select is(
  tests.record('a5500000-0000-4000-8000-000000000004', tests.val('trip1'), 'carrier_to_fulmis',
               'f5500000-0000-4000-8000-000000000001', 'FFA040404CD4', 'XAXX010101000', 970000, false),
  'unvalidated', 'the coordinator of the unit registers the carrier''s CFDI, without its PDF, "Sin validar"'
);
select results_eq(
  format($$ select direction::text, issuer_rfc, total_cents, uploaded_by, pdf_path is null
            from public.freight_invoices where trip_id = %L $$, tests.val('trip1')),
  $$ values ('carrier_to_fulmis', 'FFA040404CD4', 970000::bigint, 'a5500000-0000-4000-8000-000000000004'::uuid, true) $$,
  'the invoice keeps the issuer, the total and who uploaded it'
);
select is(tests.ledger(tests.val('trip1'), 'client_status'), 'pending',
  'the carrier''s invoice does not change what the client owes');
select is(
  tests.check('a5500000-0000-4000-8000-000000000003', tests.val('trip1'), 'carrier_to_fulmis',
              gen_random_uuid(), 'FFA040404CD4', 'X', 970000),
  '["already_invoiced"] unvalidated', 'one carrier invoice per trip'
);
select throws_ok(
  format($$ select tests.record('a5500000-0000-4000-8000-000000000003', %L, 'carrier_to_fulmis',
         gen_random_uuid(), 'FFA040404CD4', 'X', 970000) $$, tests.val('trip1')),
  '22023', 'invalid invoice', 'recording it again is refused too'
);
select is(
  tests.check('a5500000-0000-4000-8000-000000000003', tests.val('trip2'), 'carrier_to_fulmis',
              'f5500000-0000-4000-8000-000000000001', 'FFA040404CD4', 'X', 970000),
  '["uuid_taken"] unvalidated', 'a UUID already registered on another trip is refused'
);

-- With Fulmis' RFC set, the receiver is checked and the invoice is validated.
set local role authenticated;
select tests.login('a5500000-0000-4000-8000-000000000008');
select lives_ok($$ select public.admin_set_platform_setting('fulmis.rfc', '" ful201015ab1 "') $$,
  'the admin sets Fulmis'' RFC (saved trimmed, in capitals)');
reset role;
select is(
  tests.check('a5500000-0000-4000-8000-000000000003', tests.val('trip2'), 'carrier_to_fulmis',
              gen_random_uuid(), 'FFA040404CD4', 'EFA050505GH5', 970000),
  '["receiver_mismatch"] validated', 'an invoice to someone else than Fulmis is refused'
);
select is(
  tests.record('a5500000-0000-4000-8000-000000000003', tests.val('trip2'), 'carrier_to_fulmis',
               'f5500000-0000-4000-8000-000000000002', 'FFA040404CD4', 'FUL201015AB1', 970000),
  'validated', 'the Gerente registers a CFDI to Fulmis: validated'
);
select throws_ok(
  format($$ select tests.record('a5500000-0000-4000-8000-000000000003', %L, 'carrier_to_fulmis',
         gen_random_uuid(), 'FFA040404CD4', 'EFA050505GH5', 970000) $$, tests.val('trip3')),
  '22023', 'invalid invoice', 'the record RPC checks the rules again'
);

-- ---------------------------------------------------------------------------
-- Fulmis' CFDI to the client (the admin, manual provider)
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ select tests.check('a5500000-0000-4000-8000-000000000003', %L, 'fulmis_to_client',
         gen_random_uuid(), 'FUL201015AB1', 'EFA050505GH5', 1000000) $$, tests.val('trip1')),
  '42501', null, 'only the admin uploads Fulmis'' invoice to the client'
);
select is(
  tests.check('a5500000-0000-4000-8000-000000000008', tests.val('trip1'), 'fulmis_to_client',
              gen_random_uuid(), 'FFA040404CD4', 'EOF050505GH6', 970000),
  '["issuer_mismatch", "receiver_mismatch", "total_mismatch"] validated',
  'the issuer must be Fulmis, the receiver the client and the total the client amount'
);
select is(
  tests.check('a5500000-0000-4000-8000-000000000008', tests.val('trip_noterms'), 'fulmis_to_client',
              gen_random_uuid(), 'FUL201015AB1', 'ESP050505GH7', 1000000),
  '["terms_missing"] validated', 'a client without terms is not invoiced until the admin sets them'
);
select throws_ok(
  format($$ select tests.record('a5500000-0000-4000-8000-000000000008', %L, 'fulmis_to_client',
         gen_random_uuid(), 'FUL201015AB1', 'EFA050505GH5', 1000000, false) $$, tests.val('trip1')),
  '23514', null, 'Fulmis'' invoice always has its PDF (the client downloads it)'
);
select tests.as_service();
select throws_ok(
  format($$ select public.record_freight_invoice_service('a5500000-0000-4000-8000-000000000008', %L,
       'fulmis_to_client', gen_random_uuid(), 'FUL201015AB1', 'EFA050505GH5', 1000000, 'MXN',
       '2026-11-06T10:00:00', %L, %L) $$,
    tests.val('trip1'), tests.val('trip2') || '/fulmis_to_client/' || gen_random_uuid() || '.xml',
    tests.val('trip1') || '/fulmis_to_client/' || gen_random_uuid() || '.pdf'),
  '23514', null, 'a file path of another trip is refused'
);
reset role;
-- The CFDI's date within a plausible range (I5-fix-1): from CFDI 4.0 (2022)
-- to a day past now, in Mexico City. 9999-12-31 after 18:00 is year 10000 in
-- UTC, which the apps cannot read back.
select is(tests.record_at(tests.val('trip1'), '9999-12-31T23:59:59'), '22023 issued_at',
  'a CFDI dated 9999-12-31 (year 10000 in UTC) is refused, with its code');
select is(tests.record_at(tests.val('trip1'), '0100-01-01T00:00:00'), '22023 issued_at',
  'a CFDI dated in year 0100 is refused');
select is(tests.record_at(tests.val('trip1'), '2021-12-31T23:59:59'), '22023 issued_at',
  'a CFDI dated before CFDI 4.0 (2022) is refused');
select is(tests.record_at(tests.val('trip1'), (now() at time zone 'America/Mexico_City') + interval '25 hours'),
  '22023 issued_at', 'a CFDI dated more than a day in the future is refused');
select is((select count(*)::int from public.freight_invoices
           where trip_id = tests.val('trip1') and direction = 'fulmis_to_client'), 0,
  'no refused date registered an invoice');
select throws_ok(
  format($$ insert into public.freight_invoices (trip_id, direction, cfdi_uuid, issuer_rfc, receiver_rfc,
              total_cents, currency, issued_at, validation, xml_path, pdf_path)
            values (%L, 'fulmis_to_client', gen_random_uuid(), 'FUL201015AB1', 'EFA050505GH5', 1000000, 'MXN',
              '10000-01-01 05:59:59+00', 'validated', %L, %L) $$,
    tests.val('trip1'), tests.val('trip1') || '/fulmis_to_client/' || gen_random_uuid() || '.xml',
    tests.val('trip1') || '/fulmis_to_client/' || gen_random_uuid() || '.pdf'),
  '23514', null, 'the table refuses a date out of range too (freight_invoices_issued_at_range)'
);
select is(
  tests.record('a5500000-0000-4000-8000-000000000008', tests.val('trip1'), 'fulmis_to_client',
               'f5500000-0000-4000-8000-000000000011', 'FUL201015AB1', 'EFA050505GH5', 1000000),
  'validated', 'the admin registers Fulmis'' CFDI to the client'
);
select is(tests.ledger(tests.val('trip1'), 'client_status'), 'invoiced',
  'registering it moves the client''s side from pending to invoiced');
select is(
  (select count(*)::int from public.audit_log
   where table_name = 'freight_invoices' and actor_id = 'a5500000-0000-4000-8000-000000000008'
     and company_id = 'c5500000-0000-4000-8000-000000000001'),
  1, 'the admin''s upload is audited as theirs'
);
select is(tests.ledger(tests.val('trip1'), 'carrier_status'), 'pending',
  'the client''s invoice does not change what the carrier is owed');

-- A paid, an overdue and a written-off client keep their status.
set local role authenticated;
select tests.login('a5500000-0000-4000-8000-000000000008');
select public.admin_record_freight_payment(tests.val('trip2'), 'client_to_fulmis', 1000000,
  public.freight_today(), 'I5PAID0001');
reset role;
select is(tests.ledger(tests.val('trip2'), 'client_status'), 'paid', 'the client paid trip 2');
select is(
  tests.record('a5500000-0000-4000-8000-000000000008', tests.val('trip2'), 'fulmis_to_client',
               'f5500000-0000-4000-8000-000000000012', 'FUL201015AB1', 'EFA050505GH5', 1000000),
  'validated', 'a paid trip can still get its invoice'
);
select is(tests.ledger(tests.val('trip2'), 'client_status'), 'paid',
  'a paid trip stays paid when its invoice is linked');

update public.freight_ledgers set client_status = 'overdue', client_due_on = current_date - 1,
  client_terms_days = 30
where trip_id = tests.val('trip3');
select tests.record('a5500000-0000-4000-8000-000000000008', tests.val('trip3'), 'fulmis_to_client',
  'f5500000-0000-4000-8000-000000000013', 'FUL201015AB1', 'EFA050505GH5', 1000000);
select is(tests.ledger(tests.val('trip3'), 'client_status'), 'overdue', 'an overdue trip stays overdue');

update public.freight_ledgers set client_status = 'written_off' where trip_id = tests.val('trip4');
select tests.record('a5500000-0000-4000-8000-000000000008', tests.val('trip4'), 'fulmis_to_client',
  'f5500000-0000-4000-8000-000000000014', 'FUL201015AB1', 'EFA050505GH5', 1000000);
select is(tests.ledger(tests.val('trip4'), 'client_status'), 'written_off', 'a written-off trip keeps its status');

-- A cancelled trip is never invoiced.
update public.freight_ledgers set client_status = 'cancelled', carrier_status = 'cancelled'
where trip_id = tests.val('trip_noterms');
select is(
  tests.check('a5500000-0000-4000-8000-000000000008', tests.val('trip_noterms'), 'fulmis_to_client',
              gen_random_uuid(), 'FUL201015AB1', 'ESP050505GH7', 1000000),
  '["trip_cancelled"] validated', 'a cancelled trip is not invoiced (Fulmis'' side)'
);
select is(
  tests.check('a5500000-0000-4000-8000-000000000003', tests.val('trip_noterms'), 'carrier_to_fulmis',
              gen_random_uuid(), 'FFA040404CD4', 'FUL201015AB1', 970000),
  '["trip_cancelled"] validated', 'a cancelled trip is not invoiced (the carrier''s side)'
);

-- ---------------------------------------------------------------------------
-- Read matrix: each side only its own direction (I.0.3)
-- ---------------------------------------------------------------------------
-- trip1 has both invoices; trip2 the carrier's and the client's.
select is(tests.sees('a5500000-0000-4000-8000-000000000001',
  $$ select 1 from public.freight_invoices where direction = 'fulmis_to_client' $$), 4::bigint,
  'the shipper reads Fulmis'' invoices of its trips');
select is(tests.sees('a5500000-0000-4000-8000-000000000001',
  $$ select 1 from public.freight_invoices where direction = 'carrier_to_fulmis' $$), 0::bigint,
  'the shipper never reads the carrier''s invoice (its net)');
select is(tests.sees('a5500000-0000-4000-8000-000000000002',
  $$ select 1 from public.freight_invoices $$), 0::bigint, 'another shipper reads none');
select is(tests.sees('a5500000-0000-4000-8000-000000000003',
  $$ select 1 from public.freight_invoices where direction = 'carrier_to_fulmis' $$), 2::bigint,
  'the Gerente reads the carrier''s invoices');
select is(tests.sees('a5500000-0000-4000-8000-000000000003',
  $$ select 1 from public.freight_invoices where direction = 'fulmis_to_client' $$), 0::bigint,
  'the Gerente never reads Fulmis'' invoice to the client (the client amount)');
select is(tests.sees('a5500000-0000-4000-8000-000000000004',
  $$ select 1 from public.freight_invoices $$), 2::bigint,
  'the coordinator of the unit reads the carrier''s invoices only');
select is(tests.sees('a5500000-0000-4000-8000-000000000005',
  $$ select 1 from public.freight_invoices $$), 0::bigint, 'a coordinator of another unit reads none');
select is(tests.sees('a5500000-0000-4000-8000-000000000006',
  $$ select 1 from public.freight_invoices $$), 0::bigint, 'the operator reads none');
select is(tests.sees('a5500000-0000-4000-8000-000000000007',
  $$ select 1 from public.freight_invoices $$), 0::bigint, 'another carrier reads none');
select is(tests.sees('a5500000-0000-4000-8000-000000000008',
  $$ select 1 from public.freight_invoices $$), 6::bigint, 'the admin reads both sides');

-- ---------------------------------------------------------------------------
-- The `invoices` bucket: only a registered invoice the caller can read
-- ---------------------------------------------------------------------------
insert into storage.objects (bucket_id, name, metadata)
select 'invoices', f.path, '{"mimetype": "application/xml", "size": 2048}'
from public.freight_invoices i
cross join lateral (values (i.xml_path), (i.pdf_path)) as f(path)
where f.path is not null;
insert into storage.objects (bucket_id, name, metadata)
values ('invoices', tests.val('trip4') || '/carrier_to_fulmis/' || gen_random_uuid() || '.xml',
        '{"mimetype": "application/xml", "size": 2048}');

select is(tests.sees('a5500000-0000-4000-8000-000000000001',
  $$ select 1 from storage.objects where bucket_id = 'invoices' $$), 8::bigint,
  'the shipper reads the files of Fulmis'' invoices of its trips (XML and PDF)');
select is(tests.sees('a5500000-0000-4000-8000-000000000001',
  $$ select 1 from storage.objects where bucket_id = 'invoices' and name like '%/carrier_to_fulmis/%' $$), 0::bigint,
  'the shipper never reads a file of the carrier''s invoice');
select is(tests.sees('a5500000-0000-4000-8000-000000000003',
  $$ select 1 from storage.objects where bucket_id = 'invoices' $$), 3::bigint,
  'the Gerente reads the files of its invoices only, never an unregistered one');
select is(tests.sees('a5500000-0000-4000-8000-000000000002',
  $$ select 1 from storage.objects where bucket_id = 'invoices' $$), 0::bigint, 'another shipper reads none');
select is(tests.sees('a5500000-0000-4000-8000-000000000005',
  $$ select 1 from storage.objects where bucket_id = 'invoices' $$), 0::bigint,
  'a coordinator of another unit reads none');
select is(tests.sees('a5500000-0000-4000-8000-000000000008',
  $$ select 1 from storage.objects where bucket_id = 'invoices' $$), 11::bigint,
  'the admin reads every registered file');

set local role authenticated;
select tests.login('a5500000-0000-4000-8000-000000000003');
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('invoices', %L) $$,
    tests.val('trip4') || '/carrier_to_fulmis/' || gen_random_uuid() || '.xml'),
  '42501', null, 'no client uploads to the bucket (only the Edge Functions)'
);
reset role;

select * from finish();
rollback;
