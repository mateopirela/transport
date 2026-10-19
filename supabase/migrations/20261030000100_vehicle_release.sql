-- G5 · Cancelling a trip that already set off, and releasing its unit (D20).
--   1. cancel_trip takes a structured reason (trip_cancellation_reason) and
--      records who cancelled (trips.cancelled_by_side). Who may cancel, and
--      until when, does not change (B06/G1a.2). The old (p_trip_id, p_reason)
--      signature stays as a wrapper with the reason 'other'.
--   2. A trip cancelled after it set off (any status after 'assigned') with a
--      unit leaves that unit "pending release": trips_create_release_task
--      opens a vehicle_release_tasks row with the last known point of the trip
--      and ends whatever availability the unit had (the destination estimate
--      of set_trip_vehicle_availability included), so F5 does not revive it.
--      Before departure nothing changes: trips_restore_vehicle_availability
--      (F5/F13) still gives the unit back its availability.
--   3. While the task is pending the unit gets neither availability nor
--      commitments: set_vehicle_availability, assign_trip and the offers that
--      name it fail with 55000 'vehicle is pending release'; match_pairs (and
--      so matching and load_match) leaves it out; restore_vehicle_availability
--      restores nothing; trip estimates are kept archived.
--   4. release_vehicle (manager, or the coordinator of the unit's business
--      unit) confirms where the truck is and from when it is free: the task is
--      closed and the availability is written with the source 'release'; then
--      notify_matches_for_vehicle tells the staff the 3 nearest loads.
-- Lock order everywhere: trip, then unit (F5), then release task.

-- ---------------------------------------------------------------------------
-- 1. Structured cancellation
-- ---------------------------------------------------------------------------
create type public.trip_cancellation_reason as enum (
  'shipper_request', 'carrier_request', 'mechanical_failure', 'accident', 'cargo_issue', 'documentation', 'other'
);
create type public.trip_cancellation_side as enum ('shipper', 'carrier', 'admin');

alter table public.trips
  add column cancellation_reason_code public.trip_cancellation_reason,
  add column cancelled_by_side public.trip_cancellation_side;

comment on column public.trips.cancellation_reason is
  'Free notes of the cancellation (required when the reason is ''other''). The reason is cancellation_reason_code.';
comment on column public.trips.cancellation_reason_code is 'Why the trip was cancelled (G5, D20).';
comment on column public.trips.cancelled_by_side is 'Who cancelled the trip: the shipper, the carrier staff or an admin (G5).';

-- Trips cancelled before G5 had only free text: 'other', and the side from
-- the role of whoever recorded the cancellation.
update public.trips t
set cancellation_reason_code = 'other',
    cancelled_by_side = coalesce((
      select case e.actor_role when 'shipper' then 'shipper' when 'admin' then 'admin' else 'carrier' end
      from public.trip_events e
      where e.trip_id = t.id and e.event_type = 'cancelled' and e.actor_role is not null
      order by e.occurred_at desc
      limit 1
    ), 'admin')::public.trip_cancellation_side
where t.status = 'cancelled';

alter table public.trips
  add constraint trips_cancellation_reason_code_consistent
    check ((status = 'cancelled') = (cancellation_reason_code is not null)),
  add constraint trips_cancelled_by_side_consistent
    check ((status = 'cancelled') = (cancelled_by_side is not null)),
  add constraint trips_cancellation_other_has_notes
    check (cancellation_reason_code is distinct from 'other' or coalesce(char_length(btrim(cancellation_reason)), 0) > 0);

-- ---------------------------------------------------------------------------
-- 2. vehicle_release_tasks
-- ---------------------------------------------------------------------------
create type public.release_task_status as enum ('pending', 'released');

create table public.vehicle_release_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  vehicle_id uuid not null,
  -- The business unit of the unit when the trip was cancelled (a snapshot:
  -- who may release is decided by the unit's current business unit).
  business_unit_id uuid not null,
  trip_id uuid not null references public.trips (id) on delete restrict,
  status public.release_task_status not null default 'pending',
  last_known_location extensions.geography(Point, 4326),
  last_known_at timestamptz,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid references auth.users (id) on delete set null,
  released_location extensions.geography(Point, 4326),
  released_city text constraint vehicle_release_tasks_city_length check (char_length(btrim(released_city)) between 1 and 120),
  released_state text constraint vehicle_release_tasks_state_length check (char_length(btrim(released_state)) between 1 and 60),
  released_available_from timestamptz,
  -- The availability row release_vehicle wrote. No foreign key, like the
  -- bookkeeping columns of vehicle_availability (F5).
  released_availability_id uuid,
  notes text constraint vehicle_release_tasks_notes_length check (char_length(notes) <= 1000),
  constraint vehicle_release_tasks_trip_key unique (trip_id),
  constraint vehicle_release_tasks_vehicle_fkey foreign key (company_id, vehicle_id)
    references public.vehicles (company_id, id) on delete restrict,
  constraint vehicle_release_tasks_business_unit_fkey foreign key (company_id, business_unit_id)
    references public.business_units (company_id, id) on delete restrict,
  constraint vehicle_release_tasks_last_known_consistent
    check ((last_known_location is null) = (last_known_at is null)),
  constraint vehicle_release_tasks_released_consistent check (
    (status = 'released') = (released_at is not null)
    and (status = 'pending' or (released_location is not null and released_city is not null
                                and released_state is not null and released_available_from is not null))
  )
);

comment on table public.vehicle_release_tasks is
  'A unit whose trip was cancelled after it set off waits here until its coordinator or the manager confirms '
  'where it is and from when it is free (G5, D20). Written only by trips_create_release_task and release_vehicle.';

-- One pending task per unit: a second cancellation while it waits adds none.
create unique index vehicle_release_tasks_pending_vehicle_key
  on public.vehicle_release_tasks (vehicle_id) where status = 'pending';
create index vehicle_release_tasks_company_idx on public.vehicle_release_tasks (company_id, created_at desc);

revoke all on table public.vehicle_release_tasks from anon, authenticated;
grant select on table public.vehicle_release_tasks to authenticated;

alter table public.vehicle_release_tasks enable row level security;

-- The staff that operates the unit now (the manager, or the coordinators of
-- its current business unit), and admins. Same rule as vehicle_availability.
create policy vehicle_release_tasks_select
on public.vehicle_release_tasks
for select
to authenticated
using (
  company_id = (select public.auth_fleet_company_id())
  or exists (
    select 1 from public.vehicles v
    where v.id = vehicle_release_tasks.vehicle_id
      and v.business_unit_id = any ((select public.auth_business_unit_ids())::uuid[])
  )
  or (select public.is_admin())
);

-- Whether a unit waits to be released. Internal: callers hold the unit lock,
-- which every writer of a task takes too, so the answer cannot change under them.
create function public.vehicle_pending_release(p_vehicle_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.vehicle_release_tasks t where t.vehicle_id = p_vehicle_id and t.status = 'pending'
  );
$$;

revoke all on function public.vehicle_pending_release(uuid) from public, anon, authenticated;

-- How a unit is named in notifications: its fleet number, else its plate
-- (unitLabel in packages/shared).
create function public.vehicle_label(p_vehicle_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(btrim(v.fleet_number), ''), v.plate) from public.vehicles v where v.id = p_vehicle_id;
$$;

revoke all on function public.vehicle_label(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The trip is cancelled after it set off: the unit waits to be released
-- ---------------------------------------------------------------------------
-- Not security definer: trips are written only by the trip RPCs (as for
-- trips_restore_vehicle_availability, F5). Runs under the trip lock of
-- cancel_trip, then takes the unit lock of F5, then writes the task.
create function public.trips_create_release_task()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_vehicle public.vehicles;
  v_last record;
  v_task_id uuid;
begin
  select * into v_vehicle from public.vehicles v where v.id = new.vehicle_id for update;
  if not found then
    return null;
  end if;

  -- The last known point of the trip: the operator's GPS or, if newer (or
  -- there is no GPS), the place of its last status event (D11).
  select p.location, p.at into v_last
  from (
    select l.location, l.recorded_at as at
    from public.trip_locations l
    where l.trip_id = new.id
    union all
    select extensions.st_setsrid(extensions.st_makepoint(e.longitude, e.latitude), 4326)::extensions.geography,
           e.occurred_at
    from public.trip_events e
    where e.trip_id = new.id and e.latitude is not null and e.longitude is not null
  ) p
  order by p.at desc
  limit 1;

  insert into public.vehicle_release_tasks (
    company_id, vehicle_id, business_unit_id, trip_id, last_known_location, last_known_at
  ) values (
    v_vehicle.company_id, v_vehicle.id, v_vehicle.business_unit_id, new.id, v_last.location, v_last.at
  )
  on conflict do nothing
  returning id into v_task_id;

  -- Whatever availability the unit has is no longer where it is (the
  -- estimate at the destination, typically), and nothing its commitments
  -- held back may be restored (F5): only the release says where it is now.
  update public.vehicle_availability
  set archived_at = coalesce(archived_at, now()), ended_by_trip_id = null
  where vehicle_id = v_vehicle.id and (archived_at is null or ended_by_trip_id is not null);

  -- A unit already waiting (a second cancellation) keeps its first task.
  if v_task_id is not null then
    perform public.notify_carrier_staff(
      v_vehicle.company_id, v_vehicle.business_unit_id, 'vehicle_release_pending',
      jsonb_build_object(
        'taskId', v_task_id, 'tripId', new.id, 'vehicleId', v_vehicle.id,
        'vehicleLabel', public.vehicle_label(v_vehicle.id)
      ) || public.load_route_data(new.load_id)
    );
  end if;
  return null;
end;
$$;

revoke all on function public.trips_create_release_task() from public, anon, authenticated;

create trigger trips_create_release_task
after update of status on public.trips
for each row
when (
  new.status = 'cancelled'
  and old.status not in ('pending_assignment', 'assigned', 'cancelled')
  and new.vehicle_id is not null
)
execute function public.trips_create_release_task();

-- Same as F13, except that a unit pending release gets nothing back: only
-- its release says where it is.
create or replace function public.restore_vehicle_availability(p_vehicle_id uuid, p_trip_id uuid)
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
  if public.vehicle_pending_release(p_vehicle_id)
     or exists (select 1 from public.vehicle_availability a where a.vehicle_id = p_vehicle_id and a.archived_at is null)
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

  insert into public.vehicle_availability (
    company_id, vehicle_id, available_from, location, city, state, source, created_by,
    restored_from_id, restored_by_trip_id
  ) values (
    v_row.company_id, v_row.vehicle_id, v_row.available_from, v_row.location, v_row.city, v_row.state,
    v_row.source, v_row.created_by, v_row.id, p_trip_id
  );
end;
$$;

-- Same as F5, except that while the unit is pending release the estimate is
-- kept only as a record (archived, never restored).
create or replace function public.set_trip_vehicle_availability(p_trip public.trips, p_from timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_load public.loads;
  v_committed_to uuid;
  v_pending boolean;
begin
  perform 1 from public.vehicles v where v.id = p_trip.vehicle_id and v.archived_at is null for update;
  if not found then
    return;
  end if;
  v_pending := public.vehicle_pending_release(p_trip.vehicle_id);
  v_committed_to := public.vehicle_committing_trip(p_trip.vehicle_id, p_trip.id);
  select * into v_load from public.loads where id = p_trip.load_id;

  if v_committed_to is null and not v_pending then
    update public.vehicle_availability set archived_at = now()
    where vehicle_id = p_trip.vehicle_id and archived_at is null;
  end if;

  insert into public.vehicle_availability (
    company_id, vehicle_id, available_from, location, city, state, source, created_by, archived_at, ended_by_trip_id
  ) values (
    p_trip.carrier_company_id, p_trip.vehicle_id, p_from, v_load.destination_location,
    left(v_load.destination_city, 120), left(v_load.destination_state, 60), 'trip_estimate', (select auth.uid()),
    case when v_committed_to is not null or v_pending then now() end,
    case when not v_pending then v_committed_to end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. While pending: no availability and no commitments
-- ---------------------------------------------------------------------------
-- Same as G1a.2, except a unit pending release is refused (under its lock).
create or replace function public.set_vehicle_availability(p_vehicle_id uuid, p_available_from timestamp with time zone, p_latitude double precision, p_longitude double precision, p_city text, p_state text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles%rowtype;
  v_expired text;
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Lock the vehicle so concurrent calls serialize on it.
  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found or not public.can_operate_unit(v_vehicle.business_unit_id) then
    raise exception 'vehicle not found' using errcode = '42501';
  end if;
  if v_vehicle.archived_at is not null then
    raise exception 'vehicle is archived' using errcode = '22023';
  end if;
  if public.vehicle_pending_release(v_vehicle.id) then
    raise exception 'vehicle is pending release' using errcode = '55000';
  end if;
  if p_available_from is null then
    raise exception 'p_available_from is required' using errcode = '22023';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'invalid coordinates' using errcode = '22023';
  end if;

  -- Ownership was checked above, so reading the documents as definer is safe.
  select string_agg(e.code, ', ' order by e.sort_order, e.code) into v_expired
  from public.vehicle_expired_requirements(v_vehicle.id) e;
  if v_expired is not null then
    raise exception 'vehicle has expired documents: %', v_expired using errcode = '55000';
  end if;

  update public.vehicle_availability
  set archived_at = now()
  where vehicle_id = v_vehicle.id and archived_at is null;

  insert into public.vehicle_availability (company_id, vehicle_id, available_from, location, city, state, source, created_by)
  values (
    v_vehicle.company_id,
    v_vehicle.id,
    p_available_from,
    extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
    btrim(p_city),
    btrim(p_state),
    'manual',
    (select auth.uid())
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Same as G3 (20261027010100_d16_document_requirements.sql), except a unit
-- pending release cannot be assigned (checked under the unit lock).
create or replace function public.assign_trip(p_trip_id uuid, p_vehicle_id uuid, p_operator_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_is_admin boolean := public.is_admin();
  -- The manager and the admin may use any unit and operator of the company,
  -- and the trip moves to the unit's business unit; a coordinator only those
  -- of the trip's business unit.
  v_any_unit boolean;
  v_operator public.operators;
  v_unit_id uuid;
  v_kind public.vehicle_kind;
  v_previous uuid;
begin
  if not v_is_admin and not exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and t.carrier_company_id = public.auth_carrier_company_id()
      and public.can_operate_unit(t.business_unit_id)
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  select * into v_trip from public.trips where id = p_trip_id for update;
  -- Re-checked under the lock: the manager may have moved it meanwhile.
  if not found or not (v_is_admin or public.can_operate_unit(v_trip.business_unit_id)) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  v_any_unit := v_is_admin or v_trip.carrier_company_id = public.auth_fleet_company_id();
  if v_trip.status not in ('pending_assignment', 'assigned') then
    raise exception 'cannot assign a trip in status %', v_trip.status using errcode = '55000';
  end if;
  if not v_is_admin and not public.lock_company_approved(v_trip.carrier_company_id) then
    raise exception 'company is not approved' using errcode = '42501';
  end if;

  -- Operator first, then units: the same order as archiving an operator
  -- (operators_release_vehicles), so the two never deadlock. Only operators
  -- with an account can record the trip.
  select o.* into v_operator from public.operators o
  where o.id = p_operator_id and o.company_id = v_trip.carrier_company_id
    and (v_any_unit or o.business_unit_id = v_trip.business_unit_id)
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
  select v.business_unit_id, v.kind into v_unit_id, v_kind from public.vehicles v
  where v.id = p_vehicle_id and v.company_id = v_trip.carrier_company_id and v.archived_at is null
    and (v_any_unit or v.business_unit_id = v_trip.business_unit_id);
  if not found then
    raise exception 'vehicle not found' using errcode = '22023';
  end if;
  -- G5: under the unit lock, which release_vehicle and the cancellation take too.
  if public.vehicle_pending_release(p_vehicle_id) then
    raise exception 'vehicle is pending release' using errcode = '55000';
  end if;
  if exists (select 1 from public.vehicle_expired_requirements(p_vehicle_id)) then
    raise exception 'vehicle has expired documents' using errcode = '55000';
  end if;

  -- D16: a current license of the type the unit (and the cargo) needs.
  if not public.operator_license_current(v_operator.id) then
    raise exception 'operator license is missing or expired: %', v_operator.full_name using errcode = '55000';
  end if;
  if v_operator.license_type is null or not exists (
    select 1 from public.license_unit_compatibility lc
    where lc.license_type = v_operator.license_type and lc.vehicle_kind = v_kind and lc.allowed
  ) then
    raise exception 'operator license is not suitable for this vehicle: %', v_operator.full_name
      using errcode = '55000';
  end if;
  if v_operator.license_type <> 'E' and exists (
    select 1 from public.loads l
    where l.id = v_trip.load_id and 'hazmat_permit' = any (l.special_requirements)
  ) then
    raise exception 'operator license is not suitable for hazardous cargo: %', v_operator.full_name
      using errcode = '55000';
  end if;

  update public.trips
  set status = 'assigned', vehicle_id = p_vehicle_id, operator_id = p_operator_id, assigned_at = now(),
      business_unit_id = v_unit_id
  where id = v_trip.id;

  insert into public.trip_events (trip_id, event_type, from_status, to_status, occurred_at, actor_id, actor_role)
  values (v_trip.id, 'assigned', v_trip.status, 'assigned', now(), (select auth.uid()), public.auth_role());
end;
$$;

-- Same as B05, except a unit pending release cannot be proposed (make_offer,
-- counter_offer and admin_create_offer all check their fields here). Not
-- under the unit lock: an offer commits nothing, and assign_trip refuses the
-- unit under its lock until it is released.
create or replace function public.check_offer_fields(
  p_carrier_company_id uuid,
  p_side public.offer_side,
  p_amount_cents bigint,
  p_conditions text,
  p_vehicle_id uuid
)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 10000000000 then
    raise exception 'invalid offer: amount out of range' using errcode = '22023';
  end if;
  if char_length(p_conditions) > 1000 then
    raise exception 'invalid offer: conditions are too long' using errcode = '22023';
  end if;
  if p_vehicle_id is not null then
    if p_side <> 'carrier' then
      raise exception 'invalid offer: only carriers propose a unit' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.vehicles v
      where v.id = p_vehicle_id and v.company_id = p_carrier_company_id and v.archived_at is null
    ) then
      raise exception 'invalid offer: vehicle not found' using errcode = '22023';
    end if;
    if public.vehicle_pending_release(p_vehicle_id) then
      raise exception 'vehicle is pending release' using errcode = '55000';
    end if;
  end if;
end;
$$;

-- Same as F5 (20261021000000_unit_availability_restore.sql), except a unit
-- pending release has no starting point (G5).
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
      and not public.vehicle_pending_release(v.id)
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

-- ---------------------------------------------------------------------------
-- 5. cancel_trip with a structured reason
-- ---------------------------------------------------------------------------
-- Same as G1a.2, except the reason is a code (with notes, required for
-- 'other') and the side that cancelled is recorded. Who may cancel and until
-- when are unchanged.
create function public.cancel_trip(
  p_trip_id uuid,
  p_reason_code public.trip_cancellation_reason,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_is_admin boolean := public.is_admin();
  v_notes text := nullif(btrim(p_notes), '');
  v_side public.trip_cancellation_side;
begin
  if not v_is_admin and not exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and (t.shipper_company_id = public.auth_shipper_company_id()
           or (t.carrier_company_id = public.auth_carrier_company_id() and public.can_operate_unit(t.business_unit_id)))
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  select * into v_trip from public.trips where id = p_trip_id for update;
  -- Re-checked under the lock: the manager may have moved it meanwhile. The
  -- shipper comparison is null for carrier staff, so the whole test is
  -- coalesced: a null must refuse, never pass.
  if not found or not coalesce(
    v_is_admin
    or v_trip.shipper_company_id = public.auth_shipper_company_id()
    or public.can_operate_unit(v_trip.business_unit_id),
    false
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  if v_trip.status not in ('pending_assignment', 'assigned', 'en_route_to_pickup', 'at_pickup')
     and not (v_is_admin and v_trip.status in ('loading', 'in_transit', 'at_delivery', 'unloading')) then
    raise exception 'cannot cancel a trip in status %', v_trip.status using errcode = '55000';
  end if;
  if p_reason_code is null then
    raise exception 'a cancellation reason is required' using errcode = '22023';
  end if;
  if (p_reason_code = 'other' and v_notes is null) or char_length(v_notes) > 1000 then
    raise exception 'a reason of at most 1000 characters is required' using errcode = '22023';
  end if;
  v_side := case
    when v_is_admin then 'admin'
    when v_trip.shipper_company_id = public.auth_shipper_company_id() then 'shipper'
    else 'carrier'
  end;

  update public.trips
  set status = 'cancelled', cancelled_at = now(), cancellation_reason = v_notes,
      cancellation_reason_code = p_reason_code, cancelled_by_side = v_side
  where id = v_trip.id;
  update public.loads set status = 'cancelled', cancelled_at = now(), cancellation_reason = v_notes
  where id = v_trip.load_id;

  insert into public.trip_events (trip_id, event_type, from_status, to_status, occurred_at, notes, actor_id, actor_role)
  values (v_trip.id, 'cancelled', v_trip.status, 'cancelled', now(), v_notes, (select auth.uid()), public.auth_role());
end;
$$;

revoke all on function public.cancel_trip(uuid, public.trip_cancellation_reason, text) from public, anon;
grant execute on function public.cancel_trip(uuid, public.trip_cancellation_reason, text) to authenticated;

-- The B06 signature, for older builds of the app: the free text is the notes
-- of the reason 'other'. Security invoker on purpose: it only calls the
-- checked RPC above with the caller's rights (and so is not a second
-- security definer signature under a reviewed name, 18_security_audit).
create or replace function public.cancel_trip(p_trip_id uuid, p_reason text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select public.cancel_trip(p_trip_id, 'other'::public.trip_cancellation_reason, p_reason);
$$;

-- ---------------------------------------------------------------------------
-- 6. Releasing the unit
-- ---------------------------------------------------------------------------
-- The 3 nearest loads the unit can reach in time, as load_match, to the staff
-- of its business unit (never the caller). Same reach rule as notify_load_match.
create function public.notify_matches_for_vehicle(p_vehicle_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_match record;
  v_unit_id uuid := (select v.business_unit_id from public.vehicles v where v.id = p_vehicle_id);
begin
  for v_match in
    select m.load_id, m.company_id, m.empty_km
    from public.match_pairs(p_vehicle_id, null, 150) m
    where greatest(m.available_from, now()) + make_interval(secs => m.empty_km * 1.3 / 60 * 3600)
          <= m.pickup_window_end
    order by m.empty_km, m.pickup_window_start, m.load_id
    limit 3
  loop
    perform public.notify_carrier_staff(
      v_match.company_id, v_unit_id, 'load_match',
      public.load_route_data(v_match.load_id)
        || jsonb_build_object('vehicleId', p_vehicle_id, 'emptyKm', round(v_match.empty_km)::integer)
    );
  end loop;
end;
$$;

revoke all on function public.notify_matches_for_vehicle(uuid) from public, anon, authenticated;

-- What the release form shows first: the last known point and time of the
-- unit, and the route of the cancelled trip (for the map).
create function public.vehicle_release_context(p_task_id uuid)
returns table (
  task_id uuid,
  vehicle_id uuid,
  trip_id uuid,
  status public.release_task_status,
  created_at timestamptz,
  last_latitude double precision,
  last_longitude double precision,
  last_known_at timestamptz,
  origin_city text,
  origin_state text,
  origin_lat double precision,
  origin_lng double precision,
  destination_city text,
  destination_state text,
  destination_lat double precision,
  destination_lng double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.vehicle_release_tasks t
    join public.vehicles v on v.id = t.vehicle_id
    where t.id = p_task_id and (public.is_admin() or public.can_operate_unit(v.business_unit_id))
  ) then
    raise exception 'release task not found' using errcode = '42501';
  end if;

  return query
  select t.id, t.vehicle_id, t.trip_id, t.status, t.created_at,
         extensions.st_y(t.last_known_location::extensions.geometry),
         extensions.st_x(t.last_known_location::extensions.geometry),
         t.last_known_at,
         l.origin_city, l.origin_state, l.origin_lat, l.origin_lng,
         l.destination_city, l.destination_state, l.destination_lat, l.destination_lng
  from public.vehicle_release_tasks t
  join public.trips tr on tr.id = t.trip_id
  join public.loads l on l.id = tr.load_id
  where t.id = p_task_id;
end;
$$;

revoke all on function public.vehicle_release_context(uuid) from public, anon;
grant execute on function public.vehicle_release_context(uuid) to authenticated;

-- The manager, or a coordinator of the unit's current business unit,
-- confirms where the truck is and from when it is free. Locks the unit (as
-- the cancellation and assign_trip do) and then the task, so a release and an
-- assignment of the same unit serialize, and two releases close the task
-- once. Writes the availability with the source 'release' (held back, as in
-- F5, if the unit is already committed to another trip). Returns its id.
create function public.release_vehicle(
  p_task_id uuid,
  p_available_from timestamptz,
  p_latitude double precision,
  p_longitude double precision,
  p_city text,
  p_state text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_vehicle_id uuid;
  v_vehicle public.vehicles;
  v_task public.vehicle_release_tasks;
  v_city text := btrim(p_city);
  v_state text := btrim(p_state);
  v_notes text := nullif(btrim(p_notes), '');
  v_location extensions.geography;
  v_committed_to uuid;
  v_expired text;
  v_availability_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Authorize before locking, so nobody can lock another company's unit.
  select t.vehicle_id into v_vehicle_id
  from public.vehicle_release_tasks t
  join public.vehicles v on v.id = t.vehicle_id
  where t.id = p_task_id and public.can_operate_unit(v.business_unit_id);
  if not found then
    raise exception 'release task not found' using errcode = '42501';
  end if;

  -- Unit, then task. Re-checked under the lock: the manager may have moved
  -- the unit to another business unit meanwhile.
  select * into v_vehicle from public.vehicles v where v.id = v_vehicle_id for update;
  if not public.can_operate_unit(v_vehicle.business_unit_id) then
    raise exception 'release task not found' using errcode = '42501';
  end if;
  select * into v_task from public.vehicle_release_tasks t where t.id = p_task_id for update;
  if v_task.status <> 'pending' then
    raise exception 'release task is not pending' using errcode = '55000';
  end if;
  if v_vehicle.archived_at is not null then
    raise exception 'vehicle is archived' using errcode = '22023';
  end if;

  if p_available_from is null then
    raise exception 'p_available_from is required' using errcode = '22023';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'invalid coordinates' using errcode = '22023';
  end if;
  if v_city is null or char_length(v_city) not between 1 and 120
     or v_state is null or char_length(v_state) not between 1 and 60 then
    raise exception 'city and state are required' using errcode = '22023';
  end if;
  if char_length(v_notes) > 1000 then
    raise exception 'notes are too long' using errcode = '22023';
  end if;
  -- Same rule as set_vehicle_availability: a unit with expired documents
  -- cannot be made available (it stays pending until they are renewed).
  select string_agg(e.code, ', ' order by e.sort_order, e.code) into v_expired
  from public.vehicle_expired_requirements(v_vehicle.id) e;
  if v_expired is not null then
    raise exception 'vehicle has expired documents: %', v_expired using errcode = '55000';
  end if;

  v_location := extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography;
  v_committed_to := public.vehicle_committing_trip(v_vehicle.id, null);
  if v_committed_to is null then
    update public.vehicle_availability set archived_at = now()
    where vehicle_id = v_vehicle.id and archived_at is null;
  end if;
  insert into public.vehicle_availability (
    company_id, vehicle_id, available_from, location, city, state, source, created_by, archived_at, ended_by_trip_id
  ) values (
    v_vehicle.company_id, v_vehicle.id, p_available_from, v_location, v_city, v_state, 'release', v_uid,
    case when v_committed_to is not null then now() end, v_committed_to
  )
  returning id into v_availability_id;

  update public.vehicle_release_tasks
  set status = 'released', released_at = now(), released_by = v_uid, released_location = v_location,
      released_city = v_city, released_state = v_state, released_available_from = p_available_from,
      released_availability_id = v_availability_id, notes = v_notes
  where id = v_task.id;

  perform public.notify_carrier_staff(
    v_vehicle.company_id, v_vehicle.business_unit_id, 'vehicle_released',
    jsonb_build_object(
      'taskId', v_task.id, 'tripId', v_task.trip_id, 'vehicleId', v_vehicle.id,
      'vehicleLabel', public.vehicle_label(v_vehicle.id), 'city', v_city
    )
  );
  perform public.notify_matches_for_vehicle(v_vehicle.id);
  return v_availability_id;
end;
$$;

revoke all on function public.release_vehicle(uuid, timestamptz, double precision, double precision, text, text, text)
  from public, anon;
grant execute on function public.release_vehicle(uuid, timestamptz, double precision, double precision, text, text, text)
  to authenticated;
