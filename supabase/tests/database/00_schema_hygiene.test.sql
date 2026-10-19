-- Schema-wide security invariants. They apply to every table and function in
-- `public`, so they keep protecting the schema as later blocks add objects.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

-- Extensions required by the plan (B01).
select has_extension('postgis', 'postgis is installed');
select has_extension('pgcrypto', 'pgcrypto is installed');
select has_extension('pg_cron', 'pg_cron is installed');

-- Enums.
select enum_has_labels('public', 'company_type', array['shipper', 'carrier'], 'company_type labels');
select enum_has_labels(
  'public', 'user_role', array['shipper', 'manager', 'coordinator', 'operator', 'admin'], 'user_role labels'
);
select enum_has_labels(
  'public', 'verification_status',
  array['pending_review', 'approved', 'rejected', 'expired', 'suspended'],
  'verification_status labels'
);

-- Every table in public has RLS enabled.
select is_empty(
  $$
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
      -- PostGIS catalog table, owned by the extension.
      and c.relname <> 'spatial_ref_sys'
  $$,
  'every table in public has RLS enabled'
);

-- Every security definer function in public pins its search_path.
select is_empty(
  $$
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%'
      )
  $$,
  'every security definer function in public sets search_path'
);

-- No security definer function in public is executable by anon.
select is_empty(
  $$
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'execute')
  $$,
  'anon cannot execute any security definer function in public'
);

-- anon has no privileges on the identity tables.
select ok(
  not has_table_privilege('anon', 'public.companies', 'select,insert,update,delete'),
  'anon has no privileges on companies'
);
select ok(
  not has_table_privilege('anon', 'public.profiles', 'select,insert,update,delete'),
  'anon has no privileges on profiles'
);

-- The sign-up trigger is attached to auth.users.
select trigger_is(
  'auth', 'users', 'on_auth_user_created', 'public', 'handle_new_user',
  'on_auth_user_created calls public.handle_new_user'
);

select * from finish();
rollback;
