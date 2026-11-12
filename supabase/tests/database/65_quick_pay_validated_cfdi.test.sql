-- I4 fix · Quick pay only with the carrier's CFDI validated (plan-v1.md §I4):
--   * without Fulmis' RFC the carrier's CFDI is "Sin validar" and the quick
--     pay is refused with that reason (fulmis_rfc_missing), in the RPC, in
--     Cobranza (carrier_freight_ledger) and in /admin/flete
--     (admin_freight_ledger); a CFDI not made out to Fulmis' RFC stays "Sin
--     validar" (invoice_unvalidated);
--   * requests made before the fix are kept: a pending one is not approved
--     until its CFDI is validated, an approved one stays approved;
--   * saving Fulmis' RFC validates the carrier CFDI made out to it (audited),
--     and a carrier CFDI registered once the RFC is set is validated the same
--     way; Fulmis' CFDI to the clients keep their validation; clearing the RFC
--     never takes a validation back; an RFC saved before this fix: the
--     migration validates the CFDI made out to it
--     (freight_validate_carrier_invoices);
--   * nobody calls the new helpers.
-- The race of a CFDI registered while the RFC is saved: 60_quick_pay_concurrency.
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

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
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@i4v.test', now(), null,
          jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
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

-- Runs p_sql as p_uid: 'ok', or the SQLSTATE and the detail of its error.
create function tests.try(p_uid uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v_state text;
  v_detail text;
begin
  perform tests.login(p_uid);
  execute 'set local role authenticated';
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_detail = pg_exception_detail;
    execute 'reset role';
    return v_state || ':' || coalesce(v_detail, '');
  end;
  execute 'reset role';
  return 'ok';
end;
$$;

-- One text value of p_sql, as p_uid.
create function tests.as_user(p_uid uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  perform tests.login(p_uid);
  execute 'set local role authenticated';
  execute p_sql into v;
  execute 'reset role';
  return v;
end;
$$;

-- The quick pay request of p_trip by the Gerente.
create function tests.req(p_trip text)
returns text
language sql
as $$
  select tests.try('a6500000-0000-4000-8000-000000000003',
    format('select public.request_quick_pay(%L, 250)', tests.val(p_trip)))
$$;

-- The admin approves the quick pay request of p_trip.
create function tests.approve(p_trip text)
returns text
language sql
as $$
  select tests.try('a6500000-0000-4000-8000-000000000008',
    format('select public.admin_approve_quick_pay(%L)', tests.val(p_trip)))
$$;

-- The admin saves Fulmis' RFC (a JSON value: a string, or null).
create function tests.set_fulmis_rfc(p_value jsonb)
returns text
language sql
as $$
  select tests.try('a6500000-0000-4000-8000-000000000008',
    format('select public.admin_set_platform_setting(%L, %L)', 'fulmis.rfc', p_value))
$$;

-- Why Cobranza says p_trip cannot ask for the quick pay ('none': it can).
create function tests.blocker(p_trip text)
returns text
language sql
as $$
  select tests.as_user('a6500000-0000-4000-8000-000000000003', format($q$
    select coalesce(quick_pay_blocker, 'none') from public.carrier_freight_ledger() where trip_id = %L
  $q$, tests.val(p_trip)))
$$;

-- What /admin/flete says of p_trip's CFDI ('none': validated).
create function tests.admin_blocker(p_trip text)
returns text
language sql
as $$
  select tests.as_user('a6500000-0000-4000-8000-000000000008', format($q$
    select coalesce(carrier_invoice_blocker, 'none') from public.admin_freight_ledger() where trip_id = %L
  $q$, tests.val(p_trip)))
$$;

-- The validation of p_trip's CFDI in p_direction.
create function tests.validation(p_trip text, p_direction text default 'carrier_to_fulmis')
returns text
language sql
as $$
  select validation::text from public.freight_invoices
  where trip_id = tests.val(p_trip) and direction = p_direction::public.freight_invoice_direction
$$;

-- Columns of a trip's ledger, as the owner.
create function tests.ledger(p_trip text, p_columns text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  execute format('select concat_ws(%L, %s) from public.freight_ledgers where trip_id = $1', ',', p_columns)
  into v using tests.val(p_trip);
  return v;
end;
$$;

-- Registers a CFDI of a trip "Sin validar", as the I5 Edge Function does
-- without Fulmis' RFC: the carrier's to p_receiver, or Fulmis' to the client.
create function tests.cfdi(p_trip text, p_direction text, p_receiver text)
returns void
language sql
as $$
  insert into public.freight_invoices (
    trip_id, direction, cfdi_uuid, issuer_rfc, receiver_rfc, total_cents, currency, issued_at, validation,
    xml_path, pdf_path
  )
  select tests.val(p_trip), p_direction::public.freight_invoice_direction, gen_random_uuid(),
         case when p_direction = 'carrier_to_fulmis' then 'FQV040404CD4' else 'FUL201015AB1' end, p_receiver,
         case when p_direction = 'carrier_to_fulmis' then f.carrier_net_cents else f.client_amount_cents end,
         'MXN', now(), 'unvalidated',
         tests.val(p_trip) || '/' || p_direction || '/' || gen_random_uuid() || '.xml',
         tests.val(p_trip) || '/' || p_direction || '/' || gen_random_uuid() || '.pdf'
  from public.freight_ledgers f where f.trip_id = tests.val(p_trip);
$$;

grant execute on all functions in schema tests to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures. Users a65…: 01 S shipper, 03 M manager, 08 Z admin.
-- ---------------------------------------------------------------------------
select tests.new_user('a6500000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a6500000-0000-4000-8000-000000000003', 'manager');
select tests.new_user('a6500000-0000-4000-8000-000000000008', 'shipper');
update public.profiles set role = 'admin' where id = 'a6500000-0000-4000-8000-000000000008';

insert into public.companies (id, type, legal_name, rfc, status, payment_terms_days) values
  ('c6500000-0000-4000-8000-000000000001', 'shipper', 'Envíos Validados SA de CV', 'EVA050505GH5', 'approved', 30);
insert into public.companies (id, type, legal_name, rfc, status) values
  ('c6500000-0000-4000-8000-000000000002', 'carrier', 'Fletes Validados SA de CV', 'FQV040404CD4', 'approved');
update public.profiles set company_id = 'c6500000-0000-4000-8000-000000000001'
where id = 'a6500000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c6500000-0000-4000-8000-000000000002'
where id = 'a6500000-0000-4000-8000-000000000003';

insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('e6500000-0000-4000-8000-00000000000a', 'c6500000-0000-4000-8000-000000000002', 'rigid', 'HQV6501', 'dry_van', 30000);
insert into public.operators (id, company_id, full_name, license_type, license_expires_on) values
  ('d6500000-0000-4000-8000-000000000006', 'c6500000-0000-4000-8000-000000000002', 'Óscar Validado', 'E',
   current_date + 365);
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'c6500000-0000-4000-8000-000000000002'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- Eight delivered trips of $10,000 ($9,700 net).
insert into tests.vals select 'trip' || i, tests.trip('a6500000-0000-4000-8000-000000000001',
  'a6500000-0000-4000-8000-000000000003', 'e6500000-0000-4000-8000-00000000000a', 1000000)
from generate_series(1, 8) as i;
update public.trips
set status = 'delivered', vehicle_id = 'e6500000-0000-4000-8000-00000000000a',
    operator_id = 'd6500000-0000-4000-8000-000000000006', assigned_at = now(), started_at = now(), delivered_at = now()
where shipper_company_id = 'c6500000-0000-4000-8000-000000000001';

-- Without Fulmis' RFC (null, as in production today), every CFDI is "Sin
-- validar": trip1 and trip3 made out to the RFC Fulmis will set, trip2 and
-- trip6 to another one; trip4, trip7 and trip8 have none yet; trip5 has Fulmis' CFDI
-- to the client.
select tests.cfdi(t, 'carrier_to_fulmis', 'FUL201015AB1') from unnest(array['trip1', 'trip3']) as t;
select tests.cfdi(t, 'carrier_to_fulmis', 'OTR201015AB2') from unnest(array['trip2', 'trip6']) as t;
select tests.cfdi('trip5', 'fulmis_to_client', 'EVA050505GH5');

-- Requests made before the fix, with a CFDI "Sin validar": trip3 pending,
-- trip6 approved (as request_quick_pay and admin_approve_quick_pay left them).
update public.freight_ledgers
set carrier_status = 'quick_pay_requested', quick_pay_fee_bps = 250, quick_pay_fee_cents = 24250,
    quick_pay_requested_at = now(), quick_pay_requested_by = 'a6500000-0000-4000-8000-000000000003'
where trip_id in (tests.val('trip3'), tests.val('trip6'));
update public.freight_ledgers
set carrier_status = 'scheduled', quick_pay_approved_at = now(),
    quick_pay_approved_by = 'a6500000-0000-4000-8000-000000000008'
where trip_id = tests.val('trip6');

-- ---------------------------------------------------------------------------
-- Without Fulmis' RFC: "Sin validar", no quick pay, and the reason
-- ---------------------------------------------------------------------------
select is(
  (select value from public.platform_settings where key = 'fulmis.rfc'), 'null'::jsonb,
  'Fulmis has no RFC yet (the default)'
);
select is(tests.req('trip1'), '55000:fulmis_rfc_missing',
  'a CFDI "Sin validar" for lack of Fulmis'' RFC does not allow the quick pay, and says so');
select is(tests.ledger('trip1', 'carrier_status, quick_pay_requested_at is null'), 'pending,t',
  'and nothing is requested');
select is(tests.blocker('trip1'), 'fulmis_rfc_missing', 'Cobranza gives the same reason');
select is(tests.blocker('trip4'), 'invoice_missing', 'and asks for the CFDI when there is none');
select is(tests.admin_blocker('trip3'), 'fulmis_rfc_missing',
  '/admin/flete says why a pending request cannot be approved');

-- ---------------------------------------------------------------------------
-- Requests made before the fix
-- ---------------------------------------------------------------------------
select is(tests.approve('trip3'), '55000:fulmis_rfc_missing',
  'a pending request with its CFDI "Sin validar" is not approved, with the reason');
select is(tests.ledger('trip3', 'carrier_status, quick_pay_fee_cents'), 'quick_pay_requested,24250',
  'and it is kept pending: not withdrawn in silence');
select is(tests.ledger('trip6', 'carrier_status, quick_pay_approved_at is not null'), 'scheduled,t',
  'an approved one stays approved: Fulmis already committed to it');

-- ---------------------------------------------------------------------------
-- Fulmis sets its RFC: the CFDI made out to it are validated
-- ---------------------------------------------------------------------------
select is(tests.set_fulmis_rfc('"FUL201015AB1"'), 'ok', 'the admin saves Fulmis'' RFC');
select is(
  array[tests.validation('trip1'), tests.validation('trip3'), tests.validation('trip2'), tests.validation('trip6')],
  array['validated', 'validated', 'unvalidated', 'unvalidated'],
  'the carrier CFDI made out to it are validated; the others stay "Sin validar"'
);
select is(tests.validation('trip5', 'fulmis_to_client'), 'unvalidated',
  'Fulmis'' CFDI to the client keeps its validation');
select is(
  (select count(*)::integer from public.audit_log
   where table_name = 'freight_invoices' and action = 'update'
     and actor_id = 'a6500000-0000-4000-8000-000000000008'
     and old_data ->> 'validation' = 'unvalidated' and new_data ->> 'validation' = 'validated'),
  2, 'each validation is audited'
);

select is(tests.blocker('trip2'), 'invoice_unvalidated',
  'a CFDI not made out to Fulmis'' RFC stays "Sin validar", and Cobranza says so');
select is(tests.req('trip2'), '55000:invoice_unvalidated', 'and it does not allow the quick pay');
select is(tests.admin_blocker('trip6'), 'invoice_unvalidated', '/admin/flete gives the same reason');

select is(tests.blocker('trip1'), 'none', 'a validated CFDI offers the quick pay');
select is(
  tests.as_user('a6500000-0000-4000-8000-000000000003',
    format('select public.request_quick_pay(%L, 250)::text', tests.val('trip1')))::jsonb,
  '{"feeBps": 250, "feeCents": 24250, "quickNetCents": 945750}'::jsonb,
  'and the carrier asks for it'
);
select is(tests.admin_blocker('trip3'), 'none', 'the pending request''s CFDI is validated now');
select is(tests.approve('trip3'), 'ok', 'and the admin approves it');
select is(tests.ledger('trip3', 'carrier_status'), 'scheduled', 'its payment is scheduled');

-- A carrier CFDI registered once the RFC is set: as the Edge Function
-- validates it, and the insertion validates it too if it came "Sin validar".
select tests.cfdi('trip4', 'carrier_to_fulmis', 'FUL201015AB1');
select tests.cfdi('trip7', 'carrier_to_fulmis', 'OTR201015AB2');
select is(
  array[tests.validation('trip4'), tests.validation('trip7')],
  array['validated', 'unvalidated'],
  'a CFDI registered with the RFC set is validated only if made out to it'
);

-- Clearing the RFC never takes a validation back.
select is(tests.set_fulmis_rfc('null'), 'ok', 'the admin clears Fulmis'' RFC');
select is(
  array[tests.validation('trip1'), tests.validation('trip4'), tests.blocker('trip7')],
  array['validated', 'validated', 'fulmis_rfc_missing'],
  'the validated CFDI stay validated; the others are "Sin validar" for lack of the RFC again'
);

-- ---------------------------------------------------------------------------
-- Fulmis' RFC saved before this fix: the migration validates what it missed
-- ---------------------------------------------------------------------------
-- As before the migration: no trigger validates on saving the RFC nor on
-- registering a CFDI.
alter table public.platform_settings disable trigger platform_settings_fulmis_rfc_validates_invoices;
alter table public.freight_invoices disable trigger freight_invoices_validate_receiver;
update public.platform_settings set value = '"FUL201015AB1"' where key = 'fulmis.rfc';
select tests.cfdi('trip8', 'carrier_to_fulmis', 'FUL201015AB1');
alter table public.platform_settings enable trigger platform_settings_fulmis_rfc_validates_invoices;
alter table public.freight_invoices enable trigger freight_invoices_validate_receiver;
select is(tests.blocker('trip8'), 'invoice_unvalidated',
  'a CFDI made out to an RFC saved before the fix is still "Sin validar"');
select is(public.freight_validate_carrier_invoices(public.fulmis_rfc()), 1,
  'the migration''s step validates it (and only it)');
select is(
  array[tests.validation('trip8'), tests.blocker('trip8'), tests.validation('trip7')],
  array['validated', 'none', 'unvalidated'],
  'so the quick pay is offered; the CFDI made out to another RFC stays "Sin validar"'
);

-- ---------------------------------------------------------------------------
-- Nobody calls the helpers
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.freight_carrier_invoice_blocker(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.freight_carrier_invoice_blocker(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.freight_carrier_invoice_blocker(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.freight_validate_carrier_invoices(text)', 'execute')
  and not has_function_privilege('service_role', 'public.freight_validate_carrier_invoices(text)', 'execute'),
  'nobody calls freight_carrier_invoice_blocker nor freight_validate_carrier_invoices'
);
select ok(
  not has_function_privilege('authenticated', 'public.freight_invoices_validate_on_fulmis_rfc()', 'execute')
  and not has_function_privilege('authenticated', 'public.freight_invoices_validate_receiver()', 'execute')
  and not has_function_privilege('service_role', 'public.freight_invoices_validate_on_fulmis_rfc()', 'execute')
  and not has_function_privilege('service_role', 'public.freight_invoices_validate_receiver()', 'execute'),
  'nor the validation triggers'
);
select is(
  tests.try('a6500000-0000-4000-8000-000000000003',
    $$ select public.admin_set_platform_setting('fulmis.rfc', '"FUL201015AB1"') $$),
  '42501:', 'only an admin saves Fulmis'' RFC'
);

select * from finish();
rollback;
