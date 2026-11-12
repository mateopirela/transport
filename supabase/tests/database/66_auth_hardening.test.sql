-- R5 · Access security (D46): is_admin() needs the second factor (aal2) on a
-- sample of admin RPCs and tables; the lock per account of the Password and
-- MFA Verification Attempt hooks (counts, locks, expires, resets with a
-- success); who may run the hooks and read their table.
begin;
create extension if not exists pgtap with schema extensions;

select plan(41);

create schema tests;

create function tests.new_user(p_id uuid, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id || '@r5.test', now(),
          jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
$$;

-- The JWT of p_id with the given assurance level (null: no `aal` claim).
create function tests.login(p_id uuid, p_aal text)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    (jsonb_build_object('sub', p_id, 'role', 'authenticated')
      || case when p_aal is null then '{}'::jsonb else jsonb_build_object('aal', p_aal) end)::text,
    true
  );
$$;

-- Users: ...01 admin, ...02 shipper (with a company), ...03 another admin.
select tests.new_user('a6600000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a6600000-0000-4000-8000-000000000002', 'shipper');
select tests.new_user('a6600000-0000-4000-8000-000000000003', 'shipper');
update public.profiles set role = 'admin'
where id in ('a6600000-0000-4000-8000-000000000001', 'a6600000-0000-4000-8000-000000000003');
insert into public.companies (id, type, legal_name, rfc, status)
values ('c6600000-0000-4000-8000-000000000001', 'shipper', 'Aceros R5', 'ARC150301KQ2', 'pending_review');
update public.profiles set company_id = 'c6600000-0000-4000-8000-000000000001'
where id = 'a6600000-0000-4000-8000-000000000002';
insert into public.audit_log (table_name, record_id, action, company_id)
values ('companies', 'c6600000-0000-4000-8000-000000000001', 'update', 'c6600000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- is_admin() and the admin's reach by assurance level
-- ---------------------------------------------------------------------------
set local role authenticated;

select tests.login('a6600000-0000-4000-8000-000000000001', 'aal1');
select is(public.is_admin(), false, 'an admin with only the password (aal1) is not an admin');
select is(
  (select count(*)::int from public.companies where id = 'c6600000-0000-4000-8000-000000000001'),
  0, 'aal1: the admin reads no company'
);
select is(
  (select count(*)::int from public.profiles where id::text like 'a6600000-%'),
  1, 'aal1: the admin reads only its own profile'
);
select is(
  (select count(*)::int from public.audit_log where record_id = 'c6600000-0000-4000-8000-000000000001'),
  0, 'aal1: the audit log is closed'
);
select throws_ok(
  $$ select * from public.admin_list_users(null, 50, 0) $$,
  '42501', null, 'aal1: admin_list_users is refused'
);
select throws_ok(
  $$ select public.review_company('c6600000-0000-4000-8000-000000000001', 'approve') $$,
  '42501', null, 'aal1: review_company is refused'
);
select throws_ok(
  $$ select public.admin_set_platform_setting('billing.pilot_mode', 'false'::jsonb) $$,
  '42501', null, 'aal1: admin_set_platform_setting is refused'
);
select throws_ok(
  $$ select * from public.admin_freight_ledger() $$,
  '42501', null, 'aal1: admin_freight_ledger is refused'
);

select tests.login('a6600000-0000-4000-8000-000000000001', null);
select is(public.is_admin(), false, 'an admin JWT without the aal claim is not an admin');
select throws_ok(
  $$ select * from public.admin_list_users(null, 50, 0) $$,
  '42501', null, 'no aal claim: admin_list_users is refused'
);

select tests.login('a6600000-0000-4000-8000-000000000001', 'AAL2');
select is(public.is_admin(), false, 'the level is compared exactly (no case folding)');

select tests.login('a6600000-0000-4000-8000-000000000002', 'aal2');
select is(public.is_admin(), false, 'aal2 does not make a shipper an admin');
select throws_ok(
  $$ select * from public.admin_list_users(null, 50, 0) $$,
  '42501', null, 'a shipper in aal2 cannot list users'
);

select tests.login('a6600000-0000-4000-8000-000000000001', 'aal2');
select is(public.is_admin(), true, 'an admin with the second factor (aal2) is an admin');
select is(
  (select count(*)::int from public.companies where id = 'c6600000-0000-4000-8000-000000000001'),
  1, 'aal2: the admin reads every company'
);
select is(
  (select count(*)::int from public.profiles where id::text like 'a6600000-%'),
  3, 'aal2: the admin reads every profile'
);
select is(
  (select count(*)::int from public.audit_log where record_id = 'c6600000-0000-4000-8000-000000000001'),
  1, 'aal2: the admin reads the audit log'
);
select lives_ok(
  $$ select * from public.admin_list_users(null, 50, 0) $$,
  'aal2: admin_list_users works'
);
select lives_ok(
  $$ select * from public.admin_freight_ledger() $$,
  'aal2: admin_freight_ledger works'
);

reset role;

-- ---------------------------------------------------------------------------
-- The lock (auth_attempt_decision, with a controlled clock)
-- ---------------------------------------------------------------------------
create function tests.attempt(p_kind text, p_user uuid, p_valid boolean, p_minutes integer)
returns text
language sql
as $$
  select public.auth_attempt_decision(
    p_kind, p_user, p_valid, '2026-11-12 12:00:00+00'::timestamptz + make_interval(mins => p_minutes)
  ) ->> 'decision'
$$;

-- Four failures in a row: Auth answers "invalid credentials" each time.
select results_eq(
  $$ select tests.attempt('password', 'a6600000-0000-4000-8000-000000000002', false, m) from generate_series(0, 3) m $$,
  array['continue', 'continue', 'continue', 'continue'],
  'four failed passwords go on to Auth (which says the password is wrong)'
);
select is(
  (select failed_count from public.auth_attempt_lockouts
   where user_id = 'a6600000-0000-4000-8000-000000000002' and kind = 'password'),
  4, 'the four failures are counted'
);
select is(
  public.auth_attempt_decision('password', 'a6600000-0000-4000-8000-000000000002', false,
                               '2026-11-12 12:04:00+00'),
  '{"decision": "reject", "message": "Too many failed attempts: account temporarily locked"}'::jsonb,
  'the fifth failure locks the account and says so'
);
select is(
  (select locked_until from public.auth_attempt_lockouts
   where user_id = 'a6600000-0000-4000-8000-000000000002' and kind = 'password'),
  '2026-11-12 12:19:00+00'::timestamptz, 'for 15 minutes'
);
select is(
  tests.attempt('password', 'a6600000-0000-4000-8000-000000000002', true, 10),
  'reject', 'while locked, even the right password is refused'
);
select is(
  tests.attempt('password', 'a6600000-0000-4000-8000-000000000002', false, 12),
  'reject', 'while locked, a wrong one too'
);
select is(
  (select locked_until from public.auth_attempt_lockouts
   where user_id = 'a6600000-0000-4000-8000-000000000002' and kind = 'password'),
  '2026-11-12 12:19:00+00'::timestamptz, 'attempts during the lock do not extend it'
);
select is(
  tests.attempt('password', 'a6600000-0000-4000-8000-000000000002', true, 20),
  'continue', 'the lock ends on its own: the right password goes through after 15 minutes'
);
select ok(
  (select failed_count = 0 and window_started_at is null and locked_until is null
   from public.auth_attempt_lockouts
   where user_id = 'a6600000-0000-4000-8000-000000000002' and kind = 'password'),
  'a success clears the counter and the lock'
);

-- A success before the fifth failure starts over.
select results_eq(
  $$ select tests.attempt('password', 'a6600000-0000-4000-8000-000000000003', v, m)
     from (values (30, false), (31, false), (32, false), (33, false), (34, true),
                  (35, false), (36, false), (37, false), (38, false)) as t(m, v) $$,
  array['continue', 'continue', 'continue', 'continue', 'continue',
        'continue', 'continue', 'continue', 'continue'],
  'a right password resets the count: 4 failures, a success and 4 more never lock'
);

-- Failures spread over more than the window do not add up.
select results_eq(
  $$ select tests.attempt('password', 'a6600000-0000-4000-8000-000000000001', false, m)
     from unnest(array[100, 101, 102, 103, 118, 119, 120, 121]) m $$,
  array['continue', 'continue', 'continue', 'continue', 'continue', 'continue', 'continue', 'continue'],
  'four failures, then four more 15 minutes later: a new window, no lock'
);
select is(
  tests.attempt('password', 'a6600000-0000-4000-8000-000000000001', false, 122),
  'reject', 'the fifth failure within the new window locks'
);

-- The second factor has its own counter.
select is(
  tests.attempt('mfa', 'a6600000-0000-4000-8000-000000000001', true, 123),
  'continue', 'a locked password does not lock the second factor (a separate counter)'
);
select is(
  (select array_agg(tests.attempt('mfa', 'a6600000-0000-4000-8000-000000000003', false, m) order by m)
   from generate_series(200, 204) m),
  array['continue', 'continue', 'continue', 'continue', 'reject'],
  'five wrong codes lock the second factor'
);
select throws_ok(
  $$ select public.auth_attempt_decision('sms', 'a6600000-0000-4000-8000-000000000003', false) $$,
  '22023', null, 'only the password and the second factor are counted'
);

-- The hooks wrap it in the shape Supabase Auth expects.
select is(
  public.hook_password_verification_attempt(
    jsonb_build_object('user_id', 'a6600000-0000-4000-8000-000000000002', 'valid', true)
  ),
  '{"decision": "continue", "should_logout_user": false}'::jsonb,
  'the password hook answers continue and never signs the user out'
);
select is(
  public.hook_mfa_verification_attempt(
    jsonb_build_object('factor_id', gen_random_uuid(), 'factor_type', 'totp',
                       'user_id', 'a6600000-0000-4000-8000-000000000002', 'valid', false)
  ) ->> 'decision',
  'continue', 'the MFA hook counts a wrong code and goes on'
);

-- ---------------------------------------------------------------------------
-- Who reaches the hooks and their table
-- ---------------------------------------------------------------------------
select ok(
  not has_table_privilege('authenticated', 'public.auth_attempt_lockouts', 'select, insert, update, delete')
  and not has_table_privilege('anon', 'public.auth_attempt_lockouts', 'select, insert, update, delete')
  and not has_table_privilege('service_role', 'public.auth_attempt_lockouts', 'select, insert, update, delete'),
  'no API role reads or writes the failed attempts'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.auth_attempt_lockouts'::regclass)
  and not exists (select 1 from pg_policy where polrelid = 'public.auth_attempt_lockouts'::regclass),
  'the table has RLS and no policy'
);
select ok(
  not has_function_privilege('authenticated', 'public.hook_password_verification_attempt(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.hook_password_verification_attempt(jsonb)', 'execute')
  and not has_function_privilege('service_role', 'public.hook_password_verification_attempt(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.hook_mfa_verification_attempt(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.hook_mfa_verification_attempt(jsonb)', 'execute')
  and not has_function_privilege('service_role', 'public.hook_mfa_verification_attempt(jsonb)', 'execute'),
  'no API role runs the hooks (nobody can lock an account through the API)'
);
select ok(
  has_function_privilege('supabase_auth_admin', 'public.hook_password_verification_attempt(jsonb)', 'execute')
  and has_function_privilege('supabase_auth_admin', 'public.hook_mfa_verification_attempt(jsonb)', 'execute'),
  'Supabase Auth runs the hooks'
);
select ok(
  not has_function_privilege('authenticated', 'public.auth_attempt_decision(text, uuid, boolean, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.auth_attempt_decision(text, uuid, boolean, timestamptz)', 'execute')
  and not has_function_privilege('service_role', 'public.auth_attempt_decision(text, uuid, boolean, timestamptz)', 'execute')
  and not has_function_privilege('supabase_auth_admin', 'public.auth_attempt_decision(text, uuid, boolean, timestamptz)', 'execute'),
  'the decision is internal: only the hooks run it'
);

set local role authenticated;
select tests.login('a6600000-0000-4000-8000-000000000002', 'aal2');
select throws_ok(
  $$ select public.hook_password_verification_attempt(
       jsonb_build_object('user_id', 'a6600000-0000-4000-8000-000000000003', 'valid', false)) $$,
  '42501', null, 'a signed-in user cannot call the hook to lock someone else'
);
reset role;

select * from finish();
rollback;
