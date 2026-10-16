-- F2 · Database integrity fixes:
--   * deleting an account erases it from the immutable trip timeline and
--     evidence instead of failing, and changes nothing else in those rows;
--   * the Edge Function RPCs require the service role claim, not only the grant;
--   * report_incident is idempotent on p_client_event_id;
--   * reassigning a trip tells the operator taken off it;
--   * a unit committed to its return trip keeps no trip_estimate availability.
begin;
create extension if not exists pgtap with schema extensions;

select plan(40);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated, service_role;

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

create function tests.payload(p_reverse boolean, p_days integer default 1)
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
  )
  from places;
$$;

create table tests.vals (name text primary key, id uuid);
grant select, insert on tests.vals to authenticated;

create function tests.val(p_name text)
returns uuid
language sql
stable
as $$ select id from tests.vals where name = p_name $$;

-- Records an operator status event of trip A, p_seconds after the transaction started.
create function tests.step(p_event text, p_seconds integer, p_estimate timestamptz default null,
                           p_receiver text default null, p_client_event_id uuid default null)
returns uuid
language sql
as $$
  select public.record_trip_event(
    tests.val('trip_a'), p_event::public.trip_event_type, now() + make_interval(secs => p_seconds),
    20.6597, -103.3496, null, p_estimate, null, p_client_event_id, p_receiver
  );
$$;

create function tests.active_availability(p_vehicle_id uuid)
returns table (source text)
language sql
stable
as $$
  select a.source::text from public.vehicle_availability a where a.vehicle_id = p_vehicle_id and a.archived_at is null
$$;

-- Rows of a user in the immutable tables, without the user column.
create table tests.snapshot (name text primary key, data jsonb);

grant execute on all functions in schema tests to authenticated, service_role;

-- Users: ...01 shipper S   ...02 carrier A   ...03 operator O   ...04 operator P (both of A)
select tests.new_user('af200000-0000-4000-8000-000000000001', 'sara@f2.test', 'shipper');
select tests.new_user('af200000-0000-4000-8000-000000000002', 'ana@f2.test', 'carrier');
select tests.new_user('af200000-0000-4000-8000-000000000003', 'oscar@f2.test', 'operator');
select tests.new_user('af200000-0000-4000-8000-000000000004', 'pablo@f2.test', 'operator');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('cf200000-0000-4000-8000-000000000001', 'shipper', 'Envíos Sigma SA de CV', 'ESI030303EF3', 'approved'),
  ('cf200000-0000-4000-8000-000000000002', 'carrier', 'Fletes Alfa SA de CV', 'FAL010101AB1', 'approved');
update public.profiles set company_id = 'cf200000-0000-4000-8000-000000000001'
where id = 'af200000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'cf200000-0000-4000-8000-000000000002'
where id in ('af200000-0000-4000-8000-000000000002', 'af200000-0000-4000-8000-000000000003',
             'af200000-0000-4000-8000-000000000004');

insert into public.operators (id, company_id, profile_id, full_name) values
  ('df200000-0000-4000-8000-000000000003', 'cf200000-0000-4000-8000-000000000002',
   'af200000-0000-4000-8000-000000000003', 'Óscar Operador'),
  ('df200000-0000-4000-8000-000000000004', 'cf200000-0000-4000-8000-000000000002',
   'af200000-0000-4000-8000-000000000004', 'Pablo Operador');
-- V carries trip A and then the return trip B; W is a second unit.
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('ef200000-0000-4000-8000-000000000001', 'cf200000-0000-4000-8000-000000000002', 'rigid', 'FFF2001', 'dry_van', 30000),
  ('ef200000-0000-4000-8000-000000000002', 'cf200000-0000-4000-8000-000000000002', 'rigid', 'FFF2002', 'dry_van', 30000);

-- Photos are not what these tests are about (B23 covers the gate).
update public.trip_evidence_requirements set min_photos = 0;
-- Every required document of V approved, so matching considers it (B08).
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.id = 'ef200000-0000-4000-8000-000000000001'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- ---------------------------------------------------------------------------
-- Trip A (MTY -> GDL) on unit V with operator O, up to unloading
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('af200000-0000-4000-8000-000000000001');
insert into tests.vals select 'load_a', public.create_load(tests.payload(false));
select public.publish_load(tests.val('load_a'));
select tests.login('af200000-0000-4000-8000-000000000002');
insert into tests.vals select 'offer_a', public.make_offer(tests.val('load_a'), 3400000);
select tests.login('af200000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip_a', public.accept_offer(tests.val('offer_a'));
select tests.login('af200000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('trip_a'), 'ef200000-0000-4000-8000-000000000001',
                          'df200000-0000-4000-8000-000000000003');

select tests.login('af200000-0000-4000-8000-000000000003');
select lives_ok(
  $$ select tests.step('departed', 1);
     select tests.step('arrived_at_pickup', 2);
     select tests.step('loading_started', 3);
     select tests.step('loading_finished', 4) $$,
  'the operator takes the cargo'
);

-- ---------------------------------------------------------------------------
-- report_incident: idempotent on p_client_event_id
-- ---------------------------------------------------------------------------
insert into tests.vals select 'incident', public.report_incident(
  tests.val('trip_a'), 'delay', 'Tráfico en la autopista', now() + interval '5 seconds', 22.15, -100.98,
  'bf200000-0000-4000-8000-000000000001'
);
select is(
  public.report_incident(
    tests.val('trip_a'), 'delay', 'Tráfico en la autopista', now() + interval '5 seconds', 22.15, -100.98,
    'bf200000-0000-4000-8000-000000000001'
  ),
  tests.val('incident'),
  'a retry with the same key returns the incident already reported'
);
select is(
  (select count(*) from public.incidents where trip_id = tests.val('trip_a')), 1::bigint,
  'the retry does not duplicate the incident'
);
select results_eq(
  $$ select event_type::text, incident_id from public.trip_events
     where trip_id = tests.val('trip_a') and client_event_id = 'bf200000-0000-4000-8000-000000000001' $$,
  $$ values ('incident_reported', tests.val('incident')) $$,
  'the key is kept on the incident_reported event, once'
);
select isnt(
  public.report_incident(
    tests.val('trip_a'), 'delay', 'Tráfico en la autopista', now() + interval '6 seconds', 22.15, -100.98,
    'bf200000-0000-4000-8000-000000000002'
  ),
  tests.val('incident'),
  'another key reports another incident'
);
select isnt(
  public.report_incident(tests.val('trip_a'), 'other', 'Sin llave de cliente'),
  tests.val('incident'),
  'without a key every call reports a new incident (web)'
);
select is(
  (select count(*) from public.incidents where trip_id = tests.val('trip_a')), 3::bigint,
  'three incidents in total'
);
select lives_ok(
  $$ select tests.step('arrived_at_delivery', 10, null, null, 'bf200000-0000-4000-8000-000000000003') $$,
  'the operator arrives at the delivery'
);
select throws_ok(
  $$ select public.report_incident(tests.val('trip_a'), 'delay', 'Otra', null, null, null,
                                   'bf200000-0000-4000-8000-000000000003') $$,
  '22023', 'client_event_id belongs to another event',
  'a key already used by a status event is refused'
);

-- Evidence of O, to delete O's account at the end.
reset role;
insert into storage.objects (bucket_id, name, owner_id, metadata)
values ('evidence', tests.val('trip_a') || '/delivery/bf200000-0000-4000-8000-0000000000aa.jpg',
        'af200000-0000-4000-8000-000000000003', '{"mimetype": "image/jpeg", "size": 4096}');
set local role authenticated;
select lives_ok(
  $$ select public.add_trip_evidence(
       tests.val('trip_a'), 'delivery',
       tests.val('trip_a') || '/delivery/bf200000-0000-4000-8000-0000000000aa.jpg',
       repeat('cd', 32), now() + interval '11 seconds', 20.6597, -103.3496
     ) $$,
  'the operator registers a delivery photo'
);
select lives_ok(
  $$ select tests.step('unloading_started', 12, now() + interval '2 hours') $$,
  'the operator starts unloading with an estimated end'
);
reset role;
select results_eq(
  $$ select * from tests.active_availability('ef200000-0000-4000-8000-000000000001') $$,
  $$ values ('trip_estimate') $$,
  'the estimated end of unloading makes V available at the destination (return-trip mode)'
);

-- ---------------------------------------------------------------------------
-- Return trip B (GDL -> MTY) contracted with unit V before A ends
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('af200000-0000-4000-8000-000000000001');
insert into tests.vals select 'load_b', public.create_load(tests.payload(true));
select public.publish_load(tests.val('load_b'));
select tests.login('af200000-0000-4000-8000-000000000002');
insert into tests.vals select 'offer_b', public.make_offer(
  tests.val('load_b'), 3000000, null, 'ef200000-0000-4000-8000-000000000001'
);
select tests.login('af200000-0000-4000-8000-000000000001');
insert into tests.vals select 'trip_b', public.accept_offer(tests.val('offer_b'));
reset role;
select is_empty(
  $$ select * from tests.active_availability('ef200000-0000-4000-8000-000000000001') $$,
  'contracting the return trip with V ends the estimate of trip A'
);

-- A later load C (MTY -> GDL): matching starts V from the end of trip B
-- (Monterrey), not from the end of trip A (Guadalajara), although B is not
-- assigned yet.
set local role authenticated;
select tests.login('af200000-0000-4000-8000-000000000001');
insert into tests.vals select 'load_c', public.create_load(tests.payload(false, 3));
select public.publish_load(tests.val('load_c'));
reset role;
select results_eq(
  $$ select start_city, is_return_trip from public.match_pairs('ef200000-0000-4000-8000-000000000001',
                                                         tests.val('load_c'), 1000) $$,
  $$ values ('Monterrey', true) $$,
  'matching starts the booked unit from the trip it is booked for'
);
update public.trips set estimated_unload_end_at = now() + interval '5 days' where id = tests.val('trip_a');
select results_eq(
  $$ select start_city, is_return_trip from public.match_pairs('ef200000-0000-4000-8000-000000000001',
                                                               tests.val('load_c'), 1000) $$,
  $$ values ('Monterrey', true) $$,
  'even when the current trip runs late, the booked trip decides where the unit starts'
);
update public.trips set estimated_unload_end_at = now() + interval '2 hours' where id = tests.val('trip_a');

set local role authenticated;
select tests.login('af200000-0000-4000-8000-000000000003');
select lives_ok(
  $$ select public.set_estimated_unload_end(tests.val('trip_a'), now() + interval '3 hours',
                                            now() + interval '13 seconds') $$,
  'O updates the estimated end of unloading'
);
reset role;
select is_empty(
  $$ select * from tests.active_availability('ef200000-0000-4000-8000-000000000001') $$,
  'a new estimate does not make V available again'
);
set local role authenticated;
select lives_ok(
  $$ select tests.step('unloading_finished', 14, null, 'Rosa Almacén') $$,
  'O finishes unloading trip A'
);
reset role;
select is_empty(
  $$ select * from tests.active_availability('ef200000-0000-4000-8000-000000000001') $$,
  'the end of trip A does not make V available again: it is committed to trip B'
);
select is(
  (select count(*) from public.vehicle_availability where vehicle_id = 'ef200000-0000-4000-8000-000000000001'),
  1::bigint,
  'no new availability row was written for V'
);

-- A unit assigned to a trip loses the estimate of its previous trip too.
insert into public.vehicle_availability (company_id, vehicle_id, available_from, location, city, state, source)
values ('cf200000-0000-4000-8000-000000000002', 'ef200000-0000-4000-8000-000000000002', now(),
        extensions.st_setsrid(extensions.st_makepoint(-103.3496, 20.6597), 4326)::extensions.geography,
        'Guadalajara', 'Jalisco', 'trip_estimate');

-- ---------------------------------------------------------------------------
-- Reassignment of trip B: O, then P
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.login('af200000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('trip_b'), 'ef200000-0000-4000-8000-000000000001',
                          'df200000-0000-4000-8000-000000000003');
select public.assign_trip(tests.val('trip_b'), 'ef200000-0000-4000-8000-000000000001',
                          'df200000-0000-4000-8000-000000000003');
reset role;
select is_empty(
  $$ select 1 from public.notifications where type = 'trip_unassigned' $$,
  'assigning the same operator again tells no one they were taken off'
);
set local role authenticated;
select tests.login('af200000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('trip_b'), 'ef200000-0000-4000-8000-000000000002',
                          'df200000-0000-4000-8000-000000000004');
reset role;
select results_eq(
  $$ select user_id, data from public.notifications where type = 'trip_unassigned' $$,
  $$ values ('af200000-0000-4000-8000-000000000003'::uuid,
             jsonb_build_object('loadId', tests.val('load_b'), 'originCity', 'Guadalajara',
                                'destinationCity', 'Monterrey')) $$,
  'the operator taken off the trip is told, without a link to the trip'
);
select is(
  (select count(*) from public.notifications
   where type = 'trip_assigned' and user_id = 'af200000-0000-4000-8000-000000000004'
     and data ->> 'tripId' = tests.val('trip_b')::text),
  1::bigint,
  'the new operator gets the assignment'
);
select is_empty(
  $$ select * from tests.active_availability('ef200000-0000-4000-8000-000000000002') $$,
  'assigning W to a trip ends the estimate W had'
);

-- ---------------------------------------------------------------------------
-- Deleting the account of operator O
-- ---------------------------------------------------------------------------
insert into tests.snapshot
select 'events', jsonb_agg(to_jsonb(e) - 'actor_id' order by e.id)
from public.trip_events e where e.actor_id = 'af200000-0000-4000-8000-000000000003';
insert into tests.snapshot
select 'evidence', jsonb_agg(to_jsonb(e) - 'uploaded_by' order by e.id)
from public.trip_evidence e where e.uploaded_by = 'af200000-0000-4000-8000-000000000003';
insert into tests.snapshot
select 'event_ids', jsonb_agg(e.id order by e.id)
from public.trip_events e where e.actor_id = 'af200000-0000-4000-8000-000000000003';
insert into tests.snapshot
select 'evidence_ids', jsonb_agg(e.id order by e.id)
from public.trip_evidence e where e.uploaded_by = 'af200000-0000-4000-8000-000000000003';

select is(
  jsonb_array_length((select data from tests.snapshot where name = 'events')) >= 8
  and jsonb_array_length((select data from tests.snapshot where name = 'evidence')) = 1,
  true,
  'O recorded events and uploaded evidence'
);

-- The trigger still rejects every other change.
select throws_ok(
  $$ update public.trip_events set notes = 'x', actor_id = null
     where actor_id = 'af200000-0000-4000-8000-000000000003' $$,
  '42501', 'trip_events is immutable', 'erasing the actor together with another change is rejected'
);
select throws_ok(
  $$ update public.trip_events set actor_id = 'af200000-0000-4000-8000-000000000002'
     where actor_id = 'af200000-0000-4000-8000-000000000003' $$,
  '42501', 'trip_events is immutable', 'the actor cannot be replaced by another user'
);
select throws_ok(
  $$ update public.trip_events set actor_id = actor_id where trip_id = tests.val('trip_a') $$,
  '42501', 'trip_events is immutable', 'an update that erases nothing is rejected'
);
select throws_ok(
  $$ update public.trip_evidence set sha256 = repeat('ab', 32), uploaded_by = null $$,
  '42501', 'trip_evidence is immutable', 'erasing the uploader together with another change is rejected'
);
select throws_ok(
  $$ delete from public.trip_events where actor_id = 'af200000-0000-4000-8000-000000000003' $$,
  '42501', 'trip_events is immutable', 'events still cannot be deleted'
);
select throws_ok(
  $$ delete from public.trip_evidence $$,
  '42501', 'trip_evidence is immutable', 'evidence still cannot be deleted'
);

select lives_ok(
  $$ delete from auth.users where id = 'af200000-0000-4000-8000-000000000003' $$,
  'the account of an operator with events and evidence can be deleted'
);
select is(
  (select jsonb_agg(to_jsonb(e) - 'actor_id' order by e.id) from public.trip_events e
   where e.id in (select jsonb_array_elements_text(data)::uuid from tests.snapshot where name = 'event_ids')),
  (select data from tests.snapshot where name = 'events'),
  'the events stay, unchanged except for the actor'
);
select is_empty(
  $$ select 1 from public.trip_events e
     where e.id in (select jsonb_array_elements_text(data)::uuid from tests.snapshot where name = 'event_ids')
       and e.actor_id is not null $$,
  'the deleted user is no longer the actor of any event'
);
select is(
  (select jsonb_agg(to_jsonb(e) - 'uploaded_by' order by e.id) from public.trip_evidence e
   where e.id in (select jsonb_array_elements_text(data)::uuid from tests.snapshot where name = 'evidence_ids')
     and e.uploaded_by is null),
  (select data from tests.snapshot where name = 'evidence'),
  'the evidence stays, unchanged except for the uploader, which is erased'
);

-- ---------------------------------------------------------------------------
-- Edge Function RPCs: the service role claim, not only the grant
-- ---------------------------------------------------------------------------
-- Even if a grant to authenticated slipped in, a user JWT is refused.
grant execute on function public.claim_notifications(integer, integer) to authenticated;
grant execute on function public.record_notification_dispatch(jsonb) to authenticated;
grant execute on function public.delete_push_tokens(text[]) to authenticated;

set local role authenticated;
select tests.login('af200000-0000-4000-8000-000000000002');
select throws_ok(
  $$ select * from public.claim_notifications(10, 60) $$,
  '42501', 'service role required', 'a user cannot claim notifications even with the grant'
);
select throws_ok(
  $$ select public.record_notification_dispatch('[]') $$,
  '42501', 'service role required', 'a user cannot record dispatch results even with the grant'
);
select throws_ok(
  $$ select public.delete_push_tokens(array['ExponentPushToken[abcdefgh]']) $$,
  '42501', 'service role required', 'a user cannot delete push tokens even with the grant'
);
reset role;

-- The service role database role without the service role JWT is refused too.
set local role service_role;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select * from public.claim_notifications(10, 60) $$,
  '42501', 'service role required', 'the dispatcher RPCs need the service role claim'
);
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select lives_ok(
  $$ select * from public.claim_notifications(10, 60);
     select public.record_notification_dispatch('[]');
     select public.delete_push_tokens(array['ExponentPushToken[abcdefgh]']) $$,
  'the service role key runs them'
);
reset role;

select * from finish();
rollback;
