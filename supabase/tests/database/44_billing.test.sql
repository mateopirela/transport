-- H3 · Subscription (D24-E1, D30):
--   * the matrix of platform_settings, subscription_plans,
--     company_subscriptions and billing_events (reads; no client writes);
--   * a subscription row for each new carrier company;
--   * company_billing_state in the pilot, after it with each status, and with
--     pilot_ends_at;
--   * the admin RPCs (only admins, validated per key, audited);
--   * the service RPCs: only the service role, the Gerente's context, the
--     customer linked once, and billing_apply_event_service idempotent and
--     ordered;
--   * assert_billing_allows: nothing with the pilot or off/notice; with
--     block it refuses make_offer and set_vehicle_availability without an
--     active subscription, and no other RPC calls it.
begin;
create extension if not exists pgtap with schema extensions;

select plan(82);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated, service_role;

create function tests.new_user(p_id uuid, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@h3.test', now(), null,
          jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create function tests.payload(p_days integer)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'origin', jsonb_build_object('address', 'Av. Constitución 100', 'city', 'Monterrey', 'state', 'Nuevo León',
                                 'lat', 25.6866, 'lng', -100.3161),
    'destination', jsonb_build_object('address', 'Av. Vallarta 200', 'city', 'Guadalajara', 'state', 'Jalisco',
                                      'lat', 20.6597, 'lng', -103.3496),
    'pickupWindow', jsonb_build_object('start', now() + make_interval(days => p_days),
                                       'end', now() + make_interval(days => p_days, hours => 4)),
    'deliveryWindow', jsonb_build_object('start', now() + make_interval(days => p_days + 1),
                                         'end', now() + make_interval(days => p_days + 1, hours => 6)),
    'cargoType', 'palletized',
    'description', 'Tarimas',
    'weightKg', 18000,
    'unitType', 'dry_van',
    'specialRequirements', jsonb_build_array(),
    'proposedPriceCents', 3500000
  );
$$;

create table tests.vals (name text primary key, id uuid);
grant select, insert on tests.vals to authenticated, service_role;

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

-- How many rows of p_sql p_uid sees.
create function tests.sees(p_uid uuid, p_sql text)
returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  perform tests.login(p_uid);
  execute 'set local role authenticated';
  execute format('select count(*) from (%s) x', p_sql) into v_count;
  execute 'reset role';
  return v_count;
end;
$$;

-- One column of company_billing_state, as p_uid.
create function tests.state(p_uid uuid, p_column text, p_company uuid default null)
returns text
language plpgsql
as $$
declare
  v text;
begin
  perform tests.login(p_uid);
  execute 'set local role authenticated';
  execute format('select (%I)::text from public.company_billing_state($1)', p_column) into v using p_company;
  execute 'reset role';
  return v;
end;
$$;

-- An admin setting, as the admin.
create function tests.setting(p_key text, p_value jsonb)
returns void
language plpgsql
as $$
begin
  perform tests.login('a4400000-0000-4000-8000-000000000006');
  execute 'set local role authenticated';
  perform public.admin_set_platform_setting(p_key, p_value);
  execute 'reset role';
end;
$$;

-- A Stripe event whose subscription was read at p_fetched, as the service role.
create function tests.apply(p_event text, p_fetched timestamptz, p_customer text, p_subscription text, p_status text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  execute 'set local role service_role';
  v := public.billing_apply_event_service(p_event, 'customer.subscription.updated', p_fetched, p_customer,
                                          p_subscription, p_status, 'price_h3fleet', now() + interval '30 days', false);
  execute 'reset role';
  return v;
end;
$$;

grant execute on all functions in schema tests to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fixtures. Users a44…: 01 S shipper, 02 M manager of F, 03 C coordinator of
-- F, 04 H hombre camión (manager of H), 05 X manager of X, 06 admin.
-- ---------------------------------------------------------------------------
select tests.new_user('a4400000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a4400000-0000-4000-8000-000000000002', 'manager');
select tests.new_user('a4400000-0000-4000-8000-000000000003', 'coordinator');
select tests.new_user('a4400000-0000-4000-8000-000000000004', 'manager');
select tests.new_user('a4400000-0000-4000-8000-000000000005', 'manager');
select tests.new_user('a4400000-0000-4000-8000-000000000006', 'shipper');
update public.profiles set role = 'admin' where id = 'a4400000-0000-4000-8000-000000000006';

insert into public.companies (id, type, legal_name, rfc, status, is_owner_operator) values
  ('c4400000-0000-4000-8000-000000000001', 'shipper', 'Envíos Uno SA de CV', 'EUN050505GH5', 'approved', false),
  ('c4400000-0000-4000-8000-000000000002', 'carrier', 'Fletes Dos SA de CV', 'FDO040404CD4', 'approved', false),
  ('c4400000-0000-4000-8000-000000000004', 'carrier', 'Hugo Camión', 'HUCA800101AB1', 'approved', true),
  ('c4400000-0000-4000-8000-000000000005', 'carrier', 'Fletes Cinco SA de CV', 'FCI040404CD4', 'approved', false);
update public.profiles set company_id = 'c4400000-0000-4000-8000-000000000001'
where id = 'a4400000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'c4400000-0000-4000-8000-000000000002'
where id in ('a4400000-0000-4000-8000-000000000002', 'a4400000-0000-4000-8000-000000000003');
update public.profiles set company_id = 'c4400000-0000-4000-8000-000000000004'
where id = 'a4400000-0000-4000-8000-000000000004';
update public.profiles set company_id = 'c4400000-0000-4000-8000-000000000005'
where id = 'a4400000-0000-4000-8000-000000000005';

insert into tests.vals select 'bu_f', id from public.business_units where company_id = 'c4400000-0000-4000-8000-000000000002';
insert into tests.vals select 'bu_x', id from public.business_units where company_id = 'c4400000-0000-4000-8000-000000000005';
insert into public.business_unit_coordinators (business_unit_id, company_id, profile_id)
values (tests.val('bu_f'), 'c4400000-0000-4000-8000-000000000002', 'a4400000-0000-4000-8000-000000000003');

-- A unit for F and one for X, with their documents approved.
insert into public.vehicles (id, company_id, business_unit_id, kind, plate, unit_type, capacity_kg) values
  ('e4400000-0000-4000-8000-000000000002', 'c4400000-0000-4000-8000-000000000002', tests.val('bu_f'),
   'rigid', 'HHF4401', 'dry_van', 30000),
  ('e4400000-0000-4000-8000-000000000005', 'c4400000-0000-4000-8000-000000000005', tests.val('bu_x'),
   'rigid', 'HHX4401', 'dry_van', 30000);
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.id in ('e4400000-0000-4000-8000-000000000002', 'e4400000-0000-4000-8000-000000000005')
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- Published loads to offer on.
set local role authenticated;
select tests.login('a4400000-0000-4000-8000-000000000001');
insert into tests.vals select 'load' || n, public.create_load(tests.payload(n)) from generate_series(1, 5) n;
select public.publish_load(tests.val('load' || n)) from generate_series(1, 5) n;
reset role;

-- An inactive plan only admins see.
insert into public.subscription_plans (code, name, audience, active) values ('h3_retired', 'Retirado', 'fleet', false);

-- ---------------------------------------------------------------------------
-- Rows, privileges and the matrix
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.company_subscriptions
   where company_id in ('c4400000-0000-4000-8000-000000000002', 'c4400000-0000-4000-8000-000000000004',
                        'c4400000-0000-4000-8000-000000000005')
     and status = 'none' and stripe_customer_id is null),
  3::bigint,
  'every new carrier company gets its subscription row, with no subscription'
);
select is(
  (select count(*) from public.company_subscriptions where company_id = 'c4400000-0000-4000-8000-000000000001'),
  0::bigint,
  'a shipper company gets none'
);
select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
   where c.oid in ('public.platform_settings'::regclass, 'public.subscription_plans'::regclass,
                   'public.company_subscriptions'::regclass, 'public.billing_events'::regclass)),
  'the four tables have RLS'
);
select ok(
  not has_any_column_privilege('authenticated', 'public.platform_settings', 'insert, update')
  and not has_any_column_privilege('authenticated', 'public.subscription_plans', 'insert, update')
  and not has_any_column_privilege('authenticated', 'public.company_subscriptions', 'insert, update')
  and not has_any_column_privilege('authenticated', 'public.billing_events', 'insert, update')
  and not has_table_privilege('authenticated', 'public.company_subscriptions', 'delete'),
  'clients write none of them directly'
);
select ok(
  not has_column_privilege('authenticated', 'public.company_subscriptions', 'checkout_url', 'select')
  and not has_column_privilege('authenticated', 'public.company_subscriptions', 'checkout_session_id', 'select')
  and not has_column_privilege('authenticated', 'public.company_subscriptions', 'checkout_lease_id', 'select')
  and has_column_privilege('authenticated', 'public.company_subscriptions', 'status', 'select'),
  'the staff read the subscription but never the outstanding Checkout session'
);
select ok(
  not has_function_privilege('authenticated', 'public.assert_billing_allows(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.billing_settings()', 'execute')
  and not has_function_privilege('anon', 'public.company_billing_state(uuid)', 'execute')
  and not has_function_privilege('authenticated',
        'public.billing_apply_event_service(text, text, timestamptz, text, text, text, text, timestamptz, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.billing_session_context_service(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.billing_link_customer_service(uuid, text)', 'execute'),
  'the helpers and the service RPCs are not callable by clients'
);

select is(tests.sees('a4400000-0000-4000-8000-000000000001', 'select 1 from public.platform_settings where key like ''billing.%'''),
  3::bigint, 'any signed-in user reads the billing settings');
select is(tests.sees('a4400000-0000-4000-8000-000000000001', 'select 1 from public.subscription_plans where code = ''h3_retired'''),
  0::bigint, 'an inactive plan is hidden from users');
select is(tests.sees('a4400000-0000-4000-8000-000000000006', 'select 1 from public.subscription_plans where code = ''h3_retired'''),
  1::bigint, 'admins see inactive plans');
select is(tests.sees('a4400000-0000-4000-8000-000000000002', 'select company_id from public.company_subscriptions'),
  1::bigint, 'the Gerente sees the subscription of their company only');
select is(tests.sees('a4400000-0000-4000-8000-000000000003',
  'select 1 from public.company_subscriptions where company_id = ''c4400000-0000-4000-8000-000000000002'''),
  1::bigint, 'the Coordinador sees it too');
select is(tests.sees('a4400000-0000-4000-8000-000000000005',
  'select 1 from public.company_subscriptions where company_id = ''c4400000-0000-4000-8000-000000000002'''),
  0::bigint, 'another carrier does not');
select is(tests.sees('a4400000-0000-4000-8000-000000000001', 'select 1 from public.company_subscriptions'),
  0::bigint, 'a shipper sees none');
select ok(tests.sees('a4400000-0000-4000-8000-000000000006', 'select 1 from public.company_subscriptions') >= 3,
  'admins see every company');

set local role authenticated;
select tests.login('a4400000-0000-4000-8000-000000000002');
select throws_ok(
  $$ update public.company_subscriptions set status = 'active' where company_id = 'c4400000-0000-4000-8000-000000000002' $$,
  '42501', null, 'the Gerente cannot mark their company active');
select throws_ok(
  $$ update public.platform_settings set value = 'false' where key = 'billing.pilot_mode' $$,
  '42501', null, 'nor end the pilot directly');
reset role;

-- ---------------------------------------------------------------------------
-- company_billing_state during the pilot (the default)
-- ---------------------------------------------------------------------------
select is(tests.state('a4400000-0000-4000-8000-000000000002', 'effective_status'), 'pilot_free',
  'during the pilot the company is "Piloto gratis"');
select is(tests.state('a4400000-0000-4000-8000-000000000002', 'notice'), 'pilot', 'with the pilot notice');
select is(tests.state('a4400000-0000-4000-8000-000000000002', 'plan_code'), 'fleet_monthly',
  'a company with staff gets the fleet plan');
select is(tests.state('a4400000-0000-4000-8000-000000000004', 'plan_code'), 'owner_operator_monthly',
  'a hombre camión gets the owner-operator plan');
select is(tests.state('a4400000-0000-4000-8000-000000000002', 'plan_amount_cents'), null,
  'the plans have no price yet ("Por definir")');
select is(tests.state('a4400000-0000-4000-8000-000000000002', 'checkout_available'), 'false',
  'no Checkout during the pilot');
select is(tests.state('a4400000-0000-4000-8000-000000000003', 'effective_status'), 'pilot_free',
  'the Coordinador reads the state too');
select is(tests.state('a4400000-0000-4000-8000-000000000006', 'effective_status', 'c4400000-0000-4000-8000-000000000002'),
  'pilot_free', 'admins read any company');

set local role authenticated;
select tests.login('a4400000-0000-4000-8000-000000000001');
select throws_ok($$ select * from public.company_billing_state() $$, '42501', 'company not found',
  'a shipper has no billing state');
select tests.login('a4400000-0000-4000-8000-000000000005');
select throws_ok($$ select * from public.company_billing_state('c4400000-0000-4000-8000-000000000002') $$,
  '42501', 'company not found', 'a carrier cannot read another company''s state');
reset role;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a4400000-0000-4000-8000-000000000002');
select throws_ok($$ select public.admin_set_platform_setting('billing.pilot_mode', 'false') $$,
  '42501', 'only admins can change platform settings', 'the Gerente cannot end the pilot');
select throws_ok(
  $$ select public.admin_update_subscription_plan((select id from public.subscription_plans where code = 'fleet_monthly'),
       'Gratis', null, 1, null, true) $$,
  '42501', 'only admins can edit plans', 'nor edit a plan');
select tests.login('a4400000-0000-4000-8000-000000000006');
select throws_ok($$ select public.admin_set_platform_setting('billing.pilot_mode', '"no"') $$,
  '22023', 'invalid value for billing.pilot_mode', 'the pilot flag is a boolean');
select throws_ok($$ select public.admin_set_platform_setting('billing.enforcement', '"hard"') $$,
  '22023', 'invalid value for billing.enforcement', 'enforcement is off, notice or block');
select throws_ok($$ select public.admin_set_platform_setting('billing.pilot_ends_at', '"mañana"') $$,
  '22023', 'invalid value for billing.pilot_ends_at', 'the end of the pilot is a date');
select throws_ok($$ select public.admin_set_platform_setting('billing.secret', '"x"') $$,
  '22023', 'unknown setting', 'only known settings');
select throws_ok(
  $$ select public.admin_update_subscription_plan((select id from public.subscription_plans where code = 'fleet_monthly'),
       'Empresa', null, 0, null, true) $$,
  '23514', null, 'a price is positive');
select throws_ok(
  $$ select public.admin_update_subscription_plan((select id from public.subscription_plans where code = 'fleet_monthly'),
       'Empresa', null, 99900, 'prod_123', true) $$,
  '23514', null, 'a Stripe price id starts with price_');
reset role;

select tests.setting('billing.pilot_ends_at', to_jsonb(now() + interval '7 days'));
select is(tests.state('a4400000-0000-4000-8000-000000000002', 'notice'), 'pilot_ending',
  'with the end 14 days away or less, the notice is pilot_ending');
select is(tests.state('a4400000-0000-4000-8000-000000000002', 'effective_status'), 'pilot_free',
  'and the company is still "Piloto gratis"');
select is(
  (select count(*) from public.audit_log
   where table_name = 'platform_settings' and actor_id = 'a4400000-0000-4000-8000-000000000006'
     and new_data ->> 'key' = 'billing.pilot_ends_at'),
  1::bigint,
  'the change is in the audit log with the admin'
);
select tests.setting('billing.pilot_ends_at', null);
select is((select value from public.platform_settings where key = 'billing.pilot_ends_at'), 'null'::jsonb,
  'a SQL null (what the API sends for a JSON null) clears the date');
select tests.setting('billing.pilot_ends_at', to_jsonb(now() + interval '30 days'));
select is(tests.state('a4400000-0000-4000-8000-000000000002', 'notice'), 'pilot', 'further away it is pilot again');

-- ---------------------------------------------------------------------------
-- The block, off during the pilot and with off/notice
-- ---------------------------------------------------------------------------
select tests.setting('billing.enforcement', '"block"');
set local role authenticated;
select tests.login('a4400000-0000-4000-8000-000000000005');
select lives_ok($$ select public.make_offer(tests.val('load1'), 3000000) $$,
  'block during the pilot blocks nothing');
reset role;

select tests.setting('billing.pilot_mode', 'false');
select tests.setting('billing.enforcement', '"off"');
select is(tests.state('a4400000-0000-4000-8000-000000000005', 'effective_status'), 'none',
  'after the pilot the company has its own status');
select is(tests.state('a4400000-0000-4000-8000-000000000005', 'notice'), 'none', 'with enforcement off, no notice');
set local role authenticated;
select tests.login('a4400000-0000-4000-8000-000000000005');
select lives_ok($$ select public.make_offer(tests.val('load2'), 3000000) $$, 'off blocks nothing');
reset role;

select tests.setting('billing.enforcement', '"notice"');
select is(tests.state('a4400000-0000-4000-8000-000000000005', 'notice'), 'inactive', 'notice shows the inactive notice');
set local role authenticated;
select tests.login('a4400000-0000-4000-8000-000000000005');
select lives_ok($$ select public.make_offer(tests.val('load3'), 3000000) $$, 'and blocks nothing');
reset role;

select tests.setting('billing.enforcement', '"block"');
set local role authenticated;
select tests.login('a4400000-0000-4000-8000-000000000005');
select throws_ok($$ select public.make_offer(tests.val('load4'), 3000000) $$,
  'P0001', 'subscription required', 'block refuses a new offer without an active subscription');
select throws_ok(
  $$ select public.set_vehicle_availability('e4400000-0000-4000-8000-000000000005', now() + interval '1 hour',
       25.69, -100.32, 'Monterrey', 'Nuevo León') $$,
  'P0001', 'subscription required', 'and new availability');
reset role;

select set_eq(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname <> 'assert_billing_allows'
       and p.prosrc like '%assert_billing_allows%' $$,
  array['make_offer', 'set_vehicle_availability'],
  'only make_offer and set_vehicle_availability call the block: never record_trip_event, send_message, cancel_trip, '
  || 'locations, evidence or documents'
);

-- ---------------------------------------------------------------------------
-- Service RPCs: the Checkout / Portal context
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a4400000-0000-4000-8000-000000000006');
select public.admin_update_subscription_plan(
  (select id from public.subscription_plans where code = 'fleet_monthly'),
  'Empresa transportista', 'Para empresas', 99900, 'price_h3fleet', true);
reset role;
select is(tests.state('a4400000-0000-4000-8000-000000000002', 'checkout_available'), 'true',
  'after the pilot, with a price and a Stripe price, the Gerente can subscribe');
select is(tests.state('a4400000-0000-4000-8000-000000000003', 'checkout_available'), 'false',
  'the Coordinador cannot');
select is(tests.state('a4400000-0000-4000-8000-000000000002', 'billing_configured'), 'true',
  'billing is configured once a plan has a Stripe price');

set local role service_role;
select throws_ok($$ select * from public.billing_session_context_service('a4400000-0000-4000-8000-000000000002', 'fleet_monthly') $$,
  '42501', 'service role required', 'the database role alone is not enough: the JWT must be the service role''s');
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select is(
  (select stripe_price_id from public.billing_session_context_service('a4400000-0000-4000-8000-000000000002', 'fleet_monthly')),
  'price_h3fleet', 'the Gerente gets the Stripe price of the plan');
select throws_ok($$ select * from public.billing_session_context_service('a4400000-0000-4000-8000-000000000003', null) $$,
  '42501', 'only the manager can manage the subscription', 'the Coordinador opens neither Checkout nor the Portal');
select throws_ok($$ select * from public.billing_session_context_service('a4400000-0000-4000-8000-000000000004', 'fleet_monthly') $$,
  '22023', 'plan not available', 'a hombre camión cannot contract the fleet plan');
select is(public.billing_link_customer_service('c4400000-0000-4000-8000-000000000002', 'cus_h3first'), 'cus_h3first',
  'the first customer is linked');
select is(public.billing_link_customer_service('c4400000-0000-4000-8000-000000000002', 'cus_h3second'), 'cus_h3first',
  'a second one gets the customer already linked');

-- One Checkout session per company at a time.
insert into tests.vals
select 'lease', lease_id from public.billing_begin_checkout_service('c4400000-0000-4000-8000-000000000002', 'price_h3fleet')
where action = 'create';
select ok(tests.val('lease') is not null, 'the first request takes the lease to create the session');
select is(
  (select action from public.billing_begin_checkout_service('c4400000-0000-4000-8000-000000000002', 'price_h3fleet')),
  'busy', 'a concurrent request does not create a second session');
select is(
  public.billing_save_checkout_service('c4400000-0000-4000-8000-000000000002', gen_random_uuid(), 'price_h3fleet',
    'cs_test_other', 'https://checkout.stripe.com/c/pay/cs_test_other', now() + interval '30 minutes'),
  false, 'only the holder of the lease saves the session');
select is(
  public.billing_save_checkout_service('c4400000-0000-4000-8000-000000000002', tests.val('lease'), 'price_h3fleet',
    'cs_test_one', 'https://checkout.stripe.com/c/pay/cs_test_one', now() + interval '30 minutes'),
  true, 'the holder saves it');
select is(
  (select action || ' ' || url from public.billing_begin_checkout_service('c4400000-0000-4000-8000-000000000002', 'price_h3fleet')),
  'reuse https://checkout.stripe.com/c/pay/cs_test_one', 'the next request reuses the open session');
select is(
  (select action from public.billing_begin_checkout_service('c4400000-0000-4000-8000-000000000002', 'price_h3fleet',
     'cs_test_one')),
  'create', 'a session Stripe no longer has open (paid or expired) is dropped and a new one is created');
select is(
  public.billing_save_checkout_service('c4400000-0000-4000-8000-000000000002',
    (select checkout_lease_id from public.company_subscriptions where company_id = 'c4400000-0000-4000-8000-000000000002'),
    'price_h3fleet', 'cs_test_two', 'https://checkout.stripe.com/c/pay/cs_test_two', now() + interval '30 minutes'),
  true, 'the new session is saved');
select is(
  (select session_id from public.billing_begin_checkout_service('c4400000-0000-4000-8000-000000000002', 'price_h3other')
   where action = 'create'),
  'cs_test_two', 'replacing a session (another price) names it, so the Edge Function expires it first');
reset role;

-- ---------------------------------------------------------------------------
-- Service RPCs: Stripe events
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('a4400000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select public.billing_apply_event_service('evt_h3x', 'customer.subscription.updated', now(), 'cus_h3first',
       'sub_h3one', 'active', 'price_h3fleet', now(), false) $$,
  '42501', null, 'a user cannot apply Stripe events');
reset role;

select is(tests.apply('evt_h3one', now() - interval '1 hour', 'cus_h3first', 'sub_h3one', 'active'), 'applied',
  'an event of the linked customer is applied');
select is(tests.state('a4400000-0000-4000-8000-000000000002', 'effective_status'), 'active',
  'the company is active');
select is((select checkout_url from public.company_subscriptions where company_id = 'c4400000-0000-4000-8000-000000000002'),
  null, 'a subscription in force closes the outstanding Checkout session');
select is(tests.apply('evt_h3one', now() - interval '1 hour', 'cus_h3first', 'sub_h3one', 'canceled'), 'duplicate',
  'the same event again changes nothing');
select is(tests.apply('evt_h3old', now() - interval '2 hours', 'cus_h3first', 'sub_h3one', 'past_due'), 'stale',
  'a snapshot read earlier does not overwrite one read later');
select is(tests.state('a4400000-0000-4000-8000-000000000002', 'stored_status'), 'active', 'the company stays active');
select is(tests.apply('evt_h3nobody', now(), 'cus_h3nobody', 'sub_h3nobody', 'active'), 'unknown_customer',
  'a customer that is not linked changes nothing');
select is(
  (select count(*) from public.billing_events where stripe_event_id like 'evt_h3%' and processed_at is not null),
  3::bigint, 'each event is recorded once');

select tests.setting('billing.enforcement', '"block"');
set local role authenticated;
select tests.login('a4400000-0000-4000-8000-000000000002');
select lives_ok($$ select public.make_offer(tests.val('load5'), 3000000) $$,
  'with an active subscription, block lets the company offer');
select lives_ok(
  $$ select public.set_vehicle_availability('e4400000-0000-4000-8000-000000000002', now() + interval '1 hour',
       25.69, -100.32, 'Monterrey', 'Nuevo León') $$,
  'and publish availability');
reset role;

select is(tests.apply('evt_h3late', now() + interval '1 minute', 'cus_h3first', 'sub_h3one', 'past_due'), 'applied',
  'a snapshot read later applies the past due state');
select is(tests.state('a4400000-0000-4000-8000-000000000002', 'notice'), 'inactive',
  'and the company sees the inactive notice');

-- Two webhooks that race: the snapshot read first never wins.
select is(tests.apply('evt_h3same', now() + interval '1 minute', 'cus_h3first', 'sub_h3one', 'active'), 'stale',
  'a snapshot read at the same time as the stored one is not applied');
select is(tests.apply('evt_h3cancel', now() + interval '2 minutes', 'cus_h3first', 'sub_h3one', 'canceled'), 'applied',
  'the cancellation is applied');
select is(tests.apply('evt_h3revive', now() + interval '3 minutes', 'cus_h3first', 'sub_h3one', 'active'), 'stale',
  'a canceled subscription never comes back as active (Stripe cannot reactivate it)');
select is(tests.state('a4400000-0000-4000-8000-000000000002', 'stored_status'), 'canceled',
  'the company stays canceled');

select * from finish();
rollback;
