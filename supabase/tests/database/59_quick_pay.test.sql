-- I4 · Quick pay (D38):
--   * the settings: the fee (250 by default, 250..9999) and the exposure
--     limit (null or positive cents), admins only; the carrier staff read the
--     current fee through carrier_quick_pay_fee_bps, nobody else;
--   * the preconditions: a delivered trip, the carrier's CFDI registered,
--     its side pending or held with nothing paid, the fee the caller saw;
--   * who requests (the Gerente, a Coordinador of the trip's unit) and who
--     decides (the admin); the fee frozen at the request; the calculation
--     ($9,700 net at 2.5 %: $9,457.50);
--   * approval schedules the quick net and the admin pays exactly that;
--     rejection (with a reason) goes back to pending, held or scheduled;
--     a client's full payment withdraws a pending request; the exposure
--     limit asks for a confirmation;
--   * I.0.3: the client still owes $10,000 at its terms and never learns of
--     the quick pay (its read and its notifications).
begin;
create extension if not exists pgtap with schema extensions;

select plan(64);

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
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@i4.test', now(),
          case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end,
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

-- The quick pay request of p_trip by p_uid with p_fee.
create function tests.req(p_uid uuid, p_trip text, p_fee integer default 250)
returns text
language sql
as $$ select tests.try(p_uid, format('select public.request_quick_pay(%L, %s)', tests.val(p_trip), p_fee)) $$;

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

-- Registers the carrier's CFDI of a trip, validated (as the I5 Edge Function
-- would with Fulmis' RFC set: quick pay needs it validated, 65_quick_pay_validated_cfdi).
create function tests.carrier_cfdi(p_trip text)
returns void
language sql
as $$
  insert into public.freight_invoices (
    trip_id, direction, cfdi_uuid, issuer_rfc, receiver_rfc, total_cents, currency, issued_at, validation,
    xml_path
  )
  select tests.val(p_trip), 'carrier_to_fulmis', gen_random_uuid(), 'FQP040404CD4', 'FUL201015AB1',
         f.carrier_net_cents, 'MXN', now(), 'validated',
         tests.val(p_trip) || '/carrier_to_fulmis/' || gen_random_uuid() || '.xml'
  from public.freight_ledgers f where f.trip_id = tests.val(p_trip);
$$;

grant execute on all functions in schema tests to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures. Users a59…: 01 S shipper, 03 M manager, 04 A coordinator of
-- unit A, 05 B coordinator of unit B, 06 O operator (unit A), 07 X manager
-- of another carrier, 08 Z admin.
-- ---------------------------------------------------------------------------
select tests.new_user('a5900000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a5900000-0000-4000-8000-000000000003', 'manager');
select tests.new_user('a5900000-0000-4000-8000-000000000004', 'coordinator');
select tests.new_user('a5900000-0000-4000-8000-000000000005', 'coordinator');
select tests.new_user('a5900000-0000-4000-8000-000000000006', 'operator');
select tests.new_user('a5900000-0000-4000-8000-000000000007', 'manager');
select tests.new_user('a5900000-0000-4000-8000-000000000008', 'shipper');
update public.profiles set role = 'admin' where id = 'a5900000-0000-4000-8000-000000000008';

insert into public.companies (id, type, legal_name, rfc, status, payment_terms_days) values
  ('c5900000-0000-4000-8000-000000000001', 'shipper', 'Envíos Rápidos SA de CV', 'ERA050505GH5', 'approved', 30);
insert into public.companies (id, type, legal_name, rfc, status) values
  ('c5900000-0000-4000-8000-000000000002', 'carrier', 'Fletes Quick Pay SA de CV', 'FQP040404CD4', 'approved'),
  ('c5900000-0000-4000-8000-000000000003', 'carrier', 'Fletes Ajenos SA de CV', 'FAJ040404CD5', 'approved');
update public.profiles set company_id = 'c5900000-0000-4000-8000-000000000001'
where id = 'a5900000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c5900000-0000-4000-8000-000000000002'
where id in ('a5900000-0000-4000-8000-000000000003', 'a5900000-0000-4000-8000-000000000004',
             'a5900000-0000-4000-8000-000000000005', 'a5900000-0000-4000-8000-000000000006');
update public.profiles set company_id = 'c5900000-0000-4000-8000-000000000003'
where id = 'a5900000-0000-4000-8000-000000000007';

insert into tests.vals select 'bu_a', id from public.business_units where company_id = 'c5900000-0000-4000-8000-000000000002';
insert into public.business_units (id, company_id, name)
values ('b5900000-0000-4000-8000-00000000000b', 'c5900000-0000-4000-8000-000000000002', 'Unidad B');
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id) values
  (tests.val('bu_a'), 'c5900000-0000-4000-8000-000000000002', 'a5900000-0000-4000-8000-000000000004'),
  ('b5900000-0000-4000-8000-00000000000b', 'c5900000-0000-4000-8000-000000000002', 'a5900000-0000-4000-8000-000000000005');

insert into public.operators (id, company_id, business_unit_id, profile_id, full_name, license_type, license_expires_on) values
  ('d5900000-0000-4000-8000-000000000006', 'c5900000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'a5900000-0000-4000-8000-000000000006', 'Óscar Rápido', 'E', current_date + 365);
insert into public.vehicles (id, company_id, business_unit_id, kind, plate, unit_type, capacity_kg) values
  ('e5900000-0000-4000-8000-00000000000a', 'c5900000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'rigid', 'HQP5901', 'dry_van', 30000);
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'c5900000-0000-4000-8000-000000000002'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- Six trips of $10,000 (3 %: $9,700 net) in unit A.
insert into tests.vals select 'trip' || i, tests.trip('a5900000-0000-4000-8000-000000000001',
  'a5900000-0000-4000-8000-000000000004', 'e5900000-0000-4000-8000-00000000000a', 1000000)
from generate_series(1, 6) as i;

-- Delivered (the RPCs need the evidence; here the owner moves them), all
-- but trip2; the carrier's CFDI of all but trip3.
update public.trips
set status = 'delivered', vehicle_id = 'e5900000-0000-4000-8000-00000000000a',
    operator_id = 'd5900000-0000-4000-8000-000000000006', assigned_at = now(), started_at = now(), delivered_at = now()
where id in (tests.val('trip1'), tests.val('trip3'), tests.val('trip4'), tests.val('trip5'), tests.val('trip6'));
select tests.carrier_cfdi(t) from unnest(array['trip1', 'trip2', 'trip4', 'trip5', 'trip6']) as t;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select key, value from public.platform_settings where key like 'freight.quick_pay%' order by key $$,
  $$ values ('freight.quick_pay_exposure_limit_cents', 'null'::jsonb), ('freight.quick_pay_fee_bps', '250'::jsonb) $$,
  'the fee starts at 2.5 % and there is no exposure limit'
);
select is(
  tests.as_user('a5900000-0000-4000-8000-000000000003',
    $$ select count(*)::text from public.platform_settings where key like 'freight.quick_pay%' $$),
  '0', 'the carrier does not read the settings'
);
select is(
  tests.as_user('a5900000-0000-4000-8000-000000000001',
    $$ select count(*)::text from public.platform_settings where key like 'freight.quick_pay%' $$),
  '0', 'nor does the client'
);
select is(
  tests.as_user('a5900000-0000-4000-8000-000000000003', 'select public.carrier_quick_pay_fee_bps()::text'),
  '250', 'the Gerente reads the current fee'
);
select is(
  tests.as_user('a5900000-0000-4000-8000-000000000005', 'select public.carrier_quick_pay_fee_bps()::text'),
  '250', 'and a Coordinador'
);
select is(
  tests.try('a5900000-0000-4000-8000-000000000001', 'select public.carrier_quick_pay_fee_bps()'),
  '42501:', 'the client never learns the fee'
);
select is(
  tests.try('a5900000-0000-4000-8000-000000000006', 'select public.carrier_quick_pay_fee_bps()'),
  '42501:', 'nor the operator'
);
select is(
  tests.try('a5900000-0000-4000-8000-000000000003',
    $$ select public.admin_set_platform_setting('freight.quick_pay_fee_bps', '300') $$),
  '42501:', 'only an admin changes the fee'
);
select is(
  array[
    tests.try('a5900000-0000-4000-8000-000000000008', $$ select public.admin_set_platform_setting('freight.quick_pay_fee_bps', '249') $$),
    tests.try('a5900000-0000-4000-8000-000000000008', $$ select public.admin_set_platform_setting('freight.quick_pay_fee_bps', '10000') $$),
    tests.try('a5900000-0000-4000-8000-000000000008', $$ select public.admin_set_platform_setting('freight.quick_pay_fee_bps', '262.5') $$),
    tests.try('a5900000-0000-4000-8000-000000000008', $$ select public.admin_set_platform_setting('freight.quick_pay_fee_bps', 'null') $$)
  ],
  array['22023:', '22023:', '22023:', '22023:'],
  'the fee is an integer from 250 to 9999 basis points'
);
select is(
  array[
    tests.try('a5900000-0000-4000-8000-000000000008', $$ select public.admin_set_platform_setting('freight.quick_pay_exposure_limit_cents', '0') $$),
    tests.try('a5900000-0000-4000-8000-000000000008', $$ select public.admin_set_platform_setting('freight.quick_pay_exposure_limit_cents', '-100') $$),
    tests.try('a5900000-0000-4000-8000-000000000008', $$ select public.admin_set_platform_setting('freight.quick_pay_exposure_limit_cents', '100.5') $$),
    tests.try('a5900000-0000-4000-8000-000000000008', $$ select public.admin_set_platform_setting('freight.quick_pay_exposure_limit_cents', '"100"') $$),
    tests.try('a5900000-0000-4000-8000-000000000008', $$ select public.admin_set_platform_setting('freight.quick_pay_exposure_limit_cents', '5000000') $$),
    tests.try('a5900000-0000-4000-8000-000000000008', $$ select public.admin_set_platform_setting('freight.quick_pay_exposure_limit_cents', null) $$)
  ],
  array['22023:', '22023:', '22023:', '22023:', 'ok', 'ok'],
  'the exposure limit is null or a positive integer of cents'
);

-- ---------------------------------------------------------------------------
-- Preconditions and who requests
-- ---------------------------------------------------------------------------
select is(tests.req('a5900000-0000-4000-8000-000000000003', 'trip2'), '55000:not_delivered',
  'no quick pay before the delivery');
select is(tests.req('a5900000-0000-4000-8000-000000000003', 'trip3'), '55000:invoice_missing',
  'no quick pay without the carrier''s CFDI (I5)');
select is(tests.req('a5900000-0000-4000-8000-000000000001', 'trip1'), '42501:', 'the client cannot request it');
select is(tests.req('a5900000-0000-4000-8000-000000000006', 'trip1'), '42501:', 'nor the operator');
select is(tests.req('a5900000-0000-4000-8000-000000000005', 'trip1'), '42501:',
  'nor a Coordinador of another business unit');
select is(tests.req('a5900000-0000-4000-8000-000000000007', 'trip1'), '42501:', 'nor another carrier');
select is(tests.req('a5900000-0000-4000-8000-000000000008', 'trip1'), '42501:', 'nor the admin');
select is(tests.req('a5900000-0000-4000-8000-000000000003', 'trip1', 300), '55000:fee_changed',
  'a fee other than the current one is refused, not charged');
select is(tests.ledger('trip1', 'carrier_status'), 'pending', 'and nothing changed');
select is(
  tests.as_user('a5900000-0000-4000-8000-000000000003', format($$
    select quick_pay_blocker from public.carrier_freight_ledger() where trip_id = %L $$, tests.val('trip3'))),
  'invoice_missing', 'Cobranza says why a trip cannot ask for it'
);
select is(
  tests.as_user('a5900000-0000-4000-8000-000000000003', format($$
    select coalesce(quick_pay_blocker, 'none') from public.carrier_freight_ledger() where trip_id = %L $$,
    tests.val('trip1'))),
  'none', 'and offers it when it can'
);

-- ---------------------------------------------------------------------------
-- The request: $9,700 net at 2.5 % pays $9,457.50
-- ---------------------------------------------------------------------------
select is(
  tests.as_user('a5900000-0000-4000-8000-000000000004',
    format('select public.request_quick_pay(%L, 250)::text', tests.val('trip1')))::jsonb,
  '{"feeBps": 250, "feeCents": 24250, "quickNetCents": 945750}'::jsonb,
  'the Coordinador of the unit asks: a $242.50 fee and $9,457.50 to receive'
);
select is(
  tests.ledger('trip1', 'carrier_status, quick_pay_fee_bps, quick_pay_fee_cents, carrier_net_cents, quick_pay_requested_by'),
  'quick_pay_requested,250,24250,970000,a5900000-0000-4000-8000-000000000004',
  'the fee is frozen in the ledger, with who asked'
);
select is(tests.req('a5900000-0000-4000-8000-000000000003', 'trip1'), '55000:not_open', 'it is requested once');
select is(
  (select count(*)::int from public.notifications
   where user_id = 'a5900000-0000-4000-8000-000000000008' and type = 'quick_pay_requested'
     and (data ->> 'amountCents')::bigint = 945750 and data ->> 'tripId' = tests.val('trip1')::text),
  1, 'the admin is told, with the quick net'
);

-- The fee changes: the request keeps its own.
select tests.try('a5900000-0000-4000-8000-000000000008',
  $$ select public.admin_set_platform_setting('freight.quick_pay_fee_bps', '400') $$) is null as quiet;
select is(tests.ledger('trip1', 'quick_pay_fee_bps, quick_pay_fee_cents'), '250,24250',
  'a new fee does not change a request already made');
select tests.try('a5900000-0000-4000-8000-000000000008',
  $$ select public.admin_set_platform_setting('freight.quick_pay_fee_bps', '250') $$) is null as quiet;

select is(
  tests.as_user('a5900000-0000-4000-8000-000000000003', format($$
    select concat_ws(',', status, quick_pay_fee_cents, quick_pay_net_cents, pending_cents)
    from public.carrier_freight_ledger() where trip_id = %L $$, tests.val('trip1'))),
  'quick_pay_requested,24250,945750,970000', 'the Gerente sees the request and its quick net'
);
select is(
  tests.as_user('a5900000-0000-4000-8000-000000000005', format($$
    select count(*)::text from public.carrier_freight_ledger() where trip_id = %L $$, tests.val('trip1'))),
  '0', 'a Coordinador of another unit does not see it'
);

-- ---------------------------------------------------------------------------
-- The decision
-- ---------------------------------------------------------------------------
select is(
  tests.try('a5900000-0000-4000-8000-000000000008', format($$
    select public.admin_record_freight_payment(%L, 'fulmis_to_carrier', 945750, public.freight_today(), 'QP0001')
  $$, tests.val('trip1'))),
  '55000:', 'nothing is paid to the carrier while the request waits'
);
select is(
  tests.try('a5900000-0000-4000-8000-000000000003', format('select public.admin_approve_quick_pay(%L)', tests.val('trip1'))),
  '42501:', 'only an admin approves'
);
select is(
  tests.try('a5900000-0000-4000-8000-000000000003', format($$ select public.admin_reject_quick_pay(%L, 'No') $$, tests.val('trip1'))),
  '42501:', 'and rejects'
);
select is(
  tests.as_user('a5900000-0000-4000-8000-000000000008',
    format('select public.admin_approve_quick_pay(%L)::text', tests.val('trip1')))::jsonb,
  '{"exposureCents": 945750, "limitCents": null}'::jsonb,
  'the admin approves it: $9,457.50 exposed, no limit'
);
select is(tests.ledger('trip1', 'carrier_status, (quick_pay_approved_at is not null)'), 'scheduled,t',
  'the carrier''s payment is scheduled');
select is(
  (select array_agg(user_id::text order by user_id::text) from public.notifications
   where type = 'quick_pay_approved' and (data ->> 'amountCents')::bigint = 945750
     and data ->> 'tripId' = tests.val('trip1')::text),
  array['a5900000-0000-4000-8000-000000000003', 'a5900000-0000-4000-8000-000000000004'],
  'the Gerente and the Coordinador of the unit are told, with what Fulmis pays'
);
select is(
  tests.as_user('a5900000-0000-4000-8000-000000000003', format($$
    select concat_ws(',', status, pending_cents) from public.carrier_freight_ledger() where trip_id = %L $$,
    tests.val('trip1'))),
  'scheduled,945750', 'the carrier is owed the quick net'
);
select is(
  tests.try('a5900000-0000-4000-8000-000000000008', format($$
    select public.admin_record_freight_payment(%L, 'fulmis_to_carrier', 970000, public.freight_today(), 'QP0002')
  $$, tests.val('trip1'))),
  '22023:', 'not the whole net'
);
select is(
  tests.try('a5900000-0000-4000-8000-000000000008', format($$
    select public.admin_record_freight_payment(%L, 'fulmis_to_carrier', 945750, public.freight_today(), 'QP0003')
  $$, tests.val('trip1'))),
  'ok', 'the admin records the $9,457.50 sent'
);
select is(tests.ledger('trip1', 'carrier_status, carrier_paid_cents'), 'paid,945750', 'and the carrier is paid');

-- I.0.3: the client still owes everything, at its terms, and never hears of it.
select is(
  tests.as_user('a5900000-0000-4000-8000-000000000001', format($$
    select concat_ws(',', amount_cents, status, paid_cents, pending_cents, due_on = public.freight_today() + 30)
    from public.shipper_freight_ledger() where trip_id = %L $$, tests.val('trip1'))),
  '1000000,pending,0,1000000,t', 'the client still owes $10,000 at its terms'
);
select is(
  tests.as_user('a5900000-0000-4000-8000-000000000001', format($$
    select count(*)::text from public.shipper_freight_ledger() r
    where r.trip_id = %L and (to_jsonb(r)::text like '%%945750%%' or to_jsonb(r)::text like '%%24250%%'
                              or to_jsonb(r)::text like '%%quick%%') $$, tests.val('trip1'))),
  '0', 'its read carries no quick pay amount'
);
select ok(
  pg_get_function_result('public.shipper_freight_ledger()'::regprocedure) not like '%quick%',
  'the client''s read has no quick pay column'
);
select is(
  (select count(*)::int from public.notifications
   where user_id = 'a5900000-0000-4000-8000-000000000001' and type::text like 'quick_pay%'),
  0, 'the client gets no quick pay notification'
);
select ok(
  not exists (
    select 1 from public.notifications n
    where n.user_id = 'a5900000-0000-4000-8000-000000000001'
      and (n.data ->> 'amountCents' in ('945750', '24250') or n.data ? 'feeBps')
  ),
  'nor any notification with its amounts'
);
select is(
  tests.try('a5900000-0000-4000-8000-000000000001', 'select * from public.admin_quick_pay_exposure()'),
  '42501:', 'only an admin reads the exposure'
);

-- ---------------------------------------------------------------------------
-- Rejection
-- ---------------------------------------------------------------------------
select is(tests.req('a5900000-0000-4000-8000-000000000003', 'trip4'), 'ok', 'the Gerente asks for trip 4');
select is(
  tests.try('a5900000-0000-4000-8000-000000000008', format($$ select public.admin_reject_quick_pay(%L, '  ') $$, tests.val('trip4'))),
  '22023:', 'a rejection needs a reason'
);
select is(
  tests.try('a5900000-0000-4000-8000-000000000008',
    format($$ select public.admin_reject_quick_pay(%L, 'Revisa la carta porte.') $$, tests.val('trip4'))),
  'ok', 'the admin rejects it'
);
select is(
  tests.ledger('trip4', 'carrier_status, coalesce(quick_pay_fee_cents::text, $$-$$), quick_pay_rejection_reason, (quick_pay_rejected_at is not null)'),
  'pending,-,Revisa la carta porte.,t', 'back to pending, without a fee, with the reason'
);
select is(
  (select data ->> 'reason' from public.notifications
   where user_id = 'a5900000-0000-4000-8000-000000000004' and type = 'quick_pay_rejected'
     and data ->> 'tripId' = tests.val('trip4')::text),
  'Revisa la carta porte.', 'the carrier staff are told why'
);
select is(
  tests.try('a5900000-0000-4000-8000-000000000008', format('select public.admin_approve_quick_pay(%L)', tests.val('trip4'))),
  '55000:not_requested', 'a decided request cannot be approved'
);
select is(tests.req('a5900000-0000-4000-8000-000000000004', 'trip4'), 'ok', 'the carrier may ask again');
select is(tests.ledger('trip4', 'carrier_status, coalesce(quick_pay_rejection_reason, $$-$$)'), 'quick_pay_requested,-',
  'which clears the old rejection');

-- Past its date (the client has not paid): a rejection goes back to held.
update public.freight_ledgers set carrier_due_on = public.freight_today() - 1, client_due_on = public.freight_today() - 1
where trip_id = tests.val('trip4');
select public.process_freight_due();
select is(tests.ledger('trip4', 'carrier_status'), 'quick_pay_requested', 'a pending request is never held');
select tests.try('a5900000-0000-4000-8000-000000000008',
  format($$ select public.admin_reject_quick_pay(%L, 'Sin fondos.') $$, tests.val('trip4'))) is null as quiet;
select is(tests.ledger('trip4', 'carrier_status'), 'on_hold', 'rejected past its date, it is held');
select is(tests.req('a5900000-0000-4000-8000-000000000003', 'trip4'), 'ok', 'a held payment can ask for it');

-- The client pays in full while it waits: the request is withdrawn.
select tests.try('a5900000-0000-4000-8000-000000000008', format($$
  select public.admin_record_freight_payment(%L, 'client_to_fulmis', 1000000, public.freight_today(), 'QPCLIENTE4')
$$, tests.val('trip4'))) is null as quiet;
select is(
  tests.ledger('trip4', 'client_status, carrier_status, coalesce(quick_pay_fee_cents::text, $$-$$), coalesce(quick_pay_requested_at::text, $$-$$)'),
  'paid,scheduled,-,-', 'the client paid first: the carrier gets its whole net, scheduled'
);

-- ---------------------------------------------------------------------------
-- Exposure limit and partial payments
-- ---------------------------------------------------------------------------
select tests.try('a5900000-0000-4000-8000-000000000008',
  $$ select public.admin_set_platform_setting('freight.quick_pay_exposure_limit_cents', '1000000') $$) is null as quiet;
select is(tests.req('a5900000-0000-4000-8000-000000000003', 'trip5'), 'ok', 'the Gerente asks for trip 5');
select is(
  tests.try('a5900000-0000-4000-8000-000000000008', format('select public.admin_approve_quick_pay(%L)', tests.val('trip5'))),
  '55000:over_limit', 'over the $10,000 limit, the approval asks for a confirmation'
);
select is(tests.ledger('trip5', 'carrier_status'), 'quick_pay_requested', 'and nothing changed');
select is(
  tests.as_user('a5900000-0000-4000-8000-000000000008',
    format('select public.admin_approve_quick_pay(%L, true)::text', tests.val('trip5')))::jsonb,
  '{"exposureCents": 1891500, "limitCents": 1000000}'::jsonb,
  'confirmed, it is approved and the exposure is $18,915'
);
select is(
  tests.as_user('a5900000-0000-4000-8000-000000000008',
    'select concat_ws($$,$$, exposure_cents, limit_cents, fee_bps) from public.admin_quick_pay_exposure()'),
  '1891500,1000000,250', 'the admin reads the exposure, the limit and the fee'
);

-- Since D33-E1 the admin pays the carrier only once the client paid (or with
-- an approved quick pay, which is never pending): a carrier paid in part
-- while pending is a ledger from before that rule, set here directly.
update public.freight_ledgers set carrier_paid_cents = 100000 where trip_id = tests.val('trip6');
select is(tests.req('a5900000-0000-4000-8000-000000000003', 'trip6'), '55000:partially_paid',
  'no quick pay once Fulmis paid part of it');

-- ---------------------------------------------------------------------------
-- Integrity and audit
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ update public.freight_ledgers set quick_pay_fee_cents = 1 where trip_id = %L $$, tests.val('trip5')),
  '23514', null, 'the fee is always the frozen percentage of the net'
);
select is(
  (select count(*)::int from public.audit_log
   where table_name = 'freight_ledgers' and action = 'update'
     and actor_id = 'a5900000-0000-4000-8000-000000000008'
     and record_id = (select id from public.freight_ledgers where trip_id = tests.val('trip1'))
     and old_data ->> 'carrier_status' = 'quick_pay_requested' and new_data ->> 'carrier_status' = 'scheduled'),
  1, 'the approval is audited'
);

select * from finish();
rollback;
