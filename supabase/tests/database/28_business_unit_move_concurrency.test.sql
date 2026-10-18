-- G1a.2 · Business units concurrency: a coordinator of unit A calls a trip RPC
-- while the manager moves that trip to unit B (assign_trip holds the trip
-- lock). The coordinator passed the first check, waits for the lock, and must
-- be refused once the move commits: cancel_trip and add_trip_document check
-- again under the lock, and a null in that check refuses (the shipper
-- comparison is null for carrier staff).
--
-- Two real sessions (dblink) with committed fixtures, as in
-- 10_trip_concurrency.test.sql.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(8);

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

create function tests.begin_as(p_conn text, p_user uuid)
returns void
language sql
as $$
  select extensions.dblink_exec(p_conn, 'begin');
  select extensions.dblink_exec(p_conn, 'set local lock_timeout = ''15s''');
  select extensions.dblink_exec(p_conn, 'set local role authenticated');
  select extensions.dblink_exec(
    p_conn,
    format('set local request.jwt.claims = %L', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text)
  );
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

create function tests.peek(p_sql text)
returns text
language sql
as $$ select v from extensions.dblink('setup', p_sql) as t(v text) $$;

create function tests.cleanup()
returns void
language sql
as $$
  select extensions.dblink_exec('setup', $sql$
    alter table public.trip_events disable trigger trip_events_immutable;
    delete from public.trip_events
    where trip_id in (select id from public.trips where shipper_company_id = 'c2800000-0000-4000-8000-000000000001');
    alter table public.trip_events enable trigger trip_events_immutable;
    delete from public.conversations where shipper_company_id = 'c2800000-0000-4000-8000-000000000001';
    delete from public.document_shares where shipper_company_id = 'c2800000-0000-4000-8000-000000000001';
    delete from public.trips where shipper_company_id = 'c2800000-0000-4000-8000-000000000001';
    update public.loads
    set status = 'draft', accepted_offer_id = null, carrier_company_id = null, agreed_price_cents = null,
        contracted_at = null
    where shipper_company_id = 'c2800000-0000-4000-8000-000000000001';
    delete from public.offers where shipper_company_id = 'c2800000-0000-4000-8000-000000000001';
    delete from public.negotiations where shipper_company_id = 'c2800000-0000-4000-8000-000000000001';
    delete from public.loads where shipper_company_id = 'c2800000-0000-4000-8000-000000000001';
    delete from public.documents where company_id = 'c2800000-0000-4000-8000-000000000002';
    delete from public.vehicle_availability where company_id = 'c2800000-0000-4000-8000-000000000002';
    delete from public.vehicles where company_id = 'c2800000-0000-4000-8000-000000000002';
    delete from public.operators where company_id = 'c2800000-0000-4000-8000-000000000002';
    delete from public.business_unit_coordinators where company_id = 'c2800000-0000-4000-8000-000000000002';
    delete from public.notifications where user_id::text like 'a2800000-%';
    delete from auth.users where id::text like 'a2800000-%';
    delete from public.companies where id in (
      'c2800000-0000-4000-8000-000000000001', 'c2800000-0000-4000-8000-000000000002'
    );
  $sql$);
$$;

select tests.connect('setup');
select tests.connect('s1');
select tests.connect('s2');
select tests.cleanup();

-- Fixtures: shipper S (...01), carrier with manager M (...02), coordinator A
-- (...03) of unit A, coordinator B (...04) of unit B, operators O (...05, unit
-- A) and P (...06, unit B), units VA and VB with approved documents, and a
-- contracted load with its trip in unit A.
select extensions.dblink_exec('setup', $sql$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select id, 'authenticated', 'authenticated', id::text || '@g1a2c.test', now(),
         case when role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end, jsonb_build_object('role', role, 'phone', '+525500000000'), now(), now()
  from (values
    ('a2800000-0000-4000-8000-000000000001'::uuid, 'shipper'),
    ('a2800000-0000-4000-8000-000000000002', 'manager'),
    ('a2800000-0000-4000-8000-000000000003', 'coordinator'),
    ('a2800000-0000-4000-8000-000000000004', 'coordinator'),
    ('a2800000-0000-4000-8000-000000000005', 'operator'),
    ('a2800000-0000-4000-8000-000000000006', 'operator')) as u(id, role);
  insert into public.companies (id, type, legal_name, rfc, status) values
    ('c2800000-0000-4000-8000-000000000001', 'shipper', 'Mudanza Sigma SA de CV', 'MSI070707AA7', 'approved'),
    ('c2800000-0000-4000-8000-000000000002', 'carrier', 'Mudanza Alfa SA de CV', 'MAL070707AA7', 'approved');
  update public.profiles set company_id = 'c2800000-0000-4000-8000-000000000001'
  where id = 'a2800000-0000-4000-8000-000000000001';
  update public.profiles set company_id = 'c2800000-0000-4000-8000-000000000002'
  where id::text like 'a2800000-%' and id <> 'a2800000-0000-4000-8000-000000000001';
  update public.business_units set name = 'Unidad A' where company_id = 'c2800000-0000-4000-8000-000000000002';
  insert into public.business_units (id, company_id, name)
  values ('b2800000-0000-4000-8000-00000000000b', 'c2800000-0000-4000-8000-000000000002', 'Unidad B');
  insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id)
  select b.id, b.company_id, c.profile_id::uuid
  from (values ('Unidad A', 'a2800000-0000-4000-8000-000000000003'),
               ('Unidad B', 'a2800000-0000-4000-8000-000000000004')) as c(unit_name, profile_id)
  join public.business_units b on b.company_id = 'c2800000-0000-4000-8000-000000000002' and b.name = c.unit_name;
  insert into public.operators (id, company_id, business_unit_id, profile_id, full_name)
  select o.id::uuid, 'c2800000-0000-4000-8000-000000000002', b.id, o.profile_id::uuid, o.full_name
  from (values ('d2800000-0000-4000-8000-00000000000a', 'Unidad A', 'a2800000-0000-4000-8000-000000000005', 'Óscar A'),
               ('d2800000-0000-4000-8000-00000000000b', 'Unidad B', 'a2800000-0000-4000-8000-000000000006', 'Pablo B'))
       as o(id, unit_name, profile_id, full_name)
  join public.business_units b on b.company_id = 'c2800000-0000-4000-8000-000000000002' and b.name = o.unit_name;
  -- D16 (G3): assign_trip needs a current license of a suitable type.
  update public.operators set license_type = 'E', license_expires_on = current_date + 365
  where license_type is null;
  insert into public.vehicles (id, company_id, business_unit_id, kind, plate, unit_type, capacity_kg)
  select v.id::uuid, 'c2800000-0000-4000-8000-000000000002', b.id, 'rigid', v.plate, 'dry_van', 30000
  from (values ('e2800000-0000-4000-8000-00000000000a', 'Unidad A', 'GGA2801'),
               ('e2800000-0000-4000-8000-00000000000b', 'Unidad B', 'GGB2801')) as v(id, unit_name, plate)
  join public.business_units b on b.company_id = 'c2800000-0000-4000-8000-000000000002' and b.name = v.unit_name;
  insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
  select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
         'approved', case when r.requires_expiry then now() + interval '1 year' end
  from public.vehicles v
  cross join public.document_requirements r
  where v.company_id = 'c2800000-0000-4000-8000-000000000002'
    and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;
  insert into public.loads (id, shipper_company_id, status,
    origin_address, origin_city, origin_state, origin_lat, origin_lng,
    destination_address, destination_city, destination_state, destination_lat, destination_lng,
    pickup_window_start, pickup_window_end, delivery_window_start, delivery_window_end,
    cargo_type, description, weight_kg, unit_type, proposed_price_cents, published_at)
  values ('f2800000-0000-4000-8000-000000000001', 'c2800000-0000-4000-8000-000000000001', 'negotiating',
    'Centro', 'Monterrey', 'Nuevo León', 25.6866, -100.3161,
    'Centro', 'Guadalajara', 'Jalisco', 20.6597, -103.3496,
    now() + interval '1 day', now() + interval '2 days', now() + interval '2 days', now() + interval '3 days',
    'general', 'Carga de prueba', 1000, 'dry_van', 3000000, now());
  insert into public.negotiations (id, load_id, shipper_company_id, carrier_company_id, business_unit_id)
  select 'f2900000-0000-4000-8000-000000000001', 'f2800000-0000-4000-8000-000000000001',
         'c2800000-0000-4000-8000-000000000001', 'c2800000-0000-4000-8000-000000000002', b.id
  from public.business_units b where b.company_id = 'c2800000-0000-4000-8000-000000000002' and b.name = 'Unidad A';
  insert into public.offers (id, negotiation_id, load_id, shipper_company_id, carrier_company_id, side, amount_cents)
  values ('f2a00000-0000-4000-8000-000000000001', 'f2900000-0000-4000-8000-000000000001',
          'f2800000-0000-4000-8000-000000000001', 'c2800000-0000-4000-8000-000000000001',
          'c2800000-0000-4000-8000-000000000002', 'carrier', 2900000);
$sql$);

-- The shipper accepts: a trip pending assignment, in unit A (its negotiation).
select tests.begin_as('s1', 'a2800000-0000-4000-8000-000000000001');
create table tests.trips (name text primary key, id uuid not null);
insert into tests.trips
select 'trip', trip_id::uuid from extensions.dblink('s1', $sql$
  select public.accept_offer('f2a00000-0000-4000-8000-000000000001')::text
$sql$) as t(trip_id text);
select extensions.dblink_exec('s1', 'commit');

select is(
  tests.peek(format($sql$ select (t.business_unit_id = b.id)::text from public.trips t
                            join public.business_units b on b.name = 'Unidad A' and b.company_id = t.carrier_company_id
                            where t.id = %L $sql$, (select id from tests.trips where name = 'trip'))),
  'true', 'the trip starts in unit A'
);

-- ---------------------------------------------------------------------------
-- 1. cancel_trip by A waits for the manager's move to B, then is refused
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a2800000-0000-4000-8000-000000000002');
select * from extensions.dblink('s1', format(
  'select public.assign_trip(%L, %L, %L)',
  (select id from tests.trips where name = 'trip'),
  'e2800000-0000-4000-8000-00000000000b', 'd2800000-0000-4000-8000-00000000000b'
)) as t(r text);
select tests.begin_as('s2', 'a2800000-0000-4000-8000-000000000003');
select extensions.dblink_send_query('s2', format(
  'select public.cancel_trip(%L, %L)', (select id from tests.trips where name = 'trip'), 'Ya no'
));
select ok(tests.wait_until_blocked('s2'), 'the cancellation by A waits for the trip lock the move holds');
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(r text) $$,
  '42501', 'trip not found',
  'once the trip is in B, A''s cancellation is refused under the lock'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'rollback');
select is(
  tests.peek(format($sql$ select status::text from public.trips where id = %L $sql$,
                    (select id from tests.trips where name = 'trip'))),
  'assigned', 'the trip is assigned, not cancelled'
);

-- ---------------------------------------------------------------------------
-- 2. add_trip_document by B waits for the move back to A, then is refused
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a2800000-0000-4000-8000-000000000002');
select * from extensions.dblink('s1', format(
  'select public.assign_trip(%L, %L, %L)',
  (select id from tests.trips where name = 'trip'),
  'e2800000-0000-4000-8000-00000000000a', 'd2800000-0000-4000-8000-00000000000a'
)) as t(r text);
select tests.begin_as('s2', 'a2800000-0000-4000-8000-000000000004');
select extensions.dblink_send_query('s2', format(
  'select public.add_trip_document(%L, %L, %L, %L)',
  (select id from tests.trips where name = 'trip'), 'carta_porte',
  (select id from tests.trips where name = 'trip') || '/a2800000-0000-4000-8000-0000000000aa.pdf', 'carta.pdf'
));
select ok(tests.wait_until_blocked('s2'), 'the document by B waits for the trip lock the move holds');
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(r text) $$,
  '42501', 'trip not found',
  'once the trip is back in A, B''s document is refused under the lock (before any file check)'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'rollback');
select is(
  tests.peek(format($sql$ select count(*)::text from public.trip_documents where trip_id = %L $sql$,
                    (select id from tests.trips where name = 'trip'))),
  '0', 'no document was added'
);

-- B still cannot act on it now that it is in A (no race): same refusal.
select tests.begin_as('s2', 'a2800000-0000-4000-8000-000000000004');
select throws_ok(
  format($$ select * from extensions.dblink('s2', %L) as t(r text) $$,
         format('select public.cancel_trip(%L, %L)', (select id from tests.trips where name = 'trip'), 'No')),
  '42501', 'trip not found',
  'B cannot cancel a trip of A'
);
select extensions.dblink_exec('s2', 'rollback');

select tests.cleanup();
select extensions.dblink_disconnect('s1');
select extensions.dblink_disconnect('s2');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
