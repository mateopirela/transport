-- G3 · Documents per profile (D16): JP's official list replaces the
-- provisional catalog of B03, as data (D12), without deleting rows.
--
--   * Company: Constancia de Situación Fiscal and the id of the legal
--     representative (for shippers "cuando se requiera": it applies but is
--     not mandatory, column `optional_for`). The acta constitutiva, the
--     proof of address and, at company level, the SICT permit and the
--     insurance policy are archived: the permit and the insurance are now
--     documents of each unit.
--   * Unit: tarjeta de circulación, permits (new `vehicle_permit`) and
--     insurance. Operator: official id (new `operator_official_id`) and the
--     driver's license, "del tipo adecuado a la unidad".
--   * `shareable_with_shipper` marks what G6 will share with the shipper
--     when a trip is contracted; ids are personal data and stay private.
--   * License <-> unit kind: the provisional table license_unit_compatibility
--     (B: tractor, rigid and trailer; C: rigid; E: every kind; follow-up 4 of
--     plan §G.2). assign_trip refuses an operator without a current license
--     (approved unexpired document, or license_expires_on today or later) or
--     with one that does not fit the unit; a load with hazmat_permit needs
--     type E.
--   * process_document_expiry also warns the coordinators of the business
--     unit of the unit or the operator (notify_carrier_staff, G1a.2).

-- ---------------------------------------------------------------------------
-- document_requirements: optional_for and shareable_with_shipper
-- ---------------------------------------------------------------------------
alter table public.document_requirements
  add column optional_for public.company_type[] not null default '{}',
  add column shareable_with_shipper boolean not null default false,
  -- Only company requirements apply to both company types; the fleet is always
  -- the carrier's.
  add constraint document_requirements_optional_for_company
    check (owner_type = 'company' or optional_for = '{}');

comment on column public.document_requirements.optional_for is
  'Company types for which the requirement applies but is not mandatory (D16: "cuando se requiera").';
comment on column public.document_requirements.shareable_with_shipper is
  'Approved documents of this requirement are shared with the shipper of a contracted trip (D21, G6).';

grant insert (optional_for, shareable_with_shipper) on table public.document_requirements to authenticated;
grant update (optional_for, shareable_with_shipper) on table public.document_requirements to authenticated;

comment on table public.document_requirements is
  'Catalog of required documents per owner (company, vehicle, operator), JP''s list (D16).';

-- The provisional rows that leave the list are archived, never deleted: the
-- documents already sent against them keep their requirement.
update public.document_requirements
set archived_at = now()
where code in ('articles_of_incorporation', 'proof_of_address', 'sct_permit', 'carrier_insurance_policy')
  and archived_at is null;

update public.document_requirements
set name = 'Constancia de situación fiscal',
    description = 'Emitida por el SAT, con antigüedad máxima de 3 meses.',
    shareable_with_shipper = true
where code = 'tax_status_certificate';

update public.document_requirements
set name = 'Identificación del representante legal',
    description = 'INE o pasaporte vigente. Para clientes, cuando se requiera.',
    optional_for = '{shipper}'
where code = 'legal_representative_id';

update public.document_requirements
set name = 'Tarjeta de circulación',
    description = 'Vigente y a nombre de la empresa.',
    shareable_with_shipper = true
where code = 'vehicle_registration_card';

update public.document_requirements
set name = 'Seguro vigente',
    description = 'Póliza de la unidad con responsabilidad civil.',
    shareable_with_shipper = true
where code = 'vehicle_insurance_policy';

update public.document_requirements
set name = 'Licencia de conducir vigente',
    description = 'Federal (SICT), del tipo adecuado a la unidad.',
    shareable_with_shipper = true
where code = 'federal_driver_license';

insert into public.document_requirements
  (code, owner_type, company_type, taxpayer_type, name, description, requires_expiry, sort_order, shareable_with_shipper)
values
  ('vehicle_permit', 'vehicle', 'carrier', null,
   'Permisos correspondientes', 'Permiso SICT de autotransporte federal y los especiales que apliquen.', true, 75, true),
  ('operator_official_id', 'operator', 'carrier', null,
   'Identificación oficial', 'INE u otra identificación oficial vigente.', true, 85, false);

-- Same as B03, except a requirement optional for the company's type is not missing.
create or replace function public.company_missing_requirements(p_company_id uuid)
returns setof public.document_requirements
language sql
stable
set search_path = ''
as $$
  select r.*
  from public.document_requirements r
  join public.companies c on c.id = p_company_id
  where r.owner_type = 'company'
    and r.is_required
    and r.archived_at is null
    and (r.company_type is null or r.company_type = c.type)
    and not (c.type = any (r.optional_for))
    and (
      r.taxpayer_type is null
      or r.taxpayer_type = public.taxpayer_type_for_rfc(c.rfc)
    )
    and not exists (
      select 1
      from public.documents d
      where d.requirement_id = r.id
        and d.owner_type = 'company'
        and d.owner_id = c.id
        and d.status = 'approved'
        and d.archived_at is null
        and (not r.requires_expiry or d.expires_at is not null)
        and (d.expires_at is null or d.expires_at > now())
    )
  order by r.sort_order, r.code;
$$;

-- Same as B18, except a requirement optional for the company's type is not missing.
create or replace function public.vehicle_missing_requirements(p_vehicle_id uuid)
returns setof public.document_requirements
language sql
stable
set search_path = ''
as $$
  select r.*
  from public.document_requirements r
  join public.vehicles v on v.id = p_vehicle_id
  join public.companies c on c.id = v.company_id
  where r.owner_type = 'vehicle'
    and r.is_required
    and r.archived_at is null
    and (r.company_type is null or r.company_type = c.type)
    and not (c.type = any (r.optional_for))
    and not exists (
      select 1
      from public.documents d
      where d.requirement_id = r.id
        and d.owner_type = 'vehicle'
        and d.owner_id = v.id
        and d.status = 'approved'
        and d.archived_at is null
        and (not r.requires_expiry or d.expires_at is not null)
        and (d.expires_at is null or d.expires_at > now())
    )
  order by r.sort_order, r.code;
$$;

-- ---------------------------------------------------------------------------
-- license_unit_compatibility: which license types may drive each unit kind
-- ---------------------------------------------------------------------------
create table public.license_unit_compatibility (
  id uuid primary key default gen_random_uuid(),
  license_type public.license_type not null,
  vehicle_kind public.vehicle_kind not null,
  -- Admins switch a pair off instead of deleting it (rows are never deleted).
  allowed boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint license_unit_compatibility_pair_key unique (license_type, vehicle_kind)
);

comment on table public.license_unit_compatibility is
  'Provisional license <-> unit kind table (D16, plan §G.2 follow-up 4). Mirrored in packages/shared/src/carrier-trips.ts. Edited by admins.';

create trigger license_unit_compatibility_set_updated_at
before update on public.license_unit_compatibility
for each row execute function public.set_updated_at();

create trigger license_unit_compatibility_audit_admin
after insert or update or delete on public.license_unit_compatibility
for each row execute function public.audit_admin_action();

insert into public.license_unit_compatibility (license_type, vehicle_kind) values
  ('B', 'tractor'), ('B', 'rigid'), ('B', 'trailer'),
  ('C', 'rigid'),
  ('E', 'tractor'), ('E', 'rigid'), ('E', 'trailer');

revoke all on table public.license_unit_compatibility from anon, authenticated;
grant select on table public.license_unit_compatibility to authenticated;
grant insert (license_type, vehicle_kind, allowed) on table public.license_unit_compatibility to authenticated;
grant update (allowed) on table public.license_unit_compatibility to authenticated;

alter table public.license_unit_compatibility enable row level security;

create policy license_unit_compatibility_select_authenticated
on public.license_unit_compatibility
for select
to authenticated
using ((select auth.uid()) is not null);

create policy license_unit_compatibility_insert_admin
on public.license_unit_compatibility
for insert
to authenticated
with check ((select public.is_admin()));

create policy license_unit_compatibility_update_admin
on public.license_unit_compatibility
for update
to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- Whether the operator holds a current license: an approved, unexpired
-- federal_driver_license document, or a license date on the operator today
-- or later. Internal (called by assign_trip under its locks).
create function public.operator_license_current(p_operator_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.operators o
    where o.id = p_operator_id and o.license_expires_on >= current_date
  ) or exists (
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

revoke all on function public.operator_license_current(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- assign_trip: same as G1a.2, except the operator's license must be current
-- and fit the unit (license_unit_compatibility), and a load that asks for a
-- hazmat permit needs type E. Lock order unchanged: trip, operator, units by
-- id (F5).
-- ---------------------------------------------------------------------------
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
  if exists (select 1 from public.vehicle_expired_requirements(p_vehicle_id)) then
    raise exception 'vehicle has expired documents' using errcode = '55000';
  end if;

  -- D16: a current license of the type the unit (and the cargo) needs.
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
-- process_document_expiry: same as G1a.1, except the carrier side is
-- notify_carrier_staff with the business unit of the unit or the operator, so
-- its coordinators are warned too (company documents: the managers only).
-- ---------------------------------------------------------------------------
create or replace function public.process_document_expiry(p_thresholds integer[] default '{30,7}')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc record;
  v_ids uuid[];
  v_count integer := 0;
  v_data jsonb;
begin
  if cardinality(p_thresholds) is distinct from (
    select count(*) from unnest(p_thresholds) t where t between 1 and 365
  ) or cardinality(p_thresholds) = 0 then
    raise exception 'thresholds must be between 1 and 365 days' using errcode = '22023';
  end if;

  update public.documents
  set status = 'expired'
  where status = 'approved' and archived_at is null and expires_at <= now();

  with due as (
    insert into public.document_expiry_notices (document_id, threshold_days, expires_at)
    select d.id, t, d.expires_at
    from public.documents d
    cross join unnest(p_thresholds) t
    where d.status = 'approved'
      and d.archived_at is null
      and d.expires_at > now()
      and d.expires_at <= now() + make_interval(days => t)
    on conflict do nothing
    returning document_id
  )
  select coalesce(array_agg(distinct document_id), '{}') into v_ids from due;

  for v_doc in
    select d.id, d.company_id, d.owner_type, d.owner_id, d.expires_at, c.type as company_type,
           r.name as requirement_name,
           (d.expires_at at time zone 'America/Mexico_City')::date
             - (now() at time zone 'America/Mexico_City')::date as days_left,
           case d.owner_type
             when 'vehicle' then (select v.plate from public.vehicles v where v.id = d.owner_id)
             when 'operator' then (select o.full_name from public.operators o where o.id = d.owner_id)
           end as owner_label,
           case d.owner_type
             when 'vehicle' then (select v.business_unit_id from public.vehicles v where v.id = d.owner_id)
             when 'operator' then (select o.business_unit_id from public.operators o where o.id = d.owner_id)
           end as business_unit_id,
           (select o.profile_id from public.operators o
            where d.owner_type = 'operator' and o.id = d.owner_id) as operator_profile_id
    from public.documents d
    join public.companies c on c.id = d.company_id
    join public.document_requirements r on r.id = d.requirement_id
    where d.id = any (v_ids)
    order by d.id
  loop
    v_data := jsonb_strip_nulls(jsonb_build_object(
      'documentId', v_doc.id,
      'ownerType', v_doc.owner_type,
      'ownerId', v_doc.owner_id,
      'ownerLabel', v_doc.owner_label,
      'requirementName', v_doc.requirement_name,
      'expiresAt', v_doc.expires_at,
      'daysLeft', greatest(v_doc.days_left, 0)
    ));
    if v_doc.company_type = 'carrier' then
      perform public.notify_carrier_staff(v_doc.company_id, v_doc.business_unit_id, 'document_expiring', v_data);
    else
      perform public.notify_company(v_doc.company_id, 'shipper', 'document_expiring', v_data);
    end if;
    -- The operator, unless they are also a manager of the company (D13) and
    -- already got it.
    insert into public.notifications (user_id, type, data)
    select v_doc.operator_profile_id, 'document_expiring', v_data
    where v_doc.operator_profile_id is not null
      and not exists (
        select 1 from public.profiles p
        where p.id = v_doc.operator_profile_id and p.company_id = v_doc.company_id
          and p.role = public.staff_role_for_company_type(v_doc.company_type)
      );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
