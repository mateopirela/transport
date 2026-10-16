-- F2 · Database integrity fixes left in the "Seguimiento" of B06-B24:
--   1. Deleting an account no longer fails on the immutable trip timeline and
--      evidence: their `on delete set null` to auth.users is let through, as
--      trip_documents_guard (B15) already does. (messages keeps its
--      `on delete restrict` on purpose: chat authorship is never erased.)
--   2. The Edge Function RPCs (service role only) check the JWT role claim on
--      top of the grants, like consume_service_rate_limit (B24).
--   3. report_incident takes an idempotency key (p_client_event_id), like the
--      other trip event RPCs, so a retry never duplicates an incident.
--   4. Reassigning a trip also tells the operator who was taken off it.
--   5. A unit committed to its next trip (a return trip, B08) keeps no
--      `trip_estimate` availability, and matching starts it from that trip
--      even before it is assigned.

-- ---------------------------------------------------------------------------
-- 1. Immutable rows that reference auth.users with `on delete set null`
-- ---------------------------------------------------------------------------
-- Rejects UPDATE and DELETE like reject_mutation(), except an UPDATE whose
-- only change is setting some of the columns named in the trigger arguments
-- from a user id to null: the `on delete set null` of those columns when the
-- user is deleted. Stored generated columns are left out of the comparison
-- (NEW does not hold them yet in a BEFORE trigger); they follow from the
-- columns that are compared.
create function public.reject_mutation_except_user_erasure()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_column text;
  v_erased boolean := false;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    foreach v_column in array tg_argv loop
      if v_new -> v_column = 'null'::jsonb then
        v_erased := v_erased or v_old -> v_column <> 'null'::jsonb;
        v_old := v_old - v_column;
        v_new := v_new - v_column;
      end if;
    end loop;
    v_old := v_old - coalesce((
      select array_agg(a.attname::text) from pg_catalog.pg_attribute a
      where a.attrelid = tg_relid and a.attgenerated <> '' and not a.attisdropped
    ), '{}');
    v_new := v_new - coalesce((
      select array_agg(a.attname::text) from pg_catalog.pg_attribute a
      where a.attrelid = tg_relid and a.attgenerated <> '' and not a.attisdropped
    ), '{}');
    if v_erased and v_old = v_new then
      return new;
    end if;
  end if;
  raise exception '% is immutable', tg_table_name using errcode = '42501';
end;
$$;

revoke all on function public.reject_mutation_except_user_erasure() from public, anon, authenticated;

drop trigger trip_events_immutable on public.trip_events;
create trigger trip_events_immutable before update or delete on public.trip_events
for each row execute function public.reject_mutation_except_user_erasure('actor_id');

drop trigger trip_evidence_immutable on public.trip_evidence;
create trigger trip_evidence_immutable before update or delete on public.trip_evidence
for each row execute function public.reject_mutation_except_user_erasure('uploaded_by');

-- ---------------------------------------------------------------------------
-- 2. Edge Function RPCs: explicit service role check (same bodies as B09)
-- ---------------------------------------------------------------------------
create or replace function public.claim_notifications(p_limit integer default 100, p_lease_seconds integer default 120)
returns table (
  id uuid,
  user_id uuid,
  type public.notification_type,
  data jsonb,
  created_at timestamptz,
  attempt integer,
  push_pending boolean,
  email_pending boolean,
  email text,
  role public.user_role,
  push_tokens text[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Explicit caller check on top of the grants: only the service role key
  -- (its JWT role claim) may run the dispatcher.
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'limit must be between 1 and 500' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 10 and 3600 then
    raise exception 'lease must be between 10 and 3600 seconds' using errcode = '22023';
  end if;

  -- Close every stale row first, so they never take the place of fresh ones
  -- in the batch (the dispatcher stops at a short batch).
  update public.notifications n
  set dispatched_at = now(), dispatch_retry_at = null, dispatch_error = 'stale'
  where n.id in (
    select s.id from public.notifications s
    where s.dispatched_at is null and s.created_at < now() - interval '1 day'
      and (s.dispatch_retry_at is null or s.dispatch_retry_at <= now())
    for update skip locked
  );

  return query
  with due as (
    select n.id,
           n.push_state is null as push_pending,
           n.email_state is null or n.email_state = 'in_flight' as email_pending
    from public.notifications n
    where n.dispatched_at is null
      and n.created_at >= now() - interval '1 day'
      and (n.dispatch_retry_at is null or n.dispatch_retry_at <= now())
    order by n.created_at, n.id
    limit p_limit
    for update skip locked
  ),
  claimed as (
    update public.notifications n
    set dispatch_attempts = n.dispatch_attempts + 1,
        dispatch_retry_at = now() + make_interval(secs => p_lease_seconds),
        push_state = case
          when n.push_state is null then 'in_flight'
          when n.push_state = 'in_flight' then 'unknown'
          else n.push_state
        end,
        email_state = case when d.email_pending then 'in_flight' else n.email_state end
    from due d
    where n.id = d.id
    returning n.*, d.push_pending, d.email_pending
  )
  select c.id, c.user_id, c.type, c.data, c.created_at, c.dispatch_attempts::integer,
         c.push_pending, c.email_pending,
         u.email::text, p.role,
         coalesce(
           (select array_agg(t.token order by t.last_seen_at desc, t.id) from public.push_tokens t where t.user_id = c.user_id),
           '{}'
         )
  from claimed c
  join auth.users u on u.id = c.user_id
  left join public.profiles p on p.id = c.user_id
  order by c.created_at, c.id;
end;
$$;

create or replace function public.record_notification_dispatch(p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Explicit caller check on top of the grants (see claim_notifications).
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results) > 500 then
    raise exception 'results must be an array of at most 500 items' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_results) x
    where jsonb_typeof(x) is distinct from 'object'
       or coalesce(x ->> 'push', '') not in ('sent', 'skipped', 'failed', 'retry')
       or coalesce(x ->> 'email', '') not in ('sent', 'skipped', 'failed', 'retry')
  ) then
    raise exception 'each result needs push and email outcomes' using errcode = '22023';
  end if;

  with r as (
    select distinct on ((x ->> 'id')::uuid)
           (x ->> 'id')::uuid as id,
           (x ->> 'attempt')::integer as attempt,
           x ->> 'push' as push,
           x ->> 'email' as email,
           left(nullif(btrim(x ->> 'error'), ''), 1000) as error
    from jsonb_array_elements(p_results) x
    order by (x ->> 'id')::uuid
  ),
  -- Lock first: if a newer claim holds the row, this waits for it and then
  -- re-reads the row, so an old attempt no longer matches and changes nothing.
  planned as (
    select n.id, r.error, n.dispatch_attempts,
           case when n.push_state = 'in_flight'
                then nullif(r.push, 'retry') else n.push_state end as push_state,
           case when n.email_state = 'in_flight'
                then nullif(r.email, 'retry') else n.email_state end as email_state
    from r
    join public.notifications n on n.id = r.id
    where n.dispatched_at is null
      and n.dispatch_attempts = r.attempt
    order by n.id
    for update of n
  )
  update public.notifications n
  set push_state = x.push_state,
      email_state = x.email_state,
      dispatched_at = case
        when (x.push_state is not null and x.email_state is not null) or x.dispatch_attempts >= 5 then now()
      end,
      dispatch_retry_at = case
        when (x.push_state is not null and x.email_state is not null) or x.dispatch_attempts >= 5 then null
        else now() + make_interval(mins => power(4, x.dispatch_attempts - 1)::integer)
      end,
      dispatch_error = x.error
  from planned x
  where n.id = x.id
    and n.dispatched_at is null
    and n.dispatch_attempts = x.dispatch_attempts;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.delete_push_tokens(p_tokens text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Explicit caller check on top of the grants (see claim_notifications).
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if cardinality(p_tokens) > 1000 then
    raise exception 'at most 1000 tokens' using errcode = '22023';
  end if;
  delete from public.push_tokens where token = any (p_tokens);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. report_incident: idempotent on p_client_event_id (operator retries)
-- ---------------------------------------------------------------------------
-- The key is stored on the `incident_reported` event (trip_events is unique on
-- (trip_id, client_event_id)). A repeated key returns the incident it already
-- created, even if the trip changed since (as record_trip_event does).
drop function public.report_incident(
  uuid, public.incident_kind, text, timestamptz, double precision, double precision
);

create function public.report_incident(
  p_trip_id uuid,
  p_kind public.incident_kind,
  p_description text,
  p_occurred_at timestamptz default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_client_event_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_description text := nullif(btrim(p_description), '');
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
  v_event_type public.trip_event_type;
  v_id uuid;
begin
  if not public.is_admin() and not exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and (t.shipper_company_id = public.auth_shipper_company_id()
           or t.carrier_company_id = public.auth_fleet_company_id()
           or t.operator_id = public.auth_operator_id())
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  select * into v_trip from public.trips where id = p_trip_id for update;
  -- Re-checked under the lock: the trip may have been reassigned meanwhile.
  if not found or not coalesce(
    public.is_admin()
    or v_trip.shipper_company_id = public.auth_shipper_company_id()
    or v_trip.carrier_company_id = public.auth_fleet_company_id()
    or v_trip.operator_id = public.auth_operator_id(),
    false
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;

  -- Under the trip lock, so two retries with the same key never both insert.
  if p_client_event_id is not null then
    select e.event_type, e.incident_id into v_event_type, v_id from public.trip_events e
    where e.trip_id = v_trip.id and e.client_event_id = p_client_event_id;
    if found then
      if v_event_type <> 'incident_reported' then
        raise exception 'client_event_id belongs to another event' using errcode = '22023';
      end if;
      return v_id;
    end if;
  end if;

  if v_trip.status = 'cancelled' then
    raise exception 'trip is cancelled' using errcode = '55000';
  end if;
  if p_kind is null or v_description is null or char_length(v_description) > 2000 then
    raise exception 'an incident needs a kind and a description of at most 2000 characters' using errcode = '22023';
  end if;
  perform public.assert_trip_timestamp(v_trip, v_occurred_at, 'occurred_at');
  perform public.assert_coordinates(p_latitude, p_longitude);

  insert into public.incidents (trip_id, kind, description, occurred_at, latitude, longitude, reported_by, reporter_role)
  values (v_trip.id, p_kind, v_description, v_occurred_at, p_latitude, p_longitude, (select auth.uid()),
          public.auth_role())
  returning id into v_id;

  insert into public.trip_events (
    trip_id, event_type, occurred_at, latitude, longitude, incident_id, actor_id, actor_role, client_event_id
  ) values (
    v_trip.id, 'incident_reported', v_occurred_at, p_latitude, p_longitude, v_id, (select auth.uid()),
    public.auth_role(), p_client_event_id
  );
  return v_id;
end;
$$;

revoke all on function public.report_incident(
  uuid, public.incident_kind, text, timestamptz, double precision, double precision, uuid
) from public, anon;
grant execute on function public.report_incident(
  uuid, public.incident_kind, text, timestamptz, double precision, double precision, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Reassignment: the operator taken off the trip is told too
-- ---------------------------------------------------------------------------
alter type public.notification_type add value if not exists 'trip_unassigned';

-- notify_trip_event (B07) tells the new operator. The data carries no trip id:
-- the previous operator can no longer open the trip, so the push leads nowhere.
-- Not security definer: trips are written only by the trip RPCs (clients have
-- no write privilege on trips), which run as their owner.
create function public.notify_trip_unassigned()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, type, data)
  select o.profile_id, 'trip_unassigned', public.load_route_data(new.load_id)
  from public.operators o
  where o.id = old.operator_id
    and o.profile_id is not null
    and o.profile_id is distinct from (select auth.uid());
  return null;
end;
$$;

revoke all on function public.notify_trip_unassigned() from public, anon, authenticated;

create trigger trips_notify_unassigned
after update of operator_id on public.trips
for each row
when (old.operator_id is not null and old.operator_id is distinct from new.operator_id)
execute function public.notify_trip_unassigned();

-- ---------------------------------------------------------------------------
-- 5. Return trips: a committed unit keeps no trip_estimate availability
-- ---------------------------------------------------------------------------
-- Whether the unit is committed to a trip other than p_trip_id that is not
-- over yet: assigned to it, or offered for it in the accepted offer while the
-- trip waits for its assignment.
create function public.vehicle_committed_elsewhere(p_vehicle_id uuid, p_trip_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.trips t
    left join public.offers o on o.id = t.offer_id
    where t.id is distinct from p_trip_id
      and t.status not in ('delivered', 'closed', 'cancelled')
      and (t.vehicle_id = p_vehicle_id
           or (t.status = 'pending_assignment' and t.vehicle_id is null and o.vehicle_id = p_vehicle_id))
  );
$$;

revoke all on function public.vehicle_committed_elsewhere(uuid, uuid) from public, anon, authenticated;

-- Same as B06, but a unit already committed to its next trip is left alone:
-- the end of this trip no longer makes it available.
create or replace function public.set_trip_vehicle_availability(p_trip public.trips, p_from timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_load public.loads;
begin
  perform 1 from public.vehicles v where v.id = p_trip.vehicle_id and v.archived_at is null for update;
  if not found or public.vehicle_committed_elsewhere(p_trip.vehicle_id, p_trip.id) then
    return;
  end if;
  select * into v_load from public.loads where id = p_trip.load_id;

  update public.vehicle_availability set archived_at = now()
  where vehicle_id = p_trip.vehicle_id and archived_at is null;

  insert into public.vehicle_availability (company_id, vehicle_id, available_from, location, city, state, source, created_by)
  values (
    p_trip.carrier_company_id, p_trip.vehicle_id, p_from, v_load.destination_location,
    left(v_load.destination_city, 120), left(v_load.destination_state, 60), 'trip_estimate', (select auth.uid())
  );
end;
$$;

revoke all on function public.set_trip_vehicle_availability(public.trips, timestamptz) from public, anon, authenticated;

-- When a trip is contracted with a unit (the accepted offer names it) or a
-- unit is assigned, the estimate left by its previous trip ends. Manual
-- availability is the carrier's call and stays. Not security definer: trips
-- are written only by the RPCs (see notify_trip_unassigned).
create function public.trips_end_vehicle_estimate()
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
  -- Same unit lock as set_trip_vehicle_availability (which takes it for
  -- update): if the previous trip is writing its estimate right now, wait for
  -- it, so the update below (a new statement) sees that row and archives it.
  -- assign_trip already holds it for share; taking it again is no upgrade.
  perform 1 from public.vehicles v where v.id = v_vehicle_id for share;
  update public.vehicle_availability
  set archived_at = now()
  where vehicle_id = v_vehicle_id and archived_at is null and source = 'trip_estimate';
  return null;
end;
$$;

revoke all on function public.trips_end_vehicle_estimate() from public, anon, authenticated;

create trigger trips_end_vehicle_estimate_on_insert
after insert on public.trips
for each row execute function public.trips_end_vehicle_estimate();

create trigger trips_end_vehicle_estimate_on_assign
after update of vehicle_id on public.trips
for each row
when (new.vehicle_id is not null and new.vehicle_id is distinct from old.vehicle_id)
execute function public.trips_end_vehicle_estimate();

-- Matching (B08) starts a booked unit from the trip it is booked for, also
-- while that trip waits for its assignment; otherwise it would still offer
-- the unit from the end of its current trip. Same function as B08 except the
-- `trips` branch of the starting points.
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
        select 1 as priority, null::uuid as availability_id, l.destination_location as location,
               l.destination_city as city, l.destination_state as state,
               coalesce(t.estimated_unload_end_at, l.delivery_window_end) as available_from,
               true as is_return_trip, l.origin_location as home_location
        from public.trips t
        join public.loads l on l.id = t.load_id
        left join public.offers o on o.id = t.offer_id
        where (t.vehicle_id = u.id
               and t.status in ('assigned', 'en_route_to_pickup', 'at_pickup', 'loading', 'in_transit',
                                'at_delivery', 'unloading'))
           -- F2: a unit booked in the accepted offer of a trip that waits for
           -- its assignment is committed to it: it starts from that trip.
           or (t.status = 'pending_assignment' and t.vehicle_id is null and o.vehicle_id = u.id)
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

-- One-time cleanup: estimates left by trips whose unit was already committed
-- to its next trip before this migration (a trip that has not started
-- unloading yet, or the accepted offer of a trip waiting for its assignment,
-- names the unit). Manual availability is left alone.
update public.vehicle_availability a
set archived_at = now()
where a.archived_at is null
  and a.source = 'trip_estimate'
  and exists (
    select 1
    from public.trips t
    left join public.offers o on o.id = t.offer_id
    where (t.vehicle_id = a.vehicle_id
           and t.status in ('assigned', 'en_route_to_pickup', 'at_pickup', 'loading', 'in_transit', 'at_delivery'))
       or (t.status = 'pending_assignment' and t.vehicle_id is null and o.vehicle_id = a.vehicle_id)
  );
