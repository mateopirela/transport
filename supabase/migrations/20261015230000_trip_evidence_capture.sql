-- B23 · Operator photo evidence: minimum photos per stage (configurable as
-- data), the receiver's name at delivery, and the gate that keeps a trip from
-- being marked delivered without its minimum evidence.
--
-- Security model (same as B06):
--   * trip_evidence_requirements is a catalog: every signed-in user reads it,
--     only admins change the minimum (column grant + RLS), audited.
--   * record_trip_event (the only way to move a trip forward) refuses
--     `loading_finished` without the minimum pickup photos and
--     `unloading_finished` without the minimum delivery photos or the name of
--     whoever received the cargo. Photos are counted under the trip lock that
--     add_trip_evidence also takes, so the count cannot race an upload.
--   * The receiver's name lives in the immutable timeline (trip_events).

-- ---------------------------------------------------------------------------
-- trip_evidence_requirements: minimum photos per stage (pickup, delivery).
-- Incident photos are optional, so `incident` has no minimum.
-- ---------------------------------------------------------------------------
create table public.trip_evidence_requirements (
  id uuid primary key default gen_random_uuid(),
  stage public.evidence_stage not null constraint trip_evidence_requirements_stage_key unique,
  min_photos smallint not null constraint trip_evidence_requirements_min_photos_range check (min_photos between 0 and 20),
  updated_at timestamptz not null default now(),
  constraint trip_evidence_requirements_stage_gated check (stage in ('pickup', 'delivery'))
);

comment on table public.trip_evidence_requirements is
  'Minimum photos the operator takes per trip stage before finishing it (B23). Edited by admins.';

create trigger trip_evidence_requirements_set_updated_at
before update on public.trip_evidence_requirements
for each row execute function public.set_updated_at();

create trigger trip_evidence_requirements_audit_admin
after insert or update or delete on public.trip_evidence_requirements
for each row execute function public.audit_admin_action();

insert into public.trip_evidence_requirements (stage, min_photos) values ('pickup', 2), ('delivery', 2);

revoke all on table public.trip_evidence_requirements from anon, authenticated;
grant select on table public.trip_evidence_requirements to authenticated;
grant update (min_photos) on table public.trip_evidence_requirements to authenticated;

alter table public.trip_evidence_requirements enable row level security;

create policy trip_evidence_requirements_select_authenticated
on public.trip_evidence_requirements
for select
to authenticated
using ((select auth.uid()) is not null);

create policy trip_evidence_requirements_update_admin
on public.trip_evidence_requirements
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- Photos still missing for a stage of a trip (0 when the minimum is met).
-- Internal: called by record_trip_event while it holds the trip lock.
create function public.trip_evidence_missing(p_trip_id uuid, p_stage public.evidence_stage)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(
    coalesce((select r.min_photos from public.trip_evidence_requirements r where r.stage = p_stage), 0)
      - (select count(*) from public.trip_evidence e where e.trip_id = p_trip_id and e.stage = p_stage),
    0
  )::integer;
$$;

revoke all on function public.trip_evidence_missing(uuid, public.evidence_stage) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- trip_events: name of whoever received the cargo, on `unloading_finished`.
-- ---------------------------------------------------------------------------
alter table public.trip_events
  add column received_by_name text,
  add constraint trip_events_received_by_name_check check (
    received_by_name is null
    or (event_type = 'unloading_finished' and char_length(btrim(received_by_name)) between 1 and 200)
  );

comment on column public.trip_events.received_by_name is
  'Who received the cargo at delivery (unloading_finished only, B23).';

grant select (received_by_name) on table public.trip_events to authenticated;

-- ---------------------------------------------------------------------------
-- record_trip_event: same as B06, plus the evidence gate and the receiver.
-- Replaced (new trailing parameter) instead of overloaded, so PostgREST has a
-- single function to call.
-- ---------------------------------------------------------------------------
drop function public.record_trip_event(
  uuid, public.trip_event_type, timestamptz, double precision, double precision, real, timestamptz, text, uuid
);

create function public.record_trip_event(
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

revoke all on function public.record_trip_event(
  uuid, public.trip_event_type, timestamptz, double precision, double precision, real, timestamptz, text, uuid, text
) from public, anon;
grant execute on function public.record_trip_event(
  uuid, public.trip_event_type, timestamptz, double precision, double precision, real, timestamptz, text, uuid, text
) to authenticated;
