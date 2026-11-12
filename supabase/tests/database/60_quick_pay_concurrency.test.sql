-- Quick pay under concurrency (two real sessions, dblink):
--   * the Gerente and the Coordinador ask for the quick pay of the same trip
--     at once: the second waits for the ledger and is refused, the trip is
--     requested once and the admins are told once;
--   * the admin approves two requests at once (two tabs) with room for one
--     under the exposure limit: the second waits for the first (the exposure
--     is a sum over every ledger) and then asks for a confirmation;
--   * the client's full payment while the admin approves the same trip: the
--     payment waits, and the approved quick pay stays (Fulmis paid early; the
--     fee was the carrier's choice);
--   * a carrier CFDI registered "Sin validar" while the admin saves Fulmis'
--     RFC (I4 fix, 65_quick_pay_validated_cfdi), either first: it is
--     validated all the same, none is left "Sin validar" for the quick pay.
-- Committed fixtures through the setup connection, deleted at the end (same
-- approach as 54_freight_ledger_concurrency).
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(20);

create schema tests;

create function tests.conninfo()
returns text
language sql
as $$
  select format(
    'host=%s port=%s dbname=%s user=postgres password=postgres',
    host(inet_server_addr()), inet_server_port(), current_database()
  )
$$;

create table tests.pids (conn text primary key, pid integer not null);

create function tests.connect(p_conn text)
returns void
language sql
as $$
  select extensions.dblink_connect(p_conn, tests.conninfo());
  insert into tests.pids
  select p_conn, pid from extensions.dblink(p_conn, 'select pg_backend_pid()') as t(pid integer);
$$;

-- Opens a transaction in a session as the given user.
create function tests.begin_as(p_conn text, p_user uuid)
returns void
language sql
as $$
  select extensions.dblink_exec(p_conn, 'begin');
  select extensions.dblink_exec(p_conn, 'set local lock_timeout = ''15s''');
  select extensions.dblink_exec(p_conn, 'set local role authenticated');
  select extensions.dblink_exec(
    p_conn,
    format('set local request.jwt.claims = %L', jsonb_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal2')::text)
  );
$$;

create function tests.wait_until_blocked(p_conn text)
returns boolean
language plpgsql
as $$
declare
  v_pid integer := (select pid from tests.pids where conn = p_conn);
begin
  for i in 1..200 loop
    if cardinality(pg_blocking_pids(v_pid)) > 0 then
      return true;
    end if;
    perform pg_sleep(0.05);
  end loop;
  return false;
end;
$$;

-- Runs p_sql on the setup connection as p_user (committed) and returns one text value.
create function tests.as_user(p_user uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  perform extensions.dblink_exec('setup', format(
    'set request.jwt.claims = %L', jsonb_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal2')::text
  ));
  select r into v from extensions.dblink('setup', p_sql) as t(r text);
  perform extensions.dblink_exec('setup', 'reset request.jwt.claims');
  return v;
end;
$$;

create function tests.peek(p_sql text)
returns text
language sql
as $$ select v from extensions.dblink('setup', p_sql) as t(v text) $$;

create table tests.vals (name text primary key, id uuid not null);

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

create function tests.request_sql(p_trip text)
returns text
language sql
stable
as $$ select format('select public.request_quick_pay(%L, 250)::text', tests.val(p_trip)) $$;

create function tests.approve_sql(p_trip text)
returns text
language sql
stable
as $$ select format('select public.admin_approve_quick_pay(%L)::text', tests.val(p_trip)) $$;

-- Removes this file's committed fixtures (also leftovers of an aborted run).
create function tests.cleanup()
returns void
language sql
as $$
  select extensions.dblink_exec('setup', $sql$
    reset request.jwt.claims;
    update public.platform_settings set value = 'null'
    where key in ('freight.quick_pay_exposure_limit_cents', 'fulmis.rfc');
    -- The admins of the seed were told of these requests too.
    delete from public.notifications
    where data ->> 'tripId' in (
      select id::text from public.trips where shipper_company_id = 'c6000000-0000-4000-8000-000000000001'
    );
    alter table public.trip_events disable trigger trip_events_immutable;
    delete from public.trip_events
    where trip_id in (select id from public.trips where shipper_company_id = 'c6000000-0000-4000-8000-000000000001');
    alter table public.trip_events enable trigger trip_events_immutable;
    delete from public.conversations where shipper_company_id = 'c6000000-0000-4000-8000-000000000001';
    delete from public.document_shares where shipper_company_id = 'c6000000-0000-4000-8000-000000000001';
    delete from public.trips where shipper_company_id = 'c6000000-0000-4000-8000-000000000001';
    update public.loads
    set status = 'draft', accepted_offer_id = null, carrier_company_id = null, agreed_price_cents = null,
        contracted_at = null
    where shipper_company_id = 'c6000000-0000-4000-8000-000000000001';
    delete from public.offers where shipper_company_id = 'c6000000-0000-4000-8000-000000000001';
    delete from public.negotiations where shipper_company_id = 'c6000000-0000-4000-8000-000000000001';
    delete from public.loads where shipper_company_id = 'c6000000-0000-4000-8000-000000000001';
    delete from public.vehicle_availability where company_id = 'c6000000-0000-4000-8000-000000000002';
    delete from public.documents where company_id = 'c6000000-0000-4000-8000-000000000002';
    delete from public.vehicles where company_id = 'c6000000-0000-4000-8000-000000000002';
    delete from public.operators where company_id = 'c6000000-0000-4000-8000-000000000002';
    alter table public.audit_log disable trigger audit_log_immutable;
    delete from public.audit_log
    where actor_id = 'a6000000-0000-4000-8000-000000000003'
       or company_id in ('c6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002');
    alter table public.audit_log enable trigger audit_log_immutable;
    delete from public.business_unit_coordinators where company_id = 'c6000000-0000-4000-8000-000000000002';
    delete from auth.users where id in (
      'a6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000002',
      'a6000000-0000-4000-8000-000000000003', 'a6000000-0000-4000-8000-000000000004'
    );
    delete from public.business_units where company_id = 'c6000000-0000-4000-8000-000000000002';
    delete from public.companies where id in ('c6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002');
  $sql$);
$$;

select tests.connect('setup');
select tests.connect('s1');
select tests.connect('s2');
-- Leftovers of an interrupted run, if any.
select tests.cleanup();

-- ---------------------------------------------------------------------------
-- Fixtures (committed): S shipper, M manager, Z admin, C coordinator of the
-- carrier's unit; four trips of S won by M, of $10,000 each ($9,700 net),
-- delivered, with the carrier's CFDI.
-- ---------------------------------------------------------------------------
select extensions.dblink_exec('setup', $sql$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    ('a6000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 's@i4c.test', now(), null, '{"role":"shipper","phone":"+525500000000"}', now(), now()),
    ('a6000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'm@i4c.test', now(), null, '{"role":"manager","phone":"+525500000000"}', now(), now()),
    ('a6000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'z@i4c.test', now(), null, '{"role":"shipper","phone":"+525500000000"}', now(), now()),
    ('a6000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'c@i4c.test', now(), null, '{"role":"coordinator","phone":"+525500000000"}', now(), now());
  update public.profiles set role = 'admin' where id = 'a6000000-0000-4000-8000-000000000003';
  insert into public.companies (id, type, legal_name, rfc, status, payment_terms_days) values
    ('c6000000-0000-4000-8000-000000000001', 'shipper', 'Envíos Concurrentes SA de CV', 'ECO050505GH5', 'approved', 30);
  insert into public.companies (id, type, legal_name, rfc, status) values
    ('c6000000-0000-4000-8000-000000000002', 'carrier', 'Fletes Concurrentes SA de CV', 'FCO040404CD4', 'approved');
  update public.profiles set company_id = 'c6000000-0000-4000-8000-000000000001'
  where id = 'a6000000-0000-4000-8000-000000000001';
  update public.profiles set company_id = 'c6000000-0000-4000-8000-000000000002'
  where id in ('a6000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000004');
  insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id)
  select b.id, b.company_id, 'a6000000-0000-4000-8000-000000000004'
  from public.business_units b where b.company_id = 'c6000000-0000-4000-8000-000000000002';
  insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
    ('e6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002', 'rigid', 'HCO6001', 'dry_van', 30000);
  insert into public.operators (id, company_id, full_name, license_type, license_expires_on) values
    ('d6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002', 'Óscar Concurrente', 'E',
     current_date + 365);
  insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
  select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
         'approved', case when r.requires_expiry then now() + interval '1 year' end
  from public.vehicles v
  cross join public.document_requirements r
  where v.company_id = 'c6000000-0000-4000-8000-000000000002'
    and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;
$sql$);

do $$
declare
  v_load uuid;
  v_offer uuid;
begin
  -- trip5 and trip6: no CFDI yet (section 4).
  for i in 1..6 loop
    v_load := tests.as_user('a6000000-0000-4000-8000-000000000001', $sql$
      select public.create_load(jsonb_build_object(
        'origin', jsonb_build_object('address', 'Av. Constitución 100', 'city', 'Monterrey', 'state', 'Nuevo León',
                                     'lat', 25.6866, 'lng', -100.3161),
        'destination', jsonb_build_object('address', 'Blvd. Venustiano Carranza 200', 'city', 'Saltillo',
                                          'state', 'Coahuila', 'lat', 25.4383, 'lng', -100.9737),
        'pickupWindow', jsonb_build_object('start', now() + interval '1 day', 'end', now() + interval '1 day 4 hours'),
        'deliveryWindow', jsonb_build_object('start', now() + interval '2 days', 'end', now() + interval '2 days 6 hours'),
        'cargoType', 'palletized', 'description', 'Tarimas', 'weightKg', 8000, 'unitType', 'dry_van',
        'specialRequirements', jsonb_build_array(), 'proposedPriceCents', 1000000
      ))::text
    $sql$)::uuid;
    perform tests.as_user('a6000000-0000-4000-8000-000000000001', format('select public.publish_load(%L)::text', v_load));
    v_offer := tests.as_user('a6000000-0000-4000-8000-000000000002',
      format('select public.make_offer(%L, 1000000, null, %L)::text', v_load, 'e6000000-0000-4000-8000-000000000001'))::uuid;
    insert into tests.vals select 'trip' || i, tests.as_user('a6000000-0000-4000-8000-000000000001',
      format('select public.accept_offer(%L)::text', v_offer))::uuid;
  end loop;
end;
$$;

-- Delivered (the owner moves them; the RPCs need the evidence) and with the
-- carrier's CFDI (as the I5 Edge Function registers it).
select extensions.dblink_exec('setup', format($sql$
  update public.trips
  set status = 'delivered', vehicle_id = 'e6000000-0000-4000-8000-000000000001',
      operator_id = 'd6000000-0000-4000-8000-000000000001', assigned_at = now(), started_at = now(),
      delivered_at = now()
  where id in (%1$L, %2$L, %3$L, %4$L);
  insert into public.freight_invoices (
    trip_id, direction, cfdi_uuid, issuer_rfc, receiver_rfc, total_cents, currency, issued_at, validation, xml_path
  )
  select t.id, 'carrier_to_fulmis', gen_random_uuid(), 'FCO040404CD4', 'FUL201015AB1', 970000, 'MXN', now(),
         'validated', t.id || '/carrier_to_fulmis/' || gen_random_uuid() || '.xml'
  from public.trips t where t.id in (%1$L, %2$L, %3$L, %4$L);
$sql$, tests.val('trip1'), tests.val('trip2'), tests.val('trip3'), tests.val('trip4')));

-- ---------------------------------------------------------------------------
-- 1. The Gerente and the Coordinador ask for the same trip at once
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a6000000-0000-4000-8000-000000000002');
select lives_ok(
  format($$ select * from extensions.dblink('s1', %L) as t(r text) $$, tests.request_sql('trip1')),
  'the Gerente asks (not committed yet)'
);
select tests.begin_as('s2', 'a6000000-0000-4000-8000-000000000004');
select extensions.dblink_send_query('s2', tests.request_sql('trip1'));
select ok(tests.wait_until_blocked('s2'), 'the Coordinador''s request waits for the ledger');
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(r text) $$, '55000', null,
  'then it is refused: the trip is already requested'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'rollback');
select is(
  tests.peek(format($sql$
    select concat_ws(',', carrier_status, quick_pay_fee_cents, quick_pay_requested_by)
    from public.freight_ledgers where trip_id = %L
  $sql$, tests.val('trip1'))),
  'quick_pay_requested,24250,a6000000-0000-4000-8000-000000000002', 'requested once, by the Gerente'
);
select is(
  tests.peek(format($sql$
    select count(*)::text from public.notifications
    where user_id = 'a6000000-0000-4000-8000-000000000003' and type = 'quick_pay_requested' and data ->> 'tripId' = %L
  $sql$, tests.val('trip1'))),
  '1', 'the admin is told once'
);

-- ---------------------------------------------------------------------------
-- 2. Two approvals at once with room for one under the limit
-- ---------------------------------------------------------------------------
select is(tests.as_user('a6000000-0000-4000-8000-000000000002', tests.request_sql('trip2'))::jsonb ->> 'quickNetCents',
  '945750', 'trip 2 is requested');
select is(tests.as_user('a6000000-0000-4000-8000-000000000002', tests.request_sql('trip3'))::jsonb ->> 'quickNetCents',
  '945750', 'trip 3 too');
-- Room for one $9,457.50 quick pay (with the seed's approved ones, if any).
select extensions.dblink_exec('setup', $sql$
  update public.platform_settings
  set value = to_jsonb(public.freight_quick_pay_exposure_cents() + 1000000)
  where key = 'freight.quick_pay_exposure_limit_cents';
$sql$);

select tests.begin_as('s1', 'a6000000-0000-4000-8000-000000000003');
select lives_ok(
  format($$ select * from extensions.dblink('s1', %L) as t(r text) $$, tests.approve_sql('trip2')),
  'the admin approves trip 2 in one tab (not committed yet)'
);
select tests.begin_as('s2', 'a6000000-0000-4000-8000-000000000003');
select extensions.dblink_send_query('s2', tests.approve_sql('trip3'));
select ok(tests.wait_until_blocked('s2'), 'the approval of trip 3 in the other tab waits for the first');
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(r text) $$, '55000', null,
  'then it asks for a confirmation: both would pass the limit'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'rollback');
select is(
  tests.peek(format($sql$
    select string_agg(carrier_status::text, ',' order by trip_id = %L desc)
    from public.freight_ledgers where trip_id in (%L, %L)
  $sql$, tests.val('trip2'), tests.val('trip2'), tests.val('trip3'))),
  'scheduled,quick_pay_requested', 'trip 2 is approved; trip 3 still waits for the admin'
);

-- ---------------------------------------------------------------------------
-- 3. The client pays in full while the admin approves the same trip
-- ---------------------------------------------------------------------------
select tests.as_user('a6000000-0000-4000-8000-000000000002', tests.request_sql('trip4')) is null as quiet;
select extensions.dblink_exec('setup', $sql$
  update public.platform_settings set value = 'null' where key = 'freight.quick_pay_exposure_limit_cents';
$sql$);
select tests.begin_as('s1', 'a6000000-0000-4000-8000-000000000003');
select lives_ok(
  format($$ select * from extensions.dblink('s1', %L) as t(r text) $$, tests.approve_sql('trip4')),
  'the admin approves trip 4 (not committed yet)'
);
select tests.begin_as('s2', 'a6000000-0000-4000-8000-000000000003');
select extensions.dblink_send_query('s2', format(
  'select public.admin_record_freight_payment(%L, %L, 1000000, public.freight_today(), %L)::text',
  tests.val('trip4'), 'client_to_fulmis', 'QPCONC04'
));
select ok(tests.wait_until_blocked('s2'), 'the client''s payment waits for the ledger');
select extensions.dblink_exec('s1', 'commit');
select * from extensions.dblink_get_result('s2') as t(r text);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'commit');
select is(
  tests.peek(format($sql$
    select concat_ws(',', client_status, carrier_status, quick_pay_fee_cents, quick_pay_approved_at is not null)
    from public.freight_ledgers where trip_id = %L
  $sql$, tests.val('trip4'))),
  'paid,scheduled,24250,t', 'the client paid and the approved quick pay stays'
);

-- ---------------------------------------------------------------------------
-- 4. A carrier CFDI registered "Sin validar" while the admin saves Fulmis' RFC
-- ---------------------------------------------------------------------------
-- As the Edge Function registers it without the RFC: made out to the RFC the
-- admin is saving.
create function tests.cfdi_sql(p_trip text)
returns text
language sql
stable
as $$
  select format($q$
    insert into public.freight_invoices (
      trip_id, direction, cfdi_uuid, issuer_rfc, receiver_rfc, total_cents, currency, issued_at, validation, xml_path
    ) values (
      %1$L, 'carrier_to_fulmis', gen_random_uuid(), 'FCO040404CD4', 'FUL201015AB1', 970000, 'MXN', now(),
      'unvalidated', %1$L || '/carrier_to_fulmis/' || gen_random_uuid() || '.xml'
    ) returning validation::text
  $q$, tests.val(p_trip))
$$;

create function tests.save_rfc_sql()
returns text
language sql
immutable
as $$ select $q$ select public.admin_set_platform_setting('fulmis.rfc', '"FUL201015AB1"')::text $q$ $$;

-- The admin saves first: the registration waits for it and reads the RFC.
select tests.begin_as('s1', 'a6000000-0000-4000-8000-000000000003');
select lives_ok(
  format($$ select * from extensions.dblink('s1', %L) as t(r text) $$, tests.save_rfc_sql()),
  'the admin saves Fulmis'' RFC (not committed yet)'
);
select extensions.dblink_exec('s2', 'begin');
select extensions.dblink_send_query('s2', tests.cfdi_sql('trip5'));
select ok(tests.wait_until_blocked('s2'), 'a carrier CFDI registered meanwhile waits for the save');
select extensions.dblink_exec('s1', 'commit');
select is(
  (select r from extensions.dblink_get_result('s2') as t(r text)), 'validated',
  'and it is validated with the RFC just saved'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'commit');

-- The registration first: the save waits for it and then validates it.
select extensions.dblink_exec('setup', $sql$
  update public.platform_settings set value = 'null' where key = 'fulmis.rfc';
$sql$);
select extensions.dblink_exec('s2', 'begin');
select is(
  (select r from extensions.dblink('s2', tests.cfdi_sql('trip6')) as t(r text)), 'unvalidated',
  'without the RFC, a carrier CFDI is registered "Sin validar" (not committed yet)'
);
select tests.begin_as('s1', 'a6000000-0000-4000-8000-000000000003');
select extensions.dblink_send_query('s1', tests.save_rfc_sql());
select ok(tests.wait_until_blocked('s1'), 'the admin''s save of the RFC meanwhile waits for it');
select extensions.dblink_exec('s2', 'commit');
select * from extensions.dblink_get_result('s1') as t(r text);
select * from extensions.dblink_get_result('s1', false) as t(r text);
select extensions.dblink_exec('s1', 'commit');
select is(
  tests.peek(format($sql$
    select validation::text from public.freight_invoices where trip_id = %L and direction = 'carrier_to_fulmis'
  $sql$, tests.val('trip6'))),
  'validated', 'and then validates it: none is left "Sin validar"'
);

select tests.cleanup();
select extensions.dblink_disconnect('s1');
select extensions.dblink_disconnect('s2');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
