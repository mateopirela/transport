-- B08 · Matching engine V1 (rules, D07): filter -> verify -> compute -> rank.
--
--   * match_pairs (internal): every compatible (unit, open load) pair, with the
--     straight-line metrics the scoring needs. One definition serves both
--     directions: the units of a carrier (match_candidates) and the units that
--     fit a load that was just published (notify_load_match).
--   * match_candidates (RPC): the candidates of one unit of the caller. The
--     Edge Function `recommendations` scores them (packages/shared/matching)
--     and resolves road distances only for the top N, through
--     route_distance_cache.
--   * Return-trip mode: a unit with a trip in progress starts at the trip's
--     destination, at its estimated end of unloading (B06).
--   * Reverse recommendations: publishing a load queues a `load_match`
--     notification for the carriers with a compatible unit (sent by B09).
--   * route_distance_cache: Google Routes results by rounded origin and
--     destination. Only the service role (Edge Functions) reads and writes it.
--
-- Security model (same as B01-B07): match_candidates is security definer
-- and checks explicitly that the unit belongs to the caller's approved
-- carrier company (or that the caller is an admin). It only returns open
-- loads (published or negotiating), which every approved carrier already
-- sees through loads_select. The internal functions are not executable by
-- clients.

-- ---------------------------------------------------------------------------
-- route_distance_cache: origin/destination rounded to 2 decimals (~1 km).
-- No client privileges and no policies: only the service role (which
-- bypasses RLS) uses it, through get/put_route_distances.
-- ---------------------------------------------------------------------------
create table public.route_distance_cache (
  origin_lat numeric(5, 2) not null constraint route_distance_cache_origin_lat check (origin_lat between -90 and 90),
  origin_lng numeric(6, 2) not null constraint route_distance_cache_origin_lng check (origin_lng between -180 and 180),
  destination_lat numeric(5, 2) not null
    constraint route_distance_cache_destination_lat check (destination_lat between -90 and 90),
  destination_lng numeric(6, 2) not null
    constraint route_distance_cache_destination_lng check (destination_lng between -180 and 180),
  distance_km numeric(8, 2) not null constraint route_distance_cache_distance check (distance_km between 0 and 10000),
  duration_minutes integer not null
    constraint route_distance_cache_duration check (duration_minutes between 0 and 20000),
  fetched_at timestamptz not null default now(),
  primary key (origin_lat, origin_lng, destination_lat, destination_lng)
);

comment on table public.route_distance_cache is
  'Road distances from Google Routes (B08). Service role only, through get_route_distances / put_route_distances.';

alter table public.route_distance_cache enable row level security;
revoke all on table public.route_distance_cache from public, anon, authenticated;
grant select, insert, update on table public.route_distance_cache to service_role;

-- Legs: [{originLat, originLng, destinationLat, destinationLng}]. Entries
-- older than 30 days are ignored (and refreshed by the caller).
create function public.get_route_distances(p_legs jsonb)
returns table (
  origin_lat numeric, origin_lng numeric, destination_lat numeric, destination_lng numeric,
  distance_km numeric, duration_minutes integer
)
language sql
stable
set search_path = ''
as $$
  select c.origin_lat, c.origin_lng, c.destination_lat, c.destination_lng, c.distance_km, c.duration_minutes
  from public.route_distance_cache c
  join jsonb_to_recordset(case when jsonb_typeof(p_legs) = 'array' then p_legs else '[]' end)
    as k("originLat" numeric, "originLng" numeric, "destinationLat" numeric, "destinationLng" numeric)
    on c.origin_lat = round(k."originLat", 2) and c.origin_lng = round(k."originLng", 2)
   and c.destination_lat = round(k."destinationLat", 2) and c.destination_lng = round(k."destinationLng", 2)
  where c.fetched_at > now() - interval '30 days';
$$;

-- Legs as above plus {distanceKm, durationMinutes}. Upserts by rounded key.
create function public.put_route_distances(p_legs jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.route_distance_cache as c (
    origin_lat, origin_lng, destination_lat, destination_lng, distance_km, duration_minutes, fetched_at
  )
  select distinct on (1, 2, 3, 4)
    round(k."originLat", 2), round(k."originLng", 2), round(k."destinationLat", 2), round(k."destinationLng", 2),
    round(k."distanceKm", 2), round(k."durationMinutes")::integer, now()
  from jsonb_to_recordset(case when jsonb_typeof(p_legs) = 'array' then p_legs else '[]' end)
    as k("originLat" numeric, "originLng" numeric, "destinationLat" numeric, "destinationLng" numeric,
         "distanceKm" numeric, "durationMinutes" numeric)
  on conflict (origin_lat, origin_lng, destination_lat, destination_lng) do update
  set distance_km = excluded.distance_km, duration_minutes = excluded.duration_minutes, fetched_at = excluded.fetched_at;
$$;

revoke all on function public.get_route_distances(jsonb) from public, anon, authenticated;
revoke all on function public.put_route_distances(jsonb) from public, anon, authenticated;
grant execute on function public.get_route_distances(jsonb) to service_role;
grant execute on function public.put_route_distances(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- A candidate: one open load for one unit, with straight-line metrics. The
-- scoring (packages/shared/matching) turns them into road distances.
-- ---------------------------------------------------------------------------
create type public.match_candidate as (
  load_id uuid,
  company_id uuid,
  vehicle_id uuid,
  -- Null in return-trip mode while the trip is in progress.
  availability_id uuid,
  start_city text,
  start_state text,
  start_lat double precision,
  start_lng double precision,
  available_from timestamptz,
  is_return_trip boolean,
  origin_city text,
  origin_state text,
  origin_lat double precision,
  origin_lng double precision,
  destination_city text,
  destination_state text,
  destination_lat double precision,
  destination_lng double precision,
  pickup_window_start timestamptz,
  pickup_window_end timestamptz,
  unit_type public.unit_type,
  weight_kg numeric,
  proposed_price_cents bigint,
  -- Straight line from where the unit is free to the pickup.
  empty_km double precision,
  -- Straight line from the delivery to the carrier's base (return trips only).
  home_distance_km double precision,
  -- The usual route of the carrier the load follows, if any.
  route_origin_city text,
  route_destination_city text
);

-- Internal: compatible pairs. Filters, in order:
--   * the unit: active, with a body (unit_type), all required documents
--     approved and current (vehicle_missing_requirements, B18), and its
--     carrier approved;
--   * where and when it starts: the destination of its trip in progress at
--     the estimated end of unloading (return-trip mode), otherwise its active
--     availability (or the one given). A trip in progress wins even when an
--     availability is given: assign_trip leaves the previous manual
--     availability active until unloading, and it no longer says where the
--     unit will be;
--   * the load: open, same unit type, fits weight and volume, its special
--     requirements are a subset of the unit's features, the unit is free
--     before the pickup window closes, and the pickup is within
--     p_max_empty_km in a straight line (ST_DWithin);
--   * the carrier is not negotiating that load yet.
-- The carrier's base is the origin of the unit's last trip: in return-trip
-- mode the unit heads back to where it came from.
create function public.match_pairs(
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
        select 1 as priority, null::uuid as availability_id, l.destination_location as location,
               l.destination_city as city, l.destination_state as state,
               coalesce(t.estimated_unload_end_at, l.delivery_window_end) as available_from,
               true as is_return_trip, l.origin_location as home_location
        from public.trips t
        join public.loads l on l.id = t.load_id
        where t.vehicle_id = u.id
          and t.status in ('assigned', 'en_route_to_pickup', 'at_pickup', 'loading', 'in_transit', 'at_delivery',
                           'unloading')
        union all
        select 2, a.id, a.location, a.city, a.state, a.available_from, a.source = 'trip_estimate',
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
      order by x.priority, x.available_from desc
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

-- ---------------------------------------------------------------------------
-- RPC: candidate loads for one unit of the caller, by vehicle or by one of
-- its active availabilities (either way, return-trip mode when the unit has
-- a trip in progress). Nearest pickups first; at most p_limit rows.
-- ---------------------------------------------------------------------------
create function public.match_candidates(
  p_vehicle_id uuid default null,
  p_availability_id uuid default null,
  p_max_empty_km integer default 150,
  p_limit integer default 50
)
returns setof public.match_candidate
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_vehicle_id uuid := p_vehicle_id;
  v_company_id uuid;
  v_is_admin boolean := public.is_admin();
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (p_vehicle_id is null) = (p_availability_id is null) then
    raise exception 'pass either p_vehicle_id or p_availability_id' using errcode = '22023';
  end if;
  if p_max_empty_km is null or p_max_empty_km not between 1 and 500 then
    raise exception 'p_max_empty_km must be between 1 and 500' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 200 then
    raise exception 'p_limit must be between 1 and 200' using errcode = '22023';
  end if;

  if p_availability_id is not null then
    select a.vehicle_id into v_vehicle_id
    from public.vehicle_availability a
    where a.id = p_availability_id and a.archived_at is null;
  end if;
  select v.company_id into v_company_id from public.vehicles v where v.id = v_vehicle_id;

  if v_company_id is null or (not v_is_admin and v_company_id is distinct from public.auth_fleet_company_id()) then
    raise exception 'vehicle not found' using errcode = '42501';
  end if;
  if not v_is_admin and not public.is_company_approved() then
    raise exception 'company is not approved' using errcode = '42501';
  end if;

  return query
  select m.*
  from public.match_pairs(v_vehicle_id, null, p_max_empty_km, p_availability_id) m
  order by m.empty_km, m.pickup_window_start, m.load_id
  limit p_limit;
end;
$$;

revoke all on function public.match_candidates(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.match_candidates(uuid, uuid, integer, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reverse recommendations: when a load is published, the carriers with a
-- compatible unit (default radius, 150 km) get a `load_match` notification,
-- one per company with its nearest unit. Capped at the 50 nearest companies.
-- The dispatcher (B09) sends the push.
-- Only units that can reach the pickup before its window closes count, with
-- the same estimate the scoring uses without Google Routes
-- (packages/shared/matching: haversine x DEFAULT_ROAD_DISTANCE_FACTOR 1.3 at
-- ESTIMATED_TRUCK_SPEED_KMH 60), so carriers are not alerted of pickups that
-- scoreCandidate would reject.
-- ---------------------------------------------------------------------------
create function public.notify_load_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match record;
  v_route jsonb := public.load_route_data(new.id);
begin
  for v_match in
    select * from (
      select distinct on (m.company_id) m.company_id, m.vehicle_id, m.empty_km
      from public.match_pairs(null, new.id, 150) m
      where greatest(m.available_from, now()) + make_interval(secs => m.empty_km * 1.3 / 60 * 3600)
            <= m.pickup_window_end
      order by m.company_id, m.empty_km
    ) best
    order by best.empty_km
    limit 50
  loop
    perform public.notify_company(
      v_match.company_id, 'carrier', 'load_match',
      v_route || jsonb_build_object('vehicleId', v_match.vehicle_id, 'emptyKm', round(v_match.empty_km)::integer)
    );
  end loop;
  return null;
end;
$$;

revoke all on function public.notify_load_match() from public, anon, authenticated;

create trigger loads_notify_match_on_publish
after update of status on public.loads
for each row
when (old.status = 'draft' and new.status = 'published')
execute function public.notify_load_match();

create trigger loads_notify_match_on_insert
after insert on public.loads
for each row
when (new.status = 'published')
execute function public.notify_load_match();
