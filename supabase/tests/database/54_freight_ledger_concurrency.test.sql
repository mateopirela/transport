-- Freight payments under concurrency (two real sessions, dblink): the admin
-- records payments of the same trip from two tabs (s1, s2). The second waits
-- for the ledger lock that the first holds, and then sees the first:
--   * two partial payments that together complete the client's side both
--     count, and the side becomes paid (and the carrier's scheduled) once;
--   * the same SPEI reference sent twice is recorded once: the second call
--     returns the first payment (idempotency);
--   * two full payments with different references: the second one is
--     refused, the side is already paid.
-- Committed fixtures through the setup connection, deleted at the end (same
-- approach as 50_chat_message_notifications_concurrency).
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(15);

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

-- The SQL of a payment recorded by the admin.
create function tests.pay_sql(p_trip text, p_amount bigint, p_reference text)
returns text
language sql
stable
as $$
  select format(
    'select public.admin_record_freight_payment(%L, %L, %s, public.freight_today(), %L)::text',
    tests.val(p_trip), 'client_to_fulmis', p_amount, p_reference
  )
$$;

-- Removes this file's committed fixtures (also leftovers of an aborted run).
create function tests.cleanup()
returns void
language sql
as $$
  select extensions.dblink_exec('setup', $sql$
    reset request.jwt.claims;
    alter table public.trip_events disable trigger trip_events_immutable;
    delete from public.trip_events
    where trip_id in (select id from public.trips where shipper_company_id = 'c5200000-0000-4000-8000-000000000001');
    alter table public.trip_events enable trigger trip_events_immutable;
    delete from public.conversations where shipper_company_id = 'c5200000-0000-4000-8000-000000000001';
    delete from public.document_shares where shipper_company_id = 'c5200000-0000-4000-8000-000000000001';
    delete from public.trips where shipper_company_id = 'c5200000-0000-4000-8000-000000000001';
    update public.loads
    set status = 'draft', accepted_offer_id = null, carrier_company_id = null, agreed_price_cents = null,
        contracted_at = null
    where shipper_company_id = 'c5200000-0000-4000-8000-000000000001';
    delete from public.offers where shipper_company_id = 'c5200000-0000-4000-8000-000000000001';
    delete from public.negotiations where shipper_company_id = 'c5200000-0000-4000-8000-000000000001';
    delete from public.loads where shipper_company_id = 'c5200000-0000-4000-8000-000000000001';
    delete from public.vehicle_availability where company_id = 'c5200000-0000-4000-8000-000000000002';
    delete from public.documents where company_id = 'c5200000-0000-4000-8000-000000000002';
    delete from public.vehicles where company_id = 'c5200000-0000-4000-8000-000000000002';
    alter table public.audit_log disable trigger audit_log_immutable;
    delete from public.audit_log
    where actor_id = 'a5200000-0000-4000-8000-000000000003'
       or company_id in ('c5200000-0000-4000-8000-000000000001', 'c5200000-0000-4000-8000-000000000002');
    alter table public.audit_log enable trigger audit_log_immutable;
    delete from auth.users where id in (
      'a5200000-0000-4000-8000-000000000001', 'a5200000-0000-4000-8000-000000000002',
      'a5200000-0000-4000-8000-000000000003'
    );
    delete from public.business_units where company_id = 'c5200000-0000-4000-8000-000000000002';
    delete from public.companies where id in ('c5200000-0000-4000-8000-000000000001', 'c5200000-0000-4000-8000-000000000002');
  $sql$);
$$;

select tests.connect('setup');
select tests.connect('s1');
select tests.connect('s2');
-- Leftovers of an interrupted run, if any.
select tests.cleanup();

-- ---------------------------------------------------------------------------
-- Fixtures (committed): S shipper, M manager, Z admin; unit V; three trips
-- of S won by M, of $10,000 each.
-- ---------------------------------------------------------------------------
select extensions.dblink_exec('setup', $sql$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    ('a5200000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 's@i3c.test', now(), null, '{"role":"shipper","phone":"+525500000000"}', now(), now()),
    ('a5200000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'm@i3c.test', now(), null, '{"role":"manager","phone":"+525500000000"}', now(), now()),
    ('a5200000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'z@i3c.test', now(), null, '{"role":"shipper","phone":"+525500000000"}', now(), now());
  update public.profiles set role = 'admin' where id = 'a5200000-0000-4000-8000-000000000003';
  insert into public.companies (id, type, legal_name, rfc, status) values
    ('c5200000-0000-4000-8000-000000000001', 'shipper', 'Envíos Pago SA de CV', 'EPC050505GH5', 'approved'),
    ('c5200000-0000-4000-8000-000000000002', 'carrier', 'Fletes Pago SA de CV', 'FPC040404CD4', 'approved');
  update public.profiles set company_id = 'c5200000-0000-4000-8000-000000000001'
  where id = 'a5200000-0000-4000-8000-000000000001';
  update public.profiles set company_id = 'c5200000-0000-4000-8000-000000000002'
  where id = 'a5200000-0000-4000-8000-000000000002';
  insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
    ('e5200000-0000-4000-8000-000000000001', 'c5200000-0000-4000-8000-000000000002', 'rigid', 'HPC5201', 'dry_van', 30000);
  insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
  select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
         'approved', case when r.requires_expiry then now() + interval '1 year' end
  from public.vehicles v
  cross join public.document_requirements r
  where v.company_id = 'c5200000-0000-4000-8000-000000000002'
    and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;
$sql$);

do $$
declare
  v_load uuid;
  v_offer uuid;
begin
  for i in 1..3 loop
    v_load := tests.as_user('a5200000-0000-4000-8000-000000000001', $sql$
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
    perform tests.as_user('a5200000-0000-4000-8000-000000000001', format('select public.publish_load(%L)::text', v_load));
    v_offer := tests.as_user('a5200000-0000-4000-8000-000000000002',
      format('select public.make_offer(%L, 1000000, null, %L)::text', v_load, 'e5200000-0000-4000-8000-000000000001'))::uuid;
    insert into tests.vals select 'trip' || i, tests.as_user('a5200000-0000-4000-8000-000000000001',
      format('select public.accept_offer(%L)::text', v_offer))::uuid;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Two partial payments at the same time that complete the client's side
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a5200000-0000-4000-8000-000000000003');
select lives_ok(
  format($$ select * from extensions.dblink('s1', %L) as t(r text) $$, tests.pay_sql('trip1', 600000, 'PARCIAL01')),
  'the admin records $6,000 from one tab (not committed yet)'
);
select tests.begin_as('s2', 'a5200000-0000-4000-8000-000000000003');
select extensions.dblink_send_query('s2', tests.pay_sql('trip1', 400000, 'PARCIAL02'));
select ok(tests.wait_until_blocked('s2'), 'the other tab''s $4,000 waits for the ledger');
select extensions.dblink_exec('s1', 'commit');
select lives_ok($$ select * from extensions.dblink_get_result('s2') as t(r text) $$, 'then it is recorded too');
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'commit');

select is(
  tests.peek(format($sql$
    select concat_ws(',', client_paid_cents, client_status, carrier_status)
    from public.freight_ledgers where trip_id = %L
  $sql$, tests.val('trip1'))),
  '1000000,paid,scheduled', 'both payments count and the trip is paid'
);
select is(
  tests.peek(format($sql$
    select count(*)::text from public.audit_log a
    join public.freight_ledgers f on f.id = a.record_id
    where a.table_name = 'freight_ledgers' and a.action = 'update' and f.trip_id = %L
      and a.new_data ->> 'client_status' = 'paid' and a.old_data ->> 'client_status' <> 'paid'
  $sql$, tests.val('trip1'))),
  '1', 'the client''s side becomes paid once'
);
select is(
  tests.peek(format($sql$
    select count(*)::text from public.notifications
    where user_id = 'a5200000-0000-4000-8000-000000000001' and type = 'freight_payment_received'
      and data ->> 'tripId' = %L
  $sql$, tests.val('trip1'))),
  '2', 'the shipper is told of each payment'
);

-- ---------------------------------------------------------------------------
-- 2. The same SPEI reference sent twice at the same time
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a5200000-0000-4000-8000-000000000003');
create temporary table first_payment as
select r from extensions.dblink('s1', tests.pay_sql('trip2', 500000, 'REPETIDA01')) as t(r text);
select is((select count(*)::int from first_payment), 1, 'the first tab records the payment (not committed yet)');
select tests.begin_as('s2', 'a5200000-0000-4000-8000-000000000003');
select extensions.dblink_send_query('s2', tests.pay_sql('trip2', 500000, 'REPETIDA01'));
select ok(tests.wait_until_blocked('s2'), 'the retry waits for the ledger');
select extensions.dblink_exec('s1', 'commit');
create temporary table second_payment as
select r from extensions.dblink_get_result('s2') as t(r text);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'commit');
select is((select r from second_payment), (select r from first_payment), 'the retry returns the same payment');
select is(
  tests.peek($sql$ select count(*)::text from public.freight_payments where spei_reference = 'REPETIDA01' $sql$),
  '1', 'the payment is recorded once'
);
select is(
  tests.peek(format($sql$ select client_paid_cents::text from public.freight_ledgers where trip_id = %L $sql$,
                    tests.val('trip2'))),
  '500000', 'and counted once'
);

-- ---------------------------------------------------------------------------
-- 3. Two full payments at the same time with different references
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a5200000-0000-4000-8000-000000000003');
select lives_ok(
  format($$ select * from extensions.dblink('s1', %L) as t(r text) $$, tests.pay_sql('trip3', 1000000, 'TOTAL01')),
  'one tab records the full payment (not committed yet)'
);
select tests.begin_as('s2', 'a5200000-0000-4000-8000-000000000003');
select extensions.dblink_send_query('s2', tests.pay_sql('trip3', 1000000, 'TOTAL02'));
select ok(tests.wait_until_blocked('s2'), 'the other full payment waits for the ledger');
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(r text) $$, '55000', null,
  'then it is refused: the client''s side is already paid'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'rollback');
select is(
  tests.peek(format($sql$
    select concat_ws(',', f.client_paid_cents, f.client_status, (select count(*) from public.freight_payments p where p.ledger_id = f.id))
    from public.freight_ledgers f where f.trip_id = %L
  $sql$, tests.val('trip3'))),
  '1000000,paid,1', 'one payment, paid once'
);

select tests.cleanup();
select extensions.dblink_disconnect('s1');
select extensions.dblink_disconnect('s2');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
