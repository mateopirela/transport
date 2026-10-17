-- Location consent (B22): role x operation RLS matrix of location_consents;
-- only operators give it, through the RPC; it is idempotent, versioned and
-- revocable; a consent row is never edited except to revoke it; and
-- record_trip_locations refuses points from an operator without consent.
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.new_user(p_id uuid, p_email text, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_email, now(), jsonb_build_object('role', p_role), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create function tests.payload()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'origin', jsonb_build_object('address', 'Av. Constitución 100', 'city', 'Monterrey', 'state', 'Nuevo León',
                                 'lat', 25.6866, 'lng', -100.3161),
    'destination', jsonb_build_object('address', 'Av. Vallarta 200', 'city', 'Guadalajara', 'state', 'Jalisco',
                                      'lat', 20.6597, 'lng', -103.3496),
    'pickupWindow', jsonb_build_object('start', now() + interval '1 day', 'end', now() + interval '1 day 4 hours'),
    'deliveryWindow', jsonb_build_object('start', now() + interval '2 days', 'end', now() + interval '2 days 6 hours'),
    'cargoType', 'palletized',
    'description', 'Tarimas',
    'weightKg', 18000,
    'unitType', 'dry_van',
    'specialRequirements', jsonb_build_array(),
    'proposedPriceCents', 3500000
  );
$$;
grant execute on all functions in schema tests to authenticated;

create table tests.vals (name text primary key, id uuid);
grant select, insert on tests.vals to authenticated;

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;
grant execute on function tests.val(text) to authenticated;

-- One point at `p_at`, as the app sends it.
create function tests.point(p_at timestamptz)
returns jsonb
language sql
immutable
as $$ select jsonb_build_array(jsonb_build_object('recordedAt', p_at, 'lat', 25.7, 'lng', -100.3)) $$;
grant execute on function tests.point(timestamptz) to authenticated;

-- Users: ...01 shipper S   ...03 carrier A   ...05 operator O of A
--        ...06 operator P of A   ...07 admin
select tests.new_user('a7000000-0000-4000-8000-000000000001', 'sara@s.test', 'shipper');
select tests.new_user('a7000000-0000-4000-8000-000000000003', 'ana@a.test', 'manager');
select tests.new_user('a7000000-0000-4000-8000-000000000005', 'oscar@a.test', 'operator');
select tests.new_user('a7000000-0000-4000-8000-000000000006', 'pedro@a.test', 'operator');
select tests.new_user('a7000000-0000-4000-8000-000000000007', 'admin@x.test', 'shipper');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c7000000-0000-4000-8000-000000000001', 'shipper', 'Envíos Sigma SA de CV', 'ESI030303EF3', 'approved'),
  ('c7000000-0000-4000-8000-000000000003', 'carrier', 'Fletes Alfa SA de CV', 'FAL010101AB1', 'approved');
update public.profiles p set company_id = c.id
from (values
  ('a7000000-0000-4000-8000-000000000001'::uuid, 'c7000000-0000-4000-8000-000000000001'::uuid),
  ('a7000000-0000-4000-8000-000000000003', 'c7000000-0000-4000-8000-000000000003'),
  ('a7000000-0000-4000-8000-000000000005', 'c7000000-0000-4000-8000-000000000003'),
  ('a7000000-0000-4000-8000-000000000006', 'c7000000-0000-4000-8000-000000000003')
) as c(uid, id)
where p.id = c.uid;
update public.profiles set role = 'admin' where id = 'a7000000-0000-4000-8000-000000000007';

insert into public.operators (id, company_id, profile_id, full_name) values
  ('d7000000-0000-4000-8000-000000000005', 'c7000000-0000-4000-8000-000000000003',
   'a7000000-0000-4000-8000-000000000005', 'Óscar Operador'),
  ('d7000000-0000-4000-8000-000000000006', 'c7000000-0000-4000-8000-000000000003',
   'a7000000-0000-4000-8000-000000000006', 'Pedro Operador');
-- D16 (G3): assign_trip needs a current license of a suitable type.
update public.operators set license_type = 'E', license_expires_on = current_date + 365
where license_type is null;
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('e7000000-0000-4000-8000-000000000003', 'c7000000-0000-4000-8000-000000000003', 'rigid', 'AAA2222', 'dry_van', 30000);

-- A trip of S x A assigned to O, on the road since now.
set local role authenticated;
select tests.login('a7000000-0000-4000-8000-000000000001');
insert into tests.vals select 'load', public.create_load(tests.payload());
select public.publish_load(tests.val('load'));
select tests.login('a7000000-0000-4000-8000-000000000003');
insert into tests.vals select 'offer', public.make_offer(tests.val('load'), 3400000);
select tests.login('a7000000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip', public.accept_offer(tests.val('offer'));
select tests.login('a7000000-0000-4000-8000-000000000003');
select public.assign_trip(tests.val('trip'), 'e7000000-0000-4000-8000-000000000003',
                          'd7000000-0000-4000-8000-000000000005');
select tests.login('a7000000-0000-4000-8000-000000000005');
select public.record_trip_event(tests.val('trip'), 'departed', now(), 25.6866, -100.3161);

-- ---------------------------------------------------------------------------
-- No consent: no points
-- ---------------------------------------------------------------------------
select is(public.has_location_consent(), false, 'the operator starts without consent');
select throws_ok(
  $$ select public.record_trip_locations(tests.val('trip'), tests.point(now() + interval '1 minute')) $$,
  '42501', 'location consent required', 'no point is accepted without the operator''s consent'
);

-- ---------------------------------------------------------------------------
-- record_location_consent
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.record_location_consent('15 de octubre', 'android') $$, '22023', null,
  'the consent version must be a date'
);
select throws_ok(
  $$ select public.record_location_consent('2026-10-15', 'web') $$, '22023', null,
  'the platform must be ios or android'
);
insert into tests.vals select 'consent1', public.record_location_consent('2026-10-15', 'android');
select is(public.has_location_consent(), true, 'the operator gives consent');
select is(
  public.record_location_consent('2026-10-15', 'android'), tests.val('consent1'),
  'accepting the same text again returns the active consent'
);
select results_eq(
  $$ select user_id, policy_version, platform, accepted_at, revoked_at is null from public.location_consents $$,
  $$ values ('a7000000-0000-4000-8000-000000000005'::uuid, '2026-10-15', 'android', now(), true) $$,
  'the consent keeps who, which text, the platform and when'
);
select is(
  public.record_trip_locations(tests.val('trip'), tests.point(now() + interval '1 minute')), 1,
  'with consent the points are stored'
);

-- ---------------------------------------------------------------------------
-- Direct writes are refused for every role
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.location_consents (user_id, policy_version, platform)
     values ('a7000000-0000-4000-8000-000000000005', '2026-10-15', 'ios') $$,
  '42501', null, 'the operator cannot insert consents directly'
);
select throws_ok(
  $$ update public.location_consents set revoked_at = now() $$, '42501', null,
  'the operator cannot update consents directly'
);
select throws_ok(
  $$ delete from public.location_consents $$, '42501', null, 'the operator cannot delete consents'
);

-- ---------------------------------------------------------------------------
-- Who reads consents
-- ---------------------------------------------------------------------------
select tests.login('a7000000-0000-4000-8000-000000000006');
select is((select count(*) from public.location_consents), 0::bigint, 'another operator does not see the consent');
select is(public.has_location_consent(), false, 'and has no consent of its own');
select tests.login('a7000000-0000-4000-8000-000000000003');
select is((select count(*) from public.location_consents), 0::bigint, 'the carrier does not see the consent');
select throws_ok(
  $$ update public.location_consents set revoked_at = now() $$, '42501', null, 'the carrier cannot update consents'
);
select throws_ok(
  $$ select public.record_location_consent('2026-10-15', 'ios') $$, '42501', null,
  'only operators give location consent'
);
select tests.login('a7000000-0000-4000-8000-000000000001');
select is((select count(*) from public.location_consents), 0::bigint, 'the shipper does not see the consent');
select tests.login('a7000000-0000-4000-8000-000000000007');
select is((select count(*) from public.location_consents), 1::bigint, 'admins see the consent (evidence)');
select throws_ok(
  $$ delete from public.location_consents $$, '42501', null, 'admins cannot delete consents'
);
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select count(*) from public.location_consents $$, '42501', null, 'anon cannot read consents'
);
select throws_ok(
  $$ select public.record_location_consent('2026-10-15', 'ios') $$, '42501', null, 'anon cannot give consent'
);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- A new text replaces the consent; revoking stops the points
-- ---------------------------------------------------------------------------
select tests.login('a7000000-0000-4000-8000-000000000005');
insert into tests.vals select 'consent2', public.record_location_consent('2026-11-01', 'android');
select isnt(tests.val('consent2'), tests.val('consent1'), 'a new consent text creates a new consent');
select results_eq(
  $$ select policy_version, revoked_at is not null from public.location_consents order by accepted_at, policy_version $$,
  $$ values ('2026-10-15', true), ('2026-11-01', false) $$,
  'the previous consent is kept, revoked'
);
select is(public.revoke_location_consent(), 1, 'the operator withdraws the consent');
select is(public.revoke_location_consent(), 0, 'withdrawing again changes nothing');
select is(public.has_location_consent(), false, 'the operator no longer has consent');
select throws_ok(
  $$ select public.record_trip_locations(tests.val('trip'), tests.point(now() + interval '2 minutes')) $$,
  '42501', 'location consent required', 'after withdrawing it no point is accepted'
);

-- The trigger protects the evidence even from privileged writers.
reset role;
select throws_ok(
  $$ update public.location_consents set revoked_at = null where id = tests.val('consent2') $$,
  '42501', 'a location consent can only be revoked', 'a revoked consent cannot be reactivated'
);
select throws_ok(
  $$ update public.location_consents set policy_version = '2027-01-01'
     where user_id = 'a7000000-0000-4000-8000-000000000005' and revoked_at is not null $$,
  '42501', 'a location consent can only be revoked', 'the accepted text cannot be changed'
);
select throws_ok(
  $$ insert into public.location_consents (user_id, policy_version, platform) values
       ('a7000000-0000-4000-8000-000000000006', '2026-10-15', 'ios'),
       ('a7000000-0000-4000-8000-000000000006', '2026-10-15', 'android') $$,
  '23505', null, 'a user has at most one active consent'
);

select * from finish();
rollback;
