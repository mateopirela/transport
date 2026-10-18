-- G4 · "Mi empresa" concurrency, with two real sessions (dblink) and
-- committed fixtures, as in 28_business_unit_move_concurrency.test.sql:
--   1. an offer proposing a unit waits for the manager's move of that unit
--      and is then refused (the unit is no longer of its business unit);
--   2. a move waits for an offer that proposes the unit and is then refused
--      (the offer is pending);
--   3. an invitation issued by a coordinator while the manager removes them
--      waits for the removal and is then refused;
--   4. a removal that waits for an invitation being issued revokes it;
--   5. a coordinator replacing their own link while being removed waits for
--      the removal (links, then profile, in both) and is refused, no deadlock.
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
    update public.loads set status = 'draft'
    where shipper_company_id = 'c3500000-0000-4000-8000-000000000001';
    delete from public.conversations where shipper_company_id = 'c3500000-0000-4000-8000-000000000001';
    delete from public.offers where shipper_company_id = 'c3500000-0000-4000-8000-000000000001';
    delete from public.negotiations where shipper_company_id = 'c3500000-0000-4000-8000-000000000001';
    delete from public.loads where shipper_company_id = 'c3500000-0000-4000-8000-000000000001';
    delete from public.invitations where company_id = 'c3500000-0000-4000-8000-000000000002';
    delete from public.vehicles where company_id = 'c3500000-0000-4000-8000-000000000002';
    delete from public.operators where company_id = 'c3500000-0000-4000-8000-000000000002';
    delete from public.business_unit_coordinators where company_id = 'c3500000-0000-4000-8000-000000000002';
    delete from public.notifications where user_id::text like 'a3500000-%';
    delete from auth.users where id::text like 'a3500000-%';
    delete from public.companies where id in (
      'c3500000-0000-4000-8000-000000000001', 'c3500000-0000-4000-8000-000000000002'
    );
  $sql$);
$$;

select tests.connect('setup');
select tests.connect('s1');
select tests.connect('s2');
select tests.cleanup();

-- Fixtures: shipper S (...01), carrier with manager M (...02), coordinators A
-- (...03) and B (...04) of unit A, units V1 and V2 in unit A, an empty unit
-- B, and a published load.
select extensions.dblink_exec('setup', $sql$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  select id, 'authenticated', 'authenticated', id::text || '@g4c.test', now(),
         jsonb_build_object('role', role, 'phone', '+525500000000'), now(), now()
  from (values
    ('a3500000-0000-4000-8000-000000000001'::uuid, 'shipper'),
    ('a3500000-0000-4000-8000-000000000002', 'manager'),
    ('a3500000-0000-4000-8000-000000000003', 'coordinator'),
    ('a3500000-0000-4000-8000-000000000004', 'coordinator'),
    ('a3500000-0000-4000-8000-000000000005', 'coordinator')) as u(id, role);
  insert into public.companies (id, type, legal_name, rfc, status) values
    ('c3500000-0000-4000-8000-000000000001', 'shipper', 'Envíos Sigma SA de CV', 'ESI080808AA8', 'approved'),
    ('c3500000-0000-4000-8000-000000000002', 'carrier', 'Fletes Omega SA de CV', 'FOM080808AA8', 'approved');
  update public.profiles set company_id = 'c3500000-0000-4000-8000-000000000001'
  where id = 'a3500000-0000-4000-8000-000000000001';
  update public.profiles set company_id = 'c3500000-0000-4000-8000-000000000002'
  where id::text like 'a3500000-%' and id <> 'a3500000-0000-4000-8000-000000000001';
  update public.business_units set name = 'Unidad A' where company_id = 'c3500000-0000-4000-8000-000000000002';
  insert into public.business_units (id, company_id, name)
  values ('b3500000-0000-4000-8000-00000000000b', 'c3500000-0000-4000-8000-000000000002', 'Unidad B');
  insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id)
  select b.id, b.company_id, c.profile_id
  from (values ('a3500000-0000-4000-8000-000000000003'::uuid), ('a3500000-0000-4000-8000-000000000004'),
               ('a3500000-0000-4000-8000-000000000005')) as c(profile_id)
  join public.business_units b on b.company_id = 'c3500000-0000-4000-8000-000000000002' and b.name = 'Unidad A';
  insert into public.vehicles (id, company_id, business_unit_id, kind, plate, unit_type, capacity_kg)
  select v.id, 'c3500000-0000-4000-8000-000000000002', b.id, 'rigid', v.plate, 'dry_van', 30000
  from (values ('e3500000-0000-4000-8000-000000000001'::uuid, 'GGA3501'),
               ('e3500000-0000-4000-8000-000000000002', 'GGA3502')) as v(id, plate)
  join public.business_units b on b.company_id = 'c3500000-0000-4000-8000-000000000002' and b.name = 'Unidad A';
  insert into public.operators (id, company_id, business_unit_id, full_name)
  select 'd3500000-0000-4000-8000-000000000001', b.company_id, b.id, 'Óscar Sin Cuenta'
  from public.business_units b
  where b.company_id = 'c3500000-0000-4000-8000-000000000002' and b.name = 'Unidad A';
  insert into public.loads (id, shipper_company_id, status,
    origin_address, origin_city, origin_state, origin_lat, origin_lng,
    destination_address, destination_city, destination_state, destination_lat, destination_lng,
    pickup_window_start, pickup_window_end, delivery_window_start, delivery_window_end,
    cargo_type, description, weight_kg, unit_type, proposed_price_cents, published_at)
  values ('f3500000-0000-4000-8000-000000000001', 'c3500000-0000-4000-8000-000000000001', 'published',
    'Centro', 'Monterrey', 'Nuevo León', 25.6866, -100.3161,
    'Centro', 'Guadalajara', 'Jalisco', 20.6597, -103.3496,
    now() + interval '1 day', now() + interval '2 days', now() + interval '2 days', now() + interval '3 days',
    'general', 'Carga de prueba', 1000, 'dry_van', 3000000, now());
$sql$);

-- ---------------------------------------------------------------------------
-- 1. An offer proposing V1 waits for the move of V1 to B, then is refused
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a3500000-0000-4000-8000-000000000002');
select * from extensions.dblink('s1', $sql$
  select public.move_vehicle_to_unit('e3500000-0000-4000-8000-000000000001', 'b3500000-0000-4000-8000-00000000000b')::text
$sql$) as t(r text);
select tests.begin_as('s2', 'a3500000-0000-4000-8000-000000000003');
select extensions.dblink_send_query('s2', $sql$
  select public.make_offer('f3500000-0000-4000-8000-000000000001', 2900000, null,
                           'e3500000-0000-4000-8000-000000000001')::text
$sql$);
select ok(tests.wait_until_blocked('s2'), 'the offer proposing V1 waits for the move that holds V1');
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(r text) $$,
  '22023', 'invalid offer: vehicle not found',
  'once V1 is in B, the offer for unit A is refused'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'rollback');
select is(
  tests.peek($sql$ select count(*)::text from public.offers where vehicle_id = 'e3500000-0000-4000-8000-000000000001' $sql$),
  '0', 'no offer proposes V1'
);

-- ---------------------------------------------------------------------------
-- 2. A move of V2 waits for the offer that proposes it, then is refused
-- ---------------------------------------------------------------------------
select tests.begin_as('s2', 'a3500000-0000-4000-8000-000000000003');
select * from extensions.dblink('s2', $sql$
  select public.make_offer('f3500000-0000-4000-8000-000000000001', 2900000, null,
                           'e3500000-0000-4000-8000-000000000002')::text
$sql$) as t(r text);
select tests.begin_as('s1', 'a3500000-0000-4000-8000-000000000002');
select extensions.dblink_send_query('s1', $sql$
  select public.move_vehicle_to_unit('e3500000-0000-4000-8000-000000000002', 'b3500000-0000-4000-8000-00000000000b')::text
$sql$);
select ok(tests.wait_until_blocked('s1'), 'the move of V2 waits for the offer that proposes it');
select extensions.dblink_exec('s2', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s1') as t(r text) $$,
  '55000', 'cannot move: it is committed to a trip',
  'once the offer is pending, the move is refused'
);
select * from extensions.dblink_get_result('s1', false) as t(r text);
select extensions.dblink_exec('s1', 'rollback');
select is(
  tests.peek($sql$ select (v.business_unit_id = o.business_unit_id)::text
                   from public.vehicles v
                   join public.offers f on f.vehicle_id = v.id and f.status = 'pending'
                   join public.negotiations o on o.id = f.negotiation_id
                   where v.id = 'e3500000-0000-4000-8000-000000000002' $sql$),
  'true', 'V2 stays in the business unit of its pending offer'
);

-- ---------------------------------------------------------------------------
-- 3. An invitation by A waits for A's removal, then is refused
-- ---------------------------------------------------------------------------
select tests.begin_as('s1', 'a3500000-0000-4000-8000-000000000002');
select * from extensions.dblink('s1', $sql$
  select public.remove_company_member('a3500000-0000-4000-8000-000000000003')::text
$sql$) as t(r text);
select tests.begin_as('s2', 'a3500000-0000-4000-8000-000000000003');
select extensions.dblink_send_query('s2', $sql$
  select invitation_id::text from public.create_invitation(
    'operator', array(select id from public.business_units
                      where company_id = 'c3500000-0000-4000-8000-000000000002' and name = 'Unidad A'))
$sql$);
select ok(tests.wait_until_blocked('s2'), 'the invitation by A waits for the removal that holds A''s profile');
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(r text) $$,
  '42501', 'only the staff of a carrier company can invite',
  'once A is removed, their invitation is refused'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'rollback');

-- ---------------------------------------------------------------------------
-- 4. B's removal waits for B's invitation, then revokes it
-- ---------------------------------------------------------------------------
select tests.begin_as('s2', 'a3500000-0000-4000-8000-000000000004');
select * from extensions.dblink('s2', $sql$
  select invitation_id::text from public.create_invitation(
    'operator', array(select id from public.business_units
                      where company_id = 'c3500000-0000-4000-8000-000000000002' and name = 'Unidad A'))
$sql$) as t(r text);
select tests.begin_as('s1', 'a3500000-0000-4000-8000-000000000002');
select extensions.dblink_send_query('s1', $sql$
  select public.remove_company_member('a3500000-0000-4000-8000-000000000004')::text
$sql$);
select ok(tests.wait_until_blocked('s1'), 'the removal of B waits for the invitation B is issuing');
select extensions.dblink_exec('s2', 'commit');
select * from extensions.dblink_get_result('s1') as t(r text);
select * from extensions.dblink_get_result('s1', false) as t(r text);
select extensions.dblink_exec('s1', 'commit');
select is(
  tests.peek($sql$ select count(*)::text from public.invitations
                   where created_by = 'a3500000-0000-4000-8000-000000000004'
                     and revoked_at is null and accepted_at is null $sql$),
  '0', 'the removal revokes the invitation B issued meanwhile'
);

-- ---------------------------------------------------------------------------
-- 5. C replaces their link for an operator while the manager removes C
-- ---------------------------------------------------------------------------
select tests.begin_as('s2', 'a3500000-0000-4000-8000-000000000005');
select * from extensions.dblink('s2', $sql$
  select invitation_id::text
  from public.create_invitation('operator', '{}', 'd3500000-0000-4000-8000-000000000001')
$sql$) as t(r text);
select extensions.dblink_exec('s2', 'commit');
select tests.begin_as('s1', 'a3500000-0000-4000-8000-000000000002');
select * from extensions.dblink('s1', $sql$
  select public.remove_company_member('a3500000-0000-4000-8000-000000000005')::text
$sql$) as t(r text);
select tests.begin_as('s2', 'a3500000-0000-4000-8000-000000000005');
select extensions.dblink_send_query('s2', $sql$
  select invitation_id::text
  from public.create_invitation('operator', '{}', 'd3500000-0000-4000-8000-000000000001')
$sql$);
select ok(tests.wait_until_blocked('s2'), 'the replacement link waits for the removal, which holds C''s links');
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(r text) $$,
  '42501', 'only the staff of a carrier company can invite',
  'once C is removed, the replacement is refused (no deadlock)'
);
select * from extensions.dblink_get_result('s2', false) as t(r text);
select extensions.dblink_exec('s2', 'rollback');
select is(
  tests.peek($sql$ select count(*)::text from public.invitations
                   where created_by = 'a3500000-0000-4000-8000-000000000005'
                     and revoked_at is null and accepted_at is null $sql$),
  '0', 'C leaves no usable link'
);

select tests.cleanup();
select extensions.dblink_disconnect('s1');
select extensions.dblink_disconnect('s2');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
