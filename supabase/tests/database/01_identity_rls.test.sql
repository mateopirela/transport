-- Identity (B01): sign-up trigger, auth helpers, create_company and the
-- role x operation RLS matrix for companies and profiles, including access to
-- another company's rows and privilege-escalation attempts.
begin;
create extension if not exists pgtap with schema extensions;

select plan(54);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.new_user(p_id uuid, p_meta jsonb)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id || '@test.local', case when p_meta ->> 'role' = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end, p_meta || '{"phone": "+525500000000"}', now(), now());
$$;

-- Sets the JWT claims read by auth.uid(); the caller then switches role.
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

-- Users:
--   ...01 shipper A (owner)        ...02 shipper A (teammate)
--   ...03 carrier B (owner)        ...04 operator of carrier B
--   ...05 admin                    ...06 shipper without company
--   ...07 operator without company ...08 shipper without company
-- Companies: c...0a = A (shipper), c...0b = B (carrier).
select tests.new_user('a0000000-0000-4000-8000-000000000001', '{"role":"shipper","full_name":"Ana A"}');
select tests.new_user('a0000000-0000-4000-8000-000000000002', '{"role":"shipper","full_name":"Beto A"}');
select tests.new_user('a0000000-0000-4000-8000-000000000003', '{"role":"manager","full_name":"Carla B"}');
select tests.new_user('a0000000-0000-4000-8000-000000000004', '{"role":"operator","full_name":"Omar B"}');
select tests.new_user('a0000000-0000-4000-8000-000000000005', '{"role":"shipper","full_name":"Admin"}');
select tests.new_user('a0000000-0000-4000-8000-000000000006', '{"role":"shipper","full_name":"Sin Empresa"}');
select tests.new_user('a0000000-0000-4000-8000-000000000007', '{"role":"operator"}');
select tests.new_user('a0000000-0000-4000-8000-000000000008', '{"role":"shipper"}');

insert into public.companies (id, type, legal_name, rfc, contact_phone) values
  ('c0000000-0000-4000-8000-00000000000a', 'shipper', 'Acme Envíos SA de CV', 'ACE010101AB1', '8110000000'),
  ('c0000000-0000-4000-8000-00000000000b', 'carrier', 'Transportes Beta SA de CV', 'TBE020202CD2', '3330000000');

update public.profiles set company_id = 'c0000000-0000-4000-8000-00000000000a'
where id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002');
update public.profiles set company_id = 'c0000000-0000-4000-8000-00000000000b'
where id in ('a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004');
-- Admins are promoted with a privileged role, never through sign-up.
update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-000000000005';

-- ---------------------------------------------------------------------------
-- Sign-up trigger
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select role::text, full_name, company_id from public.profiles
     where id = 'a0000000-0000-4000-8000-000000000003' $$,
  $$ values ('manager', 'Carla B', 'c0000000-0000-4000-8000-00000000000b'::uuid) $$,
  'sign-up creates the profile from raw_user_meta_data'
);

select throws_ok(
  $$ select tests.new_user('a0000000-0000-4000-8000-0000000000f1', '{"role":"admin"}') $$,
  '22023', null,
  'sign-up cannot self-assign the admin role'
);

select throws_ok(
  $$ select tests.new_user('a0000000-0000-4000-8000-0000000000f2', '{"full_name":"Sin rol"}') $$,
  '22023', null,
  'sign-up without a role is rejected'
);

select tests.new_user(
  'a0000000-0000-4000-8000-0000000000f3',
  '{"role":"manager","company_id":"c0000000-0000-4000-8000-00000000000b"}'
);
select is(
  (select company_id from public.profiles where id = 'a0000000-0000-4000-8000-0000000000f3'),
  null,
  'sign-up ignores company_id in metadata'
);

-- ---------------------------------------------------------------------------
-- Shipper A (owner)
-- ---------------------------------------------------------------------------
select tests.login('a0000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(public.auth_role(), 'shipper'::public.user_role, 'auth_role() returns the caller role');
select is(
  public.auth_company_id(), 'c0000000-0000-4000-8000-00000000000a'::uuid,
  'auth_company_id() returns the caller company'
);
select is(public.is_admin(), false, 'is_admin() is false for a shipper');
select is(public.is_company_approved(), false, 'is_company_approved() is false while in review');

select results_eq(
  $$ select id from public.companies order by id $$,
  $$ values ('c0000000-0000-4000-8000-00000000000a'::uuid) $$,
  'shipper sees only its own company'
);

select results_eq(
  $$ select id from public.profiles order by id $$,
  $$ values ('a0000000-0000-4000-8000-000000000001'::uuid), ('a0000000-0000-4000-8000-000000000002'::uuid) $$,
  'shipper sees its own profile and its teammates only'
);

-- companies: writes
select throws_ok(
  $$ insert into public.companies (type, legal_name, rfc) values ('shipper', 'X', 'XXX010101XX1') $$,
  '42501', null,
  'clients cannot insert companies directly'
);
select throws_ok(
  $$ delete from public.companies where id = 'c0000000-0000-4000-8000-00000000000a' $$,
  '42501', null,
  'clients cannot delete companies'
);
select lives_ok(
  $$ update public.companies set contact_phone = '8112223333'
     where id = 'c0000000-0000-4000-8000-00000000000a' $$,
  'shipper updates its own company contact'
);
select is(
  (select contact_phone from public.companies where id = 'c0000000-0000-4000-8000-00000000000a'),
  '8112223333',
  'own company contact was updated'
);
select throws_ok(
  $$ update public.companies set status = 'approved' where id = 'c0000000-0000-4000-8000-00000000000a' $$,
  '42501', null,
  'shipper cannot approve its own company'
);
select throws_ok(
  $$ update public.companies set rfc = 'ZZZ010101ZZ1' where id = 'c0000000-0000-4000-8000-00000000000a' $$,
  '42501', null,
  'shipper cannot change its company RFC'
);
select throws_ok(
  $$ update public.companies set type = 'carrier' where id = 'c0000000-0000-4000-8000-00000000000a' $$,
  '42501', null,
  'shipper cannot change its company type'
);
select throws_ok(
  $$ update public.companies set archived_at = now() where id = 'c0000000-0000-4000-8000-00000000000a' $$,
  '42501', null,
  'shipper cannot archive its company'
);
select lives_ok(
  $$ update public.companies set legal_name = 'Hackeada' where id = 'c0000000-0000-4000-8000-00000000000b' $$,
  'updating another company runs but matches no rows'
);

-- profiles: writes
select lives_ok(
  $$ update public.profiles set full_name = 'Ana Actualizada'
     where id = 'a0000000-0000-4000-8000-000000000001' $$,
  'user updates their own name'
);
select is(
  (select full_name from public.profiles where id = 'a0000000-0000-4000-8000-000000000001'),
  'Ana Actualizada',
  'own name was updated'
);
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'user cannot escalate their own role to admin'
);
select throws_ok(
  $$ update public.profiles set company_id = 'c0000000-0000-4000-8000-00000000000b'
     where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'user cannot move themselves to another company'
);
select lives_ok(
  $$ update public.profiles set full_name = 'Hackeado' where id = 'a0000000-0000-4000-8000-000000000002' $$,
  'updating a teammate profile runs but matches no rows'
);
select throws_ok(
  $$ insert into public.profiles (id, role) values ('a0000000-0000-4000-8000-0000000000f3', 'admin') $$,
  '42501', null,
  'clients cannot insert profiles'
);
select throws_ok(
  $$ delete from public.profiles where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'clients cannot delete profiles'
);
select throws_ok(
  $$ select public.create_company('Otra SA', 'OTR010101AA1') $$,
  '42501', null,
  'a user with a company cannot create a second one'
);

reset role;
select is(
  (select legal_name from public.companies where id = 'c0000000-0000-4000-8000-00000000000b'),
  'Transportes Beta SA de CV',
  'another company was not modified'
);
select is(
  (select full_name from public.profiles where id = 'a0000000-0000-4000-8000-000000000002'),
  'Beto A',
  'a teammate profile was not modified'
);

-- ---------------------------------------------------------------------------
-- Carrier B (owner) and its operator
-- ---------------------------------------------------------------------------
select tests.login('a0000000-0000-4000-8000-000000000003');
set local role authenticated;

select results_eq(
  $$ select id from public.companies $$,
  $$ values ('c0000000-0000-4000-8000-00000000000b'::uuid) $$,
  'carrier sees only its own company'
);
select results_eq(
  $$ select id from public.profiles order by id $$,
  $$ values ('a0000000-0000-4000-8000-000000000003'::uuid), ('a0000000-0000-4000-8000-000000000004'::uuid) $$,
  'carrier sees its own profile and its operator'
);

select tests.login('a0000000-0000-4000-8000-000000000004');

select results_eq(
  $$ select id from public.companies $$,
  $$ values ('c0000000-0000-4000-8000-00000000000b'::uuid) $$,
  'operator sees its carrier company'
);
select lives_ok(
  $$ update public.companies set contact_phone = '0000000000'
     where id = 'c0000000-0000-4000-8000-00000000000b' $$,
  'operator update of the carrier company runs but matches no rows'
);
select throws_ok(
  $$ update public.profiles set company_id = null where id = 'a0000000-0000-4000-8000-000000000004' $$,
  '42501', null,
  'operator cannot detach itself from its company'
);

reset role;
select is(
  (select contact_phone from public.companies where id = 'c0000000-0000-4000-8000-00000000000b'),
  '3330000000',
  'operator could not edit the carrier company'
);

-- Approved company: the verified legal name is frozen for clients.
update public.companies set status = 'approved' where id = 'c0000000-0000-4000-8000-00000000000b';

select tests.login('a0000000-0000-4000-8000-000000000003');
set local role authenticated;

select is(public.is_company_approved(), true, 'is_company_approved() is true once approved');
select throws_ok(
  $$ update public.companies set legal_name = 'Otra razón social'
     where id = 'c0000000-0000-4000-8000-00000000000b' $$,
  '42501', null,
  'an approved company cannot change its legal name'
);
select lives_ok(
  $$ update public.companies set contact_name = 'Carla' where id = 'c0000000-0000-4000-8000-00000000000b' $$,
  'an approved company can still update its contact'
);

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
select tests.login('a0000000-0000-4000-8000-000000000005');

select is(public.is_admin(), true, 'is_admin() is true for an admin');
select is(
  (select count(*) from public.companies
   where id in ('c0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000b')),
  2::bigint,
  'admin sees every company'
);
select is(
  (select count(*) from public.profiles where id::text like 'a0000000-0000-4000-8000-00000000000_'),
  8::bigint,
  'admin sees every profile'
);
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'not even an admin changes roles with a plain update'
);
select throws_ok(
  $$ select public.create_company('Admin SA', 'ADM010101AA1') $$,
  '42501', null,
  'an admin cannot create a company'
);

-- ---------------------------------------------------------------------------
-- create_company
-- ---------------------------------------------------------------------------
select tests.login('a0000000-0000-4000-8000-000000000006');

select is_empty($$ select id from public.companies $$, 'a user without company sees no companies');
select results_eq(
  $$ select id from public.profiles $$,
  $$ values ('a0000000-0000-4000-8000-000000000006'::uuid) $$,
  'a user without company sees only their own profile'
);
select lives_ok(
  $$ select public.create_company(' Nueva Carga SA de CV ', 'nca030303ef3', 'Nora', 'nora@nueva.mx', null) $$,
  'a shipper without company creates one'
);
select results_eq(
  $$ select c.type::text, c.status::text, c.rfc, c.legal_name
     from public.companies c where c.id = public.auth_company_id() $$,
  $$ values ('shipper', 'pending_review', 'NCA030303EF3', 'Nueva Carga SA de CV') $$,
  'the new company follows the caller role, starts in review and is linked to the caller'
);
select throws_ok(
  $$ select public.create_company('Segunda SA', 'SEG030303EF3') $$,
  '42501', null,
  'create_company cannot be called twice'
);

select tests.login('a0000000-0000-4000-8000-000000000007');
select throws_ok(
  $$ select public.create_company('Operador SA', 'OPE010101AA1') $$,
  '42501', null,
  'an operator cannot create a company'
);

select tests.login('a0000000-0000-4000-8000-000000000008');
select throws_ok(
  $$ select public.create_company('RFC Malo SA', 'NO-ES-RFC') $$,
  '23514', null,
  'an invalid RFC is rejected'
);
select throws_ok(
  $$ select public.create_company('Duplicada SA', 'ACE010101AB1') $$,
  '23505', null,
  'a duplicated RFC is rejected'
);

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select throws_ok($$ select * from public.companies $$, '42501', null, 'anon cannot read companies');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok(
  $$ select public.create_company('Anon SA', 'ANO010101AA1') $$,
  '42501', null,
  'anon cannot call create_company'
);

reset role;
select * from finish();
rollback;
