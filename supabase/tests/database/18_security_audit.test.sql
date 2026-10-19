-- Security audit (B24): schema-wide invariants on privileges, policies,
-- Storage and security definer functions, plus the rate-limit RPCs. They read
-- the catalog, so they also cover the objects that later blocks add. The
-- row-level matrix (role x table x operation x other company) runs on the
-- demo seed: supabase/seed-tests/security_matrix.test.sql.
begin;
create extension if not exists pgtap with schema extensions;

select plan(38);

-- ---------------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f') and c.relname <> 'spatial_ref_sys'
       and has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger') $$,
  'anon has no table privilege on any relation in public'
);
select is_empty(
  $$ select distinct table_name from information_schema.column_privileges
     where table_schema = 'public' and grantee = 'anon' and table_name <> 'spatial_ref_sys' $$,
  'anon has no column privilege in public'
);
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f') and c.relname <> 'spatial_ref_sys'
       and has_table_privilege('authenticated', c.oid, 'insert, update, delete, truncate, references, trigger') $$,
  'authenticated has no table-wide write, delete or truncate privilege (writes are column grants or RPCs)'
);

-- Direct client writes are reviewed column grants on these tables only.
select set_eq(
  $$ select distinct table_name::text || ':' || privilege_type from information_schema.column_privileges
     where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE') $$,
  array[
    'carrier_routes:INSERT', 'carrier_routes:UPDATE', 'companies:UPDATE',
    'document_requirements:INSERT', 'document_requirements:UPDATE',
    -- G3 catalogs (D16, D22): admins only, by RLS.
    'license_unit_compatibility:INSERT', 'license_unit_compatibility:UPDATE',
    'trip_document_requirements:UPDATE',
    'operators:INSERT', 'operators:UPDATE', 'profiles:UPDATE', 'trip_evidence_requirements:UPDATE',
    'vehicles:INSERT', 'vehicles:UPDATE'
  ],
  'only the reviewed tables accept direct inserts or updates from clients'
);
select is_empty(
  $$ select g.table_name::text || ':' || g.privilege_type
     from (select distinct table_name, privilege_type from information_schema.column_privileges
           where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE')) g
     where not exists (
       select 1 from pg_policy p
       where p.polrelid = ('public.' || g.table_name)::regclass
         and p.polcmd = case g.privilege_type when 'INSERT' then 'a' else 'w' end
         and 'authenticated'::regrole = any (p.polroles)
         and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), pg_get_expr(p.polqual, p.polrelid)) is not null
     ) $$,
  'every client-writable table has a policy with a check for that command'
);

-- Deny by default: a new table or sequence in public starts closed.
create table public.b24_probe (id bigint generated always as identity primary key);
select ok(
  not has_table_privilege('anon', 'public.b24_probe', 'select, insert, update, delete, truncate')
  and not has_table_privilege('authenticated', 'public.b24_probe', 'select, insert, update, delete, truncate'),
  'a new table in public grants nothing to anon or authenticated'
);
select ok(
  not has_sequence_privilege('authenticated', pg_get_serial_sequence('public.b24_probe', 'id'), 'usage, select, update')
  and not has_sequence_privilege('anon', pg_get_serial_sequence('public.b24_probe', 'id'), 'usage, select, update'),
  'a new sequence in public grants nothing to anon or authenticated'
);
drop table public.b24_probe;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select p.polrelid::regclass::text || '.' || p.polname from pg_policy p
     join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
     where (n.nspname = 'public' or p.polrelid = 'storage.objects'::regclass)
       and (0::oid = any (p.polroles) or 'anon'::regrole = any (p.polroles)) $$,
  'no policy in public or on storage.objects applies to anon or PUBLIC'
);
select is_empty(
  $$ select p.polrelid::regclass::text || '.' || p.polname from pg_policy p
     join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
     where (n.nspname = 'public' or p.polrelid = 'storage.objects'::regclass)
       and (pg_get_expr(p.polqual, p.polrelid) = 'true' or pg_get_expr(p.polwithcheck, p.polrelid) = 'true') $$,
  'no policy uses a bare `true` condition'
);
select is_empty(
  $$ select p.polrelid::regclass::text || '.' || p.polname from pg_policy p
     join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and p.polcmd in ('d', '*') $$,
  'no client policy deletes rows (business entities are archived, logs are immutable)'
);
select is_empty(
  $$ select c.relname from pg_class c
     where c.oid in ('public.messages'::regclass, 'public.trip_events'::regclass, 'public.audit_log'::regclass,
                     'public.trip_locations'::regclass, 'public.trip_evidence'::regclass)
       and (exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polcmd <> 'r')
            or has_any_column_privilege('authenticated', c.oid, 'insert, update')) $$,
  'messages, trip events, locations, evidence and the audit log are read-only for clients'
);
select is_empty(
  $$ select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and not coalesce('security_invoker=true' = any (c.reloptions), false) $$,
  'every view in public runs with the caller''s privileges (security_invoker)'
);
select is_empty(
  $$ select p.tablename::text from pg_publication_tables p
     join pg_class c on c.relname = p.tablename join pg_namespace n on n.oid = c.relnamespace and n.nspname = p.schemaname
     where p.pubname = 'supabase_realtime' and not c.relrowsecurity $$,
  'every table published to Realtime has RLS'
);
select set_eq(
  $$ select schemaname || '.' || tablename from pg_publication_tables where pubname = 'supabase_realtime' $$,
  array['public.offers', 'public.messages', 'public.message_reads', 'public.notifications'],
  'only the reviewed tables are published to Realtime'
);

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select id from storage.buckets where public or file_size_limit is null or allowed_mime_types is null $$,
  'every bucket is private and limits file size and type'
);
select is_empty(
  $$ select p.polname from pg_policy p where p.polrelid = 'storage.objects'::regclass and p.polcmd not in ('r', 'a') $$,
  'no client can update or delete Storage objects (uploads are immutable)'
);
select is_empty(
  $$ select b.id || ':' || cmd from storage.buckets b cross join (values ('r'), ('a')) as x(cmd)
     where not exists (
       select 1 from pg_policy p
       where p.polrelid = 'storage.objects'::regclass and p.polcmd = x.cmd
         and coalesce(pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid))
             like '%bucket_id = ''' || b.id || '''::text%'
     ) $$,
  'every bucket has its own read and upload policies'
);
select is_empty(
  $$ select p.polname from pg_policy p
     where p.polrelid = 'storage.objects'::regclass
       and coalesce(pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid)) not like '%bucket_id = %' $$,
  'every Storage policy is scoped to one bucket'
);

-- ---------------------------------------------------------------------------
-- Security definer functions
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and has_function_privilege('public', p.oid, 'execute') $$,
  'no security definer function is executable by PUBLIC'
);
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     join pg_language l on l.oid = p.prolang
     where n.nspname = 'public' and p.prosecdef and l.lanname not in ('sql', 'plpgsql') $$,
  'security definer functions are written in SQL or PL/pgSQL'
);
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and p.proowner <> 'postgres'::regrole $$,
  'security definer functions are owned by postgres'
);

-- The reviewed lists below compare names, so an overload under an already
-- reviewed name would slip through them: there must be none. A new signature
-- needs its own name (or to replace the old one) and its own review.
select is_empty(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and (has_function_privilege('authenticated', p.oid, 'execute')
            or has_function_privilege('service_role', p.oid, 'execute'))
     group by p.proname having count(*) > 1 $$,
  'security definer RPCs have one signature per name, so the name lists cover every signature'
);

-- Every RPC that runs with elevated rights and that clients can call was
-- reviewed in B24 (docs/seguridad.md). A new one fails here until it is
-- reviewed and added: its explicit caller checks and its pgTAP matrix.
select set_eq(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute') $$,
  array[
    -- Context helpers (read only the caller's own row).
    'auth_role', 'auth_company_id', 'auth_shipper_company_id', 'auth_fleet_company_id', 'auth_operator_id',
    'is_admin', 'is_company_approved', 'has_location_consent', 'is_conversation_participant',
    -- Business units (G1a.2): the caller's scope, or whether they run a row.
    'auth_carrier_company_id', 'auth_is_manager', 'auth_business_unit_ids', 'can_operate_unit',
    'conversation_business_unit_id', 'coordinator_runs_document_owner',
    -- Identity and verification (B01, B03, B12, G2).
    'create_company', 'register_company', 'request_company_review', 'submit_document', 'review_document',
    'review_company', 'admin_list_users',
    -- Fleet (B04). The operator invitation codes were retired by G2.
    'set_vehicle_availability', 'clear_vehicle_availability',
    -- Invitations by link (G1b). invitation_preview is also granted to anon:
    -- it answers only to a valid token and returns no id.
    'create_invitation', 'revoke_invitation', 'invitation_preview', 'accept_coordinator_invitation',
    -- Loads and negotiation (B05, B14, B16, B19).
    'create_load', 'update_load', 'publish_load', 'cancel_load', 'make_offer', 'counter_offer',
    'reject_offer', 'withdraw_offer', 'accept_offer', 'admin_create_offer', 'admin_accept_offer',
    'load_negotiation_carriers', 'load_offer_vehicles', 'match_candidates',
    -- Trips (B06, B15, B21-B23).
    'assign_trip', 'record_trip_event', 'set_estimated_unload_end', 'record_trip_locations',
    'add_trip_evidence', 'confirm_delivery', 'cancel_trip', 'report_incident', 'resolve_incident',
    'trip_point_locations', 'add_trip_document', 'shipper_trip_parties',
    'record_location_consent', 'revoke_location_consent',
    -- Chat and notifications (B07).
    'send_message', 'mark_conversation_read', 'register_push_token', 'unregister_push_token',
    'mark_notifications_read',
    -- Product analytics (B25): records the caller's own event.
    'track_product_event',
    -- Share links (G7, D23). The two public_* views are also granted to anon
    -- (checked below); the rest need a session.
    'create_share_link', 'revoke_share_link', 'open_internal_share', 'public_shared_load', 'public_shared_trip',
    -- Rate limits (B24).
    'consume_rate_limit'
  ],
  'every client-callable security definer function is on the reviewed list'
);
-- anon reaches exactly the two sanitized share-link views (G7) and the
-- invitation preview (G1b): a token of 256 bits is the only credential of
-- each, 37_share_links checks what the views return and 29_invitations what
-- the preview returns.
select set_eq(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute') $$,
  array['invitation_preview', 'public_shared_load', 'public_shared_trip'],
  'anon executes only the invitation preview and the two public share-link views'
);
select set_eq(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and has_function_privilege('service_role', p.oid, 'execute')
       and not has_function_privilege('authenticated', p.oid, 'execute') $$,
  array[
    -- Triggers (service-role writes fire them).
    'handle_new_user', 'audit_admin_action',
    'fleet_block_archive_with_trips', 'open_conversation', 'notify_offer', 'notify_trip_event',
    'notify_document_review', 'notify_load_match', 'vehicles_end_availability',
    'companies_create_default_business_unit', 'default_business_unit',
    'operators_revoke_invitations_on_unit_change',
    -- Edge Functions.
    'claim_notifications', 'record_notification_dispatch', 'delete_push_tokens', 'consume_service_rate_limit',
    -- The redeem-invitation Edge Function (G1b, G2): they all check the JWT role claim.
    'redeem_operator_invitation_service', 'revoke_user_sessions_service',
    'issue_operator_provisioning_ticket_service', 'discard_unredeemed_operator_service',
    'discard_orphan_operator_service'
  ],
  'service-role-only security definer functions are the reviewed triggers and Edge Function RPCs'
);

-- ---------------------------------------------------------------------------
-- Rate limits: rate_limit_counters (no client access) and the RPCs
-- ---------------------------------------------------------------------------
select ok(
  not has_table_privilege('authenticated', 'public.rate_limit_counters', 'select, insert, update, delete')
  and not has_table_privilege('service_role', 'public.rate_limit_counters', 'select, insert, update, delete')
  and not exists (select 1 from pg_policy where polrelid = 'public.rate_limit_counters'::regclass),
  'rate_limit_counters is reachable only through the rate-limit RPCs'
);
select ok(
  not has_function_privilege('anon', 'public.consume_rate_limit(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.consume_service_rate_limit(text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.rate_limit_hit(text, text, integer, integer, timestamptz)', 'execute'),
  'users consume only their own limits; service limits are for the service role'
);

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('a2400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ana@a.test', now(),
        null, '{"role":"manager","phone":"+525500000000"}', now(), now()),
       ('a2400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'beto@b.test', now(),
        null, '{"role":"manager","phone":"+525500000000"}', now(), now());

-- The window logic, with a controlled clock (as the owner).
select is(
  array[
    public.rate_limit_hit('b24-test', 's', 2, 60, '2026-01-01 00:00:10+00'),
    public.rate_limit_hit('b24-test', 's', 2, 60, '2026-01-01 00:00:20+00'),
    public.rate_limit_hit('b24-test', 's', 2, 60, '2026-01-01 00:00:30+00')
  ],
  array[0, 0, 30],
  'a window allows max_hits and then answers the seconds until it resets'
);
select is(
  public.rate_limit_hit('b24-test', 's', 2, 60, '2026-01-01 00:01:05+00'),
  0,
  'a new window starts a new count'
);
-- A late call computed in the previous minute counts in the stored (newer)
-- window instead of resetting it.
select is(
  array[
    public.rate_limit_hit('b24-test', 's', 2, 60, '2026-01-01 00:00:59+00'),
    public.rate_limit_hit('b24-test', 's', 2, 60, '2026-01-01 00:01:06+00')
  ],
  array[0, 54],
  'an older window never resets a newer one'
);
select is(
  (select window_start from public.rate_limit_counters where bucket = 'b24-test' and subject = 's'),
  '2026-01-01 00:01:00+00'::timestamptz,
  'the stored window never moves backward'
);

-- The RPCs below use the real clock: start their checks far from a minute
-- boundary so every call lands in the same window.
do $$
begin
  if extract(second from clock_timestamp()) >= 45 then
    perform pg_sleep(61 - extract(second from clock_timestamp())::float8);
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "a2400000-0000-4000-8000-000000000001", "role": "authenticated"}', true);

select is(
  (select count(*) filter (where r = 0) from (select public.consume_rate_limit('recommendations') r
                                             from generate_series(1, 30)) s),
  30::bigint,
  'the first 30 calls in a minute are allowed'
);
select ok(
  public.consume_rate_limit('recommendations') between 1 and 60,
  'the 31st call is refused with the seconds until the window resets'
);

select set_config('request.jwt.claims', '{"sub": "a2400000-0000-4000-8000-000000000002", "role": "authenticated"}', true);
select is(public.consume_rate_limit('recommendations'), 0, 'each user has their own counter');
select throws_ok(
  $$ select public.consume_rate_limit('dispatch-notifications') $$,
  '22023', null, 'a user cannot consume a service bucket or an unknown one'
);

reset role;
set local role service_role;
-- The function also checks the JWT role claim, not only the grant: here the
-- claims are still the user's.
select throws_ok(
  $$ select public.consume_service_rate_limit('dispatch-notifications', 'global') $$,
  '42501', null, 'a service bucket requires the service role claim'
);
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select results_eq(
  $$ select public.consume_service_rate_limit('dispatch-notifications', 'global') > 0
     from generate_series(1, 11) g order by g $$,
  $$ select g > 10 from generate_series(1, 11) g order by g $$,
  'dispatch runs are limited to 10 per minute'
);
select throws_ok(
  $$ select public.consume_service_rate_limit('recommendations', 'global') $$,
  '22023', null, 'the service role cannot consume a user bucket'
);

select * from finish();
rollback;
