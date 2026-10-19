-- Product events (B25): RPC-only writes with the caller taken from the JWT,
-- allowlisted properties, admin-only reads, immutability and the flood guard.
begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.new_user(p_id uuid, p_email text, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_email, now(), case when p_role = 'operator' then '{"provisioned_by": "redeem-invitation"}'::jsonb end, jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
grant execute on all functions in schema tests to authenticated, anon;

-- Users: ...01 shipper S   ...03 carrier A   ...04 carrier B   ...07 admin
select tests.new_user('a1700000-0000-4000-8000-000000000001', 'sara@s.test', 'shipper');
select tests.new_user('a1700000-0000-4000-8000-000000000003', 'ana@a.test', 'manager');
select tests.new_user('a1700000-0000-4000-8000-000000000004', 'beto@b.test', 'manager');
select tests.new_user('a1700000-0000-4000-8000-000000000007', 'admin@x.test', 'shipper');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c1700000-0000-4000-8000-000000000001', 'shipper', 'Envíos Sigma SA de CV', 'ESI030303EF3', 'approved'),
  ('c1700000-0000-4000-8000-000000000003', 'carrier', 'Fletes Alfa SA de CV', 'FAL010101AB1', 'approved'),
  ('c1700000-0000-4000-8000-000000000004', 'carrier', 'Transportes Beta SA de CV', 'TBE020202CD2', 'approved');

update public.profiles p set company_id = c.id
from (values
  ('a1700000-0000-4000-8000-000000000001'::uuid, 'c1700000-0000-4000-8000-000000000001'::uuid),
  ('a1700000-0000-4000-8000-000000000003', 'c1700000-0000-4000-8000-000000000003'),
  ('a1700000-0000-4000-8000-000000000004', 'c1700000-0000-4000-8000-000000000004')
) as c(uid, id)
where p.id = c.uid;
update public.profiles set role = 'admin' where id = 'a1700000-0000-4000-8000-000000000007';

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
select enum_has_labels(
  'public', 'product_event_name',
  array['recommendations_viewed', 'recommendation_opened', 'offer_submitted'],
  'product_event_name labels'
);
select ok(
  not has_table_privilege('anon', 'public.product_events', 'select,insert,update,delete'),
  'anon has no privileges on product_events'
);
select ok(
  not has_table_privilege('authenticated', 'public.product_events', 'insert,update,delete'),
  'authenticated cannot write product_events directly'
);
select ok(
  not has_function_privilege('anon', 'public.track_product_event(public.product_event_name, uuid, jsonb)', 'execute'),
  'anon cannot call track_product_event'
);

-- ---------------------------------------------------------------------------
-- Tracking: the actor comes from the JWT
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok(
  $$ select public.track_product_event('recommendations_viewed', null, '{}') $$,
  '42501', null, 'anon cannot track events'
);

set local role authenticated;
select tests.login('a1700000-0000-4000-8000-000000000003');
select lives_ok(
  $$ select public.track_product_event('recommendations_viewed', null,
       '{"recommendations": 4, "return_trips": 1, "units": 2}') $$,
  'a carrier tracks the recommendations it saw'
);
select lives_ok(
  $$ select public.track_product_event('offer_submitted', null, '{"source": "recommendation", "counter": false}') $$,
  'a carrier tracks an offer and its source'
);
select lives_ok(
  $$ select public.track_product_event('recommendation_opened', 'f1700000-0000-4000-8000-000000000099',
       '{"vehicle_id": "e1700000-0000-4000-8000-000000000003", "rank": 1, "score": 87.5, "return_trip": true}') $$,
  'an unknown load does not fail (no existence oracle)'
);

select throws_ok(
  $$ select public.track_product_event('offer_submitted', null, '{"source": "search", "email": "a@b.mx"}') $$,
  '22023', null, 'keys outside the allowlist are rejected'
);
select throws_ok(
  $$ select public.track_product_event('recommendations_viewed', null, '{"units": {"nested": 1}}') $$,
  '22023', null, 'nested values are rejected'
);
select throws_ok(
  $$ select public.track_product_event('offer_submitted', null, jsonb_build_object('source', repeat('x', 65))) $$,
  '22023', null, 'long strings are rejected'
);
select throws_ok(
  $$ select public.track_product_event('offer_submitted', null, '["source"]') $$,
  '22023', null, 'properties must be an object'
);
select throws_ok(
  $$ select public.track_product_event('recommendation_opened', null, '{"rank": 1, "units": 3}') $$,
  '22023', null, 'keys of another event are rejected'
);
select throws_ok(
  $$ select public.track_product_event('offer_submitted', null, '{"source": "ana@fletes.mx", "counter": false}') $$,
  '22023', null, 'free text is rejected: source must be recommendation or search'
);
select throws_ok(
  $$ select public.track_product_event('offer_submitted', null, '{"source": "search"}') $$,
  '22023', null, 'every property of the event is required'
);
select throws_ok(
  $$ select public.track_product_event('recommendation_opened', null,
       '{"vehicle_id": "ana@fletes.mx", "rank": 1, "score": 1, "return_trip": true}') $$,
  '22023', null, 'vehicle_id must be a uuid'
);
select throws_ok(
  $$ select public.track_product_event('recommendation_opened', null,
       '{"vehicle_id": "e1700000-0000-4000-8000-000000000003", "rank": "1", "score": 1, "return_trip": true}') $$,
  '22023', null, 'numbers sent as strings are rejected'
);
select throws_ok(
  $$ select public.track_product_event('recommendation_opened', null,
       '{"vehicle_id": "e1700000-0000-4000-8000-000000000003", "rank": 1, "score": 8112345678, "return_trip": true}') $$,
  '22023', null, 'a score out of range (e.g. a phone number) is rejected'
);
select throws_ok(
  $$ select public.track_product_event('recommendations_viewed', null,
       '{"recommendations": 2.5, "return_trips": 0, "units": 1}') $$,
  '22023', null, 'counts must be integers'
);
select ok(
  not has_function_privilege('authenticated', 'public.product_event_properties_valid(public.product_event_name, jsonb)', 'execute'),
  'the validator is internal to track_product_event'
);

-- ---------------------------------------------------------------------------
-- Reads: admins only
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select id from public.product_events $$,
  'a carrier cannot read events, not even its own'
);
select tests.login('a1700000-0000-4000-8000-000000000004');
select is_empty($$ select id from public.product_events $$, 'another carrier cannot read events');
select tests.login('a1700000-0000-4000-8000-000000000001');
select is_empty($$ select id from public.product_events $$, 'a shipper cannot read events');

select tests.login('a1700000-0000-4000-8000-000000000007');
select is(
  (select count(*)::int from public.product_events), 3, 'an admin reads every event'
);
select results_eq(
  $$ select distinct user_id, user_role::text, company_id from public.product_events $$,
  $$ values ('a1700000-0000-4000-8000-000000000003'::uuid, 'manager', 'c1700000-0000-4000-8000-000000000003'::uuid) $$,
  'user, role and company come from the caller'
);
select is(
  (select load_id from public.product_events where name = 'recommendation_opened'), null,
  'an unknown load is stored as null'
);

-- ---------------------------------------------------------------------------
-- Immutability: even an admin cannot change or delete events
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.product_events (name) values ('offer_submitted') $$,
  '42501', null, 'an admin cannot insert directly'
);
select throws_ok(
  $$ update public.product_events set properties = '{}' $$,
  '42501', null, 'an admin cannot update events'
);
select throws_ok(
  $$ delete from public.product_events $$,
  '42501', null, 'an admin cannot delete events'
);

-- ---------------------------------------------------------------------------
-- Flood guard: beyond 60 per user and minute, events are dropped silently
-- ---------------------------------------------------------------------------
select tests.login('a1700000-0000-4000-8000-000000000004');
select lives_ok(
  $$ select public.track_product_event('offer_submitted', null, '{"source": "search", "counter": true}')
     from generate_series(1, 70) $$,
  'a flood does not fail the caller'
);
reset role;
select is(
  (select count(*)::int from public.product_events where user_id = 'a1700000-0000-4000-8000-000000000004'),
  60, 'only 60 events per minute are kept'
);

select * from finish();
rollback;
