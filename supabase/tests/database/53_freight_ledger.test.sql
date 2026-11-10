-- I3 · Freight ledger (D08-E2, D33-E1, D34-E1):
--   * privileges: no client writes; only admins read the tables; not in
--     Realtime; the freight settings only for admins;
--   * a ledger per trip with the agreed price, the commission frozen at its
--     creation (setting, carrier override, 0) and the parts adding up; the
--     rounding mirrors commissionCents (same cases as freight.test.ts);
--   * the shipper's terms, the due dates from the delivery, "Plazo por
--     definir" and no receivable without terms;
--   * the read matrix by side and role (Gerente, coordinator of the unit and
--     of another, operator, shipper, another shipper, another carrier,
--     admin): each side only gets its own amounts and payments;
--   * payments only by the admin, partial ones adding up, never over what is
--     owed, idempotent by SPEI reference and direction, with notifications to
--     each side with its own amount, and audited;
--   * overdue and held (only from pending; a quick pay never goes back),
--     at read time and by the daily job, once;
--   * a cancelled trip leaves the balances, takes no payments and is flagged
--     for the admin when it had payments.
begin;
create extension if not exists pgtap with schema extensions;

select plan(95);

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
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@i3.test', now(),
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
grant select, insert on tests.vals to authenticated;

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

-- One value of p_sql as p_uid.
create function tests.read(p_uid uuid, p_sql text)
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

-- Records a payment as the admin; returns its id.
create function tests.pay(p_trip uuid, p_direction text, p_amount bigint, p_reference text,
                          p_paid_on date default null)
returns uuid
language plpgsql
as $$
declare
  v uuid;
begin
  perform tests.login('a5100000-0000-4000-8000-000000000008');
  execute 'set local role authenticated';
  v := public.admin_record_freight_payment(
    p_trip, p_direction::public.freight_payment_direction, p_amount,
    coalesce(p_paid_on, public.freight_today()), p_reference
  );
  execute 'reset role';
  return v;
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

-- How many notifications of p_type p_user has about p_trip.
create function tests.notified(p_user uuid, p_type text, p_trip uuid)
returns integer
language sql
as $$
  select count(*)::int from public.notifications
  where user_id = p_user and type::text = p_type and data ->> 'tripId' = p_trip::text;
$$;

grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures. Users a51…: 01 S shipper, 02 T another shipper, 03 M manager,
-- 04 A coordinator of unit A, 05 B coordinator of unit B, 06 O operator
-- (unit A), 07 X manager of another carrier, 08 Z admin.
-- ---------------------------------------------------------------------------
select tests.new_user('a5100000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a5100000-0000-4000-8000-000000000002', 'shipper');
select tests.new_user('a5100000-0000-4000-8000-000000000003', 'manager');
select tests.new_user('a5100000-0000-4000-8000-000000000004', 'coordinator');
select tests.new_user('a5100000-0000-4000-8000-000000000005', 'coordinator');
select tests.new_user('a5100000-0000-4000-8000-000000000006', 'operator');
select tests.new_user('a5100000-0000-4000-8000-000000000007', 'manager');
select tests.new_user('a5100000-0000-4000-8000-000000000008', 'shipper');
update public.profiles set role = 'admin' where id = 'a5100000-0000-4000-8000-000000000008';

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c5100000-0000-4000-8000-000000000001', 'shipper', 'Envíos Libro SA de CV', 'ELI050505GH5', 'approved'),
  ('c5100000-0000-4000-8000-000000000002', 'carrier', 'Fletes Libro SA de CV', 'FLI040404CD4', 'approved'),
  ('c5100000-0000-4000-8000-000000000003', 'carrier', 'Fletes Ajenos SA de CV', 'FAJ040404CD5', 'approved'),
  ('c5100000-0000-4000-8000-000000000004', 'shipper', 'Envíos Otros SA de CV', 'EOT050505GH6', 'approved');
update public.profiles set company_id = 'c5100000-0000-4000-8000-000000000001'
where id = 'a5100000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c5100000-0000-4000-8000-000000000004'
where id = 'a5100000-0000-4000-8000-000000000002';
update public.profiles set company_id = 'c5100000-0000-4000-8000-000000000002'
where id in ('a5100000-0000-4000-8000-000000000003', 'a5100000-0000-4000-8000-000000000004',
             'a5100000-0000-4000-8000-000000000005', 'a5100000-0000-4000-8000-000000000006');
update public.profiles set company_id = 'c5100000-0000-4000-8000-000000000003'
where id = 'a5100000-0000-4000-8000-000000000007';

insert into tests.vals select 'bu_a', id from public.business_units where company_id = 'c5100000-0000-4000-8000-000000000002';
insert into public.business_units (id, company_id, name)
values ('b5100000-0000-4000-8000-00000000000b', 'c5100000-0000-4000-8000-000000000002', 'Unidad B');
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id) values
  (tests.val('bu_a'), 'c5100000-0000-4000-8000-000000000002', 'a5100000-0000-4000-8000-000000000004'),
  ('b5100000-0000-4000-8000-00000000000b', 'c5100000-0000-4000-8000-000000000002', 'a5100000-0000-4000-8000-000000000005');

insert into public.operators (id, company_id, business_unit_id, profile_id, full_name, license_type, license_expires_on) values
  ('d5100000-0000-4000-8000-000000000006', 'c5100000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'a5100000-0000-4000-8000-000000000006', 'Óscar Libro', 'E', current_date + 365);
insert into public.vehicles (id, company_id, business_unit_id, kind, plate, unit_type, capacity_kg) values
  ('e5100000-0000-4000-8000-00000000000a', 'c5100000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'rigid', 'HLI5101', 'dry_van', 30000),
  ('e5100000-0000-4000-8000-00000000000b', 'c5100000-0000-4000-8000-000000000002',
   'b5100000-0000-4000-8000-00000000000b', 'rigid', 'HLI5102', 'dry_van', 30000);
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'c5100000-0000-4000-8000-000000000002'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select ok(
  not has_table_privilege('anon', 'public.freight_ledgers', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.freight_payments', 'select,insert,update,delete'),
  'anon has no privileges on the freight tables'
);
select ok(
  not has_table_privilege('authenticated', 'public.freight_ledgers', 'insert,update,delete,truncate')
  and not has_table_privilege('authenticated', 'public.freight_payments', 'insert,update,delete,truncate'),
  'signed-in users cannot write the freight tables (transitions only by RPC)'
);
select is_empty(
  $$ select tablename from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename in ('freight_ledgers', 'freight_payments') $$,
  'the freight tables are not sent by Realtime'
);
select ok(
  not has_function_privilege('anon', 'public.admin_record_freight_payment(uuid, public.freight_payment_direction, bigint, date, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.shipper_freight_ledger()', 'execute')
  and not has_function_privilege('anon', 'public.carrier_freight_ledger()', 'execute')
  and not has_function_privilege('authenticated', 'public.process_freight_due()', 'execute'),
  'anon runs no freight RPC and nobody but pg_cron runs the daily job'
);

-- The read RPCs return each side's columns only (I.0.3).
select ok(
  pg_get_function_result('public.shipper_freight_ledger()'::regprocedure) !~ '(commission|net|carrier)',
  'the shipper''s read returns no commission, net nor carrier column'
);
select ok(
  pg_get_function_result('public.carrier_freight_ledger()'::regprocedure) !~ '(client|terms|amount_cents)',
  'the carrier''s read returns no column of the client'
);

-- The freight settings, for the admins only.
select is(tests.sees('a5100000-0000-4000-8000-000000000001',
  $$ select 1 from public.platform_settings where key like 'freight.%' $$), 0::bigint,
  'a shipper cannot read the commission setting');
select is(tests.sees('a5100000-0000-4000-8000-000000000003',
  $$ select 1 from public.platform_settings where key like 'freight.%' $$), 0::bigint,
  'a carrier cannot read the commission setting');
select is(tests.sees('a5100000-0000-4000-8000-000000000008',
  $$ select 1 from public.platform_settings where key = 'freight.commission_bps' and value = '300' $$), 1::bigint,
  'the admin reads the commission setting: 3 % by default');
select is(tests.sees('a5100000-0000-4000-8000-000000000001',
  $$ select 1 from public.platform_settings where key = 'billing.pilot_mode' $$), 1::bigint,
  'the other settings are still readable by every signed-in user');

-- ---------------------------------------------------------------------------
-- Rounding: the same cases as commissionCents (freight.test.ts)
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select public.freight_commission_cents(a, b) from (values
       (1000000::bigint, 300), (1000050, 300), (1000016, 300), (1000017, 300), (4100000, 500),
       (1, 500), (10, 500), (999999, 0), (10000000000, 500)) as t(a, b) $$,
  $$ values (30000::bigint), (30002), (30000), (30001), (205000), (0), (1), (0), (500000000) $$,
  'freight_commission_cents rounds to the cent, half up, like commissionCents'
);
select is(public.freight_due_on('2026-11-11T05:30:00Z', 30::smallint), '2026-12-10'::date,
  'the due date counts from the day of the delivery in Mexico City (23:30 on Nov 10)');
select is(public.freight_due_on(null, 30::smallint), null::date, 'no due date without a delivery');

-- ---------------------------------------------------------------------------
-- A ledger per trip, with the commission frozen at its creation
-- ---------------------------------------------------------------------------
insert into tests.vals select 'trip1', tests.trip('a5100000-0000-4000-8000-000000000001',
  'a5100000-0000-4000-8000-000000000004', 'e5100000-0000-4000-8000-00000000000a', 1000000);

select results_eq(
  $$ select client_amount_cents, commission_bps, commission_cents, carrier_net_cents, client_terms_days,
            client_due_on, client_status::text, carrier_status::text
     from public.freight_ledgers where trip_id = tests.val('trip1') $$,
  $$ values (1000000::bigint, 300, 30000::bigint, 970000::bigint, null::smallint, null::date, 'pending', 'pending') $$,
  'accepting an offer of $10,000 creates its ledger: 3 % is $300, $9,700 net, terms to be defined'
);

-- The admin raises the commission: only new trips take it.
set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.admin_set_platform_setting('freight.commission_bps', '450') $$, '42501', null,
  'only admins change the commission'
);
select tests.login('a5100000-0000-4000-8000-000000000008');
select throws_ok($$ select public.admin_set_platform_setting('freight.commission_bps', '250') $$, '22023', null,
  'a commission under 3 % (other than 0) is refused');
select throws_ok($$ select public.admin_set_platform_setting('freight.commission_bps', '501') $$, '22023', null,
  'a commission over 5 % is refused');
select throws_ok($$ select public.admin_set_platform_setting('freight.commission_bps', '"300"') $$, '22023', null,
  'a commission that is not a number is refused');
select throws_ok($$ select public.admin_set_platform_setting('freight.commission_bps', '300.5') $$, '22023', null,
  'a commission with decimals is refused');
select lives_ok($$ select public.admin_set_platform_setting('freight.commission_bps', '450') $$,
  'the admin sets the commission to 4.5 %');
reset role;

insert into tests.vals select 'trip2', tests.trip('a5100000-0000-4000-8000-000000000001',
  'a5100000-0000-4000-8000-000000000004', 'e5100000-0000-4000-8000-00000000000a', 2000000);
select is(tests.ledger(tests.val('trip2'), 'commission_bps'), '450', 'a new trip takes the new commission');
select is(tests.ledger(tests.val('trip1'), 'commission_bps'), '300', 'an existing trip keeps the commission it froze');

-- A carrier override of 0 (a pilot without commission, §I.2).
set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000008');
select throws_ok($$ select public.admin_set_company_commission('c5100000-0000-4000-8000-000000000002', 299) $$,
  '22023', null, 'an override out of range is refused');
select throws_ok($$ select public.admin_set_company_commission('c5100000-0000-4000-8000-000000000001', 300) $$,
  '22023', null, 'a shipper has no commission');
select lives_ok($$ select public.admin_set_company_commission('c5100000-0000-4000-8000-000000000002', 0) $$,
  'the admin sets the carrier''s commission to 0');
select tests.login('a5100000-0000-4000-8000-000000000003');
select throws_ok($$ select public.admin_set_company_commission('c5100000-0000-4000-8000-000000000002', 500) $$,
  '42501', null, 'the Gerente cannot set their own commission');
reset role;

insert into tests.vals select 'trip3', tests.trip('a5100000-0000-4000-8000-000000000001',
  'a5100000-0000-4000-8000-000000000004', 'e5100000-0000-4000-8000-00000000000a', 1234567);
select results_eq(
  $$ select commission_bps, commission_cents, carrier_net_cents from public.freight_ledgers where trip_id = tests.val('trip3') $$,
  $$ values (0, 0::bigint, 1234567::bigint) $$,
  'with the override at 0 the carrier gets the whole freight'
);

-- Another shipper's trip, won by unit B.
insert into tests.vals select 'trip4', tests.trip('a5100000-0000-4000-8000-000000000002',
  'a5100000-0000-4000-8000-000000000005', 'e5100000-0000-4000-8000-00000000000b', 500000);

select throws_ok(
  $$ update public.freight_ledgers set carrier_net_cents = carrier_net_cents - 1 where trip_id = tests.val('trip1') $$,
  '23514', null, 'the parts always add up to the total'
);
select throws_ok(
  $$ update public.freight_ledgers set client_status = 'invoiced' where trip_id = tests.val('trip4') $$,
  '23514', null, 'nothing is invoiced while the terms are to be defined'
);
set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000008');
select throws_ok(
  $$ update public.freight_ledgers set client_status = 'paid' where trip_id = tests.val('trip1') $$,
  '42501', null, 'not even the admin changes a status without the RPCs'
);
reset role;

-- ---------------------------------------------------------------------------
-- Terms and due dates
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000003');
select throws_ok($$ select public.admin_set_company_payment_terms('c5100000-0000-4000-8000-000000000001', 30) $$,
  '42501', null, 'only admins set the terms');
select tests.login('a5100000-0000-4000-8000-000000000008');
select throws_ok($$ select public.admin_set_company_payment_terms('c5100000-0000-4000-8000-000000000001', 45) $$,
  '22023', null, 'terms are 15, 30 or 60 days');
select throws_ok($$ select public.admin_set_company_payment_terms('c5100000-0000-4000-8000-000000000002', 30) $$,
  '22023', null, 'a carrier has no payment terms');
select lives_ok($$ select public.admin_set_company_payment_terms('c5100000-0000-4000-8000-000000000001', 30) $$,
  'the admin gives the shipper 30 days');
reset role;
select is(
  (select string_agg(coalesce(f.client_terms_days::text, '-'), ',' order by v.name)
   from public.freight_ledgers f join tests.vals v on v.id = f.trip_id
   where v.name in ('trip1', 'trip2', 'trip3', 'trip4')),
  '30,30,30,-', 'the shipper''s pending trips take the terms; the other shipper''s do not'
);
select is(
  (select count(*)::int from public.audit_log where table_name = 'companies'
     and record_id = 'c5100000-0000-4000-8000-000000000001' and new_data ->> 'payment_terms_days' = '30'),
  1, 'the change of terms is audited'
);

-- Delivery (the RPCs need the evidence; here the trips are moved by the owner).
update public.trips
set status = 'delivered', vehicle_id = 'e5100000-0000-4000-8000-00000000000a',
    operator_id = 'd5100000-0000-4000-8000-000000000006', assigned_at = now(), started_at = now(), delivered_at = now()
where id in (tests.val('trip1'), tests.val('trip2'), tests.val('trip3'));
select results_eq(
  $$ select client_due_on, carrier_due_on from public.freight_ledgers where trip_id = tests.val('trip1') $$,
  $$ values (public.freight_today() + 30, public.freight_today() + 30) $$,
  'the delivery sets the due date: its day plus the terms, the same for the carrier'
);

-- ---------------------------------------------------------------------------
-- The read matrix
-- ---------------------------------------------------------------------------
select is(tests.sees('a5100000-0000-4000-8000-000000000001', 'select * from public.shipper_freight_ledger()'), 3::bigint,
  'the shipper reads its three trips');
select is(tests.sees('a5100000-0000-4000-8000-000000000002', 'select * from public.shipper_freight_ledger()'), 1::bigint,
  'another shipper reads only its own trip');
select is(tests.sees('a5100000-0000-4000-8000-000000000003', 'select * from public.shipper_freight_ledger()'), 0::bigint,
  'the carrier gets nothing from the shipper''s read');
select is(tests.sees('a5100000-0000-4000-8000-000000000003', 'select * from public.carrier_freight_ledger()'), 4::bigint,
  'the Gerente reads every trip of the company');
select is(tests.sees('a5100000-0000-4000-8000-000000000004', 'select * from public.carrier_freight_ledger()'), 3::bigint,
  'the coordinator of unit A reads the trips of unit A');
select is(tests.sees('a5100000-0000-4000-8000-000000000005', 'select * from public.carrier_freight_ledger()'), 1::bigint,
  'the coordinator of unit B reads only the trip of unit B');
select is(tests.sees('a5100000-0000-4000-8000-000000000006', 'select * from public.carrier_freight_ledger()'), 0::bigint,
  'the operator reads nothing, even of the trip they drive');
select is(tests.sees('a5100000-0000-4000-8000-000000000007', 'select * from public.carrier_freight_ledger()'), 0::bigint,
  'another carrier reads nothing');
select is(tests.sees('a5100000-0000-4000-8000-000000000001', 'select * from public.carrier_freight_ledger()'), 0::bigint,
  'the shipper gets nothing from the carrier''s read');
select is(tests.sees('a5100000-0000-4000-8000-000000000003', 'select * from public.freight_ledgers'), 0::bigint,
  'the Gerente cannot read the table itself');
select is(tests.sees('a5100000-0000-4000-8000-000000000001', 'select * from public.freight_ledgers'), 0::bigint,
  'the shipper cannot read the table itself');
select is(tests.sees('a5100000-0000-4000-8000-000000000008',
  $$ select * from public.freight_ledgers where trip_id in (select id from tests.vals where name like 'trip%') $$),
  4::bigint, 'the admin reads the table');
select is(tests.sees('a5100000-0000-4000-8000-000000000008',
  $$ select * from public.admin_freight_ledger() where trip_id in (select id from tests.vals where name like 'trip%') $$),
  4::bigint, 'the admin reads both sides of every trip');
set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000003');
select throws_ok($$ select * from public.admin_freight_ledger() $$, '42501', null, 'only admins read both sides');
reset role;
select is(
  tests.read('a5100000-0000-4000-8000-000000000003',
    format($$ select concat_ws(',', freight_cents, commission_cents, net_cents, due_on)
              from public.carrier_freight_ledger() where trip_id = %L $$, tests.val('trip1'))),
  concat_ws(',', 1000000, 30000, 970000, public.freight_today() + 30),
  'the carrier reads the freight, the commission, its net and its date'
);
select is(
  tests.read('a5100000-0000-4000-8000-000000000001',
    format($$ select concat_ws(',', amount_cents, terms_days, due_on, status)
              from public.shipper_freight_ledger() where trip_id = %L $$, tests.val('trip1'))),
  concat_ws(',', 1000000, 30, public.freight_today() + 30, 'pending'),
  'the shipper reads the amount, its terms, the due date and the status'
);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000003');
select throws_ok(
  format($$ select public.admin_record_freight_payment(%L, 'fulmis_to_carrier', 970000, current_date, 'X1') $$,
         tests.val('trip1')),
  '42501', null, 'the Gerente cannot record a payment'
);
reset role;

insert into tests.vals select 'pay1', tests.pay(tests.val('trip1'), 'client_to_fulmis', 400000, ' spei 0001 ');
select results_eq(
  $$ select client_paid_cents, client_status::text, carrier_status::text from public.freight_ledgers where trip_id = tests.val('trip1') $$,
  $$ values (400000::bigint, 'pending', 'pending') $$,
  'a partial payment of the client adds up and keeps the trip pending'
);
select is(tests.pay(tests.val('trip1'), 'client_to_fulmis', 400000, 'SPEI0001'), tests.val('pay1'),
  'recording the same SPEI reference again returns the same payment');
select is((select count(*)::int from public.freight_payments where spei_reference = 'SPEI0001' and direction = 'client_to_fulmis'),
  1, 'the reference is stored normalized and only once');
select throws_ok(
  $$ select tests.pay(tests.val('trip1'), 'client_to_fulmis', 300000, 'SPEI0001') $$, '23505', null,
  'the same reference with another amount is refused'
);
select lives_ok(
  $$ select tests.pay(tests.val('trip1'), 'fulmis_to_carrier', 100000, 'SPEI0001') $$,
  'the same reference may be used in the other direction'
);
select throws_ok(
  $$ select tests.pay(tests.val('trip1'), 'client_to_fulmis', 600001, 'SPEI0002') $$, '22023', null,
  'a payment over what is owed is refused'
);
select throws_ok(
  $$ select tests.pay(tests.val('trip1'), 'client_to_fulmis', 1000, 'SPEI-0002') $$, '22023', null,
  'a reference with other characters is refused'
);
select throws_ok(
  $$ select tests.pay(tests.val('trip1'), 'client_to_fulmis', 1000, 'SPEI0002', public.freight_today() + 1) $$,
  '22023', null, 'a payment in the future is refused'
);
select lives_ok(
  $$ select tests.pay(tests.val('trip1'), 'client_to_fulmis', 600000, 'SPEI0002') $$,
  'the client pays the rest'
);
select results_eq(
  $$ select client_paid_cents, client_status::text, carrier_status::text from public.freight_ledgers where trip_id = tests.val('trip1') $$,
  $$ values (1000000::bigint, 'paid', 'scheduled') $$,
  'the client''s full payment marks it paid and schedules the carrier''s payment'
);
select is(
  tests.read('a5100000-0000-4000-8000-000000000001',
    format($$ select concat_ws(',', status, paid_cents, pending_cents, jsonb_array_length(payments),
                                 payments @> '[{"amountCents": 100000}]')
              from public.shipper_freight_ledger() where trip_id = %L $$, tests.val('trip1'))),
  'paid,1000000,0,2,f',
  'the shipper reads its two payments and none of the carrier''s'
);
select is(
  tests.read('a5100000-0000-4000-8000-000000000004',
    format($$ select concat_ws(',', status, paid_cents, pending_cents, jsonb_array_length(payments),
                                 payments @> '[{"amountCents": 400000}]')
              from public.carrier_freight_ledger() where trip_id = %L $$, tests.val('trip1'))),
  'scheduled,100000,870000,1,f',
  'the coordinator reads "Programado", its payment and none of the client''s'
);

-- Notifications: each side, its own amount.
select is(tests.notified('a5100000-0000-4000-8000-000000000001', 'freight_payment_received', tests.val('trip1')), 2,
  'the shipper is told of each of its payments');
select is(
  (select array_agg(key order by key) from public.notifications n, jsonb_object_keys(n.data) key
   where n.user_id = 'a5100000-0000-4000-8000-000000000001' and n.type = 'freight_payment_received'
     and n.data ->> 'amountCents' = '400000'),
  array['amountCents', 'destinationCity', 'direction', 'ledgerId', 'loadId', 'originCity', 'paidOn', 'tripId'],
  'the shipper''s notice carries only its own payment, never the carrier''s amounts'
);
select is(
  (select string_agg(concat_ws(':', u.letter, n.data ->> 'direction', n.data ->> 'amountCents'), ',' order by u.letter)
   from public.notifications n
   join (values ('a5100000-0000-4000-8000-000000000003'::uuid, 'M'), ('a5100000-0000-4000-8000-000000000004', 'A'),
                ('a5100000-0000-4000-8000-000000000005', 'B'), ('a5100000-0000-4000-8000-000000000006', 'O'),
                ('a5100000-0000-4000-8000-000000000008', 'Z'))
        as u(id, letter) on u.id = n.user_id
   where n.type = 'freight_payment_received' and n.data ->> 'tripId' = tests.val('trip1')::text),
  'A:fulmis_to_carrier:100000,M:fulmis_to_carrier:100000',
  'Fulmis''s payment goes to the Gerente and the coordinator of the unit, never to the operator nor the admin'
);

select lives_ok($$ select tests.pay(tests.val('trip1'), 'fulmis_to_carrier', 870000, 'SPEI0003') $$,
  'Fulmis pays the carrier the rest');
select is(tests.ledger(tests.val('trip1'), 'carrier_status'), 'paid', 'the carrier''s side is paid');
select throws_ok($$ select tests.pay(tests.val('trip1'), 'fulmis_to_carrier', 1, 'SPEI0004') $$, '55000', null,
  'a side already paid takes no more payments');
select is(
  (select count(*)::int from public.audit_log where table_name = 'freight_payments' and action = 'insert'
     and actor_id = 'a5100000-0000-4000-8000-000000000008'),
  4, 'every payment is audited with the admin who recorded it');

-- ---------------------------------------------------------------------------
-- Overdue and held
-- ---------------------------------------------------------------------------
update public.freight_ledgers
set client_due_on = public.freight_today() - 1, carrier_due_on = public.freight_today() - 1
where trip_id in (tests.val('trip2'), tests.val('trip3'));
update public.freight_ledgers set carrier_status = 'quick_pay_requested' where trip_id = tests.val('trip3');

select is(
  tests.read('a5100000-0000-4000-8000-000000000001',
    format('select status::text from public.shipper_freight_ledger() where trip_id = %L', tests.val('trip2'))),
  'overdue', 'past its due date the shipper already reads it overdue'
);
select is(
  tests.read('a5100000-0000-4000-8000-000000000003',
    format('select status::text from public.carrier_freight_ledger() where trip_id = %L', tests.val('trip2'))),
  'on_hold', 'and the carrier reads it held'
);
-- pg_cron runs it without a user.
select set_config('request.jwt.claims', '', true);
select ok(public.process_freight_due() >= 3, 'the daily job marks the two clients overdue and holds one payment');
select results_eq(
  $$ select f.client_status::text, f.carrier_status::text from public.freight_ledgers f
     join tests.vals v on v.id = f.trip_id where v.name in ('trip2', 'trip3') order by v.name $$,
  $$ values ('overdue', 'on_hold'), ('overdue', 'quick_pay_requested') $$,
  'only a pending payment is held: a quick pay request never goes back'
);
select is(tests.notified('a5100000-0000-4000-8000-000000000008', 'freight_overdue', tests.val('trip2')), 1,
  'the admin is told of the overdue client');
select is(tests.notified('a5100000-0000-4000-8000-000000000001', 'freight_overdue', tests.val('trip2')), 1,
  'and so is the shipper');
select is(
  (select string_agg(n.user_id::text, ',' order by n.user_id) from public.notifications n
   where n.type = 'freight_on_hold' and n.data ->> 'tripId' = tests.val('trip2')::text),
  'a5100000-0000-4000-8000-000000000003,a5100000-0000-4000-8000-000000000004',
  'the held payment is told to the Gerente and the coordinator of the unit, never to the operator'
);
select is(
  (select (data ->> 'amountCents')::bigint from public.notifications
   where type = 'freight_on_hold' and data ->> 'tripId' = tests.val('trip2')::text
     and user_id = 'a5100000-0000-4000-8000-000000000003'),
  (select carrier_net_cents from public.freight_ledgers where trip_id = tests.val('trip2')),
  'the held notice carries the carrier''s net, not the client''s amount'
);
select is(public.process_freight_due(), 0, 'running it again changes nothing');

select lives_ok($$ select tests.pay(tests.val('trip2'), 'client_to_fulmis', 2000000, 'SPEI0005') $$,
  'the overdue client pays');
select results_eq(
  $$ select client_status::text, carrier_status::text from public.freight_ledgers where trip_id = tests.val('trip2') $$,
  $$ values ('paid', 'scheduled') $$,
  'the held payment is scheduled once the client paid'
);

-- ---------------------------------------------------------------------------
-- A cancelled trip
-- ---------------------------------------------------------------------------
select lives_ok($$ select tests.pay(tests.val('trip4'), 'client_to_fulmis', 100000, 'SPEI0006') $$,
  'a payment without terms is recorded too');
set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000002');
select lives_ok(format($$ select public.cancel_trip(%L, 'El pedido se canceló.') $$, tests.val('trip4')),
  'the other shipper cancels its trip');
reset role;
select results_eq(
  $$ select client_status::text, carrier_status::text, needs_review from public.freight_ledgers where trip_id = tests.val('trip4') $$,
  $$ values ('cancelled', 'cancelled', true) $$,
  'the ledger is cancelled on both sides and flagged for the admin: it had a payment'
);
select throws_ok($$ select tests.pay(tests.val('trip4'), 'client_to_fulmis', 1000, 'SPEI0007') $$, '55000', null,
  'a cancelled trip takes no new payments');
select is(tests.sees('a5100000-0000-4000-8000-000000000002', 'select * from public.shipper_freight_ledger()'), 0::bigint,
  'the cancelled trip leaves the shipper''s Cartera');
select is(tests.sees('a5100000-0000-4000-8000-000000000005', 'select * from public.carrier_freight_ledger()'), 0::bigint,
  'and the carrier''s Cobranza');
set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000008');
select lives_ok(format($$ select public.admin_resolve_freight_review(%L, 'Se devolvió por SPEI.') $$, tests.val('trip4')),
  'the admin marks the review as resolved');
select throws_ok(format($$ select public.admin_resolve_freight_review(%L, 'Otra vez.') $$, tests.val('trip4')),
  '55000', null, 'there is nothing left to resolve');
reset role;

-- A client that pays before its terms are set still gets them: the
-- carrier's scheduled payment takes its date from them.
insert into tests.vals select 'trip5', tests.trip('a5100000-0000-4000-8000-000000000002',
  'a5100000-0000-4000-8000-000000000004', 'e5100000-0000-4000-8000-00000000000a', 400000);
update public.trips
set status = 'delivered', vehicle_id = 'e5100000-0000-4000-8000-00000000000a',
    operator_id = 'd5100000-0000-4000-8000-000000000006', assigned_at = now(), started_at = now(), delivered_at = now()
where id = tests.val('trip5');
select lives_ok($$ select tests.pay(tests.val('trip5'), 'client_to_fulmis', 400000, 'SPEI0008') $$,
  'the other shipper pays in full before having terms');
set local role authenticated;
select tests.login('a5100000-0000-4000-8000-000000000008');
select lives_ok($$ select public.admin_set_company_payment_terms('c5100000-0000-4000-8000-000000000004', 15) $$,
  'the admin then gives it 15 days');
reset role;
select results_eq(
  $$ select v.name, f.client_terms_days, f.client_due_on, f.carrier_due_on, f.client_status::text, f.carrier_status::text
     from public.freight_ledgers f join tests.vals v on v.id = f.trip_id
     where v.name in ('trip4', 'trip5') order by v.name $$,
  $$ values ('trip4', null::smallint, null::date, null::date, 'cancelled', 'cancelled'),
            ('trip5', 15::smallint, public.freight_today() + 15, public.freight_today() + 15, 'paid', 'scheduled') $$,
  'the paid trip takes the terms and its dates, keeping its statuses; the cancelled one keeps none'
);

select * from finish();
rollback;
