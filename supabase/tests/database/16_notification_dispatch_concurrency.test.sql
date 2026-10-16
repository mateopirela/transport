-- Notification dispatch (B09) concurrency: two real sessions (dblink) race.
--   1. A worker whose lease ended records its result while a newer claim of
--      the same notification holds the row: the old result waits for that
--      claim and then changes nothing (it no longer is the current attempt).
--   2. Two claims at the same time never return the same notification.
--
-- The sessions need committed fixtures, so this file creates them through its
-- own connection and deletes them at the end (same approach as
-- 12_chat_concurrency.test.sql, with Supabase's default local credentials).
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(7);

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

-- Opens a transaction in a session as the service role (the dispatcher).
create function tests.begin_service(p_conn text)
returns void
language sql
as $$
  select extensions.dblink_exec(p_conn, 'begin');
  select extensions.dblink_exec(p_conn, 'set local lock_timeout = ''15s''');
  select extensions.dblink_exec(p_conn, 'set local role service_role');
  select extensions.dblink_exec(p_conn, 'set local request.jwt.claims = ''{"role": "service_role"}''');
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

-- Runs a query on the setup connection and returns one text value.
create function tests.peek(p_sql text)
returns text
language sql
as $$ select v from extensions.dblink('setup', p_sql) as t(v text) $$;

-- Removes this file's committed fixtures (also leftovers of an aborted run);
-- the user's notifications go with it (on delete cascade).
create function tests.cleanup()
returns void
language sql
as $$
  select extensions.dblink_exec('setup', $sql$
    delete from auth.users where id = 'a9100000-0000-4000-8000-000000000001';
  $sql$);
$$;

select tests.connect('setup');
select tests.connect('s1');
select tests.connect('s2');
select tests.cleanup();

-- Fixtures: one user and one notification for it, already claimed once by a
-- worker (attempt 1, push in flight) whose lease has ended.
select extensions.dblink_exec('setup', $sql$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
    ('a9100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'sara@dc.test', now(),
     '{"role":"shipper"}', now(), now());
  insert into public.notifications (id, user_id, type, data, push_state, email_state, dispatch_attempts, dispatch_retry_at)
  values ('f9100000-0000-4000-8000-000000000001', 'a9100000-0000-4000-8000-000000000001', 'offer_received', '{}',
          'in_flight', 'in_flight', 1, now() - interval '1 second');
$sql$);

-- ---------------------------------------------------------------------------
-- 1. s2 claims again (attempt 2) and holds the row; the old worker (s1)
--    records attempt 1 meanwhile.
-- ---------------------------------------------------------------------------
select tests.begin_service('s2');
select is(
  (select attempt from extensions.dblink('s2', $sql$
    select attempt from public.claim_notifications(10, 60)
    where id = 'f9100000-0000-4000-8000-000000000001'
  $sql$) as t(attempt integer)),
  2, 'a new claim takes the notification after the lease ended'
);

select tests.begin_service('s1');
select extensions.dblink_send_query('s1', $sql$
  select public.record_notification_dispatch(
    '[{"id": "f9100000-0000-4000-8000-000000000001", "attempt": 1, "push": "retry", "email": "retry"}]'
  )::text
$sql$);
select ok(tests.wait_until_blocked('s1'), 'the old result waits for the new claim');
select extensions.dblink_exec('s2', 'commit');
select is(
  (select r from extensions.dblink_get_result('s1') as t(r text)), '0',
  'once the new claim commits, the old result changes nothing'
);
select * from extensions.dblink_get_result('s1', false) as t(r text);
select extensions.dblink_exec('s1', 'commit');

select is(
  tests.peek($sql$
    select concat_ws(',', dispatch_attempts, push_state, email_state, dispatched_at is null,
                     dispatch_retry_at > now())
    from public.notifications where id = 'f9100000-0000-4000-8000-000000000001'
  $sql$),
  '2,unknown,in_flight,t,t',
  'the new claim keeps its lease, and the lost push stays unknown (it is not reopened)'
);

-- ---------------------------------------------------------------------------
-- 2. Two claims at the same time: each notification goes to one of them.
-- ---------------------------------------------------------------------------
select extensions.dblink_exec('setup', $sql$
  insert into public.notifications (user_id, type, data)
  select 'a9100000-0000-4000-8000-000000000001', 'load_match', '{}' from generate_series(1, 6);
$sql$);

select tests.begin_service('s1');
select tests.begin_service('s2');
create table tests.claimed (conn text, id uuid);
insert into tests.claimed
select 's1', id from extensions.dblink('s1', $sql$
  select id from public.claim_notifications(4, 60) where type = 'load_match'
$sql$) as t(id uuid);
insert into tests.claimed
select 's2', id from extensions.dblink('s2', $sql$
  select id from public.claim_notifications(10, 60) where type = 'load_match'
$sql$) as t(id uuid);
select extensions.dblink_exec('s1', 'commit');
select extensions.dblink_exec('s2', 'commit');

select is((select count(*)::int from tests.claimed where conn = 's1'), 4, 'the first claim takes its limit');
select is((select count(*)::int from tests.claimed where conn = 's2'), 2, 'the second one skips the locked rows');
select is(
  (select count(distinct id)::int from tests.claimed), 6, 'no notification is claimed twice'
);

select tests.cleanup();
select extensions.dblink_disconnect('s1');
select extensions.dblink_disconnect('s2');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
