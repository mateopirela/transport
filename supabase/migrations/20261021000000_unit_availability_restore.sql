-- F5 · Availability of a unit when its next trip is cancelled or reassigned
-- (follow-up of F2, 20261020020000_db_integrity_fixes.sql):
--   1. Committing a unit to its next trip ends whatever availability it has,
--      manual too, and remembers which trip ended it (ended_by_trip_id). The
--      trip events the unit misses while committed (set_trip_vehicle_availability)
--      are kept as archived rows ended by that commitment.
--   2. When the commitment goes away before the trip starts (the trip is
--      cancelled, or assigned another unit), the unit gets back the latest of
--      those rows: the availability it would have had without the commitment.
--      Clearing the availability, or the unit setting off on a trip since,
--      means it is not restored.
--   3. Matching carries the delay of a late trip through every trip the unit
--      is booked for, and frees the unit at the end of the last one.

-- ---------------------------------------------------------------------------
-- 1. Commitments end the availability and remember it
-- ---------------------------------------------------------------------------
alter table public.vehicle_availability
  add column ended_by_trip_id uuid references public.trips (id) on delete set null;

comment on column public.vehicle_availability.ended_by_trip_id is
  'The trip whose commitment of the unit ended (or, archived from the start, held back) this availability. '
  'If that commitment goes away before the trip starts, the latest such row is restored (F5).';

-- Rows written in one transaction keep their order: the latest row of a unit
-- is the one to restore (now() is the same for the whole transaction).
alter table public.vehicle_availability alter column created_at set default clock_timestamp();

-- The trip, other than p_trip_id and not over yet, that the unit is committed
-- to: assigned to it, or offered for it in the accepted offer while the trip
-- waits for its assignment. A trip that has not started comes first (its
-- commitment is the one that can go away), then the earliest.
create function public.vehicle_committing_trip(p_vehicle_id uuid, p_trip_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select t.id
  from public.trips t
  left join public.offers o on o.id = t.offer_id
  where t.id is distinct from p_trip_id
    and t.status not in ('delivered', 'closed', 'cancelled')
    and (t.vehicle_id = p_vehicle_id
         or (t.status = 'pending_assignment' and t.vehicle_id is null and o.vehicle_id = p_vehicle_id))
  order by t.status in ('pending_assignment', 'assigned') desc, t.created_at, t.id
  limit 1;
$$;

revoke all on function public.vehicle_committing_trip(uuid, uuid) from public, anon, authenticated;

create or replace function public.vehicle_committed_elsewhere(p_vehicle_id uuid, p_trip_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.vehicle_committing_trip(p_vehicle_id, p_trip_id) is not null;
$$;

-- Same as F2, but while the unit is committed elsewhere the availability is
-- still written, archived and ended by that commitment, so it can be
-- restored if the commitment goes away.
create or replace function public.set_trip_vehicle_availability(p_trip public.trips, p_from timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_load public.loads;
  v_committed_to uuid;
begin
  perform 1 from public.vehicles v where v.id = p_trip.vehicle_id and v.archived_at is null for update;
  if not found then
    return;
  end if;
  v_committed_to := public.vehicle_committing_trip(p_trip.vehicle_id, p_trip.id);
  select * into v_load from public.loads where id = p_trip.load_id;

  if v_committed_to is null then
    update public.vehicle_availability set archived_at = now()
    where vehicle_id = p_trip.vehicle_id and archived_at is null;
  end if;

  insert into public.vehicle_availability (
    company_id, vehicle_id, available_from, location, city, state, source, created_by, archived_at, ended_by_trip_id
  ) values (
    p_trip.carrier_company_id, p_trip.vehicle_id, p_from, v_load.destination_location,
    left(v_load.destination_city, 120), left(v_load.destination_state, 60), 'trip_estimate', (select auth.uid()),
    case when v_committed_to is not null then now() end, v_committed_to
  );
end;
$$;

-- Same as F2, but it ends the manual availability too (matching already
-- starts a committed unit from its trip, so that row only misled), and marks
-- the row it ends with the trip. Same lock as F2.
create or replace function public.trips_end_vehicle_estimate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_vehicle_id uuid := new.vehicle_id;
begin
  if v_vehicle_id is null and tg_op = 'INSERT' then
    select o.vehicle_id into v_vehicle_id from public.offers o where o.id = new.offer_id;
  end if;
  if v_vehicle_id is null or new.status in ('delivered', 'closed', 'cancelled') then
    return null;
  end if;
  perform 1 from public.vehicles v where v.id = v_vehicle_id for share;
  update public.vehicle_availability
  set archived_at = now(), ended_by_trip_id = new.id
  where vehicle_id = v_vehicle_id and archived_at is null;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The commitment goes away before the trip starts: restore
-- ---------------------------------------------------------------------------
-- Gives the unit back the availability its commitments ended: the latest row
-- of the unit, if a commitment that no longer holds ended it. Nothing if the
-- unit is archived, already has an availability (the carrier set one), is
-- still committed to a trip that has not started, its latest row was ended
-- otherwise (the carrier cleared it, or the unit set off on a trip since:
-- see trips_restore_vehicle_availability) or by the trip it is on now.
-- Same unit lock as set_trip_vehicle_availability, so the two serialize and
-- each one sees what the other wrote.
create function public.restore_vehicle_availability(p_vehicle_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_row public.vehicle_availability;
begin
  perform 1 from public.vehicles v where v.id = p_vehicle_id and v.archived_at is null for update;
  if not found then
    return;
  end if;
  if exists (select 1 from public.vehicle_availability a where a.vehicle_id = p_vehicle_id and a.archived_at is null)
     or exists (
       select 1 from public.trips t where t.id = public.vehicle_committing_trip(p_vehicle_id, null)
         and t.status in ('pending_assignment', 'assigned')
     ) then
    return;
  end if;

  select * into v_row from public.vehicle_availability a
  where a.vehicle_id = p_vehicle_id
  order by a.created_at desc, a.id desc
  limit 1;
  if v_row.ended_by_trip_id is null
     or exists (
       select 1 from public.trips t
       left join public.offers o on o.id = t.offer_id
       where t.id = v_row.ended_by_trip_id
         and t.status not in ('delivered', 'closed', 'cancelled')
         and (t.vehicle_id = p_vehicle_id
              or (t.status = 'pending_assignment' and t.vehicle_id is null and o.vehicle_id = p_vehicle_id))
     ) then
    return;
  end if;

  insert into public.vehicle_availability (company_id, vehicle_id, available_from, location, city, state, source, created_by)
  values (v_row.company_id, v_row.vehicle_id, v_row.available_from, v_row.location, v_row.city, v_row.state,
          v_row.source, v_row.created_by);
end;
$$;

revoke all on function public.restore_vehicle_availability(uuid) from public, anon, authenticated;

-- A trip that has not started lets go of its unit: it is cancelled, or
-- assigned another unit (also when its accepted offer named one). When the
-- trip sets off, what the unit's commitments held back is forgotten: the
-- unit is no longer where those rows say. Not security definer: trips are written
-- only by the RPCs (see notify_trip_unassigned, F2).
create function public.trips_restore_vehicle_availability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_offered uuid;
  v_old uuid := old.vehicle_id;
  v_new uuid := new.vehicle_id;
begin
  select o.vehicle_id into v_offered from public.offers o where o.id = new.offer_id;
  if v_old is null and old.status = 'pending_assignment' then
    v_old := v_offered;
  end if;
  if new.status = 'cancelled' then
    v_new := null;
  elsif v_new is null and new.status = 'pending_assignment' then
    v_new := v_offered;
  end if;
  if v_old is not null and v_old is distinct from v_new then
    perform public.restore_vehicle_availability(v_old);
  end if;
  -- The unit sets off: nothing written before is where it will be, so what
  -- its commitments held back is no longer restored (even if this trip is
  -- cancelled later).
  if new.status not in ('pending_assignment', 'assigned', 'cancelled') then
    update public.vehicle_availability
    set ended_by_trip_id = null
    where vehicle_id = new.vehicle_id and archived_at is not null and ended_by_trip_id is not null;
  end if;
  return null;
end;
$$;

revoke all on function public.trips_restore_vehicle_availability() from public, anon, authenticated;

create trigger trips_restore_vehicle_availability
after update of status, vehicle_id on public.trips
for each row
when (old.status in ('pending_assignment', 'assigned'))
execute function public.trips_restore_vehicle_availability();

-- Clearing the availability is the carrier's call: same as B04, and what the
-- commitments of the unit held back is no longer restored either.
create or replace function public.clear_vehicle_availability(p_vehicle_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles%rowtype;
begin
  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found or v_vehicle.company_id is distinct from public.auth_fleet_company_id() then
    raise exception 'vehicle not found' using errcode = '42501';
  end if;

  update public.vehicle_availability
  set archived_at = coalesce(archived_at, now()), ended_by_trip_id = null
  where vehicle_id = v_vehicle.id and (archived_at is null or ended_by_trip_id is not null);
end;
$$;

-- Same as B06, except that it locks the unit the trip lets go (the one
-- assigned, or named in the accepted offer) and the new one together, in
-- id order and for update, before the trip changes: the triggers above then
-- take no lock of their own that could cross another assignment swapping
-- the same two units.
create or replace function public.assign_trip(p_trip_id uuid, p_vehicle_id uuid, p_operator_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_is_admin boolean := public.is_admin();
  v_previous uuid;
begin
  if not v_is_admin and not exists (
    select 1 from public.trips t where t.id = p_trip_id and t.carrier_company_id = public.auth_fleet_company_id()
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  if v_trip.status not in ('pending_assignment', 'assigned') then
    raise exception 'cannot assign a trip in status %', v_trip.status using errcode = '55000';
  end if;
  if not v_is_admin and not public.lock_company_approved(v_trip.carrier_company_id) then
    raise exception 'company is not approved' using errcode = '42501';
  end if;

  -- Operator first, then units: the same order as archiving an operator
  -- (operators_release_vehicles), so the two never deadlock. Only operators
  -- with an account can record the trip.
  perform 1 from public.operators o
  where o.id = p_operator_id and o.company_id = v_trip.carrier_company_id
    and o.archived_at is null and o.profile_id is not null
  for share;
  if not found then
    raise exception 'operator not found or without account' using errcode = '22023';
  end if;
  v_previous := v_trip.vehicle_id;
  if v_previous is null then
    select o.vehicle_id into v_previous from public.offers o where o.id = v_trip.offer_id;
  end if;
  perform 1 from public.vehicles v
  where v.id in (p_vehicle_id, v_previous) and v.company_id = v_trip.carrier_company_id
  order by v.id
  for update;
  if not exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle_id and v.company_id = v_trip.carrier_company_id and v.archived_at is null
  ) then
    raise exception 'vehicle not found' using errcode = '22023';
  end if;
  if exists (select 1 from public.vehicle_expired_requirements(p_vehicle_id)) then
    raise exception 'vehicle has expired documents' using errcode = '55000';
  end if;

  update public.trips
  set status = 'assigned', vehicle_id = p_vehicle_id, operator_id = p_operator_id, assigned_at = now()
  where id = v_trip.id;

  insert into public.trip_events (trip_id, event_type, from_status, to_status, occurred_at, actor_id, actor_role)
  values (v_trip.id, 'assigned', v_trip.status, 'assigned', now(), (select auth.uid()), public.auth_role());
end;
$$;

-- One-time cleanup: the manual availability of units already committed to a
-- trip that has not started ends, marked with that trip (F2 archived their
-- trip estimates already, without the mark: those are not restored).
update public.vehicle_availability a
set archived_at = now(), ended_by_trip_id = public.vehicle_committing_trip(a.vehicle_id, null)
where a.archived_at is null
  and a.source = 'manual'
  and exists (
    select 1 from public.trips t where t.id = public.vehicle_committing_trip(a.vehicle_id, null)
      and t.status in ('pending_assignment', 'assigned')
  );

-- ---------------------------------------------------------------------------
-- 3. Matching: delays carry through every trip the unit is committed to
-- ---------------------------------------------------------------------------
-- The trips a unit is committed to, done one after the other: the one in
-- progress first, then those not started by the opening of their pickup
-- window. A trip ends at its estimated end of unloading (or the end of its
-- delivery window); one that has not started cannot start before the
-- previous one ends, so if that is after its pickup window opens, it ends
-- that much later (it still takes as long as its windows allow). Returns
-- the load of the last trip and when the unit is free after all of them.
create function public.vehicle_trip_chain_end(p_vehicle_id uuid)
returns table (load_id uuid, available_from timestamptz)
language sql
stable
set search_path = ''
as $$
  with recursive committed as (
    select l.id as load_id,
           t.status not in ('pending_assignment', 'assigned') as started,
           coalesce(t.estimated_unload_end_at, l.delivery_window_end) as ends_at,
           l.pickup_window_start,
           row_number() over (
             order by t.status not in ('pending_assignment', 'assigned') desc,
                      case when t.status in ('pending_assignment', 'assigned') then l.pickup_window_start
                           else coalesce(t.estimated_unload_end_at, l.delivery_window_end) end,
                      t.id
           ) as n
    from public.trips t
    join public.loads l on l.id = t.load_id
    left join public.offers o on o.id = t.offer_id
    where (t.vehicle_id = p_vehicle_id
           and t.status in ('assigned', 'en_route_to_pickup', 'at_pickup', 'loading', 'in_transit',
                            'at_delivery', 'unloading'))
       or (t.status = 'pending_assignment' and t.vehicle_id is null and o.vehicle_id = p_vehicle_id)
  ),
  chain as (
    select c.n, c.load_id, c.ends_at as free_at from committed c where c.n = 1
    union all
    select c.n, c.load_id,
           case when c.started then greatest(c.ends_at, p.free_at)
                else c.ends_at + greatest(interval '0', p.free_at - c.pickup_window_start) end
    from chain p
    join committed c on c.n = p.n + 1
  )
  select ch.load_id, ch.free_at from chain ch order by ch.n desc limit 1;
$$;

revoke all on function public.vehicle_trip_chain_end(uuid) from public, anon, authenticated;

-- Same function as F2 except the `trips` branch of the starting points: the
-- end of the unit's chain of trips (vehicle_trip_chain_end).
create or replace function public.match_pairs(
  p_vehicle_id uuid,
  p_load_id uuid,
  p_max_empty_km numeric,
  p_availability_id uuid default null
)
returns setof public.match_candidate
language sql
stable
set search_path = ''
as $$
  with units as (
    select v.id, v.company_id, v.unit_type, v.capacity_kg, v.capacity_m3, v.features
    from public.vehicles v
    join public.companies c on c.id = v.company_id and c.type = 'carrier' and c.status = 'approved'
      and c.archived_at is null
    where v.archived_at is null
      and v.unit_type is not null
      and (p_vehicle_id is null or v.id = p_vehicle_id)
      and not exists (select 1 from public.vehicle_missing_requirements(v.id))
  ),
  starts as (
    select u.*, s.availability_id, s.location, s.city, s.state, s.available_from, s.is_return_trip, s.home_location
    from units u
    cross join lateral (
      select x.*
      from (
        -- F5: the unit starts where the last of its trips ends, once its
        -- delays have carried through all of them (vehicle_trip_chain_end).
        select 1 as priority, null::uuid as availability_id, l.destination_location as location,
               l.destination_city as city, l.destination_state as state, c.available_from,
               null::timestamptz as ends_at, true as is_return_trip, l.origin_location as home_location
        from public.vehicle_trip_chain_end(u.id) c
        join public.loads l on l.id = c.load_id
        union all
        select 3, a.id, a.location, a.city, a.state, a.available_from, a.available_from, a.source = 'trip_estimate',
               case when a.source = 'trip_estimate' then (
                 select l.origin_location
                 from public.trips t
                 join public.loads l on l.id = t.load_id
                 where t.vehicle_id = u.id and t.status <> 'cancelled'
                 order by t.created_at desc
                 limit 1
               ) end
        from public.vehicle_availability a
        where a.vehicle_id = u.id
          and a.archived_at is null
          and (p_availability_id is null or a.id = p_availability_id)
      ) x
      order by x.priority
      limit 1
    ) s
  )
  select
    l.id, s.company_id, s.id, s.availability_id,
    s.city, s.state,
    extensions.st_y(s.location::extensions.geometry), extensions.st_x(s.location::extensions.geometry),
    s.available_from, s.is_return_trip,
    l.origin_city, l.origin_state, l.origin_lat, l.origin_lng,
    l.destination_city, l.destination_state, l.destination_lat, l.destination_lng,
    l.pickup_window_start, l.pickup_window_end, l.unit_type, l.weight_kg, l.proposed_price_cents,
    extensions.st_distance(s.location, l.origin_location) / 1000,
    extensions.st_distance(s.home_location, l.destination_location) / 1000,
    r.origin_city, r.destination_city
  from starts s
  join public.loads l
    on l.status in ('published', 'negotiating')
   and l.archived_at is null
   and (p_load_id is null or l.id = p_load_id)
   and l.unit_type = s.unit_type
   and l.weight_kg <= s.capacity_kg
   and (l.volume_m3 is null or s.capacity_m3 is null or l.volume_m3 <= s.capacity_m3)
   and l.special_requirements <@ s.features
   and l.pickup_window_end > greatest(s.available_from, now())
   and extensions.st_dwithin(s.location, l.origin_location, p_max_empty_km * 1000)
  left join lateral (
    select cr.origin_city, cr.destination_city
    from public.carrier_routes cr
    where cr.company_id = s.company_id
      and cr.archived_at is null
      and (cardinality(cr.unit_types) = 0 or s.unit_type = any (cr.unit_types))
      and case when cr.origin_location is not null
            then extensions.st_dwithin(cr.origin_location, l.origin_location, 50000)
            else lower(cr.origin_city) = lower(l.origin_city) and lower(cr.origin_state) = lower(l.origin_state) end
      and case when cr.destination_location is not null
            then extensions.st_dwithin(cr.destination_location, l.destination_location, 50000)
            else lower(cr.destination_city) = lower(l.destination_city)
                 and lower(cr.destination_state) = lower(l.destination_state) end
    order by cr.created_at, cr.id
    limit 1
  ) r on true
  where not exists (
    select 1 from public.negotiations n where n.load_id = l.id and n.carrier_company_id = s.company_id
  );
$$;

revoke all on function public.match_pairs(uuid, uuid, numeric, uuid) from public, anon, authenticated;
