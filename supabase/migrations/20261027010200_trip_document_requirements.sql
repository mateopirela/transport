-- G3 · Documents of each trip (D22): who uploads each one and at what stage,
-- as data (D12).
--
--   * trip_document_requirements: one row per trip_document_kind with its
--     stage (before departure, or to get paid), the sides that upload it
--     (shipper and/or carrier), whether it is required and whether a missing
--     one blocks the departure (none does by default: D22 only warns).
--     Admins edit it (audited); everyone signed in reads it.
--   * add_trip_document: the shipper of the trip uploads the kinds with
--     'shipper' among the uploader sides (the service order); the staff that
--     operates the trip's business unit, those with 'carrier'. The
--     `trip-documents` bucket gets the matching upload policy for the shipper.
--   * record_trip_event('departed') refuses to leave while a required
--     document that blocks the departure is missing (SQLSTATE 55000).
--   * trip_checklist(trip): one row per document or evidence the trip needs
--     (documents, the minimum photos of pickup and delivery, and the name of
--     who received the cargo), with who is responsible and when it was done.
--     Security invoker: the caller only sees the trips RLS shows them.

create type public.trip_document_stage as enum ('before_departure', 'billing');

-- ---------------------------------------------------------------------------
-- trip_document_requirements
-- ---------------------------------------------------------------------------
create table public.trip_document_requirements (
  kind public.trip_document_kind primary key,
  stage public.trip_document_stage not null,
  uploader_sides public.offer_side[] not null
    constraint trip_document_requirements_uploader_sides_check check (cardinality(uploader_sides) between 1 and 2),
  is_required boolean not null default true,
  blocks_departure boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  -- Only something due before leaving can block the departure.
  constraint trip_document_requirements_blocks_before_departure
    check (not blocks_departure or (is_required and stage = 'before_departure'))
);

comment on table public.trip_document_requirements is
  'Documents of a trip (D22): stage, who uploads them and whether a missing one blocks the departure. Edited by admins.';

create trigger trip_document_requirements_set_updated_at
before update on public.trip_document_requirements
for each row execute function public.set_updated_at();

create trigger trip_document_requirements_audit_admin
after insert or update or delete on public.trip_document_requirements
for each row execute function public.audit_admin_action();

insert into public.trip_document_requirements (kind, stage, uploader_sides, is_required, sort_order) values
  ('service_order', 'before_departure', '{shipper,carrier}', true, 10),
  ('carta_porte', 'before_departure', '{carrier}', true, 20),
  ('invoice', 'billing', '{carrier}', true, 30),
  ('other', 'before_departure', '{shipper,carrier}', false, 40);

revoke all on table public.trip_document_requirements from anon, authenticated;
grant select on table public.trip_document_requirements to authenticated;
grant update (stage, uploader_sides, is_required, blocks_departure, sort_order)
  on table public.trip_document_requirements to authenticated;

alter table public.trip_document_requirements enable row level security;

create policy trip_document_requirements_select_authenticated
on public.trip_document_requirements
for select
to authenticated
using ((select auth.uid()) is not null);

create policy trip_document_requirements_update_admin
on public.trip_document_requirements
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Storage: the shipper of the trip uploads into its folder too (same path
-- shape and statuses as the carrier's policy; add_trip_document decides the
-- kinds). No update or delete policy: files are never replaced.
-- ---------------------------------------------------------------------------
create policy trip_documents_bucket_insert_shipper
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'trip-documents'
  and objects.name ~ (
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png|webp)$'
  )
  and exists (
    select 1 from public.trips t
    where t.id::text = split_part(objects.name, '/', 1)
      and t.shipper_company_id = (select public.auth_shipper_company_id())
      and t.status <> 'cancelled'
  )
);

-- ---------------------------------------------------------------------------
-- add_trip_document: same as G1a.2, except the shipper of the trip may call
-- it too, and each side only registers the kinds trip_document_requirements
-- lets it upload.
-- ---------------------------------------------------------------------------
create or replace function public.add_trip_document(p_trip_id uuid, p_kind public.trip_document_kind, p_storage_path text, p_file_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_shipper uuid := public.auth_shipper_company_id();
  v_carrier uuid := public.auth_carrier_company_id();
  v_side public.offer_side;
  v_trip public.trips;
  v_object storage.objects%rowtype;
  v_name text := nullif(btrim(p_file_name), '');
  v_id uuid;
begin
  -- Authorize before locking: other companies' trips are never locked.
  if not exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and (
        (v_shipper is not null and t.shipper_company_id = v_shipper)
        or (v_carrier is not null and t.carrier_company_id = v_carrier and public.can_operate_unit(t.business_unit_id))
      )
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  select * into v_trip from public.trips where id = p_trip_id for update;
  -- Re-checked under the lock: the manager may have moved it meanwhile. The
  -- shipper comparison is null for carrier staff and the other way round, so
  -- the whole test is coalesced: a null must refuse, never pass.
  if not found or not coalesce(
    v_trip.shipper_company_id = v_shipper
    or (v_trip.carrier_company_id = v_carrier and public.can_operate_unit(v_trip.business_unit_id)),
    false
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  v_side := case when v_shipper is not null and v_trip.shipper_company_id = v_shipper then 'shipper' else 'carrier' end;

  select d.id into v_id from public.trip_documents d where d.trip_id = v_trip.id and d.storage_path = p_storage_path;
  if found then
    return v_id;
  end if;

  if v_trip.status = 'cancelled' then
    raise exception 'trip is cancelled' using errcode = '55000';
  end if;
  if p_kind is null then
    raise exception 'a document kind is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.trip_document_requirements r
    where r.kind = p_kind and v_side = any (r.uploader_sides)
  ) then
    raise exception 'the % side does not upload % documents', v_side, p_kind using errcode = '42501';
  end if;
  if p_storage_path is null or p_storage_path !~ (
    '^' || v_trip.id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png|webp)$'
  ) then
    raise exception 'invalid storage path' using errcode = '22023';
  end if;
  if v_name is null or char_length(v_name) > 255 then
    raise exception 'a file name of at most 255 characters is required' using errcode = '22023';
  end if;

  -- The file must exist and have been uploaded by the caller.
  select * into v_object from storage.objects o
  where o.bucket_id = 'trip-documents' and o.name = p_storage_path and o.owner_id = v_uid::text;
  if not found then
    raise exception 'file was not uploaded' using errcode = '22023';
  end if;

  insert into public.trip_documents (trip_id, kind, storage_path, file_name, mime_type, size_bytes, uploaded_by)
  values (v_trip.id, p_kind, p_storage_path, v_name, v_object.metadata ->> 'mimetype',
          (v_object.metadata ->> 'size')::bigint, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- record_trip_event: same as B23 (20261016120000_trip_evidence_capture.sql),
-- except `departed` refuses to leave while a required trip document with
-- blocks_departure is missing. Same signature, so PostgREST keeps one function.
-- ---------------------------------------------------------------------------
create or replace function public.record_trip_event(
  p_trip_id uuid,
  p_event_type public.trip_event_type,
  p_occurred_at timestamptz,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_m real default null,
  p_estimated_unload_end_at timestamptz default null,
  p_notes text default null,
  p_client_event_id uuid default null,
  p_received_by_name text default null
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
  v_received_by text := nullif(btrim(p_received_by_name), '');
  v_missing integer;
  v_missing_documents text;
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
  -- B23: the receiver's name goes only with the end of unloading, and is required there.
  if (p_event_type = 'unloading_finished') <> (v_received_by is not null) then
    raise exception 'the name of the receiver goes only with unloading_finished, and is required there'
      using errcode = '22023';
  end if;
  if char_length(v_received_by) > 200 then
    raise exception 'the name of the receiver is too long' using errcode = '22023';
  end if;
  -- B23: no leaving the pickup nor finishing the delivery without the minimum photos.
  if p_event_type in ('loading_finished', 'unloading_finished') then
    v_missing := public.trip_evidence_missing(
      v_trip.id,
      case p_event_type when 'loading_finished' then 'pickup' else 'delivery' end::public.evidence_stage
    );
    if v_missing > 0 then
      raise exception 'evidence is missing: % more photos are required', v_missing using errcode = '55000';
    end if;
  end if;
  -- D22: a required document configured to block the departure must be there.
  if p_event_type = 'departed' then
    select string_agg(r.kind::text, ', ' order by r.sort_order, r.kind) into v_missing_documents
    from public.trip_document_requirements r
    where r.blocks_departure
      and not exists (select 1 from public.trip_documents d where d.trip_id = v_trip.id and d.kind = r.kind);
    if v_missing_documents is not null then
      raise exception 'trip documents are missing: %', v_missing_documents using errcode = '55000';
    end if;
  end if;

  insert into public.trip_events (
    trip_id, event_type, from_status, to_status, occurred_at, latitude, longitude, accuracy_m,
    estimated_unload_end_at, notes, actor_id, actor_role, client_event_id, received_by_name
  ) values (
    v_trip.id, p_event_type, v_from, v_to, p_occurred_at, p_latitude, p_longitude,
    p_accuracy_m, p_estimated_unload_end_at, v_notes, (select auth.uid()), public.auth_role(), p_client_event_id,
    v_received_by
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

-- ---------------------------------------------------------------------------
-- trip_checklist: what the trip needs, who does it and when it was done.
-- Security invoker: the subqueries go through RLS, so a trip the caller
-- cannot see yields no rows. Codes are the trip_document_kind values plus
-- `pickup_evidence`, `delivery_evidence` and `delivery_receipt`.
-- ---------------------------------------------------------------------------
create function public.trip_checklist(p_trip_id uuid)
returns table (
  code text,
  stage text,
  responsible text,
  required boolean,
  done_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with trip as (
    select t.id from public.trips t where t.id = p_trip_id
  ),
  rows_ as (
    -- Documents (D22): done when the first file of that kind is uploaded.
    select r.kind::text as code,
           r.stage::text as stage,
           r.uploader_sides[1]::text as responsible,
           r.is_required as required,
           (select min(d.created_at) from public.trip_documents d, trip where d.trip_id = trip.id and d.kind = r.kind) as done_at,
           0 as block,
           r.sort_order
    from public.trip_document_requirements r
    union all
    -- Evidence (B23): done when the minimum photos of the stage are in.
    select er.stage::text || '_evidence',
           er.stage::text,
           'operator',
           er.min_photos > 0,
           (select e.captured_at
            from public.trip_evidence e, trip
            where e.trip_id = trip.id and e.stage = er.stage
            order by e.captured_at
            offset greatest(er.min_photos, 1) - 1 limit 1),
           1,
           case er.stage when 'pickup' then 10 else 20 end
    from public.trip_evidence_requirements er
    union all
    -- The signed delivery: the name of whoever received the cargo.
    select 'delivery_receipt', 'delivery', 'operator', true,
           (select e.occurred_at from public.trip_events e, trip
            where e.trip_id = trip.id and e.event_type = 'unloading_finished' and e.received_by_name is not null
            order by e.occurred_at desc limit 1),
           1, 30
  )
  select r.code, r.stage, r.responsible, r.required, r.done_at
  from rows_ r
  where exists (select 1 from trip)
  order by r.block, r.sort_order, r.code;
$$;

revoke all on function public.trip_checklist(uuid) from public, anon;
grant execute on function public.trip_checklist(uuid) to authenticated, service_role;
