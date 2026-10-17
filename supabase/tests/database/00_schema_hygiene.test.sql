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

-- The only security definer functions in public that anon can execute are
-- reviewed ones that are public by design: invitation_preview (G1b) answers
-- only to a valid invitation token and returns no id (excluded below), and
-- the two public share-link views (G7, D23) take a 256-bit token, answer a
-- sanitized JSON and fail the same way for an unknown, expired or revoked
-- token (37_share_links). Anything else must stay closed to anon.
select set_eq(
  $$
    select p.proname::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('anon', p.oid, 'execute')
      and p.oid::regprocedure::text not in ('invitation_preview(text)')
  $$,
  array['public_shared_load', 'public_shared_trip'],
  'anon executes no security definer function in public besides the reviewed invitation preview and the two public share-link views'
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
