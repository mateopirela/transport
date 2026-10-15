-- Admin user directory (B12): admin_list_users is admin-only, returns email
-- and company, searches literally and validates its paging arguments.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.new_user(p_id uuid, p_email text, p_meta jsonb)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_email, p_meta, now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_id, 'role', 'authenticated')::text,
    true
  );
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- ...01 shipper of A, ...02 carrier of B, ...03 operator of B, ...05 admin.
select tests.new_user('a0000000-0000-4000-8000-000000000001', 'ana@acme.test',
  '{"role":"shipper","full_name":"Ana Pérez"}');
select tests.new_user('a0000000-0000-4000-8000-000000000002', 'beto@beta.test',
  '{"role":"carrier","full_name":"Beto Ruiz"}');
select tests.new_user('a0000000-0000-4000-8000-000000000003', 'carla_op@beta.test',
  '{"role":"operator","full_name":"Carla Díaz"}');
select tests.new_user('a0000000-0000-4000-8000-000000000005', 'admin@transport.test',
  '{"role":"shipper"}');

insert into public.companies (id, type, legal_name, rfc) values
  ('c0000000-0000-4000-8000-00000000000a', 'shipper', 'Acme Envíos SA de CV', 'ACE010101AB1'),
  ('c0000000-0000-4000-8000-00000000000b', 'carrier', 'Transportes Beta SA de CV', 'TBE020202CD2');

update public.profiles set company_id = 'c0000000-0000-4000-8000-00000000000a'
where id = 'a0000000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c0000000-0000-4000-8000-00000000000b'
where id in ('a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003');
update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-000000000005';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.admin_list_users(text, integer, integer)', 'execute'),
  'anon cannot execute admin_list_users'
);
select ok(
  (select prosecdef from pg_proc where oid = 'public.admin_list_users(text, integer, integer)'::regprocedure),
  'admin_list_users is security definer'
);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Non-admins are refused (shipper, carrier, operator)
-- ---------------------------------------------------------------------------
select tests.login('a0000000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select * from public.admin_list_users() $$,
  '42501', 'only admins can list users', 'a shipper cannot list users'
);
select tests.login('a0000000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select * from public.admin_list_users() $$,
  '42501', 'only admins can list users', 'a carrier cannot list users'
);
select tests.login('a0000000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select * from public.admin_list_users('beta') $$,
  '42501', 'only admins can list users', 'an operator cannot list users'
);

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
select tests.login('a0000000-0000-4000-8000-000000000005');

select is(
  (select count(*) from public.admin_list_users()),
  4::bigint,
  'the admin sees every user'
);

select results_eq(
  $$ select email, role::text, company_legal_name, company_status::text, total_count
     from public.admin_list_users('acme') $$,
  $$ values ('ana@acme.test', 'shipper', 'Acme Envíos SA de CV', 'pending_review', 1::bigint) $$,
  'search by company name returns the user with email and company'
);

select results_eq(
  $$ select email from public.admin_list_users('TBE020202') order by email $$,
  $$ values ('beto@beta.test'), ('carla_op@beta.test') $$,
  'search by RFC returns every member of the company'
);

select results_eq(
  $$ select email from public.admin_list_users('_op@') $$,
  $$ values ('carla_op@beta.test') $$,
  'LIKE wildcards in the search are matched literally'
);

select results_eq(
  $$ select count(*), max(total_count) from public.admin_list_users(null, 2, 0) $$,
  $$ values (2::bigint, 4::bigint) $$,
  'limit pages the result and total_count reports every match'
);

select throws_ok(
  $$ select * from public.admin_list_users(null, 500, 0) $$,
  '22023', 'limit must be between 1 and 100', 'limit is bounded'
);
select throws_ok(
  $$ select * from public.admin_list_users(null, 10, -1) $$,
  '22023', 'offset must not be negative', 'offset cannot be negative'
);

select * from finish();
rollback;
