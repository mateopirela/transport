-- Demo seed (B10): checks supabase/seed.sql right after `supabase db reset`
-- (or `supabase db start`). It lives outside supabase/tests on purpose: the
-- pgTAP suite runs on an empty database (`supabase db reset --no-seed`), and
-- this file needs the seed. Run it with:
--
--   supabase test db supabase/seed-tests
--
-- Everything runs in a transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(37);

create schema tests;
grant usage on schema tests to authenticated;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated')::text, true);
$$;
grant execute on function tests.login(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Scope of B10: users, companies, fleet and loads
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.profiles where id::text like '5eed0001-%' and role = 'admin' and company_id is null),
  1, 'one admin without a company'
);
select is(
  (select count(*)::int from public.companies where id::text like '5eed0002-%' and type = 'shipper' and status = 'approved'),
  3, 'three approved shipper companies'
);
select is(
  (select count(*)::int from public.companies where id::text like '5eed0002-%' and type = 'carrier' and status = 'approved'),
  3, 'three approved carrier companies'
);
select ok(
  exists (
    select 1
    from public.companies c
    join public.profiles p on p.company_id = c.id and p.role = 'manager'
    join public.operators o on o.company_id = c.id and o.profile_id = p.id
    where c.id::text like '5eed0002-%' and public.taxpayer_type_for_rfc(c.rfc) = 'fisica'
  ),
  'the hombre-camión is a persona física registered as its own operator (D13)'
);
select is((select count(*)::int from public.vehicles where id::text like '5eed0004-%'), 8, 'eight units');
select is(
  (select count(distinct kind)::int from public.vehicles where id::text like '5eed0004-%'),
  3, 'units of every kind (tractor, rigid, trailer)'
);
select ok(
  (select count(distinct unit_type) >= 5 from public.vehicles where id::text like '5eed0004-%'),
  'units of several body types'
);
select is((select count(*)::int from public.operators where id::text like '5eed0003-%'), 7, 'seven operators (Iván Garza signs in with his phone, G2)');
select is((select count(*)::int from public.loads where id::text like '5eed0005-%'), 15, 'fifteen loads');
select is(
  (select array_agg(distinct status::text order by status::text) from public.loads where id::text like '5eed0005-%'),
  array['cancelled', 'completed', 'contracted', 'draft', 'expired', 'in_progress', 'negotiating', 'published'],
  'loads in every status'
);
select ok(
  (select count(*) filter (where origin_state = 'Nuevo León' and destination_state = 'Jalisco') >= 4
      and count(*) filter (where origin_state = 'Jalisco' and destination_state = 'Nuevo León') >= 4
   from public.loads where id::text like '5eed0005-%'),
  'loads in both directions of the corridor'
);

-- ---------------------------------------------------------------------------
-- Demo users: confirmed email/password accounts (local only)
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from auth.users
   where id::text like '5eed0001-%'
     and email like '%@demo.test'
     and email_confirmed_at is not null
     and encrypted_password = extensions.crypt('Demo1234', encrypted_password)),
  12, 'twelve confirmed demo users with the documented password'
);
select is(
  (select count(*)::int from auth.identities where user_id::text like '5eed0001-%' and provider = 'email'),
  13, 'every demo user has an email identity (needed to sign in; Iván''s is the synthetic one of his phone)'
);

-- ---------------------------------------------------------------------------
-- Consistency with the state machines
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.loads l
   where l.status in ('contracted', 'in_progress', 'completed')
     and not exists (
       select 1 from public.trips t
       where t.load_id = l.id and t.offer_id = l.accepted_offer_id
         and case l.status
               when 'contracted' then t.status in ('pending_assignment', 'assigned')
               when 'in_progress' then public.trip_is_active(t.status) or t.status = 'delivered'
               else t.status = 'closed'
             end
     )),
  0, 'every contracted load has a trip in a matching status'
);
select is(
  (select count(*)::int from public.trips t
   where t.status is distinct from (
     select e.to_status from public.trip_events e
     where e.trip_id = t.id and e.to_status is not null
     order by e.occurred_at desc limit 1
   )),
  0, 'the last event of every trip leads to its status'
);
-- record_trip_event copies the device time of these events into the trip.
select is(
  (select count(*)::int from public.trips t
   where t.started_at is distinct from (
           select e.occurred_at from public.trip_events e where e.trip_id = t.id and e.event_type = 'departed')
      or t.delivered_at is distinct from (
           select e.occurred_at from public.trip_events e where e.trip_id = t.id and e.event_type = 'unloading_finished')
      or t.estimated_unload_end_at is distinct from (
           select e.estimated_unload_end_at from public.trip_events e
           where e.trip_id = t.id and e.estimated_unload_end_at is not null
           order by e.occurred_at desc limit 1)),
  0, 'the start, delivery and unloading estimate of every trip match its timeline'
);
select is(
  (select count(*)::int from public.loads l
   where (l.status = 'negotiating') <> exists (
     select 1 from public.offers o where o.load_id = l.id and o.status = 'pending'
   )),
  0, 'only negotiating loads have pending offers'
);
select is(
  (select count(*)::int from public.companies c
   where c.id::text like '5eed0002-%' and exists (select 1 from public.company_missing_requirements(c.id))),
  0, 'every company has its documents approved'
);
select is(
  (select array_agg(v.id) from public.vehicles v
   where v.id::text like '5eed0004-%' and exists (select 1 from public.vehicle_missing_requirements(v.id))),
  array['5eed0004-0000-4000-8000-000000000006'::uuid],
  'every unit is ready except the flatbed whose insurance waits for review'
);
select is(
  (select count(*)::int from public.documents where status = 'pending_review'),
  1, 'the admin review queue has one document'
);
select is(
  (select count(*)::int from public.notifications where dispatched_at is null),
  0, 'no notification is left for the dispatcher (no push or email for demo data)'
);

-- ---------------------------------------------------------------------------
-- Return trip (B08 acceptance): the unit unloading in Guadalajara is free at
-- the estimated end, and the closest compatible open load is GDL -> MTY.
-- ---------------------------------------------------------------------------
select is(
  (select t.status::text from public.trips t join public.loads l on l.id = t.load_id
   where t.id = '5eed0008-0000-4000-8000-000000000001'
     and l.origin_state = 'Nuevo León' and l.destination_state = 'Jalisco'
     and t.estimated_unload_end_at is not null),
  'unloading', 'a trip MTY -> GDL is unloading with an estimated end'
);
select is(
  (select e.estimated_unload_end_at from public.trip_events e
   where e.trip_id = '5eed0008-0000-4000-8000-000000000001' and e.event_type = 'unloading_started'),
  (select estimated_unload_end_at from public.trips where id = '5eed0008-0000-4000-8000-000000000001'),
  'the estimate is recorded in the timeline (D11)'
);
select results_eq(
  $$ select a.source::text, a.city, a.available_from
     from public.vehicle_availability a
     where a.vehicle_id = '5eed0004-0000-4000-8000-000000000002' and a.archived_at is null $$,
  $$ select 'trip_estimate', 'Guadalajara', estimated_unload_end_at
     from public.trips where id = '5eed0008-0000-4000-8000-000000000001' $$,
  'its unit is available in Guadalajara from the estimated end of unloading'
);
select is(
  (select l.id
   from public.vehicles v
   join public.vehicle_availability a on a.vehicle_id = v.id and a.archived_at is null
   join public.loads l
     on l.status = 'published'
    and l.unit_type = v.unit_type
    and l.weight_kg <= v.capacity_kg
    and (l.volume_m3 is null or l.volume_m3 <= v.capacity_m3)
    and l.special_requirements <@ v.features
    and l.pickup_window_end > a.available_from
    and extensions.st_dwithin(l.origin_location, a.location, 150000)
   where v.id = '5eed0004-0000-4000-8000-000000000002'
   order by extensions.st_distance(l.origin_location, a.location)
   limit 1),
  '5eed0005-0000-4000-8000-000000000002'::uuid,
  'the closest compatible open load for that unit is the GDL -> MTY return trip'
);
select results_eq(
  $$ select origin_city, destination_city from public.loads where id = '5eed0005-0000-4000-8000-000000000002' $$,
  $$ values ('Guadalajara', 'Monterrey') $$,
  'the return load goes from Guadalajara to Monterrey'
);

-- ---------------------------------------------------------------------------
-- What each demo profile sees (RLS) and can do (RPCs)
-- ---------------------------------------------------------------------------
set local role authenticated;

-- Ana Garza, shipper (Aceros del Norte)
select tests.login('5eed0001-0000-4000-8000-000000000002');
select is(
  (select count(*)::int from public.loads), 5, 'the shipper sees only the loads of its company'
);
select ok(
  (select count(*) > 0 from public.trip_locations where trip_id = '5eed0008-0000-4000-8000-000000000001'),
  'the shipper follows the active trip on the map'
);

-- Jorge Villarreal, carrier (Transportes Regios)
select tests.login('5eed0001-0000-4000-8000-000000000005');
select is(
  (select count(*)::int from public.loads where status in ('published', 'negotiating')), 8,
  'an approved carrier sees every open load'
);
select is(
  (select count(*)::int from public.loads where status = 'draft'), 0, 'a carrier never sees drafts'
);

-- Pedro López, operator of the trip in unloading
select tests.login('5eed0001-0000-4000-8000-000000000008');
select is(
  (select count(*)::int from public.trips), 2, 'the operator sees only the trips assigned to it'
);
select is(
  (select count(*)::int from public.messages m join public.conversations c on c.id = m.conversation_id
   where c.trip_id = '5eed0008-0000-4000-8000-000000000001'),
  2, 'the operator reads the chat of its trip'
);
select lives_ok(
  $$ select public.set_estimated_unload_end('5eed0008-0000-4000-8000-000000000001', now() + interval '1 hour') $$,
  'the operator can update the estimated end of unloading'
);

-- Miguel Hernández, operator of the assigned trip
select tests.login('5eed0001-0000-4000-8000-000000000010');
select lives_ok(
  $$ select public.record_trip_event('5eed0008-0000-4000-8000-000000000002', 'departed', now(), 25.7700, -100.1700) $$,
  'the operator of the assigned trip can depart'
);

-- Luis Ramírez, shipper (Alimentos de Occidente): his counteroffer is pending.
select tests.login('5eed0001-0000-4000-8000-000000000003');
select is(
  (select side::text from public.offers where load_id = '5eed0005-0000-4000-8000-000000000007' and status = 'pending'),
  'shipper', 'the shipper countered and waits for the carrier'
);

-- G6 acceptance: Ana's trip shares the Constancia of Transportes Regios (and
-- the unit's and the operator's documents, never an id).
select tests.login('5eed0001-0000-4000-8000-000000000002');
select is(
  (select array_agg(requirement_code order by requirement_code)
   from public.trip_shared_documents('5eed0008-0000-4000-8000-000000000001')),
  array['federal_driver_license', 'tax_status_certificate', 'vehicle_insurance_policy', 'vehicle_permit',
        'vehicle_registration_card'],
  'Ana sees the documents shared on her trip, never an id'
);

-- Admin
select tests.login('5eed0001-0000-4000-8000-000000000001');
select is(
  (select count(*)::int from public.loads where id::text like '5eed0005-%'), 15, 'the admin sees every load'
);

reset role;

select * from finish();
rollback;
