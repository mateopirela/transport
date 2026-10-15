-- B06 · Trips: trips, trip_events (immutable timeline), trip_locations (GPS
-- points), trip_evidence (photos in the private `evidence` bucket) and
-- incidents.
--
-- Security model (same as B01-B05):
--   * Every table has RLS; `anon` gets nothing and `authenticated` only SELECT.
--     Every write goes through a `security definer` RPC that validates the
--     actor and the state transition (plan §0.3).
--   * A trip is visible to its shipper company, its carrier company, the
--     operator assigned to it and admins. Nobody else.
--   * Only the assigned operator records events, locations and evidence.
--   * The shipper sees the trip's locations only while the trip is active
--     (en_route_to_pickup .. unloading). The carrier and admins keep them.
--   * Locations are accepted only inside the trip's active window (from the
--     departure until delivery): the platform never stores points outside a
--     trip (privacy, plan B22).
--   * trip_events, trip_locations and trip_evidence are immutable: no client
--     privileges, and triggers reject UPDATE, DELETE and TRUNCATE for every
--     role.
--
-- Lock order: trip row, then its load, then the vehicle. No RPC locks them in
-- another order (B05 RPCs never lock trips).

-- ---------------------------------------------------------------------------
-- Enums (identifiers match packages/shared enums)
-- ---------------------------------------------------------------------------
create type public.trip_status as enum (
  'pending_assignment',
  'assigned',
  'en_route_to_pickup',
  'at_pickup',
  'loading',
  'in_transit',
  'at_delivery',
  'unloading',
  'delivered',
  'closed',
  'cancelled'
);

create type public.trip_event_type as enum (
  'created',
  'assigned',
  'departed',
  'arrived_at_pickup',
  'loading_started',
  'loading_finished',
  'arrived_at_delivery',
  'unloading_started',
  'unloading_finished',
  'delivery_confirmed',
  'cancelled',
  'unload_estimate_updated',
  'incident_reported',
  'incident_resolved'
);

create type public.evidence_stage as enum ('pickup', 'delivery', 'incident');

create type public.incident_kind as enum (
  'delay',
  'mechanical_failure',
  'accident',
  'cargo_damage',
  'theft',
  'road_blockade',
  'other'
);

create type public.incident_status as enum ('open', 'resolved');

-- Statuses in which the unit is on the road and the operator shares location.
create function public.trip_is_active(p_status public.trip_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('en_route_to_pickup', 'at_pickup', 'loading', 'in_transit', 'at_delivery', 'unloading');
$$;

revoke all on function public.trip_is_active(public.trip_status) from public, anon;
grant execute on function public.trip_is_active(public.trip_status) to authenticated, service_role;

-- Operator events: the status each one requires and the status it leads to.
-- Mirrors OPERATOR_TRIP_EVENTS in packages/shared/src/trips.ts.
create function public.trip_event_transition(p_event public.trip_event_type, out from_status public.trip_status,
                                             out to_status public.trip_status)
language sql
immutable
set search_path = ''
as $$
  select t.from_status::public.trip_status, t.to_status::public.trip_status
  from (values
    ('departed', 'assigned', 'en_route_to_pickup'),
    ('arrived_at_pickup', 'en_route_to_pickup', 'at_pickup'),
    ('loading_started', 'at_pickup', 'loading'),
    ('loading_finished', 'loading', 'in_transit'),
    ('arrived_at_delivery', 'in_transit', 'at_delivery'),
    ('unloading_started', 'at_delivery', 'unloading'),
    ('unloading_finished', 'unloading', 'delivered')
  ) as t(event, from_status, to_status)
  where t.event = p_event::text;
$$;

revoke all on function public.trip_event_transition(public.trip_event_type) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- trips: one per contracted load, created by accept_offer.
-- ---------------------------------------------------------------------------
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.loads (id) on delete restrict,
  offer_id uuid not null references public.offers (id) on delete restrict,
  shipper_company_id uuid not null references public.companies (id) on delete restrict,
  carrier_company_id uuid not null references public.companies (id) on delete restrict,
  status public.trip_status not null default 'pending_assignment',
  vehicle_id uuid,
  operator_id uuid,
  -- Current estimate; every change is also kept in trip_events (D11).
  estimated_unload_end_at timestamptz,
  assigned_at timestamptz,
  started_at timestamptz,
  delivered_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text constraint trips_cancellation_reason_length check (char_length(cancellation_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_load_key unique (load_id),
  constraint trips_offer_key unique (offer_id),
  -- The unit and the operator always belong to the carrier of the trip.
  constraint trips_vehicle_fkey foreign key (carrier_company_id, vehicle_id)
    references public.vehicles (company_id, id) on delete restrict,
  constraint trips_operator_fkey foreign key (carrier_company_id, operator_id)
    references public.operators (company_id, id) on delete restrict,
  constraint trips_assignment_consistent check (
    status in ('pending_assignment', 'cancelled')
    or (vehicle_id is not null and operator_id is not null and assigned_at is not null)
  ),
  constraint trips_cancellation_consistent check ((status = 'cancelled') = (cancelled_at is not null))
);

comment on table public.trips is 'Execution of a contracted load. Written only through the trip RPCs.';

create index trips_shipper_company_idx on public.trips (shipper_company_id, created_at desc);
create index trips_carrier_company_idx on public.trips (carrier_company_id, created_at desc);
create index trips_operator_idx on public.trips (operator_id) where operator_id is not null;
create index trips_vehicle_idx on public.trips (vehicle_id) where vehicle_id is not null;

create trigger trips_set_updated_at
before update on public.trips
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- incidents
-- ---------------------------------------------------------------------------
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete restrict,
  kind public.incident_kind not null,
  description text not null constraint incidents_description_length check (char_length(description) between 1 and 2000),
  status public.incident_status not null default 'open',
  occurred_at timestamptz not null,
  latitude double precision,
  longitude double precision,
  location extensions.geography(Point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
  ) stored,
  reported_by uuid references auth.users (id) on delete set null,
  reporter_role public.user_role not null,
  resolution text constraint incidents_resolution_length check (char_length(resolution) between 1 and 2000),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint incidents_id_trip_key unique (id, trip_id),
  constraint incidents_coordinates check (
    (latitude is null) = (longitude is null)
    and (latitude is null or (latitude between -90 and 90 and longitude between -180 and 180))
  ),
  constraint incidents_resolution_consistent check (
    (status = 'resolved') = (resolved_at is not null and resolution is not null)
  )
);

comment on table public.incidents is 'Incidents of a trip. Reported and resolved only through RPCs.';

create index incidents_trip_idx on public.incidents (trip_id, created_at);
create index incidents_open_idx on public.incidents (created_at) where status = 'open';

create trigger incidents_set_updated_at
before update on public.incidents
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- trip_events: immutable timeline. `occurred_at` is when it happened on the
-- road (sent by the device, possibly offline); `recorded_at`, when it arrived.
-- ---------------------------------------------------------------------------
create table public.trip_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete restrict,
  event_type public.trip_event_type not null,
  from_status public.trip_status,
  to_status public.trip_status,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  latitude double precision,
  longitude double precision,
  location extensions.geography(Point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
  ) stored,
  accuracy_m real constraint trip_events_accuracy_range check (accuracy_m >= 0 and accuracy_m <= 100000),
  estimated_unload_end_at timestamptz,
  incident_id uuid,
  -- Up to 2000: incident resolutions are copied here; other notes stop at 1000 in their RPCs.
  notes text constraint trip_events_notes_length check (char_length(notes) <= 2000),
  actor_id uuid references auth.users (id) on delete set null,
  actor_role public.user_role,
  -- Idempotency key from the device's offline queue (B21).
  client_event_id uuid,
  constraint trip_events_incident_fkey foreign key (incident_id, trip_id)
    references public.incidents (id, trip_id) on delete restrict,
  constraint trip_events_client_event_key unique (trip_id, client_event_id),
  constraint trip_events_coordinates check (
    (latitude is null) = (longitude is null)
    and (latitude is null or (latitude between -90 and 90 and longitude between -180 and 180))
  ),
  constraint trip_events_estimate_only_unloading check (
    estimated_unload_end_at is null or event_type in ('unloading_started', 'unload_estimate_updated')
  )
);

comment on table public.trip_events is 'Immutable timeline of a trip (D11). Written only by the trip RPCs.';

create index trip_events_trip_idx on public.trip_events (trip_id, occurred_at);

-- ---------------------------------------------------------------------------
-- trip_locations: high-volume GPS points, inserted in batches by RPC.
-- ---------------------------------------------------------------------------
create table public.trip_locations (
  id bigint generated always as identity primary key,
  trip_id uuid not null references public.trips (id) on delete restrict,
  recorded_at timestamptz not null,
  latitude double precision not null constraint trip_locations_latitude_range check (latitude between -90 and 90),
  longitude double precision not null constraint trip_locations_longitude_range check (longitude between -180 and 180),
  location extensions.geography(Point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
  ) stored,
  accuracy_m real constraint trip_locations_accuracy_range check (accuracy_m >= 0 and accuracy_m <= 100000),
  speed_mps real constraint trip_locations_speed_range check (speed_mps >= 0 and speed_mps <= 100),
  heading_deg real constraint trip_locations_heading_range check (heading_deg >= 0 and heading_deg < 360),
  received_at timestamptz not null default now(),
  -- Also the (trip_id, recorded_at) index; makes batch retries idempotent.
  constraint trip_locations_trip_recorded_key unique (trip_id, recorded_at)
);

comment on table public.trip_locations is
  'GPS points of the assigned operator, only inside the active window of the trip. Immutable.';

-- ---------------------------------------------------------------------------
-- trip_evidence: photos in the private `evidence` bucket, with metadata.
-- ---------------------------------------------------------------------------
create table public.trip_evidence (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete restrict,
  stage public.evidence_stage not null,
  incident_id uuid,
  storage_path text not null constraint trip_evidence_storage_path_key unique,
  -- SHA-256 computed on the device at capture time (hex), so later tampering
  -- with the stored file can be detected.
  sha256 text not null constraint trip_evidence_sha256_format check (sha256 ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null,
  latitude double precision,
  longitude double precision,
  location extensions.geography(Point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
  ) stored,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint trip_evidence_incident_fkey foreign key (incident_id, trip_id)
    references public.incidents (id, trip_id) on delete restrict,
  constraint trip_evidence_incident_stage check ((stage = 'incident') = (incident_id is not null)),
  constraint trip_evidence_coordinates check (
    (latitude is null) = (longitude is null)
    and (latitude is null or (latitude between -90 and 90 and longitude between -180 and 180))
  )
);

comment on table public.trip_evidence is 'Photo evidence of a trip (file in the evidence bucket). Immutable.';

create index trip_evidence_trip_idx on public.trip_evidence (trip_id, captured_at);

-- ---------------------------------------------------------------------------
-- Immutability: rejects UPDATE, DELETE and TRUNCATE for every role.
-- ---------------------------------------------------------------------------
create function public.reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is immutable', tg_table_name using errcode = '42501';
end;
$$;

revoke all on function public.reject_mutation() from public, anon, authenticated;

create trigger trip_events_immutable before update or delete on public.trip_events
for each row execute function public.reject_mutation();
create trigger trip_events_no_truncate before truncate on public.trip_events
for each statement execute function public.reject_mutation();
create trigger trip_locations_immutable before update or delete on public.trip_locations
for each row execute function public.reject_mutation();
create trigger trip_locations_no_truncate before truncate on public.trip_locations
for each statement execute function public.reject_mutation();
create trigger trip_evidence_immutable before update or delete on public.trip_evidence
for each row execute function public.reject_mutation();
create trigger trip_evidence_no_truncate before truncate on public.trip_evidence
for each statement execute function public.reject_mutation();

-- ---------------------------------------------------------------------------
-- Audit: admin writes on trips and incidents are recorded (B03 audit_log).
-- Same function as B05; it learns the company of trips and incidents.
-- ---------------------------------------------------------------------------
create or replace function public.audit_admin_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  if not public.is_admin() then
    return null;
  end if;

  insert into public.audit_log (actor_id, action, table_name, record_id, company_id, old_data, new_data)
  values (
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    case tg_table_name
      when 'companies' then (v_row ->> 'id')::uuid
      when 'loads' then (v_row ->> 'shipper_company_id')::uuid
      when 'trips' then (v_row ->> 'carrier_company_id')::uuid
      when 'incidents' then (select t.carrier_company_id from public.trips t where t.id = (v_row ->> 'trip_id')::uuid)
      else (v_row ->> 'company_id')::uuid
    end,
    v_old,
    v_new
  );
  return null;
end;
$$;

revoke all on function public.audit_admin_action() from public, anon, authenticated;

create trigger trips_audit_admin
after insert or update or delete on public.trips
for each row execute function public.audit_admin_action();

create trigger incidents_audit_admin
after insert or update or delete on public.incidents
for each row execute function public.audit_admin_action();

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

-- Fail unless a device timestamp is plausible: not in the future (5 minutes
-- of clock skew) and not before the trip existed.
create function public.assert_trip_timestamp(p_trip public.trips, p_at timestamptz, p_what text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_at is null then
    raise exception '% is required', p_what using errcode = '22023';
  end if;
  if p_at > clock_timestamp() + interval '5 minutes' or p_at < p_trip.created_at - interval '5 minutes' then
    raise exception '% is out of range', p_what using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.assert_trip_timestamp(public.trips, timestamptz, text) from public, anon, authenticated;

-- Fail unless both coordinates are given (or neither) and are valid.
create function public.assert_coordinates(p_lat double precision, p_lng double precision)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid coordinates' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.assert_coordinates(double precision, double precision) from public, anon, authenticated;

-- Fail unless an operator event keeps the order of the timeline: not before
-- the assignment (5 minutes of clock skew, it is server time) nor before the
-- previous operator status event (device time). Call it holding the trip lock.
create function public.assert_trip_event_order(p_trip public.trips, p_at timestamptz)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_at < p_trip.assigned_at - interval '5 minutes' or exists (
    select 1 from public.trip_events e
    where e.trip_id = p_trip.id
      and e.event_type in ('departed', 'arrived_at_pickup', 'loading_started', 'loading_finished',
                           'arrived_at_delivery', 'unloading_started', 'unloading_finished')
      and e.occurred_at > p_at
  ) then
    raise exception 'occurred_at is before the previous event of the trip' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.assert_trip_event_order(public.trips, timestamptz) from public, anon, authenticated;

-- Lock and return a trip that the caller operates (assigned operator).
create function public.lock_trip_as_operator(p_trip_id uuid)
returns public.trips
language plpgsql
set search_path = ''
as $$
declare
  v_trip public.trips;
begin
  -- Authorize before locking: other trips are never locked by this call.
  if public.auth_operator_id() is null or not exists (
    select 1 from public.trips t where t.id = p_trip_id and t.operator_id = public.auth_operator_id()
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  select * into v_trip from public.trips where id = p_trip_id for update;
  -- Re-checked under the lock: the trip may have been reassigned meanwhile.
  if v_trip.operator_id is distinct from public.auth_operator_id() then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  return v_trip;
end;
$$;

revoke all on function public.lock_trip_as_operator(uuid) from public, anon, authenticated;

-- The unit of a trip becomes available from p_from at the load's destination
-- (feeds the return-trip mode of matching, B08). Replaces the unit's active
-- availability, like set_vehicle_availability.
create function public.set_trip_vehicle_availability(p_trip public.trips, p_from timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_load public.loads;
begin
  perform 1 from public.vehicles v where v.id = p_trip.vehicle_id and v.archived_at is null for update;
  if not found then
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

-- ---------------------------------------------------------------------------
-- Completes the B05 hook: accept_offer calls this (holding the load lock)
-- and returns the trip id. Same signature and privileges as the stub.
-- ---------------------------------------------------------------------------
create or replace function public.create_trip_for_accepted_offer(p_offer_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_offer public.offers;
  v_trip_id uuid;
begin
  select * into v_offer from public.offers where id = p_offer_id and status = 'accepted';
  if not found then
    raise exception 'offer is not accepted' using errcode = '55000';
  end if;

  insert into public.trips (load_id, offer_id, shipper_company_id, carrier_company_id)
  values (v_offer.load_id, v_offer.id, v_offer.shipper_company_id, v_offer.carrier_company_id)
  returning id into v_trip_id;

  insert into public.trip_events (trip_id, event_type, to_status, occurred_at, actor_id, actor_role)
  values (v_trip_id, 'created', 'pending_assignment', now(), (select auth.uid()), public.auth_role());

  return v_trip_id;
end;
$$;

revoke all on function public.create_trip_for_accepted_offer(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: the carrier (or an admin) assigns the unit and the operator. Allowed
-- until the operator departs; reassigning records a new `assigned` event.
-- ---------------------------------------------------------------------------
create function public.assign_trip(p_trip_id uuid, p_vehicle_id uuid, p_operator_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_is_admin boolean := public.is_admin();
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

  if not exists (
    select 1 from public.vehicles v
    where v.id = p_vehicle_id and v.company_id = v_trip.carrier_company_id and v.archived_at is null
  ) then
    raise exception 'vehicle not found' using errcode = '22023';
  end if;
  if exists (select 1 from public.vehicle_expired_requirements(p_vehicle_id)) then
    raise exception 'vehicle has expired documents' using errcode = '55000';
  end if;
  -- Only operators with an account can record the trip.
  perform 1 from public.operators o
  where o.id = p_operator_id and o.company_id = v_trip.carrier_company_id
    and o.archived_at is null and o.profile_id is not null
  for share;
  if not found then
    raise exception 'operator not found or without account' using errcode = '22023';
  end if;

  update public.trips
  set status = 'assigned', vehicle_id = p_vehicle_id, operator_id = p_operator_id, assigned_at = now()
  where id = v_trip.id;

  insert into public.trip_events (trip_id, event_type, from_status, to_status, occurred_at, actor_id, actor_role)
  values (v_trip.id, 'assigned', v_trip.status, 'assigned', now(), (select auth.uid()), public.auth_role());
end;
$$;

revoke all on function public.assign_trip(uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_trip(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: the assigned operator records a status event (departed .. unloading
-- finished). Validates the transition, keeps occurred_at and the location
-- from the device, and is idempotent on p_client_event_id (offline retries).
-- `unloading_started` needs the estimated end of unloading. Returns the id.
-- ---------------------------------------------------------------------------
create function public.record_trip_event(
  p_trip_id uuid,
  p_event_type public.trip_event_type,
  p_occurred_at timestamptz,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_m real default null,
  p_estimated_unload_end_at timestamptz default null,
  p_notes text default null,
  p_client_event_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips := public.lock_trip_as_operator(p_trip_id);
  v_from public.trip_status;
  v_to public.trip_status;
  v_notes text := nullif(btrim(p_notes), '');
  v_event_id uuid;
begin
  if p_client_event_id is not null then
    select e.id into v_event_id from public.trip_events e
    where e.trip_id = v_trip.id and e.client_event_id = p_client_event_id;
    if found then
      return v_event_id;
    end if;
  end if;

  select t.from_status, t.to_status into v_from, v_to from public.trip_event_transition(p_event_type) t;
  if v_to is null then
    raise exception 'event % is not an operator status event', p_event_type using errcode = '22023';
  end if;
  if v_trip.status <> v_from then
    raise exception 'cannot record % on a trip in status %', p_event_type, v_trip.status using errcode = '55000';
  end if;
  perform public.assert_trip_timestamp(v_trip, p_occurred_at, 'occurred_at');
  perform public.assert_trip_event_order(v_trip, p_occurred_at);
  -- D11: every operator status event keeps its time and its location.
  if p_latitude is null or p_longitude is null then
    raise exception 'the location of the event is required' using errcode = '22023';
  end if;
  perform public.assert_coordinates(p_latitude, p_longitude);
  if char_length(v_notes) > 1000 then
    raise exception 'notes are too long' using errcode = '22023';
  end if;
  if (p_event_type = 'unloading_started') <> (p_estimated_unload_end_at is not null) then
    raise exception 'the estimated end of unloading goes only with unloading_started, and is required there'
      using errcode = '22023';
  end if;
  if p_estimated_unload_end_at is not null
     and (p_estimated_unload_end_at < p_occurred_at or p_estimated_unload_end_at > p_occurred_at + interval '30 days') then
    raise exception 'estimated end of unloading is out of range' using errcode = '22023';
  end if;

  insert into public.trip_events (
    trip_id, event_type, from_status, to_status, occurred_at, latitude, longitude, accuracy_m,
    estimated_unload_end_at, notes, actor_id, actor_role, client_event_id
  ) values (
    v_trip.id, p_event_type, v_from, v_to, p_occurred_at, p_latitude, p_longitude,
    p_accuracy_m, p_estimated_unload_end_at, v_notes, (select auth.uid()), public.auth_role(), p_client_event_id
  )
  returning id into v_event_id;

  update public.trips
  set status = v_to,
      started_at = case when p_event_type = 'departed' then p_occurred_at else started_at end,
      delivered_at = case when p_event_type = 'unloading_finished' then p_occurred_at else delivered_at end,
      estimated_unload_end_at = coalesce(p_estimated_unload_end_at, estimated_unload_end_at)
  where id = v_trip.id;

  if p_event_type = 'departed' then
    update public.loads set status = 'in_progress' where id = v_trip.load_id and status = 'contracted';
  elsif p_event_type = 'unloading_started' then
    perform public.set_trip_vehicle_availability(v_trip, p_estimated_unload_end_at);
  elsif p_event_type = 'unloading_finished' then
    -- The real end replaces the estimate.
    perform public.set_trip_vehicle_availability(v_trip, p_occurred_at);
  end if;

  return v_event_id;
end;
$$;

revoke all on function public.record_trip_event(
  uuid, public.trip_event_type, timestamptz, double precision, double precision, real, timestamptz, text, uuid
) from public, anon;
grant execute on function public.record_trip_event(
  uuid, public.trip_event_type, timestamptz, double precision, double precision, real, timestamptz, text, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: the assigned operator updates the estimated end of unloading while
-- unloading. Records an event and moves the unit's availability.
-- ---------------------------------------------------------------------------
create function public.set_estimated_unload_end(
  p_trip_id uuid,
  p_estimated_unload_end_at timestamptz,
  p_occurred_at timestamptz default null,
  p_client_event_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips := public.lock_trip_as_operator(p_trip_id);
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
  v_event_id uuid;
begin
  if p_client_event_id is not null then
    select e.id into v_event_id from public.trip_events e
    where e.trip_id = v_trip.id and e.client_event_id = p_client_event_id;
    if found then
      return v_event_id;
    end if;
  end if;

  if v_trip.status <> 'unloading' then
    raise exception 'cannot estimate the end of unloading in status %', v_trip.status using errcode = '55000';
  end if;
  perform public.assert_trip_timestamp(v_trip, v_occurred_at, 'occurred_at');
  perform public.assert_trip_event_order(v_trip, v_occurred_at);
  if p_estimated_unload_end_at is null or p_estimated_unload_end_at < v_occurred_at - interval '1 day'
     or p_estimated_unload_end_at > v_occurred_at + interval '30 days' then
    raise exception 'estimated end of unloading is out of range' using errcode = '22023';
  end if;

  insert into public.trip_events (
    trip_id, event_type, occurred_at, estimated_unload_end_at, actor_id, actor_role, client_event_id
  ) values (
    v_trip.id, 'unload_estimate_updated', v_occurred_at, p_estimated_unload_end_at, (select auth.uid()),
    public.auth_role(), p_client_event_id
  )
  returning id into v_event_id;

  update public.trips set estimated_unload_end_at = p_estimated_unload_end_at where id = v_trip.id;
  perform public.set_trip_vehicle_availability(v_trip, p_estimated_unload_end_at);
  return v_event_id;
end;
$$;

revoke all on function public.set_estimated_unload_end(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.set_estimated_unload_end(uuid, timestamptz, timestamptz, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: the assigned operator sends a batch of GPS points (offline queue,
-- B22): [{recordedAt, lat, lng, accuracyM?, speedMps?, headingDeg?}], at most
-- 500. Points outside the trip's active window (before the departure or after
-- delivery) are dropped, as are duplicates. Returns how many were stored.
-- ---------------------------------------------------------------------------
create function public.record_trip_locations(p_trip_id uuid, p_points jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_count integer;
begin
  -- Authorize, then share-lock: concurrent batches of the same trip do not
  -- block each other, but they wait for (and see) a delivery being recorded.
  if public.auth_operator_id() is null or not exists (
    select 1 from public.trips t where t.id = p_trip_id and t.operator_id = public.auth_operator_id()
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  select * into v_trip from public.trips where id = p_trip_id for share;
  if v_trip.operator_id is distinct from public.auth_operator_id() then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  if not (public.trip_is_active(v_trip.status) or v_trip.status = 'delivered') then
    raise exception 'trip is not active (status %)', v_trip.status using errcode = '55000';
  end if;
  if jsonb_typeof(p_points) is distinct from 'array' or jsonb_array_length(p_points) > 500 then
    raise exception 'points must be an array of at most 500 items' using errcode = '22023';
  end if;

  begin
    insert into public.trip_locations (trip_id, recorded_at, latitude, longitude, accuracy_m, speed_mps, heading_deg)
    select v_trip.id, p.recorded_at, p.lat, p.lng, p.accuracy_m, p.speed_mps, p.heading_deg
    from (
      select distinct on ((x ->> 'recordedAt')::timestamptz)
        (x ->> 'recordedAt')::timestamptz as recorded_at,
        (x ->> 'lat')::double precision as lat,
        (x ->> 'lng')::double precision as lng,
        (x ->> 'accuracyM')::real as accuracy_m,
        (x ->> 'speedMps')::real as speed_mps,
        (x ->> 'headingDeg')::real as heading_deg
      from jsonb_array_elements(p_points) x
    ) p
    where p.recorded_at >= v_trip.started_at
      and p.recorded_at <= coalesce(v_trip.delivered_at, clock_timestamp() + interval '5 minutes')
    on conflict (trip_id, recorded_at) do nothing;
    get diagnostics v_count = row_count;
  exception
    when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
         or numeric_value_out_of_range or not_null_violation or check_violation then
      raise exception 'invalid location point: %', sqlerrm using errcode = '22023';
  end;

  return v_count;
end;
$$;

revoke all on function public.record_trip_locations(uuid, jsonb) from public, anon;
grant execute on function public.record_trip_locations(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: register a photo the assigned operator uploaded to the `evidence`
-- bucket at {trip_id}/{stage}/{uuid}.{ext}. Idempotent on the storage path.
-- ---------------------------------------------------------------------------
create function public.add_trip_evidence(
  p_trip_id uuid,
  p_stage public.evidence_stage,
  p_storage_path text,
  p_sha256 text,
  p_captured_at timestamptz,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_incident_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_trip public.trips := public.lock_trip_as_operator(p_trip_id);
  v_object storage.objects%rowtype;
  v_id uuid;
begin
  select e.id into v_id from public.trip_evidence e where e.trip_id = v_trip.id and e.storage_path = p_storage_path;
  if found then
    return v_id;
  end if;

  if not (public.trip_is_active(v_trip.status) or v_trip.status = 'delivered') then
    raise exception 'trip is not active (status %)', v_trip.status using errcode = '55000';
  end if;
  if p_storage_path is null or p_storage_path !~ (
    '^' || v_trip.id::text || '/' || p_stage::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|heic)$'
  ) then
    raise exception 'invalid storage path' using errcode = '22023';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid sha256' using errcode = '22023';
  end if;
  perform public.assert_trip_timestamp(v_trip, p_captured_at, 'captured_at');
  perform public.assert_coordinates(p_latitude, p_longitude);
  if (p_stage = 'incident') <> (p_incident_id is not null) then
    raise exception 'incident evidence needs its incident, and only it' using errcode = '22023';
  end if;
  if p_incident_id is not null
     and not exists (select 1 from public.incidents i where i.id = p_incident_id and i.trip_id = v_trip.id) then
    raise exception 'incident not found' using errcode = '22023';
  end if;

  -- The file must exist and have been uploaded by the caller.
  select * into v_object from storage.objects o
  where o.bucket_id = 'evidence' and o.name = p_storage_path and o.owner_id = v_uid::text;
  if not found then
    raise exception 'file was not uploaded' using errcode = '22023';
  end if;

  insert into public.trip_evidence (
    trip_id, stage, incident_id, storage_path, sha256, captured_at, latitude, longitude, mime_type, size_bytes,
    uploaded_by
  ) values (
    v_trip.id, p_stage, p_incident_id, p_storage_path, p_sha256, p_captured_at, p_latitude, p_longitude,
    v_object.metadata ->> 'mimetype', (v_object.metadata ->> 'size')::bigint, v_uid
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.add_trip_evidence(
  uuid, public.evidence_stage, text, text, timestamptz, double precision, double precision, uuid
) from public, anon;
grant execute on function public.add_trip_evidence(
  uuid, public.evidence_stage, text, text, timestamptz, double precision, double precision, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: the shipper confirms delivery (delivered -> closed); an admin may
-- close it too. The load becomes `completed`.
-- ---------------------------------------------------------------------------
create function public.confirm_delivery(p_trip_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_notes text := nullif(btrim(p_notes), '');
begin
  if not public.is_admin() and not exists (
    select 1 from public.trips t where t.id = p_trip_id and t.shipper_company_id = public.auth_shipper_company_id()
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  if v_trip.status <> 'delivered' then
    raise exception 'cannot confirm delivery of a trip in status %', v_trip.status using errcode = '55000';
  end if;
  if char_length(v_notes) > 1000 then
    raise exception 'notes are too long' using errcode = '22023';
  end if;

  update public.trips set status = 'closed', closed_at = now() where id = v_trip.id;
  update public.loads set status = 'completed' where id = v_trip.load_id and status = 'in_progress';

  insert into public.trip_events (trip_id, event_type, from_status, to_status, occurred_at, notes, actor_id, actor_role)
  values (v_trip.id, 'delivery_confirmed', 'delivered', 'closed', now(), v_notes, (select auth.uid()), public.auth_role());
end;
$$;

revoke all on function public.confirm_delivery(uuid, text) from public, anon;
grant execute on function public.confirm_delivery(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: cancel a trip with a reason (state machine in packages/shared):
-- shipper or carrier until the cargo is loaded (at_pickup); admins until
-- delivery. The load is cancelled too.
-- ---------------------------------------------------------------------------
create function public.cancel_trip(p_trip_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_is_admin boolean := public.is_admin();
  v_reason text := nullif(btrim(p_reason), '');
begin
  if not v_is_admin and not exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and (t.shipper_company_id = public.auth_shipper_company_id()
           or t.carrier_company_id = public.auth_fleet_company_id())
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  if v_trip.status not in ('pending_assignment', 'assigned', 'en_route_to_pickup', 'at_pickup')
     and not (v_is_admin and v_trip.status in ('loading', 'in_transit', 'at_delivery', 'unloading')) then
    raise exception 'cannot cancel a trip in status %', v_trip.status using errcode = '55000';
  end if;
  if v_reason is null or char_length(v_reason) > 1000 then
    raise exception 'a reason of at most 1000 characters is required' using errcode = '22023';
  end if;

  update public.trips set status = 'cancelled', cancelled_at = now(), cancellation_reason = v_reason
  where id = v_trip.id;
  update public.loads set status = 'cancelled', cancelled_at = now(), cancellation_reason = v_reason
  where id = v_trip.load_id;

  insert into public.trip_events (trip_id, event_type, from_status, to_status, occurred_at, notes, actor_id, actor_role)
  values (v_trip.id, 'cancelled', v_trip.status, 'cancelled', now(), v_reason, (select auth.uid()), public.auth_role());
end;
$$;

revoke all on function public.cancel_trip(uuid, text) from public, anon;
grant execute on function public.cancel_trip(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: report an incident on a trip that is not cancelled, by its operator,
-- carrier, shipper or an admin. Adds it to the timeline. Returns its id.
-- ---------------------------------------------------------------------------
create function public.report_incident(
  p_trip_id uuid,
  p_kind public.incident_kind,
  p_description text,
  p_occurred_at timestamptz default null,
  p_latitude double precision default null,
  p_longitude double precision default null
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
    trip_id, event_type, occurred_at, latitude, longitude, incident_id, actor_id, actor_role
  ) values (
    v_trip.id, 'incident_reported', v_occurred_at, p_latitude, p_longitude, v_id, (select auth.uid()), public.auth_role()
  );
  return v_id;
end;
$$;

revoke all on function public.report_incident(
  uuid, public.incident_kind, text, timestamptz, double precision, double precision
) from public, anon;
grant execute on function public.report_incident(
  uuid, public.incident_kind, text, timestamptz, double precision, double precision
) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: an admin resolves an open incident with a resolution note (producto
-- §3, Admin: incidencias).
-- ---------------------------------------------------------------------------
create function public.resolve_incident(p_incident_id uuid, p_resolution text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incident public.incidents;
  v_resolution text := nullif(btrim(p_resolution), '');
begin
  if not public.is_admin() then
    raise exception 'only admins resolve incidents' using errcode = '42501';
  end if;
  select * into v_incident from public.incidents where id = p_incident_id for update;
  if not found then
    raise exception 'incident not found' using errcode = '42501';
  end if;
  if v_incident.status <> 'open' then
    raise exception 'incident is already resolved' using errcode = '55000';
  end if;
  if v_resolution is null or char_length(v_resolution) > 2000 then
    raise exception 'a resolution of at most 2000 characters is required' using errcode = '22023';
  end if;

  update public.incidents
  set status = 'resolved', resolution = v_resolution, resolved_by = (select auth.uid()), resolved_at = now()
  where id = v_incident.id;

  insert into public.trip_events (trip_id, event_type, occurred_at, incident_id, notes, actor_id, actor_role)
  values (v_incident.trip_id, 'incident_resolved', now(), v_incident.id, v_resolution, (select auth.uid()), 'admin');
end;
$$;

revoke all on function public.resolve_incident(uuid, text) from public, anon;
grant execute on function public.resolve_incident(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges: read-only for clients; every write goes through the RPCs above.
-- ---------------------------------------------------------------------------
-- The coordinates of events, incidents and evidence follow the same privacy
-- rule as trip_locations, so they are not readable as columns: clients get
-- them from trip_point_locations(), which hides them from the shipper once the
-- trip is no longer active.
revoke all on table public.trips, public.trip_events, public.trip_locations, public.trip_evidence, public.incidents
  from anon, authenticated;
grant select on table public.trips, public.trip_locations to authenticated;
grant select (id, trip_id, event_type, from_status, to_status, occurred_at, recorded_at, estimated_unload_end_at,
              incident_id, notes, actor_id, actor_role, client_event_id)
  on table public.trip_events to authenticated;
grant select (id, trip_id, kind, description, status, occurred_at, reported_by, reporter_role, resolution,
              resolved_by, resolved_at, created_at, updated_at)
  on table public.incidents to authenticated;
grant select (id, trip_id, stage, incident_id, storage_path, sha256, captured_at, mime_type, size_bytes, uploaded_by,
              created_at)
  on table public.trip_evidence to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: coordinates of a trip's events, incidents and evidence. Same rule as
-- trip_locations_select: the carrier, the assigned operator and admins always;
-- the shipper only while the trip is active. Empty for anyone else.
-- ---------------------------------------------------------------------------
create function public.trip_point_locations(p_trip_id uuid)
returns table (
  source text,
  record_id uuid,
  occurred_at timestamptz,
  latitude double precision,
  longitude double precision,
  accuracy_m real
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and (
        t.carrier_company_id = public.auth_fleet_company_id()
        or (t.operator_id is not null and t.operator_id = public.auth_operator_id())
        or public.is_admin()
        or (t.shipper_company_id = public.auth_shipper_company_id() and public.trip_is_active(t.status))
      )
  ) then
    return;
  end if;

  return query
    select 'event', e.id, e.occurred_at, e.latitude, e.longitude, e.accuracy_m
    from public.trip_events e where e.trip_id = p_trip_id and e.latitude is not null
    union all
    select 'incident', i.id, i.occurred_at, i.latitude, i.longitude, null::real
    from public.incidents i where i.trip_id = p_trip_id and i.latitude is not null
    union all
    select 'evidence', v.id, v.captured_at, v.latitude, v.longitude, null::real
    from public.trip_evidence v where v.trip_id = p_trip_id and v.latitude is not null
    order by 3;
end;
$$;

revoke all on function public.trip_point_locations(uuid) from public, anon;
grant execute on function public.trip_point_locations(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security. Only select policies: no client writes at all.
-- ---------------------------------------------------------------------------
alter table public.trips enable row level security;
alter table public.trip_events enable row level security;
alter table public.trip_locations enable row level security;
alter table public.trip_evidence enable row level security;
alter table public.incidents enable row level security;

-- trips: its shipper, its carrier, its assigned operator and admins. Never
-- reads loads (the loads policy below reads trips: no recursion).
create policy trips_select
on public.trips
for select
to authenticated
using (
  shipper_company_id = (select public.auth_shipper_company_id())
  or carrier_company_id = (select public.auth_fleet_company_id())
  or (operator_id is not null and operator_id = (select public.auth_operator_id()))
  or (select public.is_admin())
);

-- Timeline, evidence and incidents: whoever sees the trip (the subquery is
-- filtered by trips_select).
create policy trip_events_select
on public.trip_events
for select
to authenticated
using (exists (select 1 from public.trips t where t.id = trip_events.trip_id));

create policy trip_evidence_select
on public.trip_evidence
for select
to authenticated
using (exists (select 1 from public.trips t where t.id = trip_evidence.trip_id));

create policy incidents_select
on public.incidents
for select
to authenticated
using (exists (select 1 from public.trips t where t.id = incidents.trip_id));

-- Locations: the carrier, the assigned operator and admins; the shipper only
-- while the trip is active.
create policy trip_locations_select
on public.trip_locations
for select
to authenticated
using (
  exists (
    select 1 from public.trips t
    where t.id = trip_locations.trip_id
      and (
        t.carrier_company_id = (select public.auth_fleet_company_id())
        or (t.operator_id is not null and t.operator_id = (select public.auth_operator_id()))
        or (select public.is_admin())
        or (t.shipper_company_id = (select public.auth_shipper_company_id()) and public.trip_is_active(t.status))
      )
  )
);

-- loads (B05) + the operator assigned to the load's trip, who needs origin,
-- destination and instructions. Otherwise identical to B05.
drop policy loads_select on public.loads;
create policy loads_select
on public.loads
for select
to authenticated
using (
  shipper_company_id = (select public.auth_shipper_company_id())
  or (select public.is_admin())
  or (
    (select public.auth_fleet_company_id()) is not null
    and (
      (
        status in ('published', 'negotiating')
        and archived_at is null
        and (select public.is_company_approved())
      )
      or (
        (carrier_company_id is null or carrier_company_id = (select public.auth_fleet_company_id()))
        and exists (
          select 1 from public.negotiations n
          where n.load_id = loads.id and n.carrier_company_id = (select public.auth_fleet_company_id())
        )
      )
    )
  )
  or (
    (select public.auth_operator_id()) is not null
    and exists (
      select 1 from public.trips t
      where t.load_id = loads.id and t.operator_id = (select public.auth_operator_id())
    )
  )
);

-- ---------------------------------------------------------------------------
-- Storage: private bucket `evidence`, path {trip_id}/{stage}/{uuid}.{ext}.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

-- Only the assigned operator uploads, into its trip's folder, while the trip
-- is active or just delivered (offline queue). No update or delete policy:
-- evidence files are never overwritten or removed by clients.
create policy evidence_bucket_insert_assigned_operator
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'evidence'
  and objects.name ~ (
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(pickup|delivery|incident)/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|heic)$'
  )
  and exists (
    select 1 from public.trips t
    where t.id::text = split_part(objects.name, '/', 1)
      and t.operator_id = (select public.auth_operator_id())
      and (public.trip_is_active(t.status) or t.status = 'delivered')
  )
);

-- Same visibility as the trip (the subquery is filtered by trips_select).
create policy evidence_bucket_select_trip_parties
on storage.objects
for select
to authenticated
using (
  bucket_id = 'evidence'
  and exists (select 1 from public.trips t where t.id::text = split_part(objects.name, '/', 1))
);
