-- G1b · Invitation links, concurrency (dblink, as in 04_fleet_concurrency):
--   1. two coordinators accept the same link at once: one joins, the other
--      gets "invalid or expired", never two acceptances;
--   2. re-issuing an access reset and redeeming the previous one interleave
--      in both orders without a deadlock (lock order: operator, then its
--      invitations).
--
-- The sessions need committed fixtures, so this file creates them through its
-- own connection and deletes them at the end.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(11);

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

-- Runs the next statements of a session as the given user (or the service role).
create function tests.as_user(p_conn text, p_user uuid)
returns void
language sql
as $$
  select extensions.dblink_exec(p_conn, 'set local lock_timeout = ''15s''');
  select extensions.dblink_exec(p_conn, 'set local role authenticated');
  select extensions.dblink_exec(
    p_conn,
    format('set local request.jwt.claims = %L', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text)
  );
$$;

create function tests.as_service(p_conn text)
returns void
language sql
as $$
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

create function tests.pid(p_conn text)
returns integer
language sql
as $$ select pid from tests.pids where conn = p_conn $$;

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
    delete from public.invitations where company_id = 'c3000000-0000-4000-8000-0000000000cc';
    delete from public.business_unit_coordinators where company_id = 'c3000000-0000-4000-8000-0000000000cc';
    delete from public.operators where company_id = 'c3000000-0000-4000-8000-0000000000cc';
    delete from auth.users where id in ('f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000002',
                                        'f3000000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000004');
    delete from public.companies where id = 'c3000000-0000-4000-8000-0000000000cc';
  $sql$);
$$;

select tests.connect('setup');
select tests.connect('s1');
select tests.connect('s2');

select tests.cleanup();

-- Fixtures: manager ...01 of company cc; coordinators ...02 and ...03 without a
-- company; operator account ...04 linked to operator o1.
select extensions.dblink_exec('setup', $sql$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
    ('f3000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'gaby@cc30.test', now(),
     null, '{"role":"manager","phone":"+525500000000"}', now(), now()),
    ('f3000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'coco@cc30.test', now(),
     null, '{"role":"coordinator","phone":"+525500000000"}', now(), now()),
    ('f3000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'cris@cc30.test', now(),
     null, '{"role":"coordinator","phone":"+525500000000"}', now(), now()),
    ('f3000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'omar@cc30.test', now(),
     '{"provisioned_by": "redeem-invitation"}'::jsonb, '{"role":"operator","phone":"+525500000000"}', now(), now());
  insert into public.companies (id, type, legal_name, rfc)
  values ('c3000000-0000-4000-8000-0000000000cc', 'carrier', 'Concurrencia Enlaces SA de CV', 'CEN040404AA4');
  update public.profiles set company_id = 'c3000000-0000-4000-8000-0000000000cc'
  where id in ('f3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000004');
  insert into public.operators (id, company_id, profile_id, full_name) values
    ('d3000000-0000-4000-8000-0000000000c1', 'c3000000-0000-4000-8000-0000000000cc',
     'f3000000-0000-4000-8000-000000000004', 'Omar');
$sql$);

create temporary table tokens (name text primary key, token text not null);

-- ---------------------------------------------------------------------------
-- 1. Two coordinators accept the same link at once.
-- ---------------------------------------------------------------------------
select extensions.dblink_exec('s1', 'begin');
select tests.as_user('s1', 'f3000000-0000-4000-8000-000000000001');
insert into tokens
select 'coord', token from extensions.dblink('s1', $sql$
  select token from public.create_invitation(
    'coordinator', array(select id from public.business_units where company_id = 'c3000000-0000-4000-8000-0000000000cc'))
$sql$) as t(token text);
select extensions.dblink_exec('s1', 'commit');

select extensions.dblink_exec('s1', 'begin');
select tests.as_user('s1', 'f3000000-0000-4000-8000-000000000002');
select is(
  (select company_id from extensions.dblink(
     's1', format('select public.accept_coordinator_invitation(%L)', (select token from tokens where name = 'coord'))
   ) as t(company_id uuid)),
  'c3000000-0000-4000-8000-0000000000cc'::uuid,
  'the first coordinator accepts the link (transaction still open)'
);

select extensions.dblink_exec('s2', 'begin');
select tests.as_user('s2', 'f3000000-0000-4000-8000-000000000003');
select extensions.dblink_send_query(
  's2',
  format('select public.accept_coordinator_invitation(%L)', (select token from tokens where name = 'coord'))
);

select ok(tests.wait_until_blocked(tests.pid('s2')), 'the second acceptance waits for the first');
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(company_id uuid) $$,
  '22023', null,
  'once the first commits, the second fails as invalid (single use)'
);
select * from extensions.dblink_get_result('s2', false) as t(company_id uuid);
select extensions.dblink_exec('s2', 'rollback');

select results_eq(
  $$ select accepted_by, company_id from extensions.dblink('setup', $sql$
       select i.accepted_by, p.company_id
       from public.invitations i
       join public.profiles p on p.id = 'f3000000-0000-4000-8000-000000000002'
       where i.company_id = 'c3000000-0000-4000-8000-0000000000cc' and i.kind = 'coordinator'
     $sql$) as t(accepted_by uuid, company_id uuid) $$,
  $$ values ('f3000000-0000-4000-8000-000000000002'::uuid, 'c3000000-0000-4000-8000-0000000000cc'::uuid) $$,
  'exactly one coordinator joined, and it is the first'
);
select is(
  (select company_id from extensions.dblink('setup', $sql$
     select company_id from public.profiles where id = 'f3000000-0000-4000-8000-000000000003'
   $sql$) as t(company_id uuid)),
  null,
  'the second coordinator still has no company'
);

-- ---------------------------------------------------------------------------
-- 2a. Re-issue first: the concurrent redemption of the previous reset waits
--     and then fails cleanly (revoked), without a deadlock.
-- ---------------------------------------------------------------------------
select extensions.dblink_exec('s1', 'begin');
select tests.as_user('s1', 'f3000000-0000-4000-8000-000000000001');
insert into tokens
select 'reset1', token from extensions.dblink('s1', $sql$
  select token from public.create_invitation('operator_access_reset', '{}', 'd3000000-0000-4000-8000-0000000000c1')
$sql$) as t(token text);
select extensions.dblink_exec('s1', 'commit');

select extensions.dblink_exec('s1', 'begin');
select tests.as_user('s1', 'f3000000-0000-4000-8000-000000000001');
insert into tokens
select 'reset2', token from extensions.dblink('s1', $sql$
  select token from public.create_invitation('operator_access_reset', '{}', 'd3000000-0000-4000-8000-0000000000c1')
$sql$) as t(token text);

select extensions.dblink_exec('s2', 'begin');
select tests.as_service('s2');
select extensions.dblink_send_query(
  's2',
  format('select operator_id from public.redeem_operator_invitation_service(%L, null)', (select token from tokens where name = 'reset1'))
);

select ok(tests.wait_until_blocked(tests.pid('s2')), 'redeeming waits for a concurrent re-issue');
select extensions.dblink_exec('s1', 'commit');
select throws_ok(
  $$ select * from extensions.dblink_get_result('s2') as t(operator_id uuid) $$,
  '22023', null,
  'the superseded reset then fails as invalid, not with a deadlock'
);
select * from extensions.dblink_get_result('s2', false) as t(operator_id uuid);
select extensions.dblink_exec('s2', 'rollback');

-- ---------------------------------------------------------------------------
-- 2b. Redemption first: the concurrent re-issue waits; afterwards the used
--     link stays used and the new one is pending.
-- ---------------------------------------------------------------------------
select extensions.dblink_exec('s2', 'begin');
select tests.as_service('s2');
select is(
  (select operator_id from extensions.dblink(
     's2', format('select operator_id from public.redeem_operator_invitation_service(%L, null)', (select token from tokens where name = 'reset2'))
   ) as t(operator_id uuid)),
  'd3000000-0000-4000-8000-0000000000c1'::uuid,
  'the current reset is redeemed (transaction still open)'
);

select extensions.dblink_exec('s1', 'begin');
select tests.as_user('s1', 'f3000000-0000-4000-8000-000000000001');
select extensions.dblink_send_query('s1', $sql$
  select token from public.create_invitation('operator_access_reset', '{}', 'd3000000-0000-4000-8000-0000000000c1')
$sql$);

select ok(tests.wait_until_blocked(tests.pid('s1')), 're-issuing waits for a concurrent redemption');
select extensions.dblink_exec('s2', 'commit');
select lives_ok(
  $$ select * from extensions.dblink_get_result('s1') as t(token text) $$,
  'once the redemption commits, the re-issue proceeds'
);
select * from extensions.dblink_get_result('s1', false) as t(token text);
select extensions.dblink_exec('s1', 'commit');

select results_eq(
  $$ select accepted, revoked, pending from extensions.dblink('setup', $sql$
       select count(*) filter (where accepted_at is not null), count(*) filter (where revoked_at is not null),
              count(*) filter (where accepted_at is null and revoked_at is null)
       from public.invitations where operator_id = 'd3000000-0000-4000-8000-0000000000c1'
     $sql$) as t(accepted bigint, revoked bigint, pending bigint) $$,
  $$ values (1::bigint, 1::bigint, 1::bigint) $$,
  'one reset was used, the superseded one stays revoked and the new one is pending'
);

select tests.cleanup();
select extensions.dblink_disconnect('s1');
select extensions.dblink_disconnect('s2');
select extensions.dblink_disconnect('setup');

select * from finish();
rollback;
