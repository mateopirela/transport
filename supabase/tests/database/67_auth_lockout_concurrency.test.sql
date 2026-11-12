-- R5 · The account lock under concurrent attempts: two failed passwords of
-- the same account at the same time (the first one creates its row) are
-- both counted, and the attempt that waits sees the other's count. Without
-- the row lock an attacker could fire attempts in parallel and never reach
-- the limit.
--
-- Two real sessions (dblink) with a committed fixture, as in
-- 28_business_unit_move_concurrency.test.sql.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(5);

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

select tests.connect('setup');
select tests.connect('s1');
select tests.connect('s2');

select extensions.dblink_exec('setup', $sql$
  delete from auth.users where id = 'a6700000-0000-4000-8000-000000000001';
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values ('a6700000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'race@r5.test', now(),
          '{"role": "shipper", "phone": "+525500000000"}', now(), now());
$sql$);

-- s1: the first failure creates the row and keeps it locked.
select extensions.dblink_exec('s1', 'begin');
select extensions.dblink_exec('s1', 'set local lock_timeout = ''15s''');
select is(
  (select v from extensions.dblink('s1', $sql$
     select public.auth_attempt_decision('password', 'a6700000-0000-4000-8000-000000000001', false) ->> 'decision'
   $sql$) as t(v text)),
  'continue',
  's1 records a failure inside its transaction'
);

-- s2: a failure at the same time waits for s1.
select extensions.dblink_exec('s2', 'set lock_timeout = ''15s''');
select extensions.dblink_send_query('s2', $sql$
  select public.auth_attempt_decision('password', 'a6700000-0000-4000-8000-000000000001', false) ->> 'decision'
$sql$);
select ok(tests.wait_until_blocked('s2'), 's2 waits for the row of s1');

select extensions.dblink_exec('s1', 'commit');
select is(
  (select v from extensions.dblink_get_result('s2') as t(v text)),
  'continue',
  's2 goes on once s1 commits'
);
select from extensions.dblink_get_result('s2') as t(v text);

select is(
  tests.peek($sql$
    select failed_count::text from public.auth_attempt_lockouts
    where user_id = 'a6700000-0000-4000-8000-000000000001' and kind = 'password'
  $sql$),
  '2',
  'both concurrent failures are counted'
);

-- Three more failures, one per session: the fifth in a row locks.
select extensions.dblink_exec('s1', $sql$
  select public.auth_attempt_decision('password', 'a6700000-0000-4000-8000-000000000001', false)
$sql$);
select extensions.dblink_exec('s2', $sql$
  select public.auth_attempt_decision('password', 'a6700000-0000-4000-8000-000000000001', false)
$sql$);
select is(
  (select v from extensions.dblink('setup', $sql$
     select public.auth_attempt_decision('password', 'a6700000-0000-4000-8000-000000000001', false) ->> 'decision'
   $sql$) as t(v text)),
  'reject',
  'the fifth failure locks the account'
);

select extensions.dblink_exec('setup', $sql$
  delete from auth.users where id = 'a6700000-0000-4000-8000-000000000001';
$sql$);
select extensions.dblink_disconnect('s1');
select extensions.dblink_disconnect('s2');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
