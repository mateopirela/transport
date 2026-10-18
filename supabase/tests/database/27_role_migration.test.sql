-- G1a.1 · The carrier role becomes manager (Gerente) and coordinator
-- (Coordinador) is added (D19):
--   * the enum no longer has carrier, and a sign-up from an older build that
--     still sends 'carrier' is stored as manager;
--   * a manager creates a carrier company; a coordinator signs up without one
--     and cannot create one, submit company documents nor request a review;
--   * until business units (G1a.2), a coordinator has no fleet scope;
--   * hygiene: no function body names the role 'carrier' or casts between a
--     company type and a role as text.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated;

create function tests.new_user(p_id uuid, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@roles.test', now(),
          case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end, jsonb_build_object('role', p_role, 'phone', '+525500000000', 'full_name', 'Prueba ' || p_role), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------------------
-- The enum
-- ---------------------------------------------------------------------------
select ok(
  not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role' and e.enumlabel = 'carrier'
  ),
  'user_role no longer has carrier'
);
select enum_has_labels('public', 'company_type', array['shipper', 'carrier'], 'company_type keeps carrier');
select enum_has_labels('public', 'offer_side', array['shipper', 'carrier'], 'offer_side keeps carrier');

-- ---------------------------------------------------------------------------
-- Sign-up
-- ---------------------------------------------------------------------------
select tests.new_user('a2700000-0000-4000-8000-000000000001', 'carrier');
select tests.new_user('a2700000-0000-4000-8000-000000000002', 'manager');
select tests.new_user('a2700000-0000-4000-8000-000000000003', 'coordinator');
select tests.new_user('a2700000-0000-4000-8000-000000000004', 'shipper');

select results_eq(
  $$ select id, role::text, company_id from public.profiles
     where id::text like 'a2700000-%' order by id $$,
  $$ values ('a2700000-0000-4000-8000-000000000001'::uuid, 'manager', null::uuid),
            ('a2700000-0000-4000-8000-000000000002'::uuid, 'manager', null::uuid),
            ('a2700000-0000-4000-8000-000000000003'::uuid, 'coordinator', null::uuid),
            ('a2700000-0000-4000-8000-000000000004'::uuid, 'shipper', null::uuid) $$,
  'a legacy carrier sign-up is stored as manager, and coordinators sign up without a company'
);

select throws_ok(
  $$ select tests.new_user('a2700000-0000-4000-8000-000000000009', 'admin') $$,
  '22023', 'invalid sign-up role: admin',
  'nobody signs up as admin'
);

-- ---------------------------------------------------------------------------
-- Companies by role
-- ---------------------------------------------------------------------------
set local role authenticated;

select tests.login('a2700000-0000-4000-8000-000000000002');
select lives_ok(
  $$ select public.create_company('Fletes Gerente SA de CV', 'FGE010101AB1') $$,
  'a manager creates a company'
);

select tests.login('a2700000-0000-4000-8000-000000000004');
select lives_ok(
  $$ select public.create_company('Cliente Uno SA de CV', 'CUN010101AB1') $$,
  'a shipper creates a company'
);

select tests.login('a2700000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.create_company('Coordinación SA de CV', 'COO010101AB1') $$,
  '42501', 'role coordinator cannot create a company',
  'a coordinator cannot create a company'
);

reset role;

select results_eq(
  $$ select p.id, c.type::text from public.profiles p join public.companies c on c.id = p.company_id
     where p.id::text like 'a2700000-%' order by p.id $$,
  $$ values ('a2700000-0000-4000-8000-000000000002'::uuid, 'carrier'),
            ('a2700000-0000-4000-8000-000000000004'::uuid, 'shipper') $$,
  'a manager creates a carrier company and a shipper a shipper company'
);

select is(public.staff_role_for_company_type('carrier'), 'manager'::public.user_role, 'carrier staff are managers');
select is(public.staff_role_for_company_type('shipper'), 'shipper'::public.user_role, 'shipper staff are shippers');

-- ---------------------------------------------------------------------------
-- A coordinator of a carrier company has no fleet scope yet (G1a.2 gives it)
-- ---------------------------------------------------------------------------
update public.profiles
set company_id = (select company_id from public.profiles where id = 'a2700000-0000-4000-8000-000000000002')
where id = 'a2700000-0000-4000-8000-000000000003';

set local role authenticated;

select tests.login('a2700000-0000-4000-8000-000000000002');
select isnt(public.auth_fleet_company_id(), null, 'the manager has the fleet of their company');

select tests.login('a2700000-0000-4000-8000-000000000003');
select is(public.auth_fleet_company_id(), null, 'a coordinator has no fleet scope without business units');
select throws_ok(
  $$ select public.request_company_review() $$,
  '42501', 'only shipper or carrier members can request a review',
  'a coordinator cannot request the company review'
);
select throws_ok(
  $$ select public.submit_document(gen_random_uuid(), 'company', gen_random_uuid(), 'x') $$,
  '42501', 'owner does not belong to the caller company',
  'a coordinator cannot submit company documents'
);

reset role;

-- ---------------------------------------------------------------------------
-- Hygiene: function bodies are text, so the enum rename did not reach them
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select p.oid::regprocedure::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname <> 'handle_new_user' -- maps the legacy 'carrier' sign-up to manager
       and (
         p.prosrc ~* 'role[a-z_]*\s*(not\s+)?(=|<>|!=|in)\s*\(?\s*(''[a-z_]+''\s*,\s*)*''carrier'''
         or p.prosrc ~* 'notify_company\([^;]*''carrier'''
       ) $$,
  'no function compares a role with carrier nor notifies the carrier role'
);
select is_empty(
  $$ select p.oid::regprocedure::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosrc ~* '(::text::public\.(user_role|company_type))|(role::text\s*=)' $$,
  'no function casts between a company type and a role as text'
);

select * from finish();
rollback;
