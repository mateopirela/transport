-- I3 fix · The carrier is paid once the client paid (D33-E1) and the carrier's
-- commission override is the admin's (plan-v1.md §I3):
--   * admin_record_freight_payment refuses a payment `fulmis_to_carrier`
--     (55000 "the client has not paid this trip yet") while the client's side
--     is not `paid`: pending with partial payments, overdue and held; the
--     client's partial payments still add up; once the client paid in full,
--     the carrier's partial and full payments go through;
--   * with an approved quick pay (D38, I4: quick_pay_approved_at), Fulmis pays
--     the carrier before the client; a rejected one does not count;
--   * companies.commission_bps: no signed-in user reads the column (Gerente,
--     coordinator, operator, shipper, admin by the table), every other column
--     still reads; admins read it through admin_company_commission_bps, nobody
--     else; new trips still freeze the override.
begin;
create extension if not exists pgtap with schema extensions;

select plan(37);

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
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@i3fix.test', now(),
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
    'destination', jsonb_build_object('address', 'Av. Juárez 300', 'city', 'Guadalajara',
                                      'state', 'Jalisco', 'lat', 20.6767, 'lng', -103.3475),
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

-- Runs p_sql as p_uid: 'ok', or the SQLSTATE and the message of its error.
create function tests.try(p_uid uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v_state text;
  v_message text;
begin
  perform tests.login(p_uid);
  execute 'set local role authenticated';
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
    execute 'reset role';
    return v_state || ':' || v_message;
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

-- A payment recorded by the admin: 'ok' or the error.
create function tests.pay(p_trip text, p_direction text, p_amount bigint, p_reference text)
returns text
language sql
as $$
  select tests.try('a6100000-0000-4000-8000-000000000008', format(
    'select public.admin_record_freight_payment(%L, %L, %s, public.freight_today(), %L)',
    tests.val(p_trip), p_direction, p_amount, p_reference));
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

grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures. Users a61…: 01 S shipper, 03 M manager, 04 A coordinator of the
-- unit, 06 O operator, 08 Z admin.
-- ---------------------------------------------------------------------------
select tests.new_user('a6100000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a6100000-0000-4000-8000-000000000003', 'manager');
select tests.new_user('a6100000-0000-4000-8000-000000000004', 'coordinator');
select tests.new_user('a6100000-0000-4000-8000-000000000006', 'operator');
select tests.new_user('a6100000-0000-4000-8000-000000000008', 'shipper');
update public.profiles set role = 'admin' where id = 'a6100000-0000-4000-8000-000000000008';

insert into public.companies (id, type, legal_name, rfc, status, payment_terms_days) values
  ('c6100000-0000-4000-8000-000000000001', 'shipper', 'Envíos Gate SA de CV', 'EGA050505GH7', 'approved', 30);
insert into public.companies (id, type, legal_name, rfc, status) values
  ('c6100000-0000-4000-8000-000000000002', 'carrier', 'Fletes Gate SA de CV', 'FGA040404CD7', 'approved');
update public.profiles set company_id = 'c6100000-0000-4000-8000-000000000001'
where id = 'a6100000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c6100000-0000-4000-8000-000000000002'
where id in ('a6100000-0000-4000-8000-000000000003', 'a6100000-0000-4000-8000-000000000004',
             'a6100000-0000-4000-8000-000000000006');

insert into tests.vals select 'bu_a', id from public.business_units where company_id = 'c6100000-0000-4000-8000-000000000002';
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id) values
  (tests.val('bu_a'), 'c6100000-0000-4000-8000-000000000002', 'a6100000-0000-4000-8000-000000000004');
insert into public.operators (id, company_id, business_unit_id, profile_id, full_name, license_type, license_expires_on) values
  ('d6100000-0000-4000-8000-000000000006', 'c6100000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'a6100000-0000-4000-8000-000000000006', 'Óscar Gate', 'E', current_date + 365);
insert into public.vehicles (id, company_id, business_unit_id, kind, plate, unit_type, capacity_kg) values
  ('e6100000-0000-4000-8000-00000000000a', 'c6100000-0000-4000-8000-000000000002', tests.val('bu_a'),
   'rigid', 'HGA6101', 'dry_van', 30000);
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'c6100000-0000-4000-8000-000000000002'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- Three trips of $12,345.67, delivered (the owner moves them; the RPCs need
-- the evidence), with the carrier's CFDI registered (I5) for the quick pay.
insert into tests.vals select 'trip' || i, tests.trip('a6100000-0000-4000-8000-000000000001',
  'a6100000-0000-4000-8000-000000000004', 'e6100000-0000-4000-8000-00000000000a', 1234567)
from generate_series(1, 3) as i;
update public.trips
set status = 'delivered', vehicle_id = 'e6100000-0000-4000-8000-00000000000a',
    operator_id = 'd6100000-0000-4000-8000-000000000006', assigned_at = now(), started_at = now(), delivered_at = now()
where id in (tests.val('trip1'), tests.val('trip2'), tests.val('trip3'));
insert into public.freight_invoices (
  trip_id, direction, cfdi_uuid, issuer_rfc, receiver_rfc, total_cents, currency, issued_at, validation, xml_path
)
select f.trip_id, 'carrier_to_fulmis', gen_random_uuid(), 'FGA040404CD7', 'FUL201015AB1',
       f.carrier_net_cents, 'MXN', now(), 'unvalidated', f.trip_id || '/carrier_to_fulmis/' || gen_random_uuid() || '.xml'
from public.freight_ledgers f where f.trip_id in (tests.val('trip2'), tests.val('trip3'));

-- ---------------------------------------------------------------------------
-- D33-E1: the carrier is paid once the client paid
-- ---------------------------------------------------------------------------
select is(tests.pay('trip1', 'client_to_fulmis', 500000, 'GATECLI1'), 'ok', 'the client pays $5,000 of $12,345.67');
select is(
  tests.pay('trip1', 'fulmis_to_carrier', (tests.ledger('trip1', 'carrier_net_cents'))::bigint, 'GATECAR1'),
  '55000:the client has not paid this trip yet',
  'the carrier''s whole net is refused while the client paid only part'
);
select is(tests.pay('trip1', 'fulmis_to_carrier', 100, 'GATECAR2'), '55000:the client has not paid this trip yet',
  'and so is a partial payment to the carrier');
select is(
  tests.ledger('trip1', 'client_paid_cents, client_status, carrier_paid_cents, carrier_status'),
  '500000,pending,0,pending', 'nothing changed on the carrier''s side'
);
select is(
  (select count(*)::int from public.freight_payments p join public.freight_ledgers f on f.id = p.ledger_id
   where f.trip_id = tests.val('trip1') and p.direction = 'fulmis_to_carrier'),
  0, 'no payment to the carrier was stored'
);
select is(tests.pay('trip1', 'client_to_fulmis', 300000, 'GATECLI2'), 'ok', 'the client''s partial payments still add up');
select is(tests.ledger('trip1', 'client_paid_cents, client_status'), '800000,pending', 'the client owes the rest');

-- Overdue and held: still the client's money first.
update public.freight_ledgers
set client_due_on = public.freight_today() - 1, carrier_due_on = public.freight_today() - 1
where trip_id = tests.val('trip1');
select ok(public.process_freight_due() >= 2, 'the daily job marks the client overdue and holds the carrier');
select is(tests.ledger('trip1', 'client_status, carrier_status'), 'overdue,on_hold', 'overdue and held');
select is(tests.pay('trip1', 'fulmis_to_carrier', 100, 'GATECAR3'), '55000:the client has not paid this trip yet',
  'a held payment is not paid while the client is overdue');

select is(tests.pay('trip1', 'client_to_fulmis', 434567, 'GATECLI3'), 'ok', 'the client pays the rest');
select is(tests.ledger('trip1', 'client_status, carrier_status'), 'paid,scheduled',
  'the client paid: the carrier''s payment is scheduled');
select is(tests.pay('trip1', 'fulmis_to_carrier', 100000, 'GATECAR4'), 'ok', 'now Fulmis pays the carrier in part');
select is(
  tests.pay('trip1', 'fulmis_to_carrier', (tests.ledger('trip1', 'carrier_net_cents - carrier_paid_cents'))::bigint,
            'GATECAR5'),
  'ok', 'and the rest'
);
select is(tests.ledger('trip1', 'carrier_paid_cents = carrier_net_cents, carrier_status'), 't,paid',
  'the carrier''s side is paid');

-- ---------------------------------------------------------------------------
-- D38: an approved quick pay is paid before the client
-- ---------------------------------------------------------------------------
select is(tests.try('a6100000-0000-4000-8000-000000000003', format('select public.request_quick_pay(%L, 250)', tests.val('trip2'))),
  'ok', 'the Gerente asks for the quick pay of trip 2');
select is(tests.pay('trip2', 'fulmis_to_carrier', 100, 'GATEQP1'),
  '55000:a quick pay request is pending: approve or reject it first', 'not while the request waits');
select is(tests.try('a6100000-0000-4000-8000-000000000008', format('select public.admin_approve_quick_pay(%L)', tests.val('trip2'))),
  'ok', 'the admin approves it');
select is(tests.ledger('trip2', 'client_paid_cents, client_status, carrier_status, quick_pay_approved_at is not null'),
  '0,pending,scheduled,t', 'approved and scheduled, with nothing from the client');
select is(
  tests.pay('trip2', 'fulmis_to_carrier', (tests.ledger('trip2', 'carrier_net_cents - quick_pay_fee_cents'))::bigint,
            'GATEQP2'),
  'ok', 'Fulmis pays the quick net before the client pays'
);
select is(tests.ledger('trip2', 'client_status, carrier_status'), 'pending,paid',
  'the carrier is paid; the client still owes it all');
select is(tests.pay('trip2', 'client_to_fulmis', 200000, 'GATEQP3'), 'ok', 'and the client still pays in part');

-- A rejected quick pay does not count.
select is(tests.try('a6100000-0000-4000-8000-000000000003', format('select public.request_quick_pay(%L, 250)', tests.val('trip3'))),
  'ok', 'the Gerente asks for the quick pay of trip 3');
select is(tests.try('a6100000-0000-4000-8000-000000000008',
    format('select public.admin_reject_quick_pay(%L, %L)', tests.val('trip3'), 'Sin fondos.')),
  'ok', 'the admin rejects it');
select is(tests.pay('trip3', 'fulmis_to_carrier', 100, 'GATEQP4'), '55000:the client has not paid this trip yet',
  'rejected, the carrier waits for the client');

-- ---------------------------------------------------------------------------
-- companies.commission_bps: the admin's only
-- ---------------------------------------------------------------------------
select ok(
  not has_column_privilege('authenticated', 'public.companies', 'commission_bps', 'select')
  and not has_column_privilege('anon', 'public.companies', 'commission_bps', 'select'),
  'no client role reads companies.commission_bps'
);
select is(tests.try('a6100000-0000-4000-8000-000000000008',
    format('select public.admin_set_company_commission(%L, 450)', 'c6100000-0000-4000-8000-000000000002')),
  'ok', 'the admin sets a 4.5 % override');
select results_eq(
  $$ select u.letter, tests.try(u.id, 'select commission_bps from public.companies')
     from (values ('M', 'a6100000-0000-4000-8000-000000000003'::uuid), ('A', 'a6100000-0000-4000-8000-000000000004'),
                  ('O', 'a6100000-0000-4000-8000-000000000006'), ('S', 'a6100000-0000-4000-8000-000000000001'),
                  ('Z', 'a6100000-0000-4000-8000-000000000008')) as u(letter, id)
     order by u.letter $$,
  $$ values ('A', '42501:permission denied for table companies'), ('M', '42501:permission denied for table companies'),
            ('O', '42501:permission denied for table companies'), ('S', '42501:permission denied for table companies'),
            ('Z', '42501:permission denied for table companies') $$,
  'nobody reads the column by the table: Gerente, coordinator, operator, shipper nor admin'
);
select is(
  tests.as_user('a6100000-0000-4000-8000-000000000006',
    $$ select concat_ws(',', count(*), min(legal_name), bool_and(not is_owner_operator)) from public.companies $$),
  '1,Fletes Gate SA de CV,t', 'the operator still reads the other columns of its company'
);
select is(
  tests.as_user('a6100000-0000-4000-8000-000000000003',
    $$ select concat_ws(',', type, status, rfc) from public.companies $$),
  'carrier,approved,FGA040404CD7', 'and so does the Gerente'
);
select is(
  tests.as_user('a6100000-0000-4000-8000-000000000001', $$ select payment_terms_days::text from public.companies $$),
  '30', 'the shipper still reads its own terms (Cartera)'
);
select is(
  tests.as_user('a6100000-0000-4000-8000-000000000008',
    format('select public.admin_company_commission_bps(%L)::text', 'c6100000-0000-4000-8000-000000000002')),
  '450', 'the admin reads the override through its RPC'
);
select results_eq(
  $$ select u.letter,
            tests.try(u.id, 'select public.admin_company_commission_bps(''c6100000-0000-4000-8000-000000000002'')')
     from (values ('M', 'a6100000-0000-4000-8000-000000000003'::uuid), ('A', 'a6100000-0000-4000-8000-000000000004'),
                  ('O', 'a6100000-0000-4000-8000-000000000006'), ('S', 'a6100000-0000-4000-8000-000000000001')) as u(letter, id)
     order by u.letter $$,
  $$ values ('A', '42501:only admins read commissions'), ('M', '42501:only admins read commissions'),
            ('O', '42501:only admins read commissions'), ('S', '42501:only admins read commissions') $$,
  'nobody else runs it'
);
select is(tests.try('a6100000-0000-4000-8000-000000000008',
    format('select public.admin_company_commission_bps(%L)', gen_random_uuid())),
  'P0002:company not found', 'an unknown company is not found');

-- The override is still frozen on the new trips (the ledger's trigger).
insert into tests.vals select 'trip4', tests.trip('a6100000-0000-4000-8000-000000000001',
  'a6100000-0000-4000-8000-000000000004', 'e6100000-0000-4000-8000-00000000000a', 1000000);
select is(tests.ledger('trip4', 'commission_bps, commission_cents'), '450,45000', 'a new trip freezes the 4.5 %');
select is(tests.try('a6100000-0000-4000-8000-000000000008',
    format('select public.admin_set_company_commission(%L, null)', 'c6100000-0000-4000-8000-000000000002')),
  'ok', 'the admin clears it');
select is(
  coalesce(tests.as_user('a6100000-0000-4000-8000-000000000008',
    format('select public.admin_company_commission_bps(%L)::text', 'c6100000-0000-4000-8000-000000000002')), 'null'),
  'null', 'without an override the RPC returns null (the general commission)'
);

select * from finish();
rollback;
