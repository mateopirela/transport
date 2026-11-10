-- Brokered loads under concurrency (two real sessions, dblink): every I6
-- RPC locks the load first, as the negotiation RPCs do, so:
--   * the admin changes the carriers' rate while a carrier accepts Transport's
--     counteroffer: the acceptance waits and then contracts at the offer's
--     amount (the rate is only what the carriers see), with its margin;
--   * a carrier accepts while the admin changes the rate: the change waits
--     and is refused, the load is contracted;
--   * the client approves while the admin quotes a new price: the approval
--     waits and is refused, the client must see the new price first.
-- Committed fixtures through the setup connection, deleted at the end (same
-- approach as 54_freight_ledger_concurrency).
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(13);

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

-- The SQL of an RPC call, returning its result as text.
create function tests.sql(p_fn text, variadic p_args text[])
returns text
language sql
stable
as $$
  select format('select public.%s(%s)::text', p_fn,
                (select string_agg(quote_nullable(a), ', ') from unnest(p_args) a))
$$;

-- Removes this file's committed fixtures (also leftovers of an aborted run).
create function tests.cleanup()
returns void
language sql
as $$
  select extensions.dblink_exec('setup', $sql$
    reset request.jwt.claims;
    -- Every admin, the seed's too, was told of these loads (requested, offer
    -- received, offer accepted): those notices go with the loads.
    delete from public.notifications
    where data ->> 'loadId' in (
      select id::text from public.loads where shipper_company_id = 'c5700000-0000-4000-8000-000000000001'
    );
    alter table public.trip_events disable trigger trip_events_immutable;
    delete from public.trip_events
    where trip_id in (select id from public.trips where shipper_company_id = 'c5700000-0000-4000-8000-000000000001');
    alter table public.trip_events enable trigger trip_events_immutable;
    delete from public.conversations where shipper_company_id = 'c5700000-0000-4000-8000-000000000001';
    delete from public.document_shares where shipper_company_id = 'c5700000-0000-4000-8000-000000000001';
    delete from public.trips where shipper_company_id = 'c5700000-0000-4000-8000-000000000001';
    update public.loads
    set status = 'draft', accepted_offer_id = null, carrier_company_id = null, agreed_price_cents = null,
        contracted_at = null
    where shipper_company_id = 'c5700000-0000-4000-8000-000000000001';
    delete from public.offers where shipper_company_id = 'c5700000-0000-4000-8000-000000000001';
    delete from public.negotiations where shipper_company_id = 'c5700000-0000-4000-8000-000000000001';
    delete from public.loads where shipper_company_id = 'c5700000-0000-4000-8000-000000000001';
    delete from public.documents where company_id = 'c5700000-0000-4000-8000-000000000002';
    delete from public.vehicles where company_id = 'c5700000-0000-4000-8000-000000000002';
    alter table public.audit_log disable trigger audit_log_immutable;
    delete from public.audit_log
    where actor_id = 'a5700000-0000-4000-8000-000000000003'
       or company_id in ('c5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000002');
    alter table public.audit_log enable trigger audit_log_immutable;
    delete from auth.users where id in (
      'a5700000-0000-4000-8000-000000000001', 'a5700000-0000-4000-8000-000000000002',
      'a5700000-0000-4000-8000-000000000003'
    );
    delete from public.business_units where company_id = 'c5700000-0000-4000-8000-000000000002';
    delete from public.companies where id in ('c5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000002');
  $sql$);
$$;

select tests.connect('setup');
select tests.connect('s1');
select tests.connect('s2');
-- Leftovers of an interrupted run, if any.
select tests.cleanup();

-- ---------------------------------------------------------------------------
-- Fixtures (committed): S shipper, M manager, Z admin; unit V. Three loads S
-- sent to the platform, quoted $12,000 / $10,800: bl1 and bl2 approved, with
-- M's offer countered by Transport at $10,800; bl3 not approved yet.
-- ---------------------------------------------------------------------------
select extensions.dblink_exec('setup', $sql$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    ('a5700000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 's@i6c.test', now(), null, '{"role":"shipper","phone":"+525500000000"}', now(), now()),
    ('a5700000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'm@i6c.test', now(), null, '{"role":"manager","phone":"+525500000000"}', now(), now()),
    ('a5700000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'z@i6c.test', now(), null, '{"role":"shipper","phone":"+525500000000"}', now(), now());
  update public.profiles set role = 'admin' where id = 'a5700000-0000-4000-8000-000000000003';
  insert into public.companies (id, type, legal_name, rfc, status) values
    ('c5700000-0000-4000-8000-000000000001', 'shipper', 'Envíos Tarifa SA de CV', 'ETC050505GH5', 'approved'),
    ('c5700000-0000-4000-8000-000000000002', 'carrier', 'Fletes Tarifa SA de CV', 'FTC040404CD4', 'approved');
  update public.profiles set company_id = 'c5700000-0000-4000-8000-000000000001'
  where id = 'a5700000-0000-4000-8000-000000000001';
  update public.profiles set company_id = 'c5700000-0000-4000-8000-000000000002'
  where id = 'a5700000-0000-4000-8000-000000000002';
  insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
    ('e5700000-0000-4000-8000-000000000001', 'c5700000-0000-4000-8000-000000000002', 'rigid', 'HTC5701', 'dry_van', 30000);
  insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
  select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
         'approved', case when r.requires_expiry then now() + interval '1 year' end
  from public.vehicles v
  cross join public.document_requirements r
  where v.company_id = 'c5700000-0000-4000-8000-000000000002'
    and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;
$sql$);

do $$
declare
  v_load uuid;
  v_offer uuid;
begin
  for i in 1..3 loop
    v_load := tests.as_user('a5700000-0000-4000-8000-000000000001', $sql$
      select public.request_brokered_load(jsonb_build_object(
        'origin', jsonb_build_object('address', 'Av. Constitución 100', 'city', 'Monterrey', 'state', 'Nuevo León',
                                     'lat', 25.6866, 'lng', -100.3161),
        'destination', jsonb_build_object('address', 'Blvd. Venustiano Carranza 200', 'city', 'Saltillo',
                                          'state', 'Coahuila', 'lat', 25.4383, 'lng', -100.9737),
        'pickupWindow', jsonb_build_object('start', now() + interval '1 day', 'end', now() + interval '1 day 4 hours'),
        'deliveryWindow', jsonb_build_object('start', now() + interval '2 days', 'end', now() + interval '2 days 6 hours'),
        'cargoType', 'palletized', 'description', 'Tarimas', 'weightKg', 8000, 'unitType', 'dry_van',
        'specialRequirements', jsonb_build_array()
      ), null)::text
    $sql$)::uuid;
    insert into tests.vals values ('bl' || i, v_load);
    perform tests.as_user('a5700000-0000-4000-8000-000000000003',
      tests.sql('admin_quote_brokered_load', v_load::text, '1200000', '1080000'));
    if i < 3 then
      perform tests.as_user('a5700000-0000-4000-8000-000000000001',
        tests.sql('approve_brokered_quote', v_load::text, '1200000'));
      v_offer := tests.as_user('a5700000-0000-4000-8000-000000000002',
        tests.sql('make_offer', v_load::text, '1150000', null, 'e5700000-0000-4000-8000-000000000001'))::uuid;
      insert into tests.vals select 'counter' || i, tests.as_user('a5700000-0000-4000-8000-000000000003',
        tests.sql('counter_offer', v_offer::text, '1080000'))::uuid;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. The admin changes the rate while the carrier accepts
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a5700000-0000-4000-8000-000000000003');
select lives_ok(
  format($$ select * from extensions.dblink('s1', %L) as t(r text) $$,
         tests.sql('admin_quote_brokered_load', tests.val('bl1')::text, '1200000', '1000000')),
  'the admin lowers the rate of bl1 (not committed yet)'
);
select tests.begin_as('s2', 'a5700000-0000-4000-8000-000000000002');
select extensions.dblink_send_query('s2', tests.sql('accept_offer', tests.val('counter1')::text));
select ok(tests.wait_until_blocked('s2'), 'the carrier''s acceptance waits for the load');
select extensions.dblink_exec('s1', 'commit');
select lives_ok($$ select * from extensions.dblink_get_result('s2') as t(r text) $$, 'then it contracts');
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'commit');
select is(
  tests.peek(format($sql$
    select concat_ws(',', l.status, l.agreed_price_cents, f.client_amount_cents, f.carrier_net_cents, f.margin_cents)
    from public.loads l join public.trips t on t.load_id = l.id join public.freight_ledgers f on f.trip_id = t.id
    where l.id = %L
  $sql$, tests.val('bl1'))),
  'contracted,1080000,1200000,1080000,120000',
  'at the amount of the offer it accepted, with its margin'
);

-- ---------------------------------------------------------------------------
-- 2. The carrier accepts while the admin changes the rate
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a5700000-0000-4000-8000-000000000002');
select lives_ok(
  format($$ select * from extensions.dblink('s1', %L) as t(r text) $$,
         tests.sql('accept_offer', tests.val('counter2')::text)),
  'the carrier accepts bl2 (not committed yet)'
);
select tests.begin_as('s2', 'a5700000-0000-4000-8000-000000000003');
select extensions.dblink_send_query('s2',
  tests.sql('admin_quote_brokered_load', tests.val('bl2')::text, '1200000', '1000000'));
select ok(tests.wait_until_blocked('s2'), 'the admin''s change waits for the load');
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(r text) $$, '55000', null,
  'then it is refused: the load is contracted'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'rollback');
select is(
  tests.peek(format($sql$ select concat_ws(',', status, proposed_price_cents, agreed_price_cents)
                          from public.loads where id = %L $sql$, tests.val('bl2'))),
  'contracted,1080000,1080000', 'the rate and the agreed price stay'
);

-- ---------------------------------------------------------------------------
-- 3. The client approves while the admin quotes a new price
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a5700000-0000-4000-8000-000000000003');
select lives_ok(
  format($$ select * from extensions.dblink('s1', %L) as t(r text) $$,
         tests.sql('admin_quote_brokered_load', tests.val('bl3')::text, '1300000', '1100000')),
  'the admin raises the quote of bl3 (not committed yet)'
);
select tests.begin_as('s2', 'a5700000-0000-4000-8000-000000000001');
select extensions.dblink_send_query('s2', tests.sql('approve_brokered_quote', tests.val('bl3')::text, '1200000'));
select ok(tests.wait_until_blocked('s2'), 'the client''s approval of $12,000 waits for the load');
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(r text) $$, '55000', 'the quote changed',
  'then it is refused: the client approves only the price it saw'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'rollback');
select is(
  tests.peek(format($sql$ select concat_ws(',', l.status, p.status, p.client_price_cents)
                          from public.loads l join public.load_client_prices p on p.load_id = l.id
                          where l.id = %L $sql$, tests.val('bl3'))),
  'draft,quoted,1300000', 'the load waits for the client with the new price'
);

select tests.cleanup();
-- Nothing of this file is left behind: the demo seed's checks (seed-tests)
-- count the notifications of its admin.
select is(
  (select count(*)::int from public.notifications
   where data ->> 'loadId' in (select id::text from tests.vals where name like 'bl%')),
  0, 'the cleanup leaves no notification of these loads, the admins'' included'
);
select extensions.dblink_disconnect('s1');
select extensions.dblink_disconnect('s2');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
