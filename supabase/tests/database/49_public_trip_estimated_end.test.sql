-- Public tracking (G7) with the estimated end of unloading of H5 (D32):
--   * public_shared_trip -> 'estimatedUnloadEndAt' is what the shipper sees
--     on its trip page (trip_end_estimate with the shipper view): the
--     default 4 h, the shipper's own measured trips, then the operator's
--     estimate; null once unloading finished or for a cancelled trip;
--   * data exposure: the carrier's measurements for other shippers never
--     shape it, and the JSON keeps exactly the keys of G7 (no source, basis
--     or sample size).
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.new_user(p_id uuid, p_role text)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id::text || '@pte.test', now(), null,
          jsonb_build_object('role', p_role, 'phone', '+525500000000'), now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;

create function tests.anon()
returns void
language sql
as $$
  select set_config('request.jwt.claims', '{"role": "anon"}', true);
$$;

create table tests.vals (name text primary key, id uuid);
grant select, insert on tests.vals to anon, authenticated;
create table tests.tokens (name text primary key, token text);
grant select, insert on tests.tokens to anon, authenticated;

-- What the shipper's own trip page shows, computed as the owner (anon cannot
-- call trip_end_estimate) and compared from the anonymous visitor's side.
create table tests.expected (name text primary key, at timestamptz);
grant select on tests.expected to anon, authenticated;

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

create function tests.token(p_name text)
returns text
language sql
stable
as $$ select token from tests.tokens where name = p_name $$;

-- A MTY -> GDL load: pickup in p_days (4 h window), delivery the day after.
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

-- The shipper publishes a load, the carrier's manager offers and the shipper
-- accepts. Returns the trip.
create function tests.contract(p_name text, p_shipper uuid, p_carrier uuid)
returns uuid
language plpgsql
as $$
declare
  v_load uuid;
  v_offer uuid;
  v_trip uuid;
begin
  perform tests.login(p_shipper);
  v_load := public.create_load(tests.payload(1));
  perform public.publish_load(v_load);
  perform tests.login(p_carrier);
  v_offer := public.make_offer(v_load, 3000000, null, null);
  perform tests.login(p_shipper);
  v_trip := public.accept_offer(v_offer);
  insert into tests.vals values (p_name, v_trip);
  return v_trip;
end;
$$;

-- A past unloading at the GDL site, written as the owner: arrival, p_wait
-- minutes of waiting and p_handling minutes of unloading.
create function tests.unloaded(p_trip uuid, p_arrived timestamptz, p_wait integer, p_handling integer)
returns void
language sql
as $$
  insert into public.trip_events (trip_id, event_type, occurred_at, latitude, longitude)
  values (p_trip, 'arrived_at_delivery', p_arrived, 20.6597, -103.3496),
         (p_trip, 'unloading_started', p_arrived + make_interval(mins => p_wait), 20.6597, -103.3496),
         (p_trip, 'unloading_finished', p_arrived + make_interval(mins => p_wait + p_handling), 20.6597, -103.3496);
$$;

-- The shipper shares the tracking of p_trip; the token is kept under p_name.
create function tests.share(p_name text, p_shipper uuid, p_trip text)
returns void
language plpgsql
as $$
declare
  r record;
begin
  perform tests.login(p_shipper);
  execute 'set local role authenticated';
  select * into r from public.create_share_link('trip_tracking_public', null, tests.val(p_trip), null);
  execute 'reset role';
  insert into tests.tokens values (p_name, r.token);
end;
$$;

-- The public estimate of a link, as an anonymous visitor.
create function tests.public_end(p_name text)
returns timestamptz
language sql
as $$ select (public.public_shared_trip(tests.token(p_name)) ->> 'estimatedUnloadEndAt')::timestamptz $$;

-- The estimate of a trip from the shipper's and from the carrier's side.
create function tests.estimate(p_trip text, p_shipper_view boolean)
returns table (ends_at timestamptz, source text)
language sql
as $$ select e.ends_at, e.source from public.trip_end_estimate(tests.val(p_trip), p_shipper_view) e $$;

grant execute on all functions in schema tests to anon, authenticated;

-- Users: ...01 shipper S (shares the link), ...02 manager of carrier A,
-- ...03 manager of carrier B, ...04 shipper S2 (another client of A).
select tests.new_user('a4900000-0000-4000-8000-000000000001', 'shipper');
select tests.new_user('a4900000-0000-4000-8000-000000000002', 'manager');
select tests.new_user('a4900000-0000-4000-8000-000000000003', 'manager');
select tests.new_user('a4900000-0000-4000-8000-000000000004', 'shipper');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('c4900000-0000-4000-8000-000000000001', 'shipper', 'Envíos Pi SA de CV', 'EPI050505GH5', 'approved'),
  ('c4900000-0000-4000-8000-000000000002', 'carrier', 'Fletes Rho SA de CV', 'FRH040404CD4', 'approved'),
  ('c4900000-0000-4000-8000-000000000003', 'carrier', 'Fletes Psi SA de CV', 'FPS040404CD4', 'approved'),
  ('c4900000-0000-4000-8000-000000000004', 'shipper', 'Envíos Chi SA de CV', 'ECH050505GH5', 'approved');
update public.profiles p set company_id = v.company_id::uuid
from (values
  ('a4900000-0000-4000-8000-000000000001', 'c4900000-0000-4000-8000-000000000001'),
  ('a4900000-0000-4000-8000-000000000002', 'c4900000-0000-4000-8000-000000000002'),
  ('a4900000-0000-4000-8000-000000000003', 'c4900000-0000-4000-8000-000000000003'),
  ('a4900000-0000-4000-8000-000000000004', 'c4900000-0000-4000-8000-000000000004')
) as v(id, company_id)
where p.id = v.id::uuid;

-- The shared trip of S with A, and a trip of S that will be cancelled.
set local role authenticated;
select tests.contract('trip', 'a4900000-0000-4000-8000-000000000001', 'a4900000-0000-4000-8000-000000000002');
select tests.contract('cancelled', 'a4900000-0000-4000-8000-000000000001', 'a4900000-0000-4000-8000-000000000002');
-- Five past trips of A for another shipper (S2) at the same GDL site: 10 h each.
select tests.contract('s2_' || n, 'a4900000-0000-4000-8000-000000000004', 'a4900000-0000-4000-8000-000000000002')
from generate_series(1, 5) n;
reset role;
select tests.share('trip_pub', 'a4900000-0000-4000-8000-000000000001', 'trip');
select tests.share('cancelled_pub', 'a4900000-0000-4000-8000-000000000001', 'cancelled');
select tests.unloaded(tests.val('s2_' || n), now() - make_interval(days => n), 480, 120)
from generate_series(1, 5) n;

-- ---------------------------------------------------------------------------
-- 1. Before arriving: the shipper's view, never the carrier's other clients
-- ---------------------------------------------------------------------------
select is(
  (select source from tests.estimate('trip', false)), 'measured',
  'the carrier''s own view uses its measurements for another shipper at that site'
);
set local role anon;
select tests.anon();
select set_eq(
  $$ select jsonb_object_keys(public.public_shared_trip(tests.token('trip_pub'))) $$,
  array['kind', 'status', 'origin', 'destination', 'pickupWindow', 'deliveryWindow', 'estimatedUnloadEndAt',
        'carrierName', 'unitType', 'plateMasked', 'timeline', 'lastPosition', 'expiresAt'],
  'the public trip keeps exactly the keys of G7 (no source, basis or sample size)'
);
reset role;
select is(
  (select source from tests.estimate('trip', true)), 'default',
  'the shipper has no measurements of its own there yet: the default 4 h'
);
insert into tests.expected select 'default', ends_at from tests.estimate('trip', true);
set local role anon;
select tests.anon();
select is(
  tests.public_end('trip_pub'), (select at from tests.expected where name = 'default'),
  'before unloading, the public estimate is the one the shipper sees (estimated arrival + 4 h)'
);
reset role;
select isnt(
  (select ends_at from tests.estimate('trip', true)), (select ends_at from tests.estimate('trip', false)),
  'and it is not the carrier''s view, built with another shipper''s trips'
);

-- Five past trips of S with carrier B at the site: 6 h each.
set local role authenticated;
select tests.contract('s_' || n, 'a4900000-0000-4000-8000-000000000001', 'a4900000-0000-4000-8000-000000000003')
from generate_series(1, 5) n;
reset role;
select tests.unloaded(tests.val('s_' || n), now() - make_interval(days => n), 300, 60)
from generate_series(1, 5) n;
select is(
  (select source from tests.estimate('trip', true)), 'measured',
  'with five trips of its own at the site, the shipper''s estimate is measured'
);
insert into tests.expected select 'measured', ends_at from tests.estimate('trip', true);
set local role anon;
select tests.anon();
select is(
  tests.public_end('trip_pub'), (select at from tests.expected where name = 'measured'),
  'and the public page shows that measured estimate'
);
select ok(
  public.public_shared_trip(tests.token('trip_pub'))::text !~* '(sampleSize|sample_size|basis|"source")',
  'nothing says what the estimate is based on or how many trips the shipper had there'
);
reset role;

-- ---------------------------------------------------------------------------
-- 2. Unloading: the operator's estimate, then nothing
-- ---------------------------------------------------------------------------
insert into public.trip_events (trip_id, event_type, occurred_at, latitude, longitude)
values (tests.val('trip'), 'arrived_at_delivery', now() - interval '2 hours', 20.6597, -103.3496),
       (tests.val('trip'), 'unloading_started', now() - interval '1 hour', 20.6597, -103.3496);
update public.trips set estimated_unload_end_at = date_trunc('minute', now()) + interval '3 hours'
where id = tests.val('trip');
set local role anon;
select tests.anon();
select is(
  tests.public_end('trip_pub'), date_trunc('minute', now()) + interval '3 hours',
  'once unloading started, the public estimate is the operator''s'
);
reset role;

insert into public.trip_events (trip_id, event_type, occurred_at, latitude, longitude)
values (tests.val('trip'), 'unloading_finished', now() - interval '5 minutes', 20.6597, -103.3496);
set local role anon;
select tests.anon();
select is(
  public.public_shared_trip(tests.token('trip_pub')) -> 'estimatedUnloadEndAt', 'null'::jsonb,
  'once unloading finished there is no estimate (the timeline has the real end)'
);
reset role;

-- ---------------------------------------------------------------------------
-- 3. A cancelled trip: the link still opens, without an estimate
-- ---------------------------------------------------------------------------
update public.trips set status = 'cancelled', cancelled_at = now(), cancellation_reason_code = 'shipper_request',
  cancelled_by_side = 'shipper' where id = tests.val('cancelled');
set local role anon;
select tests.anon();
select is(
  public.public_shared_trip(tests.token('cancelled_pub')) ->> 'status', 'cancelled',
  'the tracking of a cancelled trip still opens (G7: up to 24 h)'
);
select is(
  public.public_shared_trip(tests.token('cancelled_pub')) -> 'estimatedUnloadEndAt', 'null'::jsonb,
  'and shows no estimated end of unloading'
);
reset role;

select * from finish();
rollback;
