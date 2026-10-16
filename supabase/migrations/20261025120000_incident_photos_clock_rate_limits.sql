-- F12 · Incident photos on an assigned trip, phone clocks ahead of the
-- server, and rate limits on the client RPCs.
--
--   1. Incident photos follow the incident: report_incident accepts an
--      incident on any trip that is not cancelled (an `assigned` one
--      included), so add_trip_evidence and the `evidence` bucket now take its
--      photos in those same statuses. Pickup and delivery photos keep their
--      rule (trip active or just delivered).
--   2. A phone clock ahead of the server: queued incidents carry the phone's
--      time, and a time more than 5 minutes ahead was refused for good (the
--      queue drops a refused report). report_incident now records the server
--      time instead and keeps the phone's in incidents.device_occurred_at; the
--      incident photos do the same with trip_evidence.device_captured_at. Only
--      a time in the future is replaced: a time before the trip still fails,
--      so nothing can be dated in the arbitrary past.
--   3. Rate limits (docs/seguridad.md, finding 6): per-user fixed windows
--      (rate_limit_policy, scope 'rpc') on what the client RPCs write:
--      messages, incidents, evidence, loads, offers and location batches.
--      Over the limit the call fails with SQLSTATE PT429 (HTTP 429 through
--      PostgREST), which the mobile queues retry later.

-- ---------------------------------------------------------------------------
-- Rate limits
-- ---------------------------------------------------------------------------

-- Same buckets as before plus the 'rpc' ones. 'rpc' buckets are consumed only
-- by enforce_rate_limit (triggers below); consume_rate_limit refuses them, so
-- a client cannot spend or probe them directly. Values and reasons are in
-- docs/seguridad.md.
create or replace function public.rate_limit_policy(
  p_bucket text,
  out scope text,
  out max_hits integer,
  out window_seconds integer
)
language sql
immutable
set search_path = ''
as $$
  select v.scope, v.max_hits, v.window_seconds
  from (values
    -- B08: each call can spend up to 2 x top N Google Routes requests.
    ('recommendations', 'user', 30, 60),
    -- B09: pg_cron calls it once a minute; the margin covers manual runs.
    ('dispatch-notifications', 'service', 10, 60),
    -- F12: client RPCs, per user and minute.
    ('send_message', 'rpc', 60, 60),
    ('report_incident', 'rpc', 20, 60),
    ('add_trip_evidence', 'rpc', 120, 60),
    ('create_load', 'rpc', 30, 60),
    ('offers', 'rpc', 60, 60),
    ('record_trip_locations', 'rpc', 120, 60)
  ) as v(bucket, scope, max_hits, window_seconds)
  where v.bucket = p_bucket;
$$;

revoke all on function public.rate_limit_policy(text) from public, anon, authenticated, service_role;

-- Counts one write of the caller in the bucket named by the trigger argument
-- and fails with PT429 over the limit. Runs inside the RPC's transaction: a
-- call that fails (for this limit or any other reason) rolls its hit back, so
-- only writes that went through are counted, and a retry that the RPC answers
-- from its idempotency key (no new row) costs nothing.
--
-- Writes without a user (service role, pg_cron, seed) are not limited. Not
-- security definer: clients cannot insert into these tables directly (only
-- through the security definer RPCs, which run as their owner), so the
-- trigger always runs as the owner too; a direct write by a client would
-- fail closed on rate_limit_counters.
create function public.enforce_rate_limit()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_bucket text := tg_argv[0];
  v_policy record;
  v_retry integer;
begin
  if v_uid is not null then
    select * into v_policy from public.rate_limit_policy(v_bucket);
    if v_policy.scope is distinct from 'rpc' then
      raise exception 'unknown rate limit bucket %', v_bucket using errcode = '22023';
    end if;
    v_retry := public.rate_limit_hit(v_bucket, v_uid::text, v_policy.max_hits, v_policy.window_seconds);
    if v_retry > 0 then
      raise exception 'rate limit exceeded'
        using errcode = 'PT429',
              detail = format('%s: at most %s per %s seconds', v_bucket, v_policy.max_hits, v_policy.window_seconds),
              hint = format('retry after %s seconds', v_retry);
    end if;
  end if;
  if tg_level = 'ROW' then
    return new;
  end if;
  return null;
end;
$$;

revoke all on function public.enforce_rate_limit() from public, anon, authenticated, service_role;

-- One hit per row created by send_message, report_incident, add_trip_evidence,
-- create_load and make_offer / counter_offer (admin_create_offer counts for
-- the admin). record_trip_locations inserts a whole batch in one statement:
-- one hit per call, so an offline backlog of points is not throttled by size.
create trigger messages_rate_limit before insert on public.messages
for each row execute function public.enforce_rate_limit('send_message');
create trigger incidents_rate_limit before insert on public.incidents
for each row execute function public.enforce_rate_limit('report_incident');
create trigger trip_evidence_rate_limit before insert on public.trip_evidence
for each row execute function public.enforce_rate_limit('add_trip_evidence');
create trigger loads_rate_limit before insert on public.loads
for each row execute function public.enforce_rate_limit('create_load');
create trigger offers_rate_limit before insert on public.offers
for each row execute function public.enforce_rate_limit('offers');
create trigger trip_locations_rate_limit before insert on public.trip_locations
for each statement execute function public.enforce_rate_limit('record_trip_locations');

-- ---------------------------------------------------------------------------
-- Device times ahead of the server
-- ---------------------------------------------------------------------------

alter table public.incidents
  add column device_occurred_at timestamptz,
  add constraint incidents_device_occurred_at_ahead check (device_occurred_at > occurred_at);
comment on column public.incidents.device_occurred_at is
  'Phone time of the report when it was more than 5 minutes ahead of the server (F12); occurred_at then holds '
  'the server time at which the report arrived.';

alter table public.trip_evidence
  add column device_captured_at timestamptz,
  add constraint trip_evidence_device_captured_at_ahead check (device_captured_at > captured_at);
comment on column public.trip_evidence.device_captured_at is
  'Phone time of an incident photo when it was more than 5 minutes ahead of the server (F12); captured_at then '
  'holds the server time at which the photo was registered.';

grant select (device_occurred_at) on public.incidents to authenticated;
grant select (device_captured_at) on public.trip_evidence to authenticated;

-- Whether a device time is ahead of the server clock beyond the tolerance of
-- assert_trip_timestamp (5 minutes). The callers then record the server time
-- and keep the device's aside; a time that is not ahead stands as is, and
-- assert_trip_timestamp still checks its lower bound (not before the trip).
create function public.device_time_ahead(p_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_at > clock_timestamp() + interval '5 minutes';
$$;

revoke all on function public.device_time_ahead(timestamptz) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- report_incident: same as F2 (20261020020000), plus the phone time ahead
-- ---------------------------------------------------------------------------
create or replace function public.report_incident(
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
  v_device_at timestamptz;
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
  -- F12: a phone clock ahead of the server must not lose the report. The
  -- incident gets the server time and keeps the phone's aside. Only the
  -- future is replaced: the lower bound below still applies.
  if public.device_time_ahead(v_occurred_at) then
    v_device_at := v_occurred_at;
    v_occurred_at := clock_timestamp();
  end if;
  perform public.assert_trip_timestamp(v_trip, v_occurred_at, 'occurred_at');
  perform public.assert_coordinates(p_latitude, p_longitude);

  insert into public.incidents (
    trip_id, kind, description, occurred_at, device_occurred_at, latitude, longitude, reported_by, reporter_role
  ) values (
    v_trip.id, p_kind, v_description, v_occurred_at, v_device_at, p_latitude, p_longitude, (select auth.uid()),
    public.auth_role()
  )
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

-- ---------------------------------------------------------------------------
-- add_trip_evidence: same as F7 (20261024000000), plus incident photos in
-- every status that takes the incident, and their phone time ahead
-- ---------------------------------------------------------------------------
create or replace function public.add_trip_evidence(
  p_trip_id uuid,
  p_stage public.evidence_stage,
  p_storage_path text,
  p_sha256 text,
  p_captured_at timestamptz,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_incident_id uuid default null,
  p_incident_client_event_id uuid default null
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
  v_incident_id uuid := p_incident_id;
  v_captured_at timestamptz := p_captured_at;
  v_device_at timestamptz;
  v_id uuid;
begin
  select e.id into v_id from public.trip_evidence e where e.trip_id = v_trip.id and e.storage_path = p_storage_path;
  if found then
    return v_id;
  end if;

  -- F12: an incident photo goes wherever its incident went (report_incident
  -- takes any trip that is not cancelled); pickup and delivery photos only
  -- while the trip is active or just delivered.
  if p_stage = 'incident' then
    if v_trip.status = 'cancelled' then
      raise exception 'trip is cancelled' using errcode = '55000';
    end if;
  elsif not (public.trip_is_active(v_trip.status) or v_trip.status = 'delivered') then
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
  -- F12: like its report, an incident photo taken with the phone clock ahead
  -- keeps the server time and the phone's aside. Only the future.
  if p_stage = 'incident' and public.device_time_ahead(v_captured_at) then
    v_device_at := v_captured_at;
    v_captured_at := clock_timestamp();
  end if;
  perform public.assert_trip_timestamp(v_trip, v_captured_at, 'captured_at');
  perform public.assert_coordinates(p_latitude, p_longitude);

  -- F7: the incident by the key of its report, only on this trip.
  if p_incident_client_event_id is not null then
    if p_incident_id is not null then
      raise exception 'give the incident or the key of its report, not both' using errcode = '22023';
    end if;
    select e.incident_id into v_incident_id from public.trip_events e
    where e.trip_id = v_trip.id
      and e.client_event_id = p_incident_client_event_id
      and e.event_type = 'incident_reported';
    if v_incident_id is null then
      raise exception 'incident not found' using errcode = '22023';
    end if;
  end if;

  if (p_stage = 'incident') <> (v_incident_id is not null) then
    raise exception 'incident evidence needs its incident, and only it' using errcode = '22023';
  end if;
  if v_incident_id is not null
     and not exists (select 1 from public.incidents i where i.id = v_incident_id and i.trip_id = v_trip.id) then
    raise exception 'incident not found' using errcode = '22023';
  end if;

  -- The file must exist and have been uploaded by the caller.
  select * into v_object from storage.objects o
  where o.bucket_id = 'evidence' and o.name = p_storage_path and o.owner_id = v_uid::text;
  if not found then
    raise exception 'file was not uploaded' using errcode = '22023';
  end if;

  insert into public.trip_evidence (
    trip_id, stage, incident_id, storage_path, sha256, captured_at, device_captured_at, latitude, longitude,
    mime_type, size_bytes, uploaded_by
  ) values (
    v_trip.id, p_stage, v_incident_id, p_storage_path, p_sha256, v_captured_at, v_device_at, p_latitude,
    p_longitude, v_object.metadata ->> 'mimetype', (v_object.metadata ->> 'size')::bigint, v_uid
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage: the incident folder follows add_trip_evidence
-- ---------------------------------------------------------------------------

-- Only the assigned operator uploads, into its trip's folder: pickup and
-- delivery photos while the trip is active or just delivered (offline queue),
-- incident photos while the trip is not cancelled (F12). No update or delete
-- policy: evidence files are never overwritten or removed by clients.
drop policy evidence_bucket_insert_assigned_operator on storage.objects;
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
      and (
        public.trip_is_active(t.status)
        or t.status = 'delivered'
        or (split_part(objects.name, '/', 2) = 'incident' and t.status <> 'cancelled')
      )
  )
);
