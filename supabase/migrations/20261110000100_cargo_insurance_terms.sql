-- I1 · Cargo insurance of the shipper and accepted terms (D35-E1).
--
--   * Annual policy: new company requirement `cargo_insurance_policy` for
--     shippers, optional (optional_for shipper) and with a mandatory expiry
--     date. The admin approves it like any other document (D10).
--   * Policy of the trip: trip document `cargo_insurance`, uploaded by the
--     shipper before the departure, required and blocking the departure
--     (JP: "es necesario que lo indique antes de cada viaje"). An approved
--     annual policy that is still valid at the pickup covers it
--     (annual_cargo_policy). The admin may switch the block off in the
--     catalog, like any other trip document (D22).
--   * The carrier side reads the state of the insurance (trip_cargo_insurance
--     and trip_checklist), never the shipper's file: trip document kinds get
--     `shareable_with_carrier` (false for the insurance) and the trip_documents
--     table and the `trip-documents` bucket hide those files from the carrier
--     staff and the operator.
--   * Notices: `cargo_insurance_missing` to the shipper when an offer is
--     accepted and the trip is not covered, and 24 hours before the pickup to
--     the shipper and the carrier staff of the trip's business unit if it is
--     still missing (pg_cron, once per trip).
--   * Accepted terms: terms_acceptances (user, version, date, optional IP),
--     written at sign-up from the version in the user's metadata (every way
--     of creating an account: web, app, coordinator and operator links) and
--     later by accept_terms when the version goes up. Immutable.
--
-- Lock order: record_trip_event keeps that of B23/G3 (the trip only).

-- ---------------------------------------------------------------------------
-- Annual policy of the shipper (company document, D12/D16 catalog)
-- ---------------------------------------------------------------------------
insert into public.document_requirements
  (code, owner_type, company_type, taxpayer_type, name, description, is_required, requires_expiry,
   sort_order, optional_for, shareable_with_shipper)
values
  ('cargo_insurance_policy', 'company', 'shipper', null,
   'Póliza de seguro de la mercancía',
   'Póliza anual vigente que cubre la mercancía de tus viajes (GNP, AXA, Chubb, HDI, MAPFRE u otra). Si no la tienes, sube la póliza o el certificado de cada viaje.',
   true, true, 50, '{shipper}', false)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Trip documents: which kinds the carrier side may read, and the insurance
-- ---------------------------------------------------------------------------
alter table public.trip_document_requirements
  add column shareable_with_carrier boolean not null default true;

comment on column public.trip_document_requirements.shareable_with_carrier is
  'Whether the carrier staff and the operator read the files of this kind (I1: the cargo insurance is the shipper''s; the carrier only reads its state).';

grant update (shareable_with_carrier) on table public.trip_document_requirements to authenticated;

insert into public.trip_document_requirements
  (kind, stage, uploader_sides, is_required, blocks_departure, sort_order, shareable_with_carrier)
values ('cargo_insurance', 'before_departure', '{shipper}', true, true, 15, false)
on conflict (kind) do nothing;

-- Same predicate as the trips_select policy (G1a.2): whether the caller sees
-- the trip. For security definer functions that bypass RLS. Internal.
create function public.can_see_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select t.shipper_company_id = public.auth_shipper_company_id()
        or t.carrier_company_id = public.auth_fleet_company_id()
        or t.business_unit_id = any (public.auth_business_unit_ids())
        or (t.operator_id is not null and t.operator_id = public.auth_operator_id())
        or public.is_admin()
    from public.trips t
    where t.id = p_trip_id
  ), false);
$$;

revoke all on function public.can_see_trip(uuid) from public, anon, authenticated, service_role;

-- The approved annual policy of the trip's shipper that covers the trip:
-- valid when the trip left or, before that, both now and when the pickup
-- window opens. An approved policy that expired later (status `expired`)
-- still covered the trips that left before. The latest expiry wins.
-- Internal: callers check who sees the trip.
create function public.annual_cargo_policy(p_trip_id uuid)
returns table (document_id uuid, expires_at timestamptz, approved_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.expires_at, d.reviewed_at
  from public.trips t
  join public.loads l on l.id = t.load_id
  join public.documents d on d.owner_type = 'company' and d.owner_id = t.shipper_company_id
  join public.document_requirements r on r.id = d.requirement_id
  where t.id = p_trip_id
    and r.code = 'cargo_insurance_policy'
    and d.archived_at is null
    and d.status in ('approved', 'expired')
    and d.expires_at > coalesce(t.started_at, greatest(now(), l.pickup_window_start))
  order by d.expires_at desc, d.id
  limit 1;
$$;

revoke all on function public.annual_cargo_policy(uuid) from public, anon, authenticated, service_role;

-- Whether the trip has its proof of cargo insurance: the policy of the trip
-- or a covering annual policy. Internal.
create function public.trip_cargo_insured(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.trip_documents d where d.trip_id = p_trip_id and d.kind = 'cargo_insurance')
      or exists (select 1 from public.annual_cargo_policy(p_trip_id));
$$;

revoke all on function public.trip_cargo_insured(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- trip_cargo_insurance: the state of the insurance of a trip, for everyone
-- who sees the trip (the carrier too: the state, never the file). No rows
-- for a trip the caller does not see.
-- ---------------------------------------------------------------------------
create function public.trip_cargo_insurance(p_trip_id uuid)
returns table (
  required boolean,
  blocks_departure boolean,
  -- First upload of the policy of the trip, if any.
  trip_policy_at timestamptz,
  -- The annual policy that covers the trip, if any.
  annual_policy_expires_at timestamptz,
  annual_policy_approved_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(r.is_required, false),
         coalesce(r.blocks_departure, false),
         (select min(d.created_at) from public.trip_documents d
          where d.trip_id = t.id and d.kind = 'cargo_insurance'),
         a.expires_at,
         a.approved_at
  from public.trips t
  left join public.trip_document_requirements r on r.kind = 'cargo_insurance'
  left join lateral public.annual_cargo_policy(t.id) a on true
  where t.id = p_trip_id
    and public.can_see_trip(t.id);
$$;

revoke all on function public.trip_cargo_insurance(uuid) from public, anon;
grant execute on function public.trip_cargo_insurance(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reading trip documents: the shipper side reads every file of its trips;
-- the carrier side (staff and operator) only the kinds shareable with it and
-- what it uploaded; admins everything.
-- ---------------------------------------------------------------------------
create function public.trip_document_readable(p_trip_id uuid, p_kind public.trip_document_kind, p_uploaded_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.is_admin()
    or p_uploaded_by = (select auth.uid())
    or coalesce((select r.shareable_with_carrier from public.trip_document_requirements r where r.kind = p_kind), true)
    or exists (
      select 1 from public.trips t
      where t.id = p_trip_id and t.shipper_company_id = public.auth_shipper_company_id()
    ),
    false
  );
$$;

revoke all on function public.trip_document_readable(uuid, public.trip_document_kind, uuid) from public, anon;
grant execute on function public.trip_document_readable(uuid, public.trip_document_kind, uuid) to authenticated;

-- A file of the bucket: the shipper side and the uploader read it as soon as
-- it is there; anyone else only once it is registered with a kind they read.
create function public.trip_document_object_readable(p_name text, p_owner_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.is_admin()
    or p_owner_id = (select auth.uid())::text
    or exists (
      select 1 from public.trips t
      where t.id::text = split_part(p_name, '/', 1)
        and t.shipper_company_id = public.auth_shipper_company_id()
    )
    or exists (
      select 1 from public.trip_documents d
      left join public.trip_document_requirements r on r.kind = d.kind
      where d.storage_path = p_name and coalesce(r.shareable_with_carrier, true)
    ),
    false
  );
$$;

revoke all on function public.trip_document_object_readable(text, text) from public, anon;
grant execute on function public.trip_document_object_readable(text, text) to authenticated;

drop policy trip_documents_select on public.trip_documents;
create policy trip_documents_select
on public.trip_documents
for select
to authenticated
using (
  exists (select 1 from public.trips t where t.id = trip_documents.trip_id)
  and public.trip_document_readable(trip_documents.trip_id, trip_documents.kind, trip_documents.uploaded_by)
);

drop policy trip_documents_bucket_select_trip_parties on storage.objects;
create policy trip_documents_bucket_select_trip_parties
on storage.objects
for select
to authenticated
using (
  bucket_id = 'trip-documents'
  and exists (select 1 from public.trips t where t.id::text = split_part(objects.name, '/', 1))
  and public.trip_document_object_readable(objects.name, objects.owner_id)
);

-- ---------------------------------------------------------------------------
-- record_trip_event: same as G3 (20261027010200_trip_document_requirements.sql),
-- except a covering annual policy stands in for the policy of the trip when
-- the cargo insurance blocks the departure. Same signature.
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
  -- D22: a required document configured to block the departure must be
  -- there; I1: for the cargo insurance, a covering annual policy will do.
  if p_event_type = 'departed' then
    select string_agg(r.kind::text, ', ' order by r.sort_order, r.kind) into v_missing_documents
    from public.trip_document_requirements r
    where r.blocks_departure
      and not exists (select 1 from public.trip_documents d where d.trip_id = v_trip.id and d.kind = r.kind)
      and not (r.kind = 'cargo_insurance' and exists (select 1 from public.annual_cargo_policy(v_trip.id)));
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
-- trip_checklist: same as G3, except it runs as definer behind can_see_trip,
-- so the carrier side sees a document it cannot read as done (the cargo
-- insurance), and a covering annual policy marks the insurance done when it
-- was approved. Same signature and columns.
-- ---------------------------------------------------------------------------
create or replace function public.trip_checklist(p_trip_id uuid)
returns table (
  code text,
  stage text,
  responsible text,
  required boolean,
  done_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with trip as (
    select t.id from public.trips t where t.id = p_trip_id and public.can_see_trip(t.id)
  ),
  rows_ as (
    -- Documents (D22): done when the first file of that kind is uploaded.
    select r.kind::text as code,
           r.stage::text as stage,
           r.uploader_sides[1]::text as responsible,
           r.is_required as required,
           coalesce(
             (select min(d.created_at) from public.trip_documents d, trip where d.trip_id = trip.id and d.kind = r.kind),
             case when r.kind = 'cargo_insurance' then
               (select a.approved_at from trip, public.annual_cargo_policy(trip.id) a)
             end
           ) as done_at,
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

-- ---------------------------------------------------------------------------
-- Notices: cargo_insurance_missing
-- ---------------------------------------------------------------------------

-- What a cargo_insurance_missing notification carries: the trip, its route,
-- when the pickup opens, whether the trip cannot leave without it, and who it
-- is for (`audience`: the shipper uploads it; the carrier staff only waits).
create function public.cargo_insurance_notice_data(p_trip public.trips, p_audience text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'tripId', p_trip.id,
    'audience', p_audience,
    'pickupAt', (select l.pickup_window_start from public.loads l where l.id = p_trip.load_id),
    'blocksDeparture', coalesce(
      (select r.blocks_departure from public.trip_document_requirements r where r.kind = 'cargo_insurance'), false)
  ) || public.load_route_data(p_trip.load_id);
$$;

revoke all on function public.cargo_insurance_notice_data(public.trips, text) from public, anon, authenticated, service_role;

-- The shipper's users, the one who accepted the offer included: it is a
-- reminder of something still to do, not news of their own action.
create function public.notify_shipper_cargo_insurance(p_trip_id uuid)
returns void
language sql
set search_path = ''
as $$
  insert into public.notifications (user_id, type, data)
  select p.id, 'cargo_insurance_missing', public.cargo_insurance_notice_data(t, 'shipper')
  from public.trips t
  join public.profiles p on p.company_id = t.shipper_company_id and p.role = 'shipper'
  where t.id = p_trip_id;
$$;

revoke all on function public.notify_shipper_cargo_insurance(uuid) from public, anon, authenticated, service_role;

-- When an offer is accepted (the trip is created): the shipper, unless the
-- insurance is not required or an annual policy covers the trip.
create function public.notify_cargo_insurance_on_trip_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending_assignment'
     and exists (select 1 from public.trip_document_requirements r where r.kind = 'cargo_insurance' and r.is_required)
     and not public.trip_cargo_insured(new.id) then
    perform public.notify_shipper_cargo_insurance(new.id);
  end if;
  return null;
end;
$$;

revoke all on function public.notify_cargo_insurance_on_trip_created() from public, anon, authenticated;

create trigger trips_notify_cargo_insurance
after insert on public.trips
for each row execute function public.notify_cargo_insurance_on_trip_created();

-- One reminder per trip (written only by remind_cargo_insurance).
create table public.cargo_insurance_reminders (
  trip_id uuid primary key references public.trips (id) on delete cascade,
  sent_at timestamptz not null default now()
);

comment on table public.cargo_insurance_reminders is
  'Trips already reminded of their missing cargo insurance 24 hours before the pickup (I1). Internal.';

revoke all on table public.cargo_insurance_reminders from public, anon, authenticated;
alter table public.cargo_insurance_reminders enable row level security;
-- No policies: only remind_cargo_insurance (pg_cron, as the owner) uses it.

-- 24 hours before the pickup opens, if the trip has not left and still has
-- no proof of insurance: the shipper and the carrier staff of the trip's
-- business unit. Run by pg_cron; returns how many trips were reminded.
create function public.remind_cargo_insurance()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_count integer := 0;
begin
  if not exists (select 1 from public.trip_document_requirements r where r.kind = 'cargo_insurance' and r.is_required) then
    return 0;
  end if;

  for v_trip in
    select t.*
    from public.trips t
    join public.loads l on l.id = t.load_id
    where t.status in ('pending_assignment', 'assigned')
      and l.pickup_window_start > now()
      and l.pickup_window_start <= now() + interval '24 hours'
      and not exists (select 1 from public.cargo_insurance_reminders cr where cr.trip_id = t.id)
      and not public.trip_cargo_insured(t.id)
    order by t.id
  loop
    insert into public.cargo_insurance_reminders (trip_id) values (v_trip.id) on conflict do nothing;
    if found then
      perform public.notify_shipper_cargo_insurance(v_trip.id);
      perform public.notify_carrier_staff(
        v_trip.carrier_company_id, v_trip.business_unit_id, 'cargo_insurance_missing',
        public.cargo_insurance_notice_data(v_trip, 'carrier')
      );
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.remind_cargo_insurance() from public, anon, authenticated, service_role;

-- Every 30 minutes (UTC), like the other jobs of B09.
select cron.schedule('remind-cargo-insurance', '*/30 * * * *', 'select public.remind_cargo_insurance()');

-- ---------------------------------------------------------------------------
-- Accepted terms (D35-E1)
-- ---------------------------------------------------------------------------
create table public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- TERMS_VERSION in packages/shared/src/copy/legal.ts: a new version asks
  -- every account to accept again.
  terms_version text not null
    constraint terms_acceptances_version_format check (terms_version ~ '^\d{4}-\d{2}-\d{2}$'),
  accepted_at timestamptz not null default now(),
  -- The address the web server saw the acceptance come from; null from the
  -- app and at sign-up. Informational.
  ip inet,
  constraint terms_acceptances_user_version_key unique (user_id, terms_version)
);

comment on table public.terms_acceptances is
  'Terms and privacy notice accepted by each account, by version (I1, D35-E1). Written at sign-up and by accept_terms; immutable.';

create index terms_acceptances_user_idx on public.terms_acceptances (user_id, accepted_at desc);

-- Evidence: never changed (the account's deletion removes it by cascade).
create trigger terms_acceptances_immutable
before update on public.terms_acceptances
for each row execute function public.reject_mutation();
create trigger terms_acceptances_no_truncate
before truncate on public.terms_acceptances
for each statement execute function public.reject_mutation();

revoke all on table public.terms_acceptances from public, anon, authenticated;
grant select (id, user_id, terms_version, accepted_at) on table public.terms_acceptances to authenticated;

alter table public.terms_acceptances enable row level security;

-- Own acceptances, and admins. No write policies: accept_terms and the
-- sign-up trigger write them.
create policy terms_acceptances_select
on public.terms_acceptances
for select
to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));

-- The caller accepts a version of the terms (idempotent). Returns when the
-- caller accepted it.
create function public.accept_terms(p_terms_version text, p_ip inet default null)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_at timestamptz;
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_terms_version is null or p_terms_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid terms version' using errcode = '22023';
  end if;
  insert into public.terms_acceptances (user_id, terms_version, ip)
  values (v_uid, p_terms_version, p_ip)
  on conflict (user_id, terms_version) do nothing;
  select a.accepted_at into v_at from public.terms_acceptances a
  where a.user_id = v_uid and a.terms_version = p_terms_version;
  return v_at;
end;
$$;

revoke all on function public.accept_terms(text, inet) from public, anon;
grant execute on function public.accept_terms(text, inet) to authenticated;

-- At sign-up: the version the person accepted with the checkbox travels in
-- the user metadata (`terms_version`), because a new email account has no
-- session until it confirms the address. Runs after handle_new_user
-- (on_auth_user_created), which created the profile; a malformed version is
-- ignored here and the apps ask for the acceptance at the first sign-in.
create function public.record_sign_up_terms_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version text := new.raw_user_meta_data ->> 'terms_version';
begin
  if v_version ~ '^\d{4}-\d{2}-\d{2}$' and exists (select 1 from public.profiles p where p.id = new.id) then
    insert into public.terms_acceptances (user_id, terms_version, accepted_at)
    values (new.id, v_version, coalesce(new.created_at, now()))
    on conflict (user_id, terms_version) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.record_sign_up_terms_acceptance() from public, anon, authenticated;

create trigger on_auth_user_terms_accepted
after insert on auth.users
for each row execute function public.record_sign_up_terms_acceptance();
