-- Fleet (B04) concurrency: two real sessions (dblink) interleave
--   1. archiving an operator and assigning it to a unit, in both orders;
--   2. re-issuing an invitation and accepting it, in both orders (no deadlock).
--
-- The sessions need committed fixtures, so this file creates them through its
-- own connection and deletes them at the end. It connects to the local
-- development database with Supabase's default local credentials.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(12);

create schema tests;

-- dblink only lets a non-superuser connect with a password, and the local
-- database trusts loopback connections without one, so connect to the
-- server's own non-loopback address (the one this test session uses).
create function tests.conninfo()
returns text
language sql
as $$
  select format(
    'host=%s port=%s dbname=%s user=postgres password=postgres',
    host(inet_server_addr()), inet_server_port(), current_database()
  )
$$;

-- Runs one statement in a session as the given user, inside its open transaction.
create function tests.as_user(p_conn text, p_user uuid)
returns void
language sql
as $$
  -- A broken lock order fails fast instead of hanging the suite.
  select extensions.dblink_exec(p_conn, 'set local lock_timeout = ''15s''');
  select extensions.dblink_exec(p_conn, 'set local role authenticated');
  select extensions.dblink_exec(
    p_conn,
    format(
      'set local request.jwt.claims = %L',
      jsonb_build_object('sub', p_user, 'role', 'authenticated')::text
    )
  );
$$;

-- Backend pid of each session, captured at connect time (a session busy with
-- an async query cannot answer another one).
create table tests.pids (conn text primary key, pid integer not null);

create function tests.connect(p_conn text)
returns void
language sql
as $$
  select extensions.dblink_connect(p_conn, tests.conninfo());
  insert into tests.pids
  select p_conn, pid from extensions.dblink(p_conn, 'select pg_backend_pid()') as t(pid integer);
$$;

create function tests.pid(p_conn text)
returns integer
language sql
as $$ select pid from tests.pids where conn = p_conn $$;

-- True once the backend is waiting for a lock held by another session.
create function tests.wait_until_blocked(p_pid integer)
returns boolean
language plpgsql
as $$
begin
  for i in 1..200 loop
    if cardinality(pg_blocking_pids(p_pid)) > 0 then
      return true;
    end if;
    perform pg_sleep(0.05);
  end loop;
  return false;
end;
$$;

create function tests.cleanup()
returns void
language sql
as $$
  select extensions.dblink_exec('setup', $sql$
    delete from public.operator_invitations where company_id = 'c0000000-0000-4000-8000-0000000000cc';
    delete from public.vehicles where company_id = 'c0000000-0000-4000-8000-0000000000cc';
    delete from public.operators where company_id = 'c0000000-0000-4000-8000-0000000000cc';
    delete from auth.users where id in ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002');
    delete from public.companies where id = 'c0000000-0000-4000-8000-0000000000cc';
  $sql$);
$$;

select tests.connect('setup');
select tests.connect('s1');
select tests.connect('s2');

select tests.cleanup();

-- Fixtures: carrier ...01 of company cc, operator account ...02 (zoe@cc.test);
-- operators o1 and o3 (to archive), o2 (to invite); vehicle v1.
select extensions.dblink_exec('setup', $sql$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
    ('f0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'carla@cc.test', now(),
     '{"role":"carrier"}', now(), now()),
    ('f0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'zoe@cc.test', now(),
     '{"role":"operator"}', now(), now());
  insert into public.companies (id, type, legal_name, rfc)
  values ('c0000000-0000-4000-8000-0000000000cc', 'carrier', 'Concurrencia SA de CV', 'CON040404AA4');
  update public.profiles set company_id = 'c0000000-0000-4000-8000-0000000000cc'
  where id = 'f0000000-0000-4000-8000-000000000001';
  insert into public.operators (id, company_id, full_name, email) values
    ('d0000000-0000-4000-8000-0000000000c1', 'c0000000-0000-4000-8000-0000000000cc', 'Uno', null),
    ('d0000000-0000-4000-8000-0000000000c2', 'c0000000-0000-4000-8000-0000000000cc', 'Zoe', 'zoe@cc.test'),
    ('d0000000-0000-4000-8000-0000000000c3', 'c0000000-0000-4000-8000-0000000000cc', 'Tres', null);
  insert into public.vehicles (id, company_id, kind, plate)
  values ('e0000000-0000-4000-8000-0000000000c1', 'c0000000-0000-4000-8000-0000000000cc', 'tractor', 'CCC1111');
$sql$);

-- ---------------------------------------------------------------------------
-- 1a. Archival first: the concurrent assignment waits and then fails.
-- ---------------------------------------------------------------------------
select extensions.dblink_exec('s1', 'begin');
select tests.as_user('s1', 'f0000000-0000-4000-8000-000000000001');
select extensions.dblink_exec('s1', $sql$
  update public.operators set archived_at = now() where id = 'd0000000-0000-4000-8000-0000000000c1'
$sql$);

select extensions.dblink_exec('s2', 'begin');
select tests.as_user('s2', 'f0000000-0000-4000-8000-000000000001');
select extensions.dblink_send_query('s2', $sql$
  update public.vehicles set current_operator_id = 'd0000000-0000-4000-8000-0000000000c1'
  where id = 'e0000000-0000-4000-8000-0000000000c1'
$sql$);

select ok(tests.wait_until_blocked(tests.pid('s2')), 'an assignment waits for a concurrent archival');
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(status text) $$,
  '23514', null,
  'once the archival commits, the assignment fails'
);
select * from extensions.dblink_get_result('s2', false) as t(status text);
select extensions.dblink_exec('s2', 'rollback');

-- ---------------------------------------------------------------------------
-- 1b. Assignment first: the archival waits and then releases the unit.
-- ---------------------------------------------------------------------------
select extensions.dblink_exec('s2', 'begin');
select tests.as_user('s2', 'f0000000-0000-4000-8000-000000000001');
select extensions.dblink_exec('s2', $sql$
  update public.vehicles set current_operator_id = 'd0000000-0000-4000-8000-0000000000c3'
  where id = 'e0000000-0000-4000-8000-0000000000c1'
$sql$);

select extensions.dblink_exec('s1', 'begin');
select tests.as_user('s1', 'f0000000-0000-4000-8000-000000000001');
select extensions.dblink_send_query('s1', $sql$
  update public.operators set archived_at = now() where id = 'd0000000-0000-4000-8000-0000000000c3'
$sql$);

select ok(tests.wait_until_blocked(tests.pid('s1')), 'an archival waits for a concurrent assignment');
select extensions.dblink_exec('s2', 'commit');
select lives_ok(
  $$ select * from extensions.dblink_get_result('s1') as t(status text) $$,
  'once the assignment commits, the archival proceeds'
);
select * from extensions.dblink_get_result('s1', false) as t(status text);
select extensions.dblink_exec('s1', 'commit');

select is(
  (select current_operator_id from extensions.dblink('setup', $sql$
     select current_operator_id from public.vehicles where id = 'e0000000-0000-4000-8000-0000000000c1'
   $sql$) as t(current_operator_id uuid)),
  null,
  'no unit stays assigned to an archived operator'
);

-- ---------------------------------------------------------------------------
-- 2a. Re-issue first: the concurrent acceptance of the old code waits and
--     then fails cleanly (revoked), without a deadlock.
-- ---------------------------------------------------------------------------
create temporary table codes (name text primary key, code text not null);

select extensions.dblink_exec('s1', 'begin');
select tests.as_user('s1', 'f0000000-0000-4000-8000-000000000001');
insert into codes
select 'first', code from extensions.dblink('s1', $sql$
  select code from public.create_operator_invitation('d0000000-0000-4000-8000-0000000000c2')
$sql$) as t(code text);
select extensions.dblink_exec('s1', 'commit');

select extensions.dblink_exec('s1', 'begin');
select tests.as_user('s1', 'f0000000-0000-4000-8000-000000000001');
insert into codes
select 'second', code from extensions.dblink('s1', $sql$
  select code from public.create_operator_invitation('d0000000-0000-4000-8000-0000000000c2')
$sql$) as t(code text);

select extensions.dblink_exec('s2', 'begin');
select tests.as_user('s2', 'f0000000-0000-4000-8000-000000000002');
select extensions.dblink_send_query(
  's2',
  format('select public.accept_operator_invitation(%L)', (select code from codes where name = 'first'))
);

select ok(tests.wait_until_blocked(tests.pid('s2')), 'accepting waits for a concurrent re-issue');
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(operator_id uuid) $$,
  '22023', null,
  'the superseded code then fails as invalid, not with a deadlock'
);
select * from extensions.dblink_get_result('s2', false) as t(operator_id uuid);
select extensions.dblink_exec('s2', 'rollback');

-- ---------------------------------------------------------------------------
-- 2b. Acceptance first: the concurrent re-issue waits and then fails because
--     the operator already has an account.
-- ---------------------------------------------------------------------------
select extensions.dblink_exec('s2', 'begin');
select tests.as_user('s2', 'f0000000-0000-4000-8000-000000000002');
select is(
  (select operator_id from extensions.dblink(
     's2', format('select public.accept_operator_invitation(%L)', (select code from codes where name = 'second'))
   ) as t(operator_id uuid)),
  'd0000000-0000-4000-8000-0000000000c2'::uuid,
  'the current code is accepted'
);

select extensions.dblink_exec('s1', 'begin');
select tests.as_user('s1', 'f0000000-0000-4000-8000-000000000001');
select extensions.dblink_send_query('s1', $sql$
  select code from public.create_operator_invitation('d0000000-0000-4000-8000-0000000000c2')
$sql$);

select ok(tests.wait_until_blocked(tests.pid('s1')), 're-issuing waits for a concurrent acceptance');
select extensions.dblink_exec('s2', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s1') as t(code text) $$,
  '22023', null,
  'the re-issue then fails because the operator already has an account'
);
select * from extensions.dblink_get_result('s1', false) as t(code text);
select extensions.dblink_exec('s1', 'rollback');

select results_eq(
  $$ select accepted, revoked from extensions.dblink('setup', $sql$
       select count(*) filter (where accepted_at is not null), count(*) filter (where revoked_at is not null)
       from public.operator_invitations where operator_id = 'd0000000-0000-4000-8000-0000000000c2'
     $sql$) as t(accepted bigint, revoked bigint) $$,
  $$ values (1::bigint, 1::bigint) $$,
  'one invitation was accepted and the superseded one stays revoked'
);
select is(
  (select profile_id from extensions.dblink('setup', $sql$
     select profile_id from public.operators where id = 'd0000000-0000-4000-8000-0000000000c2'
   $sql$) as t(profile_id uuid)),
  'f0000000-0000-4000-8000-000000000002'::uuid,
  'the operator is linked to the account that accepted'
);

select tests.cleanup();
select extensions.dblink_disconnect('s1');
select extensions.dblink_disconnect('s2');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
