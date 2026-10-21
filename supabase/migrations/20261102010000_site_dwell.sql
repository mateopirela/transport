-- H5 · Waiting times at loading and unloading sites (D32): how long trucks
-- really wait at each site, measured from the trip events (D11), and used in
-- the estimated end of a trip, in the hour return trips become available and
-- as information for the shipper about its own sites.
--
--   * trip_stop_dwells: one row per trip and stop (pickup, delivery), derived
--     from trip_events by the trigger trip_events_record_dwell (an offline
--     event that arrives late counts with its occurred_at). The "site" is the
--     point of the load rounded to 3 decimals (~100 m). Waiting = arrival →
--     start of loading/unloading; handling = start → finish. Rows with
--     negative times or more than 72 h are kept but `excluded`.
--   * site_dwell_stats (internal) and site_dwell_estimate (RPC): median and
--     p75 of waiting, handling and their sum, with the basis and the sample
--     size. The first tier with 5 or more valid measurements wins: same site
--     and hour band → same site → same shipper (all its sites) → default
--     (DEFAULT_DWELL_MINUTES, the 4 h the app always suggested).
--     Privacy: a tier mixing other carriers' trips counts them only when it
--     has trips of 2 or more carriers; otherwise only the caller's own trips
--     count. A shipper only ever counts its own trips. Admins see everything.
--   * trip_end_estimate (internal) and trip_estimated_end (RPC): the estimated
--     end of unloading of a trip = arrival at the delivery (or, before it, the
--     estimated arrival: end of loading + driving time from
--     route_distance_cache or haversine × road factor at 60 km/h, and never
--     before the delivery window opens) + the site's time. Once unloading
--     started, the operator's estimate wins.
--   * vehicle_trip_chain_end: the end of each trip of a unit's chain uses
--     trip_end_estimate before falling back to the delivery window (return
--     trips, B08/F5).
--
-- packages/shared/src/dwell.ts mirrors the tiers, the bands and the defaults.

create type public.trip_stop as enum ('pickup', 'delivery');

-- Hour band of an arrival in Mexico City: night 0–6, morning 6–12, afternoon
-- 12–18, evening 18–24. Mirrors hourBand in packages/shared/src/dwell.ts.
-- Immutable on purpose: it backs a generated column (the zone's rules are
-- fixed, Mexico has no daylight saving time since 2022).
create function public.dwell_hour_band(p_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_at is null then null
    when extract(hour from p_at at time zone 'America/Mexico_City') < 6 then 'night'
    when extract(hour from p_at at time zone 'America/Mexico_City') < 12 then 'morning'
    when extract(hour from p_at at time zone 'America/Mexico_City') < 18 then 'afternoon'
    else 'evening'
  end;
$$;

revoke all on function public.dwell_hour_band(timestamptz) from public, anon;
grant execute on function public.dwell_hour_band(timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- trip_stop_dwells: derived from trip_events, written only by the trigger.
-- ---------------------------------------------------------------------------
create table public.trip_stop_dwells (
  trip_id uuid not null references public.trips (id) on delete restrict,
  stop public.trip_stop not null,
  shipper_company_id uuid not null references public.companies (id) on delete restrict,
  carrier_company_id uuid not null references public.companies (id) on delete restrict,
  -- The point of the load rounded to ~100 m: the "site".
  site_lat numeric(6, 3) not null constraint trip_stop_dwells_site_lat_range check (site_lat between -90 and 90),
  site_lng numeric(7, 3) not null constraint trip_stop_dwells_site_lng_range check (site_lng between -180 and 180),
  arrived_at timestamptz,
  handling_started_at timestamptz,
  handling_finished_at timestamptz,
  wait_minutes integer generated always as (
    round(extract(epoch from handling_started_at - arrived_at) / 60)::integer
  ) stored,
  handling_minutes integer generated always as (
    round(extract(epoch from handling_finished_at - handling_started_at) / 60)::integer
  ) stored,
  hour_band text generated always as (public.dwell_hour_band(arrived_at)) stored,
  -- Outliers: negative times (events out of order) or more than 72 h.
  excluded boolean generated always as (
    coalesce(
      handling_started_at < arrived_at
      or handling_finished_at < handling_started_at
      or handling_started_at - arrived_at > interval '72 hours'
      or handling_finished_at - handling_started_at > interval '72 hours',
      false
    )
  ) stored,
  updated_at timestamptz not null default now(),
  primary key (trip_id, stop)
);

comment on table public.trip_stop_dwells is
  'Waiting and handling times of each trip at its pickup and delivery (H5, D32), derived from trip_events by trip_events_record_dwell. Aggregates across companies only through site_dwell_estimate and trip_estimated_end.';

create index trip_stop_dwells_site_idx on public.trip_stop_dwells (stop, site_lat, site_lng);
create index trip_stop_dwells_shipper_idx on public.trip_stop_dwells (stop, shipper_company_id);

alter table public.trip_stop_dwells enable row level security;
revoke all on table public.trip_stop_dwells from anon, authenticated;
grant select on table public.trip_stop_dwells to authenticated;

-- The staff of the trip's business unit, the shipper of the trip and admins.
-- Operators read their trip's events, not these rows.
create policy trip_stop_dwells_select
on public.trip_stop_dwells
for select
to authenticated
using (
  shipper_company_id = (select public.auth_shipper_company_id())
  or exists (
    select 1 from public.trips t
    where t.id = trip_stop_dwells.trip_id and public.can_operate_unit(t.business_unit_id)
  )
  or (select public.is_admin())
);

-- ---------------------------------------------------------------------------
-- The trigger: each arrival / start / finish event fills its column.
-- ---------------------------------------------------------------------------
create function public.trip_events_record_dwell()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stop public.trip_stop := case
    when new.event_type in ('arrived_at_pickup', 'loading_started', 'loading_finished') then 'pickup'
    else 'delivery'
  end::public.trip_stop;
  v_arrived timestamptz := case when new.event_type in ('arrived_at_pickup', 'arrived_at_delivery')
                                then new.occurred_at end;
  v_started timestamptz := case when new.event_type in ('loading_started', 'unloading_started')
                                then new.occurred_at end;
  v_finished timestamptz := case when new.event_type in ('loading_finished', 'unloading_finished')
                                 then new.occurred_at end;
begin
  insert into public.trip_stop_dwells (
    trip_id, stop, shipper_company_id, carrier_company_id, site_lat, site_lng,
    arrived_at, handling_started_at, handling_finished_at
  )
  select t.id, v_stop, t.shipper_company_id, t.carrier_company_id,
         round((case when v_stop = 'pickup' then l.origin_lat else l.destination_lat end)::numeric, 3),
         round((case when v_stop = 'pickup' then l.origin_lng else l.destination_lng end)::numeric, 3),
         v_arrived, v_started, v_finished
  from public.trips t
  join public.loads l on l.id = t.load_id
  where t.id = new.trip_id
  on conflict (trip_id, stop) do update
  set arrived_at = coalesce(excluded.arrived_at, trip_stop_dwells.arrived_at),
      handling_started_at = coalesce(excluded.handling_started_at, trip_stop_dwells.handling_started_at),
      handling_finished_at = coalesce(excluded.handling_finished_at, trip_stop_dwells.handling_finished_at),
      updated_at = now();
  return null;
end;
$$;

revoke all on function public.trip_events_record_dwell() from public, anon, authenticated;

create trigger trip_events_record_dwell
after insert on public.trip_events
for each row
when (new.event_type in ('arrived_at_pickup', 'loading_started', 'loading_finished',
                         'arrived_at_delivery', 'unloading_started', 'unloading_finished'))
execute function public.trip_events_record_dwell();

-- Backfill with the trips that already exist (the first event of each kind).
insert into public.trip_stop_dwells (
  trip_id, stop, shipper_company_id, carrier_company_id, site_lat, site_lng,
  arrived_at, handling_started_at, handling_finished_at
)
select t.id, s.stop, t.shipper_company_id, t.carrier_company_id,
       round((case when s.stop = 'pickup' then l.origin_lat else l.destination_lat end)::numeric, 3),
       round((case when s.stop = 'pickup' then l.origin_lng else l.destination_lng end)::numeric, 3),
       e.arrived_at, e.started_at, e.finished_at
from public.trips t
join public.loads l on l.id = t.load_id
cross join (values ('pickup'::public.trip_stop), ('delivery'::public.trip_stop)) as s(stop)
cross join lateral (
  select
    min(x.occurred_at) filter (where x.event_type in ('arrived_at_pickup', 'arrived_at_delivery')) as arrived_at,
    min(x.occurred_at) filter (where x.event_type in ('loading_started', 'unloading_started')) as started_at,
    min(x.occurred_at) filter (where x.event_type in ('loading_finished', 'unloading_finished')) as finished_at
  from public.trip_events x
  where x.trip_id = t.id
    and x.event_type = any (
      case when s.stop = 'pickup'
        then array['arrived_at_pickup', 'loading_started', 'loading_finished']::public.trip_event_type[]
        else array['arrived_at_delivery', 'unloading_started', 'unloading_finished']::public.trip_event_type[]
      end
    )
) e
where coalesce(e.arrived_at, e.started_at, e.finished_at) is not null;

-- ---------------------------------------------------------------------------
-- Aggregates
-- ---------------------------------------------------------------------------
-- The statistic of a site as one viewer may see it (see the header). Not
-- callable by clients: site_dwell_estimate and trip_end_estimate pass the
-- viewer. p_at null skips the hour-band tier.
create function public.site_dwell_stats(
  p_stop public.trip_stop,
  p_lat double precision,
  p_lng double precision,
  p_shipper_company_id uuid,
  p_at timestamptz,
  p_carrier_viewer uuid,
  p_shipper_viewer uuid,
  p_all boolean
)
returns table (
  basis text,
  sample_size integer,
  wait_median_minutes integer,
  wait_p75_minutes integer,
  handling_median_minutes integer,
  handling_p75_minutes integer,
  total_median_minutes integer,
  total_p75_minutes integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  -- Mirrors DWELL_MIN_SAMPLES and DEFAULT_DWELL_MINUTES (packages/shared/src/dwell.ts).
  c_min_samples constant integer := 5;
  c_default_minutes constant integer := 240;
  v_lat numeric := round(p_lat::numeric, 3);
  v_lng numeric := round(p_lng::numeric, 3);
  v_band text := public.dwell_hour_band(p_at);
  v_tier text;
begin
  foreach v_tier in array array['site_hour', 'site', 'shipper'] loop
    continue when v_tier = 'site_hour' and v_band is null;
    continue when v_tier = 'shipper' and p_shipper_company_id is null;
    return query
      with tier as (
        select d.carrier_company_id, d.shipper_company_id, d.wait_minutes, d.handling_minutes
        from public.trip_stop_dwells d
        where d.stop = p_stop
          and not d.excluded
          and d.wait_minutes is not null
          and d.handling_minutes is not null
          and case
            when v_tier = 'shipper' then d.shipper_company_id = p_shipper_company_id
            else d.site_lat = v_lat and d.site_lng = v_lng and (v_tier = 'site' or d.hour_band = v_band)
          end
      ),
      shared as (
        select count(distinct x.carrier_company_id) >= 2 as ok from tier x
      ),
      visible as (
        select x.* from tier x, shared s
        where coalesce(p_all, false)
           or (p_shipper_viewer is not null and x.shipper_company_id = p_shipper_viewer)
           or (p_carrier_viewer is not null and (s.ok or x.carrier_company_id = p_carrier_viewer))
      )
      select v_tier,
             count(*)::integer,
             round(percentile_cont(0.5) within group (order by v.wait_minutes))::integer,
             round(percentile_cont(0.75) within group (order by v.wait_minutes))::integer,
             round(percentile_cont(0.5) within group (order by v.handling_minutes))::integer,
             round(percentile_cont(0.75) within group (order by v.handling_minutes))::integer,
             round(percentile_cont(0.5) within group (order by v.wait_minutes + v.handling_minutes))::integer,
             round(percentile_cont(0.75) within group (order by v.wait_minutes + v.handling_minutes))::integer
      from visible v
      having count(*) >= c_min_samples;
    if found then
      return;
    end if;
  end loop;
  return query select 'default'::text, 0, null::integer, null::integer, null::integer, null::integer,
                      c_default_minutes, c_default_minutes;
end;
$$;

revoke all on function public.site_dwell_stats(public.trip_stop, double precision, double precision, uuid,
  timestamptz, uuid, uuid, boolean) from public, anon, authenticated;

-- The typical time at a site for the caller: a carrier's staff and operators
-- count their company's trips (and others' only from 2 carriers up), a
-- shipper its own trips, an admin every trip. Always one row.
create function public.site_dwell_estimate(
  p_stop public.trip_stop,
  p_lat double precision,
  p_lng double precision,
  p_shipper_company_id uuid default null,
  p_at timestamptz default now()
)
returns table (
  basis text,
  sample_size integer,
  wait_median_minutes integer,
  wait_p75_minutes integer,
  handling_median_minutes integer,
  handling_p75_minutes integer,
  total_median_minutes integer,
  total_p75_minutes integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_stop is null or p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid site' using errcode = '22023';
  end if;
  return query
    select * from public.site_dwell_stats(
      p_stop, p_lat, p_lng, p_shipper_company_id, p_at,
      coalesce(
        public.auth_carrier_company_id(),
        (select o.company_id from public.operators o where o.id = public.auth_operator_id())
      ),
      public.auth_shipper_company_id(),
      public.is_admin()
    );
end;
$$;

revoke all on function public.site_dwell_estimate(public.trip_stop, double precision, double precision, uuid,
  timestamptz) from public, anon;
grant execute on function public.site_dwell_estimate(public.trip_stop, double precision, double precision, uuid,
  timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Estimated end of unloading of a trip
-- ---------------------------------------------------------------------------
-- source: 'finished' (unloading finished: the real end), 'operator' (the
-- operator's estimate after starting to unload), 'measured' (the site's
-- measured time) or 'default' (4 h). No row for an unknown or cancelled trip.
-- The statistics are the carrier's view, or the shipper's with p_shipper_view.
-- Not callable by clients: trip_estimated_end checks who asks.
create function public.trip_end_estimate(p_trip_id uuid, p_shipper_view boolean default false)
returns table (
  ends_at timestamptz,
  source text,
  basis text,
  sample_size integer,
  arrival_at timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
declare
  -- Mirrors DEFAULT_ROAD_DISTANCE_FACTOR and ESTIMATED_TRUCK_SPEED_KMH.
  c_road_factor constant numeric := 1.3;
  c_speed_kmh constant numeric := 60;
  v_trip record;
  v_pickup public.trip_stop_dwells;
  v_delivery public.trip_stop_dwells;
  v_carrier uuid;
  v_shipper uuid;
  v_estimate record;
  v_pickup_at timestamptz;
  v_depart timestamptz;
  v_arrival timestamptz;
  v_minutes numeric;
begin
  select t.status, t.estimated_unload_end_at, t.shipper_company_id, t.carrier_company_id,
         l.origin_lat, l.origin_lng, l.destination_lat, l.destination_lng,
         l.origin_location, l.destination_location, l.pickup_window_start, l.delivery_window_start
  into v_trip
  from public.trips t
  join public.loads l on l.id = t.load_id
  where t.id = p_trip_id;
  if not found or v_trip.status = 'cancelled' then
    return;
  end if;

  select * into v_pickup from public.trip_stop_dwells d where d.trip_id = p_trip_id and d.stop = 'pickup';
  select * into v_delivery from public.trip_stop_dwells d where d.trip_id = p_trip_id and d.stop = 'delivery';

  if v_delivery.handling_finished_at is not null then
    return query select v_delivery.handling_finished_at, 'finished'::text, null::text, null::integer,
                        v_delivery.arrived_at;
    return;
  end if;
  if v_delivery.handling_started_at is not null and v_trip.estimated_unload_end_at is not null then
    return query select v_trip.estimated_unload_end_at, 'operator'::text, null::text, null::integer,
                        v_delivery.arrived_at;
    return;
  end if;

  if coalesce(p_shipper_view, false) then
    v_shipper := v_trip.shipper_company_id;
  else
    v_carrier := v_trip.carrier_company_id;
  end if;

  v_arrival := v_delivery.arrived_at;
  if v_arrival is null then
    -- When the truck leaves the pickup: the real end of loading, or its estimate.
    v_depart := v_pickup.handling_finished_at;
    if v_depart is null then
      v_pickup_at := coalesce(v_pickup.arrived_at, v_trip.pickup_window_start);
      select * into v_estimate from public.site_dwell_stats(
        'pickup', v_trip.origin_lat, v_trip.origin_lng, v_trip.shipper_company_id, v_pickup_at,
        v_carrier, v_shipper, false);
      v_depart := case
        when v_pickup.handling_started_at is not null then v_pickup.handling_started_at
          + coalesce(v_estimate.handling_median_minutes, v_estimate.total_median_minutes) * interval '1 minute'
        else v_pickup_at + v_estimate.total_median_minutes * interval '1 minute'
      end;
    end if;
    -- Driving time: the cached Routes answer (B08), or the straight-line estimate.
    select c.duration_minutes into v_minutes
    from public.route_distance_cache c
    where c.origin_lat = round(v_trip.origin_lat::numeric, 2)
      and c.origin_lng = round(v_trip.origin_lng::numeric, 2)
      and c.destination_lat = round(v_trip.destination_lat::numeric, 2)
      and c.destination_lng = round(v_trip.destination_lng::numeric, 2);
    v_minutes := coalesce(
      v_minutes,
      extensions.st_distance(v_trip.origin_location, v_trip.destination_location) / 1000
        * c_road_factor / c_speed_kmh * 60
    );
    -- A truck that would arrive early waits for the delivery window to open.
    v_arrival := greatest(v_depart + v_minutes * interval '1 minute', v_trip.delivery_window_start);
  end if;

  select * into v_estimate from public.site_dwell_stats(
    'delivery', v_trip.destination_lat, v_trip.destination_lng, v_trip.shipper_company_id, v_arrival,
    v_carrier, v_shipper, false);
  return query select
    case
      when v_delivery.handling_started_at is not null then v_delivery.handling_started_at
        + coalesce(v_estimate.handling_median_minutes, v_estimate.total_median_minutes) * interval '1 minute'
      else v_arrival + v_estimate.total_median_minutes * interval '1 minute'
    end,
    case when v_estimate.basis = 'default' then 'default' else 'measured' end,
    v_estimate.basis::text,
    v_estimate.sample_size::integer,
    v_arrival;
end;
$$;

revoke all on function public.trip_end_estimate(uuid, boolean) from public, anon, authenticated;

-- The estimated end of unloading for whoever sees the trip (trips_select):
-- the shipper gets the statistics of its own trips, everyone else the
-- carrier's. 42501 for anyone else.
create function public.trip_estimated_end(p_trip_id uuid)
returns table (
  ends_at timestamptz,
  source text,
  basis text,
  sample_size integer,
  arrival_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shipper_view boolean;
begin
  select coalesce(t.shipper_company_id = public.auth_shipper_company_id(), false)
  into v_shipper_view
  from public.trips t
  where t.id = p_trip_id
    and (t.shipper_company_id = public.auth_shipper_company_id()
         or t.carrier_company_id = public.auth_fleet_company_id()
         or public.can_operate_unit(t.business_unit_id)
         or (t.operator_id is not null and t.operator_id = public.auth_operator_id())
         or public.is_admin());
  if not found then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  return query select * from public.trip_end_estimate(p_trip_id, v_shipper_view);
end;
$$;

revoke all on function public.trip_estimated_end(uuid) from public, anon;
grant execute on function public.trip_estimated_end(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Return trips: the chain of a unit's trips ends with the measured times
-- ---------------------------------------------------------------------------
-- Same as F5 (20261021000000_unit_availability_restore.sql), except that the
-- end of each trip, in its two places (the end and the order of the started
-- trips), is coalesce(estimated_unload_end_at, trip_end_estimate(t.id),
-- delivery_window_end): the estimate of H5 comes before the delivery window.
-- The chain (order, carried delays) is unchanged.
create or replace function public.vehicle_trip_chain_end(p_vehicle_id uuid)
returns table (load_id uuid, available_from timestamptz)
language sql
stable
set search_path = ''
as $$
  with recursive unit_trips as materialized (
    select t.id as trip_id, l.id as load_id,
           t.status not in ('pending_assignment', 'assigned') as started,
           t.estimated_unload_end_at, l.delivery_window_end, l.pickup_window_start
    from public.trips t
    join public.loads l on l.id = t.load_id
    left join public.offers o on o.id = t.offer_id
    where (t.vehicle_id = p_vehicle_id
           and t.status in ('assigned', 'en_route_to_pickup', 'at_pickup', 'loading', 'in_transit',
                            'at_delivery', 'unloading'))
       or (t.status = 'pending_assignment' and t.vehicle_id is null and o.vehicle_id = p_vehicle_id)
  ),
  ends as (
    select u.*,
           coalesce(u.estimated_unload_end_at,
                    (select e.ends_at from public.trip_end_estimate(u.trip_id) e),
                    u.delivery_window_end) as ends_at
    from unit_trips u
  ),
  committed as (
    select e.load_id, e.started, e.ends_at, e.pickup_window_start,
           row_number() over (
             order by e.started desc,
                      case when not e.started then e.pickup_window_start else e.ends_at end,
                      e.trip_id
           ) as n
    from ends e
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
