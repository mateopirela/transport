-- I7 · Carga de regreso (D40): when a trip reaches its destination, or its
-- operator's location comes within 50 km of it (whichever happens first), the
-- platform looks for compatible loads near that destination for when the unit
-- is free, so the truck does not go back empty. If there is at least one, the
-- managers of the carrier and the coordinators of the trip's business unit get
-- a `backhaul_suggestions` notification ("3 cargas cerca de Guadalajara para
-- cuando CS53-01 quede libre"), once per trip.
--
-- Nothing new is scored here: the loads are the ones B08's matching already
-- gives the unit (match_pairs, which starts a unit with a trip where the last
-- trip of its chain ends, at the estimated end of unloading of H5:
-- vehicle_trip_chain_end), with the reach-in-time rule of notify_load_match
-- and notify_matches_for_vehicle. The ranking and the explanations stay in
-- packages/shared/src/matching (the apps show the best 3 in "Para el regreso").
--
--   * trip_backhaul_checks: one row per trip, written only by check_backhaul.
--     It is what makes the check "once per trip" (its primary key) and what
--     the trip screen reads to show "Para el regreso". RLS: the staff of the
--     trip's business unit and admins; never the operator, the shipper or
--     another carrier. No money in it (I.0.3).
--   * check_backhaul(trip, source): the check. `proximity` runs only for a
--     trip never checked; `arrival` runs again only when the proximity check
--     found nothing (the loads may have appeared since). Once a trip notified,
--     nothing runs again.
--   * Triggers: after an `arrived_at_delivery` event (trip_events), and after
--     each batch of GPS points (trip_locations, per statement) with a point
--     within 50 km of the destination. trip_events_suggest_backhaul must fire
--     after trip_events_record_dwell (H5), which records the arrival that
--     trip_end_estimate reads for when the unit is free: Postgres fires the
--     after triggers of a table in the order of their names.
--
-- Mirrors BACKHAUL_PROXIMITY_KM, BACKHAUL_RADIUS_KM and shouldCheckBackhaul
-- (packages/shared/src/backhaul.ts).
--
-- Lock order: the triggers run inside record_trip_event (trip row for update)
-- and record_trip_locations (trip row for share). check_backhaul only reads
-- the matching and writes its own row (insert … on conflict, so two batches
-- at the same time insert one row and notify once) and the notifications.

-- ---------------------------------------------------------------------------
-- 1. trip_backhaul_checks
-- ---------------------------------------------------------------------------
create table public.trip_backhaul_checks (
  trip_id uuid primary key references public.trips (id) on delete restrict,
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  -- What started the check: the arrival at the delivery or the operator's location.
  source text not null constraint trip_backhaul_checks_source check (source in ('arrival', 'proximity')),
  checked_at timestamptz not null default now(),
  -- When the unit is free (vehicle_trip_chain_end); null when the unit
  -- already has its next trip.
  available_from timestamptz,
  -- Compatible loads found at the check (0 when the unit has its next trip).
  load_count integer not null constraint trip_backhaul_checks_load_count check (load_count >= 0),
  -- When the staff was notified; only with at least one load.
  notified_at timestamptz,
  constraint trip_backhaul_checks_notified check (notified_at is null or load_count > 0)
);

comment on table public.trip_backhaul_checks is
  'Return-load check of each trip (I7, D40): once per trip, on arrival or within 50 km of the destination. Written only by check_backhaul.';

create index trip_backhaul_checks_vehicle_idx on public.trip_backhaul_checks (vehicle_id);

alter table public.trip_backhaul_checks enable row level security;
revoke all on table public.trip_backhaul_checks from anon, authenticated;
grant select on table public.trip_backhaul_checks to authenticated;

-- The staff of the trip's business unit (the managers, every unit of their
-- company) and admins. Not the operator nor the shipper: it is the carrier's
-- planning.
create policy trip_backhaul_checks_select
on public.trip_backhaul_checks
for select
to authenticated
using (
  exists (
    select 1 from public.trips t
    where t.id = trip_backhaul_checks.trip_id
      and (
        t.carrier_company_id = (select public.auth_fleet_company_id())
        or t.business_unit_id = any ((select public.auth_business_unit_ids())::uuid[])
      )
  )
  or (select public.is_admin())
);

-- ---------------------------------------------------------------------------
-- 2. The check
-- ---------------------------------------------------------------------------
create function public.check_backhaul(p_trip_id uuid, p_source text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  -- Mirrors BACKHAUL_RADIUS_KM: how far from the destination a pickup counts
  -- as "near" (the default radius of the recommendations, B08).
  c_radius_km constant numeric := 150;
  v_trip record;
  v_chain record;
  v_count integer := 0;
  v_notified boolean;
begin
  select t.id, t.status, t.vehicle_id, t.load_id, t.carrier_company_id, t.business_unit_id, l.destination_city
  into v_trip
  from public.trips t
  join public.loads l on l.id = t.load_id
  where t.id = p_trip_id;
  -- From the end of the loading on: the arrival event is inserted before
  -- record_trip_event moves the trip to at_delivery.
  if not found or v_trip.vehicle_id is null
     or v_trip.status not in ('in_transit', 'at_delivery', 'unloading') then
    return;
  end if;
  -- Once per trip (shouldCheckBackhaul).
  if exists (
    select 1 from public.trip_backhaul_checks c
    where c.trip_id = p_trip_id
      and (p_source = 'proximity' or c.source = 'arrival' or c.notified_at is not null)
  ) then
    return;
  end if;

  -- Where and when the unit is free: the end of the last trip of its chain.
  -- If that is another trip, the unit already has its next trip and does not
  -- go back empty: nothing to suggest.
  select * into v_chain from public.vehicle_trip_chain_end(v_trip.vehicle_id);
  if v_chain.load_id = v_trip.load_id then
    select count(*)::integer into v_count
    from public.match_pairs(v_trip.vehicle_id, null, c_radius_km) m
    where greatest(m.available_from, now()) + make_interval(secs => m.empty_km * 1.3 / 60 * 3600)
          <= m.pickup_window_end;
  end if;

  insert into public.trip_backhaul_checks as c (trip_id, vehicle_id, source, available_from, load_count, notified_at)
  values (
    p_trip_id, v_trip.vehicle_id, p_source,
    case when v_chain.load_id = v_trip.load_id then v_chain.available_from end,
    v_count, case when v_count > 0 then now() end
  )
  on conflict (trip_id) do update
    set source = excluded.source,
        checked_at = now(),
        available_from = excluded.available_from,
        load_count = excluded.load_count,
        notified_at = excluded.notified_at
    -- Only an arrival after a proximity check without notice.
    where c.notified_at is null and c.source = 'proximity' and excluded.source = 'arrival'
  returning c.notified_at is not null into v_notified;
  if not coalesce(v_notified, false) then
    return;
  end if;

  -- The managers and the coordinators of the trip's business unit. Not
  -- through notify_carrier_staff: that one skips the caller, and the
  -- hombre-camión (D13), manager and operator at once, records the arrival
  -- himself and is the one who needs the return load. A plain operator never
  -- gets it (not a manager nor a coordinator).
  insert into public.notifications (user_id, type, data)
  select r.user_id, 'backhaul_suggestions',
         jsonb_build_object(
           'tripId', p_trip_id,
           'vehicleId', v_trip.vehicle_id,
           'vehicleLabel', public.vehicle_label(v_trip.vehicle_id),
           'city', v_trip.destination_city,
           'loadCount', v_count,
           'availableFrom', v_chain.available_from
         )
  from (
    select p.id as user_id
    from public.profiles p
    join public.companies co on co.id = p.company_id and co.type = 'carrier' and co.archived_at is null
    where p.company_id = v_trip.carrier_company_id and p.role = 'manager'
    union
    select p.id
    from public.business_unit_coordinators bc
    join public.business_units b on b.id = bc.business_unit_id and b.archived_at is null
    join public.profiles p on p.id = bc.profile_id and p.role = 'coordinator' and p.company_id = b.company_id
    where bc.business_unit_id = v_trip.business_unit_id
      and b.company_id = v_trip.carrier_company_id
  ) r;
end;
$$;

revoke all on function public.check_backhaul(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Triggers: the arrival at the delivery and the operator's location
-- ---------------------------------------------------------------------------
create function public.trip_events_suggest_backhaul()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op is distinct from 'INSERT' or tg_when is distinct from 'AFTER'
     or tg_level is distinct from 'ROW' or tg_table_name is distinct from 'trip_events' then
    raise exception 'trip_events_suggest_backhaul runs only after inserting a trip event' using errcode = '42501';
  end if;
  if new.event_type = 'arrived_at_delivery' then
    perform public.check_backhaul(new.trip_id, 'arrival');
  end if;
  return null;
end;
$$;

revoke all on function public.trip_events_suggest_backhaul() from public, anon, authenticated;

create trigger trip_events_suggest_backhaul
after insert on public.trip_events
for each row
when (new.event_type = 'arrived_at_delivery')
execute function public.trip_events_suggest_backhaul();

create function public.trip_locations_suggest_backhaul()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Mirrors BACKHAUL_PROXIMITY_KM.
  c_proximity_km constant numeric := 50;
  v_trip_id uuid;
begin
  if tg_op is distinct from 'INSERT' or tg_when is distinct from 'AFTER'
     or tg_level is distinct from 'STATEMENT' or tg_table_name is distinct from 'trip_locations' then
    raise exception 'trip_locations_suggest_backhaul runs only after inserting trip locations' using errcode = '42501';
  end if;
  -- The trips of the batch not checked yet, on their way to (or at) the
  -- delivery, with a point within 50 km of it. Cheap for every other batch:
  -- the primary key of trip_backhaul_checks answers first.
  for v_trip_id in
    select distinct n.trip_id
    from new_locations n
    join public.trips t
      on t.id = n.trip_id
     and t.vehicle_id is not null
     and t.status in ('in_transit', 'at_delivery', 'unloading')
    join public.loads l on l.id = t.load_id
    where not exists (select 1 from public.trip_backhaul_checks c where c.trip_id = n.trip_id)
      and extensions.st_dwithin(
        extensions.st_setsrid(extensions.st_makepoint(n.longitude, n.latitude), 4326)::extensions.geography,
        l.destination_location,
        c_proximity_km * 1000
      )
    order by n.trip_id
  loop
    perform public.check_backhaul(v_trip_id, 'proximity');
  end loop;
  return null;
end;
$$;

revoke all on function public.trip_locations_suggest_backhaul() from public, anon, authenticated;

create trigger trip_locations_suggest_backhaul
after insert on public.trip_locations
referencing new table as new_locations
for each statement
execute function public.trip_locations_suggest_backhaul();
