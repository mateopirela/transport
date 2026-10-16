-- F7 · Offline incidents (mobile): add_trip_evidence can name the incident of
-- a photo by the idempotency key of its report (p_incident_client_event_id)
-- instead of by its id.
--
-- The operator may report an incident and take its photos without
-- connection. The phone does not know the incident id until report_incident
-- runs, so the photo keeps the key the report is sent with (the
-- client_event_id of its `incident_reported` event) and the server resolves
-- it here, under the trip lock. The phone uploads the photo only after the
-- report went through; a key with no incident of the trip behind it is
-- refused like an unknown incident id.
--
-- Everything else is unchanged from B06/B23: idempotent on the storage path,
-- only the assigned operator, only active (or delivered) trips.

drop function public.add_trip_evidence(
  uuid, public.evidence_stage, text, text, timestamptz, double precision, double precision, uuid
);

create function public.add_trip_evidence(
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
    trip_id, stage, incident_id, storage_path, sha256, captured_at, latitude, longitude, mime_type, size_bytes,
    uploaded_by
  ) values (
    v_trip.id, p_stage, v_incident_id, p_storage_path, p_sha256, p_captured_at, p_latitude, p_longitude,
    v_object.metadata ->> 'mimetype', (v_object.metadata ->> 'size')::bigint, v_uid
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.add_trip_evidence(
  uuid, public.evidence_stage, text, text, timestamptz, double precision, double precision, uuid, uuid
) from public, anon;
grant execute on function public.add_trip_evidence(
  uuid, public.evidence_stage, text, text, timestamptz, double precision, double precision, uuid, uuid
) to authenticated;
