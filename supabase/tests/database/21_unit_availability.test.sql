-- F5 · Availability of a unit when its next trip is cancelled or reassigned:
--   * committing a unit to its next trip ends whatever availability it had
--     (trip estimate or manual), and the trip events it misses meanwhile are
--     kept as history;
--   * cancelling that trip before it starts, or assigning it another unit,
--     gives the unit back the availability it would have had without it;
--   * clearing the availability, or setting off on a trip after it was
--     written, means it is not restored;
--   * a restored row records the row it copies and the trip that let go (F13);
--   * matching carries the delay of a late trip through every booked trip.
begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated;

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

-- The shipper publishes a load (reverse: GDL -> MTY) and the carrier offers
-- for it, naming p_vehicle_id; the shipper accepts. Returns the trip id.
create function tests.contract(p_name text, p_reverse boolean, p_days integer, p_vehicle_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_load uuid;
  v_offer uuid;
  v_trip uuid;
begin
  perform tests.login('af500000-0000-4000-8000-000000000001');
  v_load := public.create_load(tests.payload(p_reverse, p_days));
  perform public.publish_load(v_load);
  perform tests.login('af500000-0000-4000-8000-000000000002');
  v_offer := public.make_offer(v_load, 3000000, null, p_vehicle_id);
  perform tests.login('af500000-0000-4000-8000-000000000001');
  v_trip := public.accept_offer(v_offer);
  insert into tests.vals values (p_name, v_trip), ('load_' || p_name, v_load);
  return v_trip;
end;
$$;

-- Records an operator status event of trip A, p_seconds after the transaction started.
create function tests.step(p_event text, p_seconds integer, p_estimate timestamptz default null,
                           p_receiver text default null)
returns uuid
language sql
as $$
  select public.record_trip_event(
    tests.val('trip_a'), p_event::public.trip_event_type, now() + make_interval(secs => p_seconds),
    20.6597, -103.3496, null, p_estimate, null, null, p_receiver
  );
$$;

create function tests.availability(p_vehicle_id uuid)
returns table (source text, city text, available_from timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.source::text, a.city, a.available_from from public.vehicle_availability a
  where a.vehicle_id = p_vehicle_id and a.archived_at is null
$$;

grant execute on all functions in schema tests to authenticated;

-- Users: ...01 shipper S   ...02 carrier A   ...03 operator O   ...04 operator P (both of A)
select tests.new_user('af500000-0000-4000-8000-000000000001', 'sara@f5.test', 'shipper');
select tests.new_user('af500000-0000-4000-8000-000000000002', 'ana@f5.test', 'manager');
select tests.new_user('af500000-0000-4000-8000-000000000003', 'oscar@f5.test', 'operator');
select tests.new_user('af500000-0000-4000-8000-000000000004', 'pablo@f5.test', 'operator');

insert into public.companies (id, type, legal_name, rfc, status) values
  ('cf500000-0000-4000-8000-000000000001', 'shipper', 'Envíos Omega SA de CV', 'EOM050505GH5', 'approved'),
  ('cf500000-0000-4000-8000-000000000002', 'carrier', 'Fletes Delta SA de CV', 'FDE040404CD4', 'approved');
update public.profiles set company_id = 'cf500000-0000-4000-8000-000000000001'
where id = 'af500000-0000-4000-8000-000000000001';
update public.profiles set company_id = 'cf500000-0000-4000-8000-000000000002'
where id in ('af500000-0000-4000-8000-000000000002', 'af500000-0000-4000-8000-000000000003',
             'af500000-0000-4000-8000-000000000004');

insert into public.operators (id, company_id, profile_id, full_name) values
  ('df500000-0000-4000-8000-000000000003', 'cf500000-0000-4000-8000-000000000002',
   'af500000-0000-4000-8000-000000000003', 'Óscar Operador'),
  ('df500000-0000-4000-8000-000000000004', 'cf500000-0000-4000-8000-000000000002',
   'af500000-0000-4000-8000-000000000004', 'Pablo Operador');
-- D16 (G3): assign_trip needs a current license of a suitable type.
update public.operators set license_type = 'E', license_expires_on = current_date + 365
where license_type is null;
-- V carries trip A and is booked for its next trips; W is a second unit.
insert into public.vehicles (id, company_id, kind, plate, unit_type, capacity_kg) values
  ('ef500000-0000-4000-8000-000000000001', 'cf500000-0000-4000-8000-000000000002', 'rigid', 'FFF5001', 'dry_van', 30000),
  ('ef500000-0000-4000-8000-000000000002', 'cf500000-0000-4000-8000-000000000002', 'rigid', 'FFF5002', 'dry_van', 30000);

-- Photos are not what these tests are about (B23 covers the gate).
update public.trip_evidence_requirements set min_photos = 0;
-- Every required document of V and W approved, so they can be assigned and matched.
insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path, status, expires_at)
select v.company_id, r.id, 'vehicle', v.id, v.company_id || '/vehicle/' || v.id || '/' || gen_random_uuid() || '.pdf',
       'approved', case when r.requires_expiry then now() + interval '1 year' end
from public.vehicles v
cross join public.document_requirements r
where v.company_id = 'cf500000-0000-4000-8000-000000000002'
  and r.owner_type = 'vehicle' and r.is_required and r.archived_at is null;

-- ---------------------------------------------------------------------------
-- Trip A (MTY -> GDL) on unit V with operator O, up to unloading
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.contract('trip_a', false, 1, null);
select tests.login('af500000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('trip_a'), 'ef500000-0000-4000-8000-000000000001',
                          'df500000-0000-4000-8000-000000000003');
select tests.login('af500000-0000-4000-8000-000000000003');
select lives_ok(
  $$ select tests.step('departed', 1);
     select tests.step('arrived_at_pickup', 2);
     select tests.step('loading_started', 3);
     select tests.step('loading_finished', 4);
     select tests.step('arrived_at_delivery', 5);
     select tests.step('unloading_started', 6, now() + interval '2 hours') $$,
  'O takes trip A up to unloading, with an estimated end'
);
select results_eq(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000001') $$,
  $$ values ('trip_estimate', 'Guadalajara', now() + interval '2 hours') $$,
  'V is available at the destination of trip A'
);

-- ---------------------------------------------------------------------------
-- Cancelling the return trip gives V its estimate back
-- ---------------------------------------------------------------------------
-- V is booked for two return trips, B and B2.
select tests.contract('trip_b', true, 1, 'ef500000-0000-4000-8000-000000000001');
select tests.contract('trip_b2', true, 1, 'ef500000-0000-4000-8000-000000000001');
select is_empty(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000001') $$,
  'booking V for its return trip ends the estimate of trip A'
);

-- Matching: trip A runs late (ends at +5 days). V is free only once it has
-- also done its return trips: B ends 4 days after its delivery window
-- (+6d 6h), so B2 (same windows) ends 5 days 6 hours late (+7d 12h).
reset role;
update public.trips set estimated_unload_end_at = now() + interval '5 days' where id = tests.val('trip_a');
set local role authenticated;
select tests.login('af500000-0000-4000-8000-000000000001');
insert into tests.vals select 'load_late', public.create_load(tests.payload(false, 5));
select public.publish_load(tests.val('load_late'));
insert into tests.vals select 'load_later', public.create_load(tests.payload(false, 9));
select public.publish_load(tests.val('load_later'));
reset role;
select results_eq(
  $$ select start_city, available_from, is_return_trip
     from public.match_pairs('ef500000-0000-4000-8000-000000000001', tests.val('load_later'), 1000) $$,
  $$ values ('Monterrey', now() + interval '7 days 12 hours', true) $$,
  'a unit whose current trip runs late is free once it has also done the trips it is booked for'
);
select is_empty(
  $$ select 1 from public.match_pairs('ef500000-0000-4000-8000-000000000001', tests.val('load_late'), 1000) $$,
  'a load whose pickup closes after the late trip but before the booked trips end is not offered'
);
update public.trips set estimated_unload_end_at = now() + interval '2 hours' where id = tests.val('trip_a');

set local role authenticated;
select tests.login('af500000-0000-4000-8000-000000000001');
select public.cancel_trip(tests.val('trip_b'), 'El cliente ya no necesita el envío');
select is_empty(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000001') $$,
  'cancelling B leaves V without availability: it is still booked for B2'
);
-- While booked, a new estimate of trip A does not make V available...
select tests.login('af500000-0000-4000-8000-000000000003');
select public.set_estimated_unload_end(tests.val('trip_a'), now() + interval '3 hours', now() + interval '7 seconds');
select is_empty(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000001') $$,
  'a new estimate of trip A does not make the booked V available'
);
-- ...but is kept (archived) for when the booking goes away.
reset role;
select results_eq(
  $$ select a.source::text, a.available_from, a.ended_by_trip_id is not null
     from public.vehicle_availability a
     where a.vehicle_id = 'ef500000-0000-4000-8000-000000000001'
     order by a.created_at desc limit 1 $$,
  $$ values ('trip_estimate', now() + interval '3 hours', true) $$,
  'the estimate V misses while booked is kept as history'
);
set local role authenticated;

select tests.login('af500000-0000-4000-8000-000000000001');
select public.cancel_trip(tests.val('trip_b2'), 'El cliente ya no necesita el envío');
select results_eq(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000001') $$,
  $$ values ('trip_estimate', 'Guadalajara', now() + interval '3 hours') $$,
  'cancelling its last booking gives V the latest estimate of trip A'
);

-- Trip A ends while V is booked for trip C; the carrier cancels C.
select tests.contract('trip_c', true, 1, 'ef500000-0000-4000-8000-000000000001');
select tests.login('af500000-0000-4000-8000-000000000003');
select tests.step('unloading_finished', 14, null, 'Rosa Almacén');
select is_empty(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000001') $$,
  'the end of trip A does not make the booked V available'
);
select tests.login('af500000-0000-4000-8000-000000000002');
select public.cancel_trip(tests.val('trip_c'), 'Sin operador disponible');
select results_eq(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000001') $$,
  $$ values ('trip_estimate', 'Guadalajara', now() + interval '14 seconds') $$,
  'cancelling C makes V available where and when trip A really ended'
);
select is(
  (select count(*) from public.vehicle_availability
   where vehicle_id = 'ef500000-0000-4000-8000-000000000001' and archived_at is null),
  1::bigint,
  'V has a single active availability'
);

-- ---------------------------------------------------------------------------
-- Manual availability: ended by the booking, restored by its cancellation
-- ---------------------------------------------------------------------------
select tests.login('af500000-0000-4000-8000-000000000002');
select public.set_vehicle_availability('ef500000-0000-4000-8000-000000000002', now() + interval '1 day',
                                       25.6866, -100.3161, 'Monterrey', 'Nuevo León');
select tests.contract('trip_d', false, 2, 'ef500000-0000-4000-8000-000000000002');
select is_empty(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000002') $$,
  'booking W ends its manual availability too'
);
select tests.login('af500000-0000-4000-8000-000000000001');
select public.cancel_trip(tests.val('trip_d'), 'Cambio de planes');
select results_eq(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000002') $$,
  $$ values ('manual', 'Monterrey', now() + interval '1 day') $$,
  'cancelling the booking gives W its manual availability back'
);
-- F13: the restored row says what it copies and which trip let go of W; who
-- set the availability (created_by) is still the carrier.
reset role;
select results_eq(
  $$ select r.created_by, r.restored_from_id, r.restored_by_trip_id, o.source::text, o.archived_at is not null
     from public.vehicle_availability r
     join public.vehicle_availability o on o.id = r.restored_from_id
     where r.vehicle_id = 'ef500000-0000-4000-8000-000000000002' and r.archived_at is null $$,
  $$ select 'af500000-0000-4000-8000-000000000002'::uuid, o.id, tests.val('trip_d'), 'manual', true
     from public.vehicle_availability o
     where o.vehicle_id = 'ef500000-0000-4000-8000-000000000002' and o.ended_by_trip_id = tests.val('trip_d') $$,
  'the restored availability records the row it copies and the cancelled trip, and keeps its creator'
);
select is(
  (select count(*) from public.vehicle_availability
   where vehicle_id = 'ef500000-0000-4000-8000-000000000002'
     and restored_from_id is null and restored_by_trip_id is not null),
  0::bigint,
  'only restored rows carry the trip that restored them'
);
set local role authenticated;

-- The carrier sets a new availability while W is booked: it is theirs to keep.
select tests.contract('trip_e', false, 2, 'ef500000-0000-4000-8000-000000000002');
select tests.login('af500000-0000-4000-8000-000000000002');
select public.set_vehicle_availability('ef500000-0000-4000-8000-000000000002', now() + interval '2 days',
                                       25.4232, -101.0053, 'Saltillo', 'Coahuila');
select public.cancel_trip(tests.val('trip_e'), 'Cambio de planes');
select results_eq(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000002') $$,
  $$ values ('manual', 'Saltillo', now() + interval '2 days') $$,
  'an availability set during the booking is kept when the booking is cancelled'
);

-- Clearing the availability is the carrier's call: a later cancellation does
-- not bring it back.
select tests.contract('trip_g', false, 2, 'ef500000-0000-4000-8000-000000000002');
select tests.login('af500000-0000-4000-8000-000000000002');
select public.set_vehicle_availability('ef500000-0000-4000-8000-000000000002', now() + interval '2 days',
                                       25.4232, -101.0053, 'Saltillo', 'Coahuila');
select public.clear_vehicle_availability('ef500000-0000-4000-8000-000000000002');
select public.cancel_trip(tests.val('trip_g'), 'Cambio de planes');
select is_empty(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000002') $$,
  'an availability the carrier cleared stays cleared'
);
select public.set_vehicle_availability('ef500000-0000-4000-8000-000000000002', now() + interval '2 days',
                                       25.4232, -101.0053, 'Saltillo', 'Coahuila');

-- ---------------------------------------------------------------------------
-- The offer names V, but the carrier assigns W
-- ---------------------------------------------------------------------------
select tests.contract('trip_f', true, 2, 'ef500000-0000-4000-8000-000000000001');
select is_empty(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000001') $$,
  'the offer of trip F books V'
);
select tests.login('af500000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('trip_f'), 'ef500000-0000-4000-8000-000000000002',
                          'df500000-0000-4000-8000-000000000004');
select results_eq(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000001') $$,
  $$ values ('trip_estimate', 'Guadalajara', now() + interval '14 seconds') $$,
  'assigning W instead gives V its availability back'
);
select is_empty(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000002') $$,
  'and W, now assigned, loses its own'
);

-- Reassigned back to V: W gets its availability back.
select public.assign_trip(tests.val('trip_f'), 'ef500000-0000-4000-8000-000000000001',
                          'df500000-0000-4000-8000-000000000004');
select results_eq(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000002') $$,
  $$ values ('manual', 'Saltillo', now() + interval '2 days') $$,
  'reassigning the trip to V gives W its availability back'
);
select is_empty(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000001') $$,
  'and V, assigned again, loses its own'
);
-- Assigning the same unit again changes nothing.
select public.assign_trip(tests.val('trip_f'), 'ef500000-0000-4000-8000-000000000001',
                          'df500000-0000-4000-8000-000000000003');
select is_empty(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000001') $$,
  'changing only the operator keeps V booked'
);

-- ---------------------------------------------------------------------------
-- Cancelling a trip that already started restores nothing: the unit is no
-- longer where its previous availability says.
-- ---------------------------------------------------------------------------
select tests.login('af500000-0000-4000-8000-000000000003');
select public.record_trip_event(tests.val('trip_f'), 'departed', now() + interval '20 seconds', 20.6597, -103.3496);
select tests.login('af500000-0000-4000-8000-000000000002');
select public.cancel_trip(tests.val('trip_f'), 'Falla mecánica');
select is_empty(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000001') $$,
  'cancelling a trip on its way leaves V without availability'
);

-- ---------------------------------------------------------------------------
-- Clearing while booked: nothing comes back
-- ---------------------------------------------------------------------------
-- W has its Saltillo availability; the booking ends it, then the carrier
-- clears the unit (nothing active to clear) and the booking is cancelled.
select tests.contract('trip_i', false, 2, 'ef500000-0000-4000-8000-000000000002');
select tests.login('af500000-0000-4000-8000-000000000002');
select public.clear_vehicle_availability('ef500000-0000-4000-8000-000000000002');
select public.cancel_trip(tests.val('trip_i'), 'Cambio de planes');
select is_empty(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000002') $$,
  'clearing a booked unit means the cancellation restores nothing'
);

-- ---------------------------------------------------------------------------
-- The unit set off after the row was written: nothing comes back
-- ---------------------------------------------------------------------------
-- W is assigned trip J (ending its Monterrey availability) and booked for
-- trip K; it sets off on J, J is cancelled, then K is cancelled.
select public.set_vehicle_availability('ef500000-0000-4000-8000-000000000002', now() + interval '1 day',
                                       25.6866, -100.3161, 'Monterrey', 'Nuevo León');
select tests.contract('trip_j', false, 2, 'ef500000-0000-4000-8000-000000000002');
select tests.login('af500000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('trip_j'), 'ef500000-0000-4000-8000-000000000002',
                          'df500000-0000-4000-8000-000000000004');
select tests.contract('trip_k', true, 4, 'ef500000-0000-4000-8000-000000000002');
select tests.login('af500000-0000-4000-8000-000000000004');
select public.record_trip_event(tests.val('trip_j'), 'departed', now() + interval '30 seconds', 25.6866, -100.3161);
select tests.login('af500000-0000-4000-8000-000000000002');
select public.cancel_trip(tests.val('trip_j'), 'Falla mecánica');
select public.cancel_trip(tests.val('trip_k'), 'Sin unidad');
select is_empty(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000002') $$,
  'a unit that set off since its availability was held back does not get it back'
);

-- ---------------------------------------------------------------------------
-- Matching: delays carry through every booked trip
-- ---------------------------------------------------------------------------
-- V sets off on trip P, which runs late (ends at +10 days); V is booked for
-- Q (GDL -> MTY, pickup +1 day, delivery ends +2 days 6 h) and then R
-- (MTY -> GDL, pickup +3 days, delivery ends +4 days 6 h). Q ends 9 days
-- late (+11 days 6 h), so R starts 8 days 6 h late and ends at +12 days 12 h.
select tests.contract('trip_p', false, 1, 'ef500000-0000-4000-8000-000000000001');
select tests.login('af500000-0000-4000-8000-000000000002');
select public.assign_trip(tests.val('trip_p'), 'ef500000-0000-4000-8000-000000000001',
                          'df500000-0000-4000-8000-000000000003');
select tests.login('af500000-0000-4000-8000-000000000003');
select public.record_trip_event(tests.val('trip_p'), 'departed', now() + interval '40 seconds', 25.6866, -100.3161);
select tests.contract('trip_q', true, 1, 'ef500000-0000-4000-8000-000000000001');
select tests.contract('trip_r', false, 3, 'ef500000-0000-4000-8000-000000000001');
insert into tests.vals select 'load_far', public.create_load(tests.payload(true, 14));
select public.publish_load(tests.val('load_far'));
reset role;
update public.trips set estimated_unload_end_at = now() + interval '10 days' where id = tests.val('trip_p');
select results_eq(
  $$ select start_city, available_from
     from public.match_pairs('ef500000-0000-4000-8000-000000000001', tests.val('load_far'), 1000) $$,
  $$ values ('Guadalajara', now() + interval '12 days 12 hours') $$,
  'the delay of the late trip carries through both booked trips'
);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- An archived unit gets nothing back
-- ---------------------------------------------------------------------------
select tests.contract('trip_h', false, 3, 'ef500000-0000-4000-8000-000000000002');
reset role;
update public.vehicles set archived_at = now() where id = 'ef500000-0000-4000-8000-000000000002';
set local role authenticated;
select tests.login('af500000-0000-4000-8000-000000000001');
select lives_ok(
  $$ select public.cancel_trip(tests.val('trip_h'), 'La unidad se dio de baja') $$,
  'the booking of an archived unit can be cancelled'
);
select is_empty(
  $$ select * from tests.availability('ef500000-0000-4000-8000-000000000002') $$,
  'an archived unit gets no availability back'
);

-- ---------------------------------------------------------------------------
-- No client can write the new column
-- ---------------------------------------------------------------------------
select ok(
  not has_column_privilege('authenticated', 'public.vehicle_availability', 'ended_by_trip_id', 'update')
  and not has_column_privilege('authenticated', 'public.vehicle_availability', 'ended_by_trip_id', 'insert'),
  'clients cannot write ended_by_trip_id'
);
select ok(
  has_column_privilege('authenticated', 'public.vehicle_availability', 'ended_by_trip_id', 'select'),
  'the carrier can read it with the rest of the row (RLS still applies)'
);
reset role;

select * from finish();
rollback;
