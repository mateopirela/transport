-- I6 · Correction (verification, round 2): load windows within a plausible
-- range (20261110160000_load_windows_range).
--   * create_load, update_load (a draft too) and request_brokered_load refuse
--     a window that starts before yesterday or ends more than a year from
--     now, among them 9999-12-31 after 18:00 in Mexico City (year 10000 in
--     UTC, which no client can read);
--   * a window within the range is still taken, at both edges;
--   * the table refuses any other writer a window outside 2022–2099, but the
--     check is NOT VALID: rows stored before it are not checked.
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

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
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@i6r.test', now(), null,
          jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
$$;

-- A valid load payload with the given windows (start and end of each).
create function tests.payload(
  p_pickup_start timestamptz, p_pickup_end timestamptz,
  p_delivery_start timestamptz, p_delivery_end timestamptz
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'origin', jsonb_build_object('address', 'Av. Constitución 100', 'city', 'Monterrey', 'state', 'Nuevo León',
                                 'lat', 25.6866, 'lng', -100.3161),
    'destination', jsonb_build_object('address', 'Blvd. Venustiano Carranza 200', 'city', 'Saltillo',
                                      'state', 'Coahuila', 'lat', 25.4383, 'lng', -100.9737),
    'pickupWindow', jsonb_build_object('start', p_pickup_start, 'end', p_pickup_end),
    'deliveryWindow', jsonb_build_object('start', p_delivery_start, 'end', p_delivery_end),
    'cargoType', 'palletized', 'description', 'Tarimas', 'weightKg', 8000, 'unitType', 'dry_van',
    'specialRequirements', jsonb_build_array(), 'proposedPriceCents', 1500000
  );
$$;

-- The usual windows: pickup tomorrow, delivery the day after.
create function tests.payload()
returns jsonb
language sql
stable
as $$
  select tests.payload(now() + interval '1 day', now() + interval '1 day 4 hours',
                       now() + interval '2 days', now() + interval '2 days 6 hours');
$$;

-- Windows on 9999-12-31 in Mexico City, the last ones after 18:00 (year
-- 10000 in UTC).
create function tests.year_9999()
returns jsonb
language sql
stable
as $$
  select tests.payload(timestamptz '9999-12-31 12:00:00-06', timestamptz '9999-12-31 16:00:00-06',
                       timestamptz '9999-12-31 19:00:00-06', timestamptz '9999-12-31 23:59:00-06');
$$;

grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures: S shipper of an approved company, with a draft.
-- ---------------------------------------------------------------------------
select tests.new_user('a6100000-0000-4000-8000-000000000001', 'shipper');
insert into public.companies (id, type, legal_name, rfc, status) values
  ('c6100000-0000-4000-8000-000000000001', 'shipper', 'Envíos Fechas SA de CV', 'EFE061010AB1', 'approved');
update public.profiles set company_id = 'c6100000-0000-4000-8000-000000000001'
where id = 'a6100000-0000-4000-8000-000000000001';

select tests.login('a6100000-0000-4000-8000-000000000001');
set local role authenticated;

create temporary table draft on commit drop as select public.create_load(tests.payload()) as id;

-- ---------------------------------------------------------------------------
-- The RPCs refuse windows out of range
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.create_load(tests.year_9999()) $$,
  '22023', 'invalid load: dates out of range',
  'create_load refuses windows on 9999-12-31 (year 10000 in UTC)'
);
select throws_ok(
  $$ select public.create_load(tests.payload(now() - interval '2 days', now() + interval '4 hours',
                                             now() + interval '1 day', now() + interval '1 day 6 hours')) $$,
  '22023', 'invalid load: dates out of range',
  'create_load refuses a pickup that starts before yesterday'
);
select throws_ok(
  $$ select public.create_load(tests.payload(now() + interval '1 day', now() + interval '1 day 4 hours',
                                             now() + interval '2 days', now() + interval '13 months')) $$,
  '22023', 'invalid load: dates out of range',
  'create_load refuses a delivery that ends more than a year from now'
);
select throws_ok(
  $$ select public.create_load(tests.payload(now() + interval '1 day', now() + interval '400 days',
                                             now() + interval '2 days', now() + interval '2 days 6 hours')) $$,
  '22023', 'invalid load: dates out of range',
  'create_load checks every bound, also a pickup that ends after the delivery'
);
select throws_ok(
  format($$ select public.update_load(%L, tests.year_9999()) $$, (select id from draft)),
  '22023', 'invalid load: dates out of range',
  'update_load refuses them on a draft too'
);
select throws_ok(
  $$ select public.request_brokered_load(tests.year_9999() - 'proposedPriceCents', null) $$,
  '22023', 'invalid load: dates out of range',
  'request_brokered_load refuses them'
);

-- ---------------------------------------------------------------------------
-- Within the range, at both edges
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.create_load(tests.payload(now() - interval '23 hours', now() + interval '1 hour',
                                             now() + interval '2 hours', now() + interval '1 year')) $$,
  'create_load takes a pickup that started today and a delivery a year from now'
);
select lives_ok(
  format($$ select public.update_load(%L, tests.payload(now() + interval '3 days', now() + interval '3 days 4 hours',
                                                        now() + interval '4 days', now() + interval '4 days 6 hours')) $$,
         (select id from draft)),
  'update_load takes new dates within the range'
);
select lives_ok(
  $$ select public.request_brokered_load(tests.payload() - 'proposedPriceCents', 1200000) $$,
  'request_brokered_load takes a load within the range'
);

reset role;

-- ---------------------------------------------------------------------------
-- The table: a readable range for any writer, NOT VALID for older rows
-- ---------------------------------------------------------------------------
select is(
  (select convalidated from pg_constraint
   where conrelid = 'public.loads'::regclass and conname = 'loads_windows_range'),
  false, 'loads_windows_range does not check the rows stored before it (NOT VALID)'
);
select throws_ok(
  format($$ update public.loads set delivery_window_end = timestamptz '9999-12-31 23:59:00-06' where id = %L $$,
         (select id from draft)),
  '23514', null,
  'no writer can store a delivery in year 10000 (UTC)'
);
select throws_ok(
  format($$ update public.loads set pickup_window_end = timestamptz '2100-01-01 00:00:00+00' where id = %L $$,
         (select id from draft)),
  '23514', null,
  'nor a window that ends in 2100'
);
select throws_ok(
  format($$ update public.loads
            set pickup_window_start = timestamptz '2021-12-31 00:00:00-06',
                pickup_window_end = timestamptz '2021-12-31 04:00:00-06'
            where id = %L $$,
         (select id from draft)),
  '23514', null,
  'nor a pickup before 2022'
);
select throws_ok(
  format($$ update public.loads
            set delivery_window_start = timestamptz '2021-12-31 00:00:00-06'
            where id = %L $$,
         (select id from draft)),
  '23514', null,
  'nor a delivery that starts before 2022'
);
select lives_ok(
  format($$ update public.loads
            set pickup_window_start = now() - interval '30 days', pickup_window_end = now() - interval '29 days',
                delivery_window_start = now() - interval '28 days', delivery_window_end = now() - interval '27 days'
            where id = %L $$,
         (select id from draft)),
  'the table takes past dates within the range (a contracted load keeps changing status after them)'
);

-- A row stored before the check (as on production) is not checked again
-- until it changes.
alter table public.loads drop constraint loads_windows_range;
update public.loads set delivery_window_end = timestamptz '9999-12-31 23:59:00-06' where id = (select id from draft);
alter table public.loads
  add constraint loads_windows_range check (
    pickup_window_start >= timestamptz '2022-01-01 00:00:00-06'
    and delivery_window_start >= timestamptz '2022-01-01 00:00:00-06'
    and pickup_window_end < timestamptz '2100-01-01 00:00:00+00'
    and delivery_window_end < timestamptz '2100-01-01 00:00:00+00'
  ) not valid;
select is(
  (select to_json(delivery_window_end)::text from public.loads where id = (select id from draft)),
  '"10000-01-01T05:59:00+00:00"',
  'a row stored before the check keeps its date, which the apps show as "fecha no válida"'
);

select * from finish();
rollback;
