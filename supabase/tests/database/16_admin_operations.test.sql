-- Admin operations (B16): manual contracting on behalf of the parties
-- (admin_create_offer, admin_accept_offer) with its audit trail, the
-- refactored accept_offer, and the KPI views (admin only, computed values).
begin;
create extension if not exists pgtap with schema extensions;

select plan(42);

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

-- Monterrey -> Guadalajara, or the way back when p_reverse.
create function tests.payload(p_reverse boolean default false)
returns jsonb
language sql
stable
as $$
  with places as (
    select jsonb_build_object('address', 'Av. Constitución 100', 'city', 'Monterrey', 'state', 'Nuevo León',
                              'lat', 25.6866, 'lng', -100.3161) as mty,
           jsonb_build_object('address', 'Av. Vallarta 200', 'city', 'Guadalajara', 'state', 'Jalisco',
                              'lat', 20.6597, 'lng', -103.3496) as gdl
  )
  select jsonb_build_object(
    'origin', case when p_reverse then gdl else mty end,
    'destination', case when p_reverse then mty else gdl end,
    'pickupWindow', jsonb_build_object('start', now() + interval '1 day', 'end', now() + interval '1 day 4 hours'),
    'deliveryWindow', jsonb_build_object('start', now() + interval '2 days', 'end', now() + interval '2 days 6 hours'),
    'cargoType', 'palletized',
    'description', 'Tarimas',
    'weightKg', 18000,
    'unitType', 'dry_van',
    'specialRequirements', jsonb_build_array(),
    'proposedPriceCents', 3500000
  )
  from places;
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

-- Users: ...01 shipper S   ...03 carrier A   ...04 carrier B   ...05 operator O of A
--        ...06 carrier C (company in review)   ...07 admin
select tests.new_user('a1600000-0000-4000-8000-000000000001', 'sara@s.test', 'shipper');
select tests.new_user('a1600000-0000-4000-8000-000000000003', 'ana@a.test', 'manager');
select tests.new_user('a1600000-0000-4000-8000-000000000004', 'beto@b.test', 'manager');
select tests.new_user('a1600000-0000-4000-8000-000000000005', 'oscar@a.test', 'operator');
select tests.new_user('a1600000-0000-4000-8000-000000000006', 'carla@c.test', 'manager');
select tests.new_user('a1600000-0000-4000-8000-000000000007', 'admin@x.test', 'shipper');

insert into public.companies (id, type, legal_name, rfc, status, created_at) values
  ('c1600000-0000-4000-8000-000000000001', 'shipper', 'Envíos Sigma SA de CV', 'ESI030303EF3', 'approved', now()),
  ('c1600000-0000-4000-8000-000000000003', 'carrier', 'Fletes Alfa SA de CV', 'FAL010101AB1', 'approved', now()),
  ('c1600000-0000-4000-8000-000000000004', 'carrier', 'Transportes Beta SA de CV', 'TBE020202CD2', 'approved', now()),
  ('c1600000-0000-4000-8000-000000000006', 'carrier', 'Carga Gama SA de CV', 'CGA040404GH4', 'pending_review',
   now() - interval '2 days');

update public.profiles p set company_id = c.id
from (values
  ('a1600000-0000-4000-8000-000000000001'::uuid, 'c1600000-0000-4000-8000-000000000001'::uuid),
  ('a1600000-0000-4000-8000-000000000003', 'c1600000-0000-4000-8000-000000000003'),
  ('a1600000-0000-4000-8000-000000000004', 'c1600000-0000-4000-8000-000000000004'),
  ('a1600000-0000-4000-8000-000000000005', 'c1600000-0000-4000-8000-000000000003'),
  ('a1600000-0000-4000-8000-000000000006', 'c1600000-0000-4000-8000-000000000006')
) as c(uid, id)
where p.id = c.uid;
update public.profiles set role = 'admin' where id = 'a1600000-0000-4000-8000-000000000007';

-- KPI rows that already exist (e.g. the demo seed), read as the admin before
-- this test adds any: the pilot summary is checked against them plus the
-- fixtures, so it does not depend on what the database already holds.
select tests.login('a1600000-0000-4000-8000-000000000007');
create table tests.kpi_before as select * from public.kpi_pilot_summary;
create table tests.unload_errors_before as
select unload_estimate_error_minutes as minutes from public.kpi_trip_metrics
where unload_estimate_error_minutes is not null;
create table tests.approvals_before as
select minutes_to_approval as minutes from public.kpi_carrier_onboarding
where minutes_to_approval is not null and company_id::text not like 'c1600000-%';
select set_config('request.jwt.claims', '', true);
grant select on tests.kpi_before, tests.unload_errors_before, tests.approvals_before to authenticated;

insert into public.operators (id, company_id, profile_id, full_name) values
  ('d1600000-0000-4000-8000-000000000005', 'c1600000-0000-4000-8000-000000000003',
   'a1600000-0000-4000-8000-000000000005', 'Óscar Operador');
-- D16 (G3): assign_trip needs a current license of a suitable type.
update public.operators set license_type = 'E', license_expires_on = current_date + 365
where license_type is null;
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('e1600000-0000-4000-8000-000000000003', 'c1600000-0000-4000-8000-000000000003', 'rigid', 'AAA1111', 'dry_van', 30000);

-- Loads of S: load1 and load2 MTY -> GDL, load3 GDL -> MTY.
set local role authenticated;
select tests.login('a1600000-0000-4000-8000-000000000001');
insert into tests.vals select 'load1', public.create_load(tests.payload());
insert into tests.vals select 'load2', public.create_load(tests.payload());
insert into tests.vals select 'load3', public.create_load(tests.payload(true));
select public.publish_load(tests.val('load1'));
select public.publish_load(tests.val('load2'));
select public.publish_load(tests.val('load3'));

-- ---------------------------------------------------------------------------
-- Manual contracting: admins only
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.admin_create_offer(tests.val('load1'), 'c1600000-0000-4000-8000-000000000003', 3000000) $$,
  '42501', null, 'a shipper cannot offer on behalf of a carrier'
);
select tests.login('a1600000-0000-4000-8000-000000000003');
select throws_ok(
  $$ select public.admin_create_offer(tests.val('load1'), 'c1600000-0000-4000-8000-000000000003', 3000000, null,
                                      null, true) $$,
  '42501', null, 'a carrier cannot contract a load on its own behalf through the admin RPC'
);
insert into tests.vals select 'offerA2', public.make_offer(tests.val('load2'), 3400000);
select throws_ok(
  $$ select public.admin_accept_offer(tests.val('offerA2')) $$,
  '42501', null, 'a carrier cannot accept through the admin RPC'
);
select tests.login('a1600000-0000-4000-8000-000000000001');
select throws_ok(
  $$ select public.admin_accept_offer(tests.val('offerA2')) $$,
  '42501', null, 'the shipper of the load cannot accept through the admin RPC'
);
select tests.login('a1600000-0000-4000-8000-000000000005');
select throws_ok(
  $$ select public.admin_create_offer(tests.val('load1'), 'c1600000-0000-4000-8000-000000000003', 3000000, null,
                                      null, true) $$,
  '42501', null, 'an operator cannot offer through the admin RPC'
);
select throws_ok(
  $$ select public.admin_accept_offer(tests.val('offerA2')) $$,
  '42501', null, 'an operator cannot accept through the admin RPC'
);
set local role anon;
select throws_ok(
  $$ select public.admin_create_offer('00000000-0000-4000-8000-000000000000',
                                      'c1600000-0000-4000-8000-000000000003', 3000000) $$,
  '42501', null, 'anon cannot execute admin_create_offer'
);
select throws_ok(
  $$ select public.admin_accept_offer('00000000-0000-4000-8000-000000000000') $$,
  '42501', null, 'anon cannot execute admin_accept_offer'
);
set local role authenticated;
select tests.login('a1600000-0000-4000-8000-000000000001');
select results_eq(
  $$ select l.status::text, (select count(*)::int from public.offers o where o.load_id = l.id)
     from public.loads l where l.id = tests.val('load1') $$,
  $$ values ('published', 0) $$,
  'the refused calls created no offer and left load1 published'
);
select results_eq(
  $$ select (select status::text from public.offers where id = tests.val('offerA2')),
            (select status::text from public.loads where id = tests.val('load2')) $$,
  $$ values ('pending', 'negotiating') $$,
  'the refused acceptances left the offer pending and load2 negotiating'
);

select tests.login('a1600000-0000-4000-8000-000000000007');
select throws_ok(
  $$ select public.admin_create_offer(tests.val('load1'), 'c1600000-0000-4000-8000-000000000001', 3000000) $$,
  '22023', 'carrier not found', 'the company must be a carrier'
);
select throws_ok(
  $$ select public.admin_create_offer(tests.val('load1'), 'c1600000-0000-4000-8000-000000000006', 3000000) $$,
  '55000', 'company is not approved', 'the carrier must be approved'
);
select throws_ok(
  $$ select public.admin_create_offer(tests.val('load1'), 'c1600000-0000-4000-8000-000000000003', 0) $$,
  '22023', null, 'the amount is validated like any offer'
);

-- Offer on behalf of carrier A on load1 (pending): the shipper can answer it.
insert into tests.vals
select 'offerA1', public.admin_create_offer(tests.val('load1'), 'c1600000-0000-4000-8000-000000000003', 3200000,
                                           'Acordado por teléfono');
select results_eq(
  $$ select side::text, status::text, created_by from public.offers where id = tests.val('offerA1') $$,
  $$ values ('carrier', 'pending', 'a1600000-0000-4000-8000-000000000007'::uuid) $$,
  'the admin offer is a pending carrier offer created by the admin'
);
select is(
  (select status::text from public.loads where id = tests.val('load1')), 'negotiating',
  'the load moves to negotiating'
);
select throws_ok(
  $$ select public.admin_create_offer(tests.val('load1'), 'c1600000-0000-4000-8000-000000000003', 3100000) $$,
  '55000', 'negotiation already has a pending offer', 'one pending offer per negotiation'
);
select tests.login('a1600000-0000-4000-8000-000000000001');
select ok(
  exists (select 1 from public.notifications n
          where n.type = 'offer_received' and n.data ->> 'offerId' = tests.val('offerA1')::text),
  'the shipper is notified of the offer'
);
select tests.login('a1600000-0000-4000-8000-000000000007');

-- Accept it on behalf of the shipper.
insert into tests.vals select 'trip1', public.admin_accept_offer(tests.val('offerA1'));
select isnt(tests.val('trip1'), null, 'admin_accept_offer returns the new trip');
select results_eq(
  $$ select status::text, carrier_company_id, agreed_price_cents from public.loads where id = tests.val('load1') $$,
  $$ values ('contracted', 'c1600000-0000-4000-8000-000000000003'::uuid, 3200000::bigint) $$,
  'the load is contracted with the carrier at the offered price'
);
select is(
  (select status::text from public.offers where id = tests.val('offerA1')), 'accepted', 'the offer is accepted'
);
select results_eq(
  $$ select table_name from public.audit_log
     where actor_id = 'a1600000-0000-4000-8000-000000000007'
       and (record_id in (tests.val('offerA1'), tests.val('load1'), tests.val('trip1'))
            or (table_name = 'negotiations' and new_data ->> 'load_id' = tests.val('load1')::text))
     group by table_name order by table_name $$,
  $$ values ('loads'), ('negotiations'), ('offers'), ('trips') $$,
  'the offer, negotiation, load and trip are in the audit log with the admin as actor'
);
select throws_ok(
  $$ select public.admin_accept_offer(tests.val('offerA1')) $$,
  '55000', null, 'an accepted offer cannot be accepted again'
);
select throws_ok(
  $$ select public.admin_create_offer(tests.val('load1'), 'c1600000-0000-4000-8000-000000000004', 3000000) $$,
  '55000', null, 'no offers on a contracted load'
);

-- Contract load2 directly with carrier B: carrier A's pending offer closes.
insert into tests.vals
select 'offerB2', public.admin_create_offer(tests.val('load2'), 'c1600000-0000-4000-8000-000000000004', 3300000,
                                           null, null, true);
select results_eq(
  $$ select status::text, carrier_company_id from public.loads where id = tests.val('load2') $$,
  $$ values ('contracted', 'c1600000-0000-4000-8000-000000000004'::uuid) $$,
  'with p_accept the admin contracts the load at once'
);
select results_eq(
  $$ select status::text, status_reason from public.offers where id = tests.val('offerA2') $$,
  $$ values ('rejected', 'other_offer_accepted') $$,
  'the other pending offers are rejected'
);
select is(
  (select count(*)::int from public.trips where offer_id = tests.val('offerB2')), 1, 'the trip is created'
);

-- The shipper's own acceptance still works (accept_offer now shares the code).
select tests.login('a1600000-0000-4000-8000-000000000003');
insert into tests.vals select 'offerA3', public.make_offer(tests.val('load3'), 2900000);
select tests.login('a1600000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select public.accept_offer(tests.val('offerA3')) $$,
  '42501', null, 'accept_offer still refuses other companies'
);
select tests.login('a1600000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip3', public.accept_offer(tests.val('offerA3'));
select isnt(tests.val('trip3'), null, 'the shipper accepts a carrier offer and gets the trip');

-- ---------------------------------------------------------------------------
-- KPI fixtures (as the table owner): the unit of A does load1 and then
-- load3 (the way back); timings are set relative to now(). The bookings are
-- out of travel order: trip3 (travels later) was booked before trip1.
-- ---------------------------------------------------------------------------
reset role;
select tests.login('a1600000-0000-4000-8000-000000000007');
-- Carrier C is approved by the admin today, two days after registering.
update public.companies set status = 'approved' where id = 'c1600000-0000-4000-8000-000000000006';
select set_config('request.jwt.claims', '', true);

update public.trips
set status = 'assigned', vehicle_id = 'e1600000-0000-4000-8000-000000000003',
    operator_id = 'd1600000-0000-4000-8000-000000000005', assigned_at = now(),
    created_at = case id when tests.val('trip1') then now() - interval '1 day' else now() - interval '3 days' end
where id in (tests.val('trip1'), tests.val('trip3'));
update public.loads
set published_at = now() - interval '10 hours', contracted_at = now() - interval '5 hours',
    pickup_window_start = now() - interval '4 days'
where id = tests.val('load1');
update public.offers set created_at = now() - interval '8 hours' where id = tests.val('offerA1');
insert into public.trip_events (trip_id, event_type, occurred_at, estimated_unload_end_at) values
  (tests.val('trip3'), 'unloading_started', now() - interval '3 hours', now() - interval '1 hour'),
  (tests.val('trip3'), 'unloading_finished', now() - interval '30 minutes', null);

-- ---------------------------------------------------------------------------
-- KPI views: admins only
-- ---------------------------------------------------------------------------
select ok(
  not has_table_privilege('anon', 'public.kpi_pilot_summary', 'select')
  and not has_table_privilege('anon', 'public.kpi_trip_metrics', 'select')
  and not has_table_privilege('anon', 'public.kpi_load_times', 'select')
  and not has_table_privilege('anon', 'public.kpi_carrier_onboarding', 'select'),
  'anon cannot read the KPI views'
);

set local role authenticated;
select tests.login('a1600000-0000-4000-8000-000000000001');
select is_empty($$ select * from public.kpi_pilot_summary $$, 'a shipper gets no summary');
select is_empty($$ select * from public.kpi_load_times $$, 'a shipper does not see load times, not even its own');
select tests.login('a1600000-0000-4000-8000-000000000003');
select is_empty($$ select * from public.kpi_trip_metrics $$, 'a carrier does not see trip metrics, not even its own');
select is_empty($$ select * from public.kpi_carrier_onboarding $$, 'a carrier does not see onboarding times');

select tests.login('a1600000-0000-4000-8000-000000000007');
select results_eq(
  $$ select previous_trip_id, empty_km, is_return_trip, avoided_empty_km
     from public.kpi_trip_metrics where trip_id = tests.val('trip1') $$,
  $$ values (null::uuid, null::numeric, false, null::numeric) $$,
  'the first trip in travel order has no previous trip, even if it was booked later'
);
select results_eq(
  $$ select previous_trip_id, empty_km, is_return_trip from public.kpi_trip_metrics
     where trip_id = tests.val('trip3') $$,
  $$ values (tests.val('trip1'), 0.0::numeric, true) $$,
  'the way back from the previous destination is a return trip with no empty km'
);
select ok(
  (select avoided_empty_km between 550 and 750 from public.kpi_trip_metrics where trip_id = tests.val('trip3')),
  'the return trip avoids the empty way back MTY <-> GDL (straight line, ~640 km)'
);
select is(
  (select unload_estimate_error_minutes from public.kpi_trip_metrics where trip_id = tests.val('trip3')), 30.0,
  'unloading ended 30 minutes after the estimate'
);
select results_eq(
  $$ select minutes_to_first_offer, minutes_to_contract from public.kpi_load_times
     where load_id = tests.val('load1') $$,
  $$ values (120.0::numeric, 300.0::numeric) $$,
  'time from publication to the first offer and to the contract'
);
select is(
  (select minutes_to_approval from public.kpi_carrier_onboarding
   where company_id = 'c1600000-0000-4000-8000-000000000006'), 2880.0,
  'carrier onboarding time comes from the approval in the audit log'
);
select is(
  (select minutes_to_approval from public.kpi_carrier_onboarding
   where company_id = 'c1600000-0000-4000-8000-000000000003'), null,
  'a carrier approved without an admin review has no onboarding time'
);
select results_eq(
  $$ select loads_published, offers_total, trips_total, return_trips, unload_estimates_measured,
            avg_abs_unload_error_minutes, median_minutes_to_carrier_approval
     from public.kpi_pilot_summary $$,
  $$ select b.loads_published + 3, b.offers_total + 4, b.trips_total + 3, b.return_trips + 1,
            b.unload_estimates_measured + 1,
            (select round(avg(abs(x.minutes)), 1)
             from (select minutes from tests.unload_errors_before union all select 30.0) x),
            (select round(percentile_cont(0.5) within group (order by x.minutes)::numeric, 1)
             from (select minutes from tests.approvals_before union all select 2880.0) x)
     from tests.kpi_before b $$,
  'the pilot summary aggregates the KPI views'
);
select is(
  (select total_avoided_empty_km from public.kpi_pilot_summary),
  (select b.total_avoided_empty_km + m.avoided_empty_km
   from tests.kpi_before b, public.kpi_trip_metrics m where m.trip_id = tests.val('trip3')),
  'the avoided empty km add up over the trips'
);

select * from finish();
rollback;
