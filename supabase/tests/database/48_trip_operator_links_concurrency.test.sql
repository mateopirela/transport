-- H2 · Trip link for the operator under concurrency (two real sessions,
-- dblink): issuing the link and reassigning the trip at the same time. Both
-- lock the trip row first (create_trip_operator_link and assign_trip), so one
-- waits for the other:
--   1. the link is issued first: the reassignment waits, then its trigger
--      revokes the new link, and no live link points at the old operator;
--   2. the reassignment goes first: the link waits, then it is issued for the
--      new operator.
-- Committed fixtures through the setup connection, deleted at the end (same
-- approach as 10_trip_concurrency and 43_trip_internal_chat_concurrency).
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(10);

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
    format('set local request.jwt.claims = %L', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text)
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
    'set request.jwt.claims = %L', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text
  ));
  select r into v from extensions.dblink('setup', p_sql) as t(r text);
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

-- Removes this file's committed fixtures (also leftovers of an aborted run).
create function tests.cleanup()
returns void
language sql
as $$
  select extensions.dblink_exec('setup', $sql$
    reset request.jwt.claims;
    alter table public.messages disable trigger messages_immutable;
    delete from public.messages
    where conversation_id in (
      select id from public.conversations where shipper_company_id = 'c4800000-0000-4000-8000-000000000001'
    );
    alter table public.messages enable trigger messages_immutable;
    alter table public.trip_events disable trigger trip_events_immutable;
    delete from public.trip_events
    where trip_id in (select id from public.trips where shipper_company_id = 'c4800000-0000-4000-8000-000000000001');
    alter table public.trip_events enable trigger trip_events_immutable;
    delete from public.conversations where shipper_company_id = 'c4800000-0000-4000-8000-000000000001';
    delete from public.document_shares where shipper_company_id = 'c4800000-0000-4000-8000-000000000001';
    delete from public.share_links where company_id = 'c4800000-0000-4000-8000-000000000002';
    delete from public.trips where shipper_company_id = 'c4800000-0000-4000-8000-000000000001';
    update public.loads
    set status = 'draft', accepted_offer_id = null, carrier_company_id = null, agreed_price_cents = null,
        contracted_at = null
    where shipper_company_id = 'c4800000-0000-4000-8000-000000000001';
    delete from public.offers where shipper_company_id = 'c4800000-0000-4000-8000-000000000001';
    delete from public.negotiations where shipper_company_id = 'c4800000-0000-4000-8000-000000000001';
    delete from public.loads where shipper_company_id = 'c4800000-0000-4000-8000-000000000001';
    delete from public.vehicle_availability where company_id = 'c4800000-0000-4000-8000-000000000002';
    delete from public.documents where company_id = 'c4800000-0000-4000-8000-000000000002';
    delete from public.vehicles where company_id = 'c4800000-0000-4000-8000-000000000002';
    delete from public.operators where company_id = 'c4800000-0000-4000-8000-000000000002';
    delete from auth.users where id in (
      'a4800000-0000-4000-8000-000000000001', 'a4800000-0000-4000-8000-000000000002',
      'a4800000-0000-4000-8000-000000000003', 'a4800000-0000-4000-8000-000000000004'
    );
    delete from public.business_units where company_id = 'c4800000-0000-4000-8000-000000000002';
    delete from public.companies where id in ('c4800000-0000-4000-8000-000000000001', 'c4800000-0000-4000-8000-000000000002');
  $sql$);
$$;

select tests.connect('setup');
select tests.connect('s1');
select tests.connect('s2');
-- Leftovers of an interrupted run, if any.
select tests.cleanup();

-- ---------------------------------------------------------------------------
-- Fixtures (committed): S shipper, M manager, O and P operators; unit V; a
-- trip of S won by M and assigned to O.
-- ---------------------------------------------------------------------------
select extensions.dblink_exec('setup', $sql$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    ('a4800000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 's@h2c.test', now(), null, '{"role":"shipper","phone":"+525500000000"}', now(), now()),
    ('a4800000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'm@h2c.test', now(), null, '{"role":"manager","phone":"+525500000000"}', now(), now()),
    ('a4800000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'o@h2c.test', now(), '{"provisioned_by":"redeem-invitation"}', '{"role":"operator","phone":"+525500000000"}', now(), now()),
    ('a4800000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'p@h2c.test', now(), '{"provisioned_by":"redeem-invitation"}', '{"role":"operator","phone":"+525500000000"}', now(), now());
  insert into public.companies (id, type, legal_name, rfc, status) values
    ('c4800000-0000-4000-8000-000000000001', 'shipper', 'Envíos Enlace SA de CV', 'EEN050505GH5', 'approved'),
    ('c4800000-0000-4000-8000-000000000002', 'carrier', 'Fletes Enlace SA de CV', 'FEN040404CD4', 'approved');
  update public.profiles set company_id = 'c4800000-0000-4000-8000-000000000001'
  where id = 'a4800000-0000-4000-8000-000000000001';
  update public.profiles set company_id = 'c4800000-0000-4000-8000-000000000002'
  where id in ('a4800000-0000-4000-8000-000000000002', 'a4800000-0000-4000-8000-000000000003',
               'a4800000-0000-4000-8000-000000000004');
  insert into public.operators (id, company_id, profile_id, full_name, license_type, license_expires_on) values
    ('d4800000-0000-4000-8000-000000000001', 'c4800000-0000-4000-8000-000000000002',
     'a4800000-0000-4000-8000-000000000003', 'Óscar Enlace', 'E', current_date + 365),
    ('d4800000-0000-4000-8000-000000000002', 'c4800000-0000-4000-8000-000000000002',
     'a4800000-0000-4000-8000-000000000004', 'Pablo Enlace', 'E', current_date + 365);
  insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
    ('e4800000-0000-4000-8000-000000000001', 'c4800000-0000-4000-8000-000000000002', 'rigid', 'HHE4801', 'dry_van', 30000);
  insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
  select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
         'approved', case when r.requires_expiry then now() + interval '1 year' end
  from public.vehicles v
  cross join public.document_requirements r
  where v.company_id = 'c4800000-0000-4000-8000-000000000002'
    and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;
$sql$);

insert into tests.vals select 'load', tests.as_user('a4800000-0000-4000-8000-000000000001', $sql$
  select public.create_load(jsonb_build_object(
    'origin', jsonb_build_object('address', 'Av. Constitución 100', 'city', 'Monterrey', 'state', 'Nuevo León',
                                 'lat', 25.6866, 'lng', -100.3161),
    'destination', jsonb_build_object('address', 'Av. Vallarta 200', 'city', 'Guadalajara', 'state', 'Jalisco',
                                      'lat', 20.6597, 'lng', -103.3496),
    'pickupWindow', jsonb_build_object('start', now() + interval '1 day', 'end', now() + interval '1 day 4 hours'),
    'deliveryWindow', jsonb_build_object('start', now() + interval '2 days', 'end', now() + interval '2 days 6 hours'),
    'cargoType', 'palletized', 'description', 'Tarimas', 'weightKg', 18000, 'unitType', 'dry_van',
    'specialRequirements', jsonb_build_array(), 'proposedPriceCents', 3500000
  ))::text
$sql$)::uuid;
select tests.as_user('a4800000-0000-4000-8000-000000000001',
  format('select public.publish_load(%L)::text', tests.val('load')));
insert into tests.vals select 'offer', tests.as_user('a4800000-0000-4000-8000-000000000002',
  format('select public.make_offer(%L, 3000000, null, %L)::text', tests.val('load'), 'e4800000-0000-4000-8000-000000000001'))::uuid;
insert into tests.vals select 'trip', tests.as_user('a4800000-0000-4000-8000-000000000001',
  format('select public.accept_offer(%L)::text', tests.val('offer')))::uuid;
select tests.as_user('a4800000-0000-4000-8000-000000000002', format(
  'select public.assign_trip(%L, %L, %L)::text', tests.val('trip'), 'e4800000-0000-4000-8000-000000000001',
  'd4800000-0000-4000-8000-000000000001'));

-- ---------------------------------------------------------------------------
-- 1. The link first, the reassignment (to P) at the same time
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a4800000-0000-4000-8000-000000000002');
select lives_ok(
  format($$ select * from extensions.dblink('s1', %L) as t(r text) $$, format(
    'select id::text from public.create_trip_operator_link(%L)', tests.val('trip'))),
  'the manager issues the link for O (not committed yet)'
);
select tests.begin_as('s2', 'a4800000-0000-4000-8000-000000000002');
select extensions.dblink_send_query('s2', format(
  'select public.assign_trip(%L, %L, %L)::text', tests.val('trip'), 'e4800000-0000-4000-8000-000000000001',
  'd4800000-0000-4000-8000-000000000002'));
select ok(tests.wait_until_blocked('s2'), 'the reassignment waits for the trip');
select extensions.dblink_exec('s1', 'commit');
select lives_ok($$ select * from extensions.dblink_get_result('s2') as t(r text) $$, 'then the trip goes to P');
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'commit');

select is(
  tests.peek(format($sql$
    select count(*)::text from public.share_links
    where trip_id = %L and kind = 'trip_operator' and revoked_at is null
  $sql$, tests.val('trip'))),
  '0', 'the link issued for O was revoked by the reassignment'
);
select is(
  tests.peek(format($sql$ select operator_id::text from public.trips where id = %L $sql$, tests.val('trip'))),
  'd4800000-0000-4000-8000-000000000002', 'the trip is P''s'
);

-- ---------------------------------------------------------------------------
-- 2. The reassignment (back to O) first, the link at the same time
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a4800000-0000-4000-8000-000000000002');
select lives_ok(
  format($$ select * from extensions.dblink('s1', %L) as t(r text) $$, format(
    'select public.assign_trip(%L, %L, %L)::text', tests.val('trip'), 'e4800000-0000-4000-8000-000000000001',
    'd4800000-0000-4000-8000-000000000001')),
  'the manager gives the trip back to O (not committed yet)'
);
select tests.begin_as('s2', 'a4800000-0000-4000-8000-000000000002');
select extensions.dblink_send_query('s2', format(
  'select id::text from public.create_trip_operator_link(%L)', tests.val('trip')));
select ok(tests.wait_until_blocked('s2'), 'issuing the link waits for the trip');
select extensions.dblink_exec('s1', 'commit');
select lives_ok($$ select * from extensions.dblink_get_result('s2') as t(r text) $$, 'then the link is issued');
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'commit');

select is(
  tests.peek(format($sql$
    select string_agg(operator_id::text, ',') from public.share_links
    where trip_id = %L and kind = 'trip_operator' and revoked_at is null
  $sql$, tests.val('trip'))),
  'd4800000-0000-4000-8000-000000000001', 'the one live link names the operator assigned now (O)'
);
select is(
  tests.as_user('a4800000-0000-4000-8000-000000000003', format($sql$
    select count(*)::text from public.trips where id = %L and operator_id = public.auth_operator_id()
  $sql$, tests.val('trip'))),
  '1', 'and O is the one assigned to the trip'
);

select tests.cleanup();
select extensions.dblink_disconnect('s1');
select extensions.dblink_disconnect('s2');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
