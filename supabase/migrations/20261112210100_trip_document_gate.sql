-- R4 · Candado de viajes (D45) and where a review came from (D10-E1).
--
-- No unit and no operator is assigned to a trip, recommended or made
-- available while any required document of the catalog (D12, D16) lacks a
-- current approval. Before this block three gaps remained (plan-registro.md):
--   1. assign_trip refused a unit with expired documents only: a unit that
--      never had one approved (missing, in review or rejected) was assigned.
--   2. operator_license_current accepted operators.license_expires_on, a date
--      the carrier types, without an approved license document.
--   3. the operator's official id was never checked when assigning.
--
-- What changes:
--   * operator_missing_requirements / operator_expired_requirements: the
--     operator's twins of vehicle_missing_requirements and
--     vehicle_expired_requirements (B18), from the catalog: every required
--     `owner_type = 'operator'` requirement (official id, license and, when R3
--     adds it, the selfie) with no code change. security invoker, like the
--     vehicle ones.
--   * assert_vehicle_documents_ready / assert_operator_documents_ready
--     (internal): raise 55000 with the codes of what blocks the unit or the
--     operator, expired documents first. The message carries catalog codes
--     only, and every caller checks first that the unit or the operator is of
--     the caller's company, so nothing of another company is revealed:
--       'vehicle has expired documents: <codes>'
--       'vehicle has missing documents: <codes>'
--       'operator has expired documents: <codes>: <full name>'
--       'operator has missing documents: <codes>: <full name>'
--   * owner_operator_id / owner_operator_ready (internal): the hombre-camión's
--     own operator row (D13), whose documents gate his units too
--     (assert_vehicle_can_travel, match_pairs). Without an active row (never
--     created, or archived) his units are blocked, not waved through.
--   * operator_license_current: the approved, unexpired license document
--     only; license_expires_on stays as information. assign_trip still calls
--     it as a floor, so a license is needed even if the catalog row changed.
--   * assign_trip (Same as G5): the unit and the operator must have every
--     required document approved and current (gaps 1, 2 and 3).
--   * set_vehicle_availability (Same as H3) and release_vehicle (Same as G5)
--     refuse a unit with missing documents too (before: expired only), and a
--     hombre-camión's unit while his own operator is not ready.
--   * match_pairs (Same as G5): already skipped units with missing
--     documents; now also a hombre-camión's units while his own operator is
--     not ready. matching, load_match, match_candidates, notify_matches_* and
--     the return-load suggestions all read it.
--   * documents.review_source (D10-E1): 'manual' by default and on every row
--     so far; review_document sets it. No RPC writes 'automatic' yet.
--     document_requirements.auto_review_eligible marks what an automatic
--     reviewer could check later (admins edit it, like the rest of the
--     catalog).
--
-- Not gated here, on purpose (listed in the PR):
--   * Offers that name a unit (make_offer, counter_offer, admin_create_offer):
--     an offer commits nothing, load_offer_vehicles already lists only units
--     without missing documents, and the trip still needs assign_trip.
--   * The availability a trip leaves behind (set_trip_vehicle_availability,
--     restore_vehicle_availability): automatic, and match_pairs skips a unit
--     that is not ready whatever its availability says.
--
-- Lock order: unchanged (trip, operator, units by id, release task). The new
-- checks run under the locks the RPCs already take.

-- ---------------------------------------------------------------------------
-- D10-E1: the source of a review and what an automatic reviewer could check
-- ---------------------------------------------------------------------------
alter table public.documents
  add column review_source public.document_review_source not null default 'manual';

comment on column public.documents.review_source is
  'Who decided the review (D10-E1): manual (an admin, review_document) or automatic (a future reviewer). Set by RPCs only.';

alter table public.document_requirements
  add column auto_review_eligible boolean not null default false;

comment on column public.document_requirements.auto_review_eligible is
  'An automatic reviewer could decide documents of this requirement (D10-E1). No reviewer exists yet: every review is manual.';

-- Admins edit the catalog (RLS: document_requirements_*_admin).
grant insert (auto_review_eligible) on table public.document_requirements to authenticated;
grant update (auto_review_eligible) on table public.document_requirements to authenticated;

-- Same as B03 (20261015050000_documents_verification.sql), except the
-- decision records its source: an admin, so 'manual' (D10-E1).
create or replace function public.review_document(
  p_document_id uuid,
  p_decision text,
  p_notes text default null,
  p_expires_at timestamptz default null
)
returns public.verification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.documents%rowtype;
  v_requires_expiry boolean;
  v_notes text := nullif(btrim(p_notes), '');
  v_expires_at timestamptz;
  v_status public.verification_status;
begin
  if not public.is_admin() then
    raise exception 'only admins can review documents' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'decision must be approve or reject' using errcode = '22023';
  end if;

  select * into v_document from public.documents where id = p_document_id for update;
  if not found then
    raise exception 'document not found' using errcode = '22023';
  end if;
  if v_document.status <> 'pending_review' or v_document.archived_at is not null then
    raise exception 'document is not pending review (status %)', v_document.status
      using errcode = '55000';
  end if;

  if p_decision = 'reject' then
    if v_notes is null then
      raise exception 'a rejection needs a reason' using errcode = '22023';
    end if;
    v_status := 'rejected';
    v_expires_at := v_document.expires_at;
  else
    select r.requires_expiry into v_requires_expiry
    from public.document_requirements r where r.id = v_document.requirement_id;
    -- The admin may set or correct the expiry date read from the document.
    v_expires_at := coalesce(p_expires_at, v_document.expires_at);
    if v_requires_expiry and v_expires_at is null then
      raise exception 'this document needs an expiry date' using errcode = '22023';
    end if;
    if v_expires_at is not null and v_expires_at <= now() then
      raise exception 'document is already expired' using errcode = '22023';
    end if;
    v_status := 'approved';

    -- The approved document replaces the previously approved one.
    update public.documents
    set archived_at = now()
    where requirement_id = v_document.requirement_id
      and owner_type = v_document.owner_type
      and owner_id = v_document.owner_id
      and id <> v_document.id
      and status = 'approved'
      and archived_at is null;
  end if;

  update public.documents
  set status = v_status,
      review_notes = v_notes,
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      review_source = 'manual',
      expires_at = v_expires_at
  where id = v_document.id;

  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Operator readiness (the twins of B18's vehicle helpers)
-- ---------------------------------------------------------------------------

-- Required operator documents without an approved, unexpired document. Same
-- rules as vehicle_missing_requirements (G3): a requirement that asks for an
-- expiry date needs one on the approved document.
create function public.operator_missing_requirements(p_operator_id uuid)
returns setof public.document_requirements
language sql
stable
set search_path = ''
as $$
  select r.*
  from public.document_requirements r
  join public.operators o on o.id = p_operator_id
  join public.companies c on c.id = o.company_id
  where r.owner_type = 'operator'
    and r.is_required
    and r.archived_at is null
    and (r.company_type is null or r.company_type = c.type)
    and not (c.type = any (r.optional_for))
    and not exists (
      select 1
      from public.documents d
      where d.requirement_id = r.id
        and d.owner_type = 'operator'
        and d.owner_id = o.id
        and d.status = 'approved'
        and d.archived_at is null
        and (not r.requires_expiry or d.expires_at is not null)
        and (d.expires_at is null or d.expires_at > now())
    )
  order by r.sort_order, r.code;
$$;

revoke all on function public.operator_missing_requirements(uuid) from public, anon;
grant execute on function public.operator_missing_requirements(uuid) to authenticated, service_role;

-- The subset whose document expired (marked `expired`, or approved and past
-- its date), as vehicle_expired_requirements.
create function public.operator_expired_requirements(p_operator_id uuid)
returns setof public.document_requirements
language sql
stable
set search_path = ''
as $$
  select m.*
  from public.operator_missing_requirements(p_operator_id) m
  where exists (
    select 1
    from public.documents d
    where d.requirement_id = m.id
      and d.owner_type = 'operator'
      and d.owner_id = p_operator_id
      and d.archived_at is null
      and (d.status = 'expired' or (d.status = 'approved' and d.expires_at <= now()))
  )
  order by m.sort_order, m.code;
$$;

revoke all on function public.operator_expired_requirements(uuid) from public, anon;
grant execute on function public.operator_expired_requirements(uuid) to authenticated, service_role;

-- Same as G3 (20261027010100_d16_document_requirements.sql), except only the
-- approved, unexpired license document counts (D45): license_expires_on is a
-- date the carrier types, kept as information. Internal.
create or replace function public.operator_license_current(p_operator_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    join public.document_requirements r on r.id = d.requirement_id
    where d.owner_type = 'operator'
      and d.owner_id = p_operator_id
      and r.code = 'federal_driver_license'
      and d.status = 'approved'
      and d.archived_at is null
      and d.expires_at > now()
  );
$$;

-- The hombre-camión's own operator (D13): the active operator row linked to
-- a manager of an owner-operator company. Null for a fleet, and also for a
-- hombre-camión whose row is missing or archived: callers tell both apart
-- with companies.is_owner_operator and block the latter (owner_operator_ready).
-- Internal.
create function public.owner_operator_id(p_company_id uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select o.id
  from public.operators o
  join public.companies c on c.id = o.company_id and c.is_owner_operator
  join public.profiles p on p.id = o.profile_id and p.company_id = o.company_id and p.role = 'manager'
  where o.company_id = p_company_id
    and o.archived_at is null
  order by o.created_at, o.id
  limit 1;
$$;

revoke all on function public.owner_operator_id(uuid) from public, anon, authenticated;

-- Whether a company's units may travel as far as the hombre-camión's own
-- documents go: true for a fleet; for an owner-operator company, only with
-- an active own operator row whose required documents are all approved and
-- current. Archiving that row (or never having one) does not skip the gate.
-- Internal (match_pairs).
create function public.owner_operator_ready(p_company_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not c.is_owner_operator
    or (
      o.id is not null
      and not exists (select 1 from public.operator_missing_requirements(o.id))
    )
  from public.companies c
  left join lateral (select public.owner_operator_id(c.id) as id) o on true
  where c.id = p_company_id;
$$;

revoke all on function public.owner_operator_ready(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The gate: what blocks a unit or an operator, as a 55000 error
-- ---------------------------------------------------------------------------

-- A unit travels only with every required document approved and current.
-- Expired documents first (the message B18 already used, now with the
-- codes), then the rest: missing, in review or rejected. Internal: the caller
-- authorized the unit (same company) first, so the codes reveal nothing of
-- another company.
create function public.assert_vehicle_documents_ready(p_vehicle_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_codes text;
begin
  select string_agg(e.code, ', ' order by e.sort_order, e.code) into v_codes
  from public.vehicle_expired_requirements(p_vehicle_id) e;
  if v_codes is not null then
    raise exception 'vehicle has expired documents: %', v_codes using errcode = '55000';
  end if;
  select string_agg(m.code, ', ' order by m.sort_order, m.code) into v_codes
  from public.vehicle_missing_requirements(p_vehicle_id) m;
  if v_codes is not null then
    raise exception 'vehicle has missing documents: %', v_codes using errcode = '55000';
  end if;
end;
$$;

revoke all on function public.assert_vehicle_documents_ready(uuid) from public, anon, authenticated;

-- Same for an operator; the message ends with the operator's name, as the
-- license errors of G3, for the web and the app to show.
create function public.assert_operator_documents_ready(p_operator_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_codes text;
  v_name text;
begin
  select o.full_name into v_name from public.operators o where o.id = p_operator_id;
  select string_agg(e.code, ', ' order by e.sort_order, e.code) into v_codes
  from public.operator_expired_requirements(p_operator_id) e;
  if v_codes is not null then
    raise exception 'operator has expired documents: %: %', v_codes, v_name using errcode = '55000';
  end if;
  select string_agg(m.code, ', ' order by m.sort_order, m.code) into v_codes
  from public.operator_missing_requirements(p_operator_id) m;
  if v_codes is not null then
    raise exception 'operator has missing documents: %: %', v_codes, v_name using errcode = '55000';
  end if;
end;
$$;

revoke all on function public.assert_operator_documents_ready(uuid) from public, anon, authenticated;

-- What makes a unit available (set_vehicle_availability, release_vehicle):
-- its documents and, for a hombre-camión, his own (he is its only driver).
-- A hombre-camión without an active own operator row (never created, or
-- archived) is refused too: 'owner operator not found'.
create function public.assert_vehicle_can_travel(p_vehicle_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_is_owner_operator boolean;
  v_operator_id uuid;
begin
  perform public.assert_vehicle_documents_ready(p_vehicle_id);
  select c.is_owner_operator, public.owner_operator_id(c.id)
    into v_is_owner_operator, v_operator_id
  from public.vehicles v
  join public.companies c on c.id = v.company_id
  where v.id = p_vehicle_id;
  if v_operator_id is not null then
    perform public.assert_operator_documents_ready(v_operator_id);
  elsif v_is_owner_operator then
    raise exception 'owner operator not found' using errcode = '55000';
  end if;
end;
$$;

revoke all on function public.assert_vehicle_can_travel(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- assign_trip
-- ---------------------------------------------------------------------------

-- Same as G5 (20261030000100_vehicle_release.sql), except the unit and the
-- operator need every required document approved and current (D45): a
-- missing document blocks like an expired one, the license comes from its
-- approved document only, and the official id counts. Checked under the
-- locks, after the unit and the operator were found in the trip's company.
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
  -- R4 (D45): every required document of the unit, then of the operator.
  perform public.assert_vehicle_documents_ready(p_vehicle_id);
  perform public.assert_operator_documents_ready(v_operator.id);

  -- D16: a current license of the type the unit (and the cargo) needs. The
  -- catalog check above already asks for it; this keeps it a floor.
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

-- ---------------------------------------------------------------------------
-- Availability: set_vehicle_availability and release_vehicle
-- ---------------------------------------------------------------------------

-- Same as H3 (20261102000000_billing.sql), except a unit with any required
-- document not approved (before: expired only), or a hombre-camión's unit
-- while his own documents are not, cannot be made available (D45).
create or replace function public.set_vehicle_availability(p_vehicle_id uuid, p_available_from timestamp with time zone, p_latitude double precision, p_longitude double precision, p_city text, p_state text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles%rowtype;
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
  -- H3: the future block, on the unit's company (checked after the caller).
  perform public.assert_billing_allows(v_vehicle.company_id);
  if p_available_from is null then
    raise exception 'p_available_from is required' using errcode = '22023';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'invalid coordinates' using errcode = '22023';
  end if;

  -- Ownership was checked above, so reading the documents as definer is safe.
  perform public.assert_vehicle_can_travel(v_vehicle.id);

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

-- Same as G5 (20261030000100_vehicle_release.sql), except the same rule as
-- set_vehicle_availability (R4): a unit with any required document not
-- approved, or a hombre-camión's unit while his own documents are not, stays
-- pending until they are.
create or replace function public.release_vehicle(
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
  -- Same rule as set_vehicle_availability: a unit that cannot travel cannot
  -- be made available (it stays pending until its documents are approved).
  perform public.assert_vehicle_can_travel(v_vehicle.id);

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

-- ---------------------------------------------------------------------------
-- Recommendations: match_pairs
-- ---------------------------------------------------------------------------

-- Same as G5 (20261030000100_vehicle_release.sql), except a hombre-camión's
-- units are left out while his own documents are not approved and current
-- (D45). Units with missing documents were already left out.
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
      and public.owner_operator_ready(c.id)
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
