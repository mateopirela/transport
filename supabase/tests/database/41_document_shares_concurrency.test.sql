-- G6 · Document shares under concurrency: an admin approving a replacement
-- document while the trip is being assigned, or while an offer of the carrier
-- is being accepted. Whichever runs first, the other waits (for the trip lock
-- or the carrier's share lock, never for a share the first one holds, so
-- there is no deadlock), both succeed and the approved document ends up
-- shared with the trip that has its owner. Also three sessions: an approval
-- waiting for a trip whose assignment needs the unit of an offer being
-- accepted, which must wait for the carrier's lock without holding that unit.
--
-- Two real sessions (dblink) with committed fixtures, as in
-- 10_trip_concurrency.test.sql.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(26);

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
  select extensions.dblink_exec(p_conn, 'set local deadlock_timeout = ''100ms''');
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

create table tests.vals (name text primary key, id uuid not null);

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

-- A pending replacement of an owner's approved document (as the owner).
create function tests.pending(p_name text, p_code text, p_owner_type text, p_owner uuid)
returns void
language sql
as $$
  insert into tests.vals
  select p_name, id::uuid from extensions.dblink('setup', format($sql$
    insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
    select 'c3600000-0000-4000-8000-000000000002', r.id, %L, %L,
           'c3600000-0000-4000-8000-000000000002/' || %L || '/' || %L || '/' || gen_random_uuid() || '.pdf',
           'pending_review', case when r.requires_expiry then now() + interval '1 year' end
    from public.document_requirements r where r.code = %L
    returning id::text
  $sql$, p_owner_type, p_owner, p_owner_type, p_owner, p_code)) as t(id text);
$$;

-- Active shares of a trip: whether the document is shared on it.
create function tests.shared(p_trip uuid, p_document uuid)
returns text
language sql
as $$
  select tests.peek(format($sql$
    select exists (select 1 from public.document_shares
                   where trip_id = %L and document_id = %L and revoked_at is null)::text
  $sql$, p_trip, p_document))
$$;

-- The approved, current document of a requirement for an owner.
create function tests.current_doc(p_code text, p_owner uuid)
returns uuid
language sql
as $$
  select tests.peek(format($sql$
    select d.id::text from public.documents d join public.document_requirements r on r.id = d.requirement_id
    where r.code = %L and d.owner_id = %L and d.status = 'approved' and d.archived_at is null
  $sql$, p_code, p_owner))::uuid
$$;

create function tests.cleanup()
returns void
language sql
as $$
  select extensions.dblink_exec('setup', $sql$
    alter table public.trip_events disable trigger trip_events_immutable;
    delete from public.trip_events
    where trip_id in (select id from public.trips where shipper_company_id = 'c3600000-0000-4000-8000-000000000001');
    alter table public.trip_events enable trigger trip_events_immutable;
    alter table public.audit_log disable trigger audit_log_immutable;
    delete from public.audit_log where company_id = 'c3600000-0000-4000-8000-000000000002';
    alter table public.audit_log enable trigger audit_log_immutable;
    delete from public.conversations where shipper_company_id = 'c3600000-0000-4000-8000-000000000001';
    delete from public.document_shares where shipper_company_id = 'c3600000-0000-4000-8000-000000000001';
    delete from public.trips where shipper_company_id = 'c3600000-0000-4000-8000-000000000001';
    update public.loads
    set status = 'draft', accepted_offer_id = null, carrier_company_id = null, agreed_price_cents = null,
        contracted_at = null
    where shipper_company_id = 'c3600000-0000-4000-8000-000000000001';
    delete from public.offers where shipper_company_id = 'c3600000-0000-4000-8000-000000000001';
    delete from public.negotiations where shipper_company_id = 'c3600000-0000-4000-8000-000000000001';
    delete from public.loads where shipper_company_id = 'c3600000-0000-4000-8000-000000000001';
    delete from public.documents where company_id = 'c3600000-0000-4000-8000-000000000002';
    delete from public.vehicle_availability where company_id = 'c3600000-0000-4000-8000-000000000002';
    delete from public.vehicles where company_id = 'c3600000-0000-4000-8000-000000000002';
    delete from public.operators where company_id = 'c3600000-0000-4000-8000-000000000002';
    delete from public.notifications where user_id::text like 'a3600000-%';
    delete from auth.users where id::text like 'a3600000-%';
    delete from public.companies where id in (
      'c3600000-0000-4000-8000-000000000001', 'c3600000-0000-4000-8000-000000000002'
    );
  $sql$);
$$;

select tests.connect('setup');
select tests.connect('s1');
select tests.connect('s2');
select tests.connect('s3');
select tests.cleanup();

-- Fixtures: shipper S (...01), carrier with manager M (...02), admin A
-- (...03), operator O (...04), units V1, V2 and V3 with every document
-- approved, and four loads with a carrier offer each (the fourth with V3).
select extensions.dblink_exec('setup', $sql$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select id, 'authenticated', 'authenticated', id::text || '@g6c.test', now(),
         case when role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end,
         jsonb_build_object('role', role, 'phone', '+525500000000'), now(), now()
  from (values
    ('a3600000-0000-4000-8000-000000000001'::uuid, 'shipper'),
    ('a3600000-0000-4000-8000-000000000002', 'manager'),
    ('a3600000-0000-4000-8000-000000000003', 'shipper'),
    ('a3600000-0000-4000-8000-000000000004', 'operator')) as u(id, role);
  update public.profiles set role = 'admin' where id = 'a3600000-0000-4000-8000-000000000003';
  insert into public.companies (id, type, legal_name, rfc, status) values
    ('c3600000-0000-4000-8000-000000000001', 'shipper', 'Envíos Treinta y Seis SA de CV', 'ETS060606AA6', 'approved'),
    ('c3600000-0000-4000-8000-000000000002', 'carrier', 'Fletes Treinta y Seis SA de CV', 'FTS060606AA6', 'approved');
  update public.profiles set company_id = 'c3600000-0000-4000-8000-000000000001'
  where id = 'a3600000-0000-4000-8000-000000000001';
  update public.profiles set company_id = 'c3600000-0000-4000-8000-000000000002'
  where id in ('a3600000-0000-4000-8000-000000000002', 'a3600000-0000-4000-8000-000000000004');
  insert into public.operators (id, company_id, business_unit_id, profile_id, full_name, license_type, license_expires_on)
  select 'd3600000-0000-4000-8000-000000000004', b.company_id, b.id, 'a3600000-0000-4000-8000-000000000004',
         'Óscar Treinta y Seis', 'E', current_date + 365
  from public.business_units b where b.company_id = 'c3600000-0000-4000-8000-000000000002';
  insert into public.vehicles (id, company_id, business_unit_id, kind, plate, unit_type, capacity_kg)
  select v.id::uuid, b.company_id, b.id, 'rigid', v.plate, 'dry_van', 30000
  from (values ('e3600000-0000-4000-8000-000000000001', 'GGA3601'),
               ('e3600000-0000-4000-8000-000000000002', 'GGA3602'),
               ('e3600000-0000-4000-8000-000000000003', 'GGA3603')) as v(id, plate)
  cross join public.business_units b where b.company_id = 'c3600000-0000-4000-8000-000000000002';
  insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
  select 'c3600000-0000-4000-8000-000000000002', r.id, r.owner_type, o.id,
         'c3600000-0000-4000-8000-000000000002/' || r.owner_type || '/' || o.id || '/' || gen_random_uuid() || '.pdf',
         'approved', case when r.requires_expiry then now() + interval '1 year' end
  from public.document_requirements r
  join (values
    ('company'::public.document_owner_type, 'c3600000-0000-4000-8000-000000000002'::uuid),
    ('vehicle', 'e3600000-0000-4000-8000-000000000001'), ('vehicle', 'e3600000-0000-4000-8000-000000000002'),
    ('vehicle', 'e3600000-0000-4000-8000-000000000003'),
    ('operator', 'd3600000-0000-4000-8000-000000000004')
  ) as o(owner_type, id) on o.owner_type = r.owner_type
  where r.archived_at is null and (r.company_type is null or r.company_type = 'carrier');
  insert into public.loads (id, shipper_company_id, status,
    origin_address, origin_city, origin_state, origin_lat, origin_lng,
    destination_address, destination_city, destination_state, destination_lat, destination_lng,
    pickup_window_start, pickup_window_end, delivery_window_start, delivery_window_end,
    cargo_type, description, weight_kg, unit_type, proposed_price_cents, published_at)
  select ('f3600000-0000-4000-8000-00000000000' || n)::uuid, 'c3600000-0000-4000-8000-000000000001', 'negotiating',
    'Centro', 'Monterrey', 'Nuevo León', 25.6866, -100.3161,
    'Centro', 'Guadalajara', 'Jalisco', 20.6597, -103.3496,
    now() + interval '1 day', now() + interval '2 days', now() + interval '2 days', now() + interval '3 days',
    'general', 'Carga de prueba', 1000, 'dry_van', 3000000, now()
  from generate_series(1, 4) as n;
  insert into public.negotiations (id, load_id, shipper_company_id, carrier_company_id, business_unit_id)
  select ('f3610000-0000-4000-8000-00000000000' || n)::uuid, ('f3600000-0000-4000-8000-00000000000' || n)::uuid,
         'c3600000-0000-4000-8000-000000000001', b.company_id, b.id
  from generate_series(1, 4) as n
  cross join public.business_units b where b.company_id = 'c3600000-0000-4000-8000-000000000002';
  insert into public.offers (id, negotiation_id, load_id, shipper_company_id, carrier_company_id, side, amount_cents,
                             vehicle_id)
  select ('f3620000-0000-4000-8000-00000000000' || n)::uuid, ('f3610000-0000-4000-8000-00000000000' || n)::uuid,
         ('f3600000-0000-4000-8000-00000000000' || n)::uuid, 'c3600000-0000-4000-8000-000000000001',
         'c3600000-0000-4000-8000-000000000002', 'carrier', 2900000,
         case when n = 4 then 'e3600000-0000-4000-8000-000000000003'::uuid end
  from generate_series(1, 4) as n;
$sql$);

-- The shipper accepts the first offer and the manager assigns V1 and O.
select tests.begin_as('s1', 'a3600000-0000-4000-8000-000000000001');
insert into tests.vals
select 'trip', trip_id::uuid from extensions.dblink('s1', $sql$
  select public.accept_offer('f3620000-0000-4000-8000-000000000001')::text
$sql$) as t(trip_id text);
select extensions.dblink_exec('s1', 'commit');
select tests.begin_as('s1', 'a3600000-0000-4000-8000-000000000002');
select * from extensions.dblink('s1', format('select public.assign_trip(%L, %L, %L)', tests.val('trip'),
  'e3600000-0000-4000-8000-000000000001', 'd3600000-0000-4000-8000-000000000004')) as t(r text);
select extensions.dblink_exec('s1', 'commit');

select is(tests.shared(tests.val('trip'), tests.current_doc('vehicle_permit', 'e3600000-0000-4000-8000-000000000001')),
  'true', 'the trip starts with V1''s documents shared');

-- ---------------------------------------------------------------------------
-- 1. Approval first, then the assignment to the document's unit: the
--    assignment waits for the trip and then shares the approved document
-- ---------------------------------------------------------------------------
select tests.pending('v2_registration', 'vehicle_registration_card', 'vehicle', 'e3600000-0000-4000-8000-000000000002');
insert into tests.vals
select 'v2_registration_old', tests.current_doc('vehicle_registration_card', 'e3600000-0000-4000-8000-000000000002');

select tests.begin_as('s2', 'a3600000-0000-4000-8000-000000000003');
select * from extensions.dblink('s2', format('select public.review_document(%L, %L)::text',
  tests.val('v2_registration'), 'approve')) as t(r text);
select tests.begin_as('s1', 'a3600000-0000-4000-8000-000000000002');
select extensions.dblink_send_query('s1', format('select public.assign_trip(%L, %L, %L)', tests.val('trip'),
  'e3600000-0000-4000-8000-000000000002', 'd3600000-0000-4000-8000-000000000004'));
select ok(tests.wait_until_blocked('s1'), 'the assignment waits for the trip the approval locked');
select extensions.dblink_exec('s2', 'commit');
select lives_ok($$ select * from extensions.dblink_get_result('s1') as t(r text) $$,
  'the assignment goes through once the approval commits (no deadlock)');
select * from extensions.dblink_get_result('s1', false) as t(r text);
select extensions.dblink_exec('s1', 'commit');

select is(tests.shared(tests.val('trip'), tests.val('v2_registration')), 'true',
  'the assignment shares the document approved meanwhile');
select is(tests.shared(tests.val('trip'), tests.val('v2_registration_old')), 'false',
  'not the document it replaced');
select is(tests.shared(tests.val('trip'), tests.current_doc('vehicle_permit', 'e3600000-0000-4000-8000-000000000001')),
  'false', 'and V1''s documents are revoked');

-- ---------------------------------------------------------------------------
-- 2. Assignment first, then the approval of a replacement for the unit that
--    leaves and of one for the unit that arrives: the approval waits for the
--    trip, not for a share, and sees the assignment once it commits
-- ---------------------------------------------------------------------------
select tests.pending('v1_permit', 'vehicle_permit', 'vehicle', 'e3600000-0000-4000-8000-000000000001');
insert into tests.vals
select 'v1_permit_old', tests.current_doc('vehicle_permit', 'e3600000-0000-4000-8000-000000000001');

select tests.begin_as('s1', 'a3600000-0000-4000-8000-000000000002');
select * from extensions.dblink('s1', format('select public.assign_trip(%L, %L, %L)', tests.val('trip'),
  'e3600000-0000-4000-8000-000000000001', 'd3600000-0000-4000-8000-000000000004')) as t(r text);
select tests.begin_as('s2', 'a3600000-0000-4000-8000-000000000003');
select extensions.dblink_send_query('s2', format('select public.review_document(%L, %L)::text',
  tests.val('v1_permit'), 'approve'));
select ok(tests.wait_until_blocked('s2'), 'the approval waits for the trip the assignment locked');
select is(
  tests.peek(format($sql$
    select string_agg(distinct l.relation::regclass::text, ',') from pg_locks l
    where l.pid = %s and l.locktype = 'tuple'
  $sql$, (select pid from tests.pids where conn = 's2'))),
  'trips', 'on the trip row, not on a share');
select extensions.dblink_exec('s1', 'commit');
select lives_ok($$ select * from extensions.dblink_get_result('s2') as t(r text) $$,
  'the approval goes through once the assignment commits (no deadlock)');
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'commit');

select is(tests.shared(tests.val('trip'), tests.val('v1_permit')), 'true',
  'the approval shares its document with the trip that just got its unit');
select is(tests.shared(tests.val('trip'), tests.val('v1_permit_old')), 'false',
  'and the document it replaced is no longer shared');
select is(tests.shared(tests.val('trip'), tests.val('v2_registration')), 'false',
  'the unit that left loses its shares');

-- ---------------------------------------------------------------------------
-- 3. A company document approved while an offer is accepted, both orders:
--    the new trip shares the approved one, never the replaced one
-- ---------------------------------------------------------------------------
select tests.pending('tax_1', 'tax_status_certificate', 'company', 'c3600000-0000-4000-8000-000000000002');
insert into tests.vals
select 'tax_0', tests.current_doc('tax_status_certificate', 'c3600000-0000-4000-8000-000000000002');

select tests.begin_as('s2', 'a3600000-0000-4000-8000-000000000003');
select * from extensions.dblink('s2', format('select public.review_document(%L, %L)::text',
  tests.val('tax_1'), 'approve')) as t(r text);
select tests.begin_as('s1', 'a3600000-0000-4000-8000-000000000001');
select extensions.dblink_send_query('s1', $sql$
  select public.accept_offer('f3620000-0000-4000-8000-000000000002')::text
$sql$);
select ok(tests.wait_until_blocked('s1'), 'the acceptance waits for the approval (the carrier''s share lock)');
select extensions.dblink_exec('s2', 'commit');
insert into tests.vals select 'trip_2', trip_id::uuid from extensions.dblink_get_result('s1') as t(trip_id text);
select * from extensions.dblink_get_result('s1', false) as t(r text);
select extensions.dblink_exec('s1', 'commit');

select is(tests.shared(tests.val('trip_2'), tests.val('tax_1')), 'true',
  'a trip created during the approval shares the approved document');
select is(tests.shared(tests.val('trip_2'), tests.val('tax_0')), 'false', 'not the one it replaced');

select tests.pending('tax_2', 'tax_status_certificate', 'company', 'c3600000-0000-4000-8000-000000000002');
select tests.begin_as('s1', 'a3600000-0000-4000-8000-000000000001');
insert into tests.vals
select 'trip_3', trip_id::uuid from extensions.dblink('s1', $sql$
  select public.accept_offer('f3620000-0000-4000-8000-000000000003')::text
$sql$) as t(trip_id text);
select tests.begin_as('s2', 'a3600000-0000-4000-8000-000000000003');
select extensions.dblink_send_query('s2', format('select public.review_document(%L, %L)::text',
  tests.val('tax_2'), 'approve'));
select ok(tests.wait_until_blocked('s2'), 'the approval waits for the acceptance (the carrier''s share lock)');
select extensions.dblink_exec('s1', 'commit');
select lives_ok($$ select * from extensions.dblink_get_result('s2') as t(r text) $$,
  'the approval goes through once the acceptance commits');
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'commit');

select is(tests.shared(tests.val('trip_3'), tests.val('tax_2')), 'true',
  'the approval shares its document with the trip created meanwhile');
select is(
  tests.peek(format($sql$
    select count(*)::text from public.document_shares
    where document_id in (%L, %L) and revoked_at is null
  $sql$, tests.val('tax_0'), tests.val('tax_1'))),
  '0', 'and the documents it replaced are shared with no trip');

-- ---------------------------------------------------------------------------
-- 4. Three sessions: the manager holds the trip (assigned to V2), an approval
--    waits for it holding the carrier's lock, and an offer naming V3 is
--    accepted. The acceptance waits for the carrier's lock before it locks
--    V3, so the manager can still assign V3 and everything goes through
-- ---------------------------------------------------------------------------
select tests.pending('v1_insurance', 'vehicle_insurance_policy', 'vehicle', 'e3600000-0000-4000-8000-000000000001');

select tests.begin_as('s1', 'a3600000-0000-4000-8000-000000000002');
select * from extensions.dblink('s1', format('select public.assign_trip(%L, %L, %L)', tests.val('trip'),
  'e3600000-0000-4000-8000-000000000002', 'd3600000-0000-4000-8000-000000000004')) as t(r text);
select tests.begin_as('s2', 'a3600000-0000-4000-8000-000000000003');
select extensions.dblink_send_query('s2', format('select public.review_document(%L, %L)::text',
  tests.val('v1_insurance'), 'approve'));
select ok(tests.wait_until_blocked('s2'), 'the approval waits for the trip the manager holds');
select tests.begin_as('s3', 'a3600000-0000-4000-8000-000000000001');
select extensions.dblink_send_query('s3', $sql$
  select public.accept_offer('f3620000-0000-4000-8000-000000000004')::text
$sql$);
select ok(tests.wait_until_blocked('s3'), 'the acceptance of the offer with V3 waits for the carrier''s lock');
select lives_ok(
  format($$ select * from extensions.dblink('s1', %L) as t(r text) $$,
         format('select public.assign_trip(%L, %L, %L)', tests.val('trip'),
                'e3600000-0000-4000-8000-000000000003', 'd3600000-0000-4000-8000-000000000004')),
  'the manager assigns V3 meanwhile: the acceptance does not hold it (no deadlock)');
select extensions.dblink_exec('s1', 'commit');
select lives_ok($$ select * from extensions.dblink_get_result('s2') as t(r text) $$,
  'the approval goes through once the assignment commits');
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'commit');
insert into tests.vals select 'trip_4', trip_id::uuid from extensions.dblink_get_result('s3') as t(trip_id text);
select * from extensions.dblink_get_result('s3', false) as t(r text);
select extensions.dblink_exec('s3', 'commit');

select ok(tests.val('trip_4') is not null, 'and the acceptance goes through once the approval commits');
select is(tests.shared(tests.val('trip'), tests.current_doc('vehicle_permit', 'e3600000-0000-4000-8000-000000000003')),
  'true', 'the trip shares V3''s documents');
select is(tests.shared(tests.val('trip_4'), tests.val('tax_2')), 'true',
  'and the new trip the carrier''s company documents');

select tests.cleanup();
select extensions.dblink_disconnect('s1');
select extensions.dblink_disconnect('s3');
select extensions.dblink_disconnect('s2');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
