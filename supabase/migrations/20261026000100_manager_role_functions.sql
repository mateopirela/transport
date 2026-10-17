-- G1a.1 · Functions that named the carrier role (follow-up of the previous
-- migration). Each one is the same as its last version except for how it names
-- the role: carrier becomes manager, and a company type maps to the role of its
-- staff with staff_role_for_company_type instead of a text cast (a carrier
-- company's staff are managers now, so the cast would fail at run time).
-- Coordinators get nothing new here: auth_fleet_company_id stays manager-only,
-- so a coordinator sees and does nothing in the fleet until business units
-- (G1a.2) give them their scope.

-- The role of a company's staff. Its mirror is staffRoleForCompanyType in
-- @transport/shared.
create function public.staff_role_for_company_type(p_type public.company_type)
returns public.user_role
language sql
immutable
set search_path = ''
as $$
  select case p_type
    when 'shipper' then 'shipper'::public.user_role
    when 'carrier' then 'manager'::public.user_role
  end;
$$;

comment on function public.staff_role_for_company_type(public.company_type) is
  'The user_role of the staff of a company type: shipper for shipper companies, manager for carrier companies.';

revoke execute on function public.staff_role_for_company_type(public.company_type) from public, anon;
grant execute on function public.staff_role_for_company_type(public.company_type) to authenticated, service_role;

-- Same as 20261015040644_identity.sql, except it accepts manager and coordinator,
-- and stores the carrier role of older builds as manager.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := new.raw_user_meta_data ->> 'role';
begin
  -- Builds from before G1a still sign carriers up as 'carrier'.
  if v_role = 'carrier' then
    v_role := 'manager';
  end if;
  if v_role is null or v_role not in ('shipper', 'manager', 'coordinator', 'operator') then
    raise exception 'invalid sign-up role: %', coalesce(v_role, '(missing)')
      using errcode = '22023';
  end if;

  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    v_role::public.user_role,
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), '')
  );

  return new;
end;
$$;

-- Same as 20261015040644_identity.sql, except a manager creates a carrier company
-- (coordinators and operators never create one).
create or replace function public.create_company(p_legal_name text, p_rfc text, p_contact_name text default null, p_contact_email text default null, p_contact_phone text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profile public.profiles%rowtype;
  v_company_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Lock the caller's profile so two concurrent calls cannot create two companies.
  select * into v_profile from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'profile not found' using errcode = '42501';
  end if;

  if v_profile.role not in ('shipper', 'manager') then
    raise exception 'role % cannot create a company', v_profile.role using errcode = '42501';
  end if;

  if v_profile.company_id is not null then
    raise exception 'user already belongs to a company' using errcode = '42501';
  end if;

  insert into public.companies (type, legal_name, rfc, contact_name, contact_email, contact_phone, created_by)
  values (
    case v_profile.role when 'shipper' then 'shipper' else 'carrier' end::public.company_type,
    btrim(p_legal_name),
    upper(btrim(p_rfc)),
    nullif(btrim(p_contact_name), ''),
    nullif(btrim(p_contact_email), ''),
    nullif(btrim(p_contact_phone), ''),
    v_uid
  )
  returning id into v_company_id;

  update public.profiles set company_id = v_company_id where id = v_uid;

  return v_company_id;
end;
$$;

-- Same as 20261015050000_documents_verification.sql, except carrier becomes manager.
create or replace function public.submit_document(p_requirement_id uuid, p_owner_type public.document_owner_type, p_owner_id uuid, p_storage_path text, p_file_name text default null, p_expires_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.user_role := public.auth_role();
  v_company public.companies%rowtype;
  v_requirement public.document_requirements%rowtype;
  v_object storage.objects%rowtype;
  v_document_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_role is null or v_role not in ('shipper', 'manager') then
    raise exception 'only shipper or carrier members can submit documents' using errcode = '42501';
  end if;

  -- Lock the company so a concurrent review_company sees a consistent state.
  select * into v_company from public.companies
  where id = public.auth_company_id() and archived_at is null
  for update;
  if not found then
    raise exception 'caller has no active company' using errcode = '42501';
  end if;

  if public.document_owner_company_id(p_owner_type, p_owner_id) is distinct from v_company.id then
    raise exception 'owner does not belong to the caller company' using errcode = '42501';
  end if;

  select * into v_requirement from public.document_requirements
  where id = p_requirement_id and archived_at is null;
  if not found then
    raise exception 'unknown document requirement' using errcode = '22023';
  end if;
  if v_requirement.owner_type <> p_owner_type
     or (v_requirement.company_type is not null and v_requirement.company_type <> v_company.type) then
    raise exception 'requirement % does not apply to this owner', v_requirement.code using errcode = '22023';
  end if;
  if v_requirement.taxpayer_type is not null
     and v_requirement.taxpayer_type <> public.taxpayer_type_for_rfc(v_company.rfc) then
    raise exception 'requirement % does not apply to this taxpayer type', v_requirement.code using errcode = '22023';
  end if;
  if v_requirement.requires_expiry and p_expires_at is null then
    raise exception 'requirement % needs an expiry date', v_requirement.code using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'document is already expired' using errcode = '22023';
  end if;

  -- {company_id}/{owner_type}/{owner_id}/{uuid}[.ext]
  if p_storage_path is null or p_storage_path !~ (
    '^' || v_company.id::text || '/' || p_owner_type::text || '/' || p_owner_id::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,8})?$'
  ) then
    raise exception 'invalid storage path' using errcode = '22023';
  end if;

  select * into v_object from storage.objects
  where bucket_id = 'documents' and name = p_storage_path;
  if not found then
    raise exception 'file was not uploaded' using errcode = '22023';
  end if;

  -- A newer submission supersedes pending ones for the same requirement and owner.
  update public.documents
  set archived_at = now()
  where requirement_id = v_requirement.id
    and owner_type = p_owner_type
    and owner_id = p_owner_id
    and status = 'pending_review'
    and archived_at is null;

  insert into public.documents (
    company_id, requirement_id, owner_type, owner_id, storage_path, file_name,
    mime_type, size_bytes, expires_at, submitted_by
  )
  values (
    v_company.id, v_requirement.id, p_owner_type, p_owner_id, p_storage_path,
    nullif(left(btrim(p_file_name), 255), ''),
    v_object.metadata ->> 'mimetype',
    (v_object.metadata ->> 'size')::bigint,
    p_expires_at,
    v_uid
  )
  returning id into v_document_id;

  -- A rejected company goes back to the review queue when it sends new documents.
  if v_company.status = 'rejected' then
    update public.companies set status = 'pending_review' where id = v_company.id;
  end if;

  return v_document_id;
end;
$$;

-- Same as 20261015120000_verification_panel.sql, except carrier becomes manager.
create or replace function public.request_company_review()
returns public.verification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := public.auth_role();
  v_company public.companies%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_role is null or v_role not in ('shipper', 'manager') then
    raise exception 'only shipper or carrier members can request a review' using errcode = '42501';
  end if;

  -- Same lock as review_company, so a concurrent admin decision serializes.
  select * into v_company from public.companies
  where id = public.auth_company_id() and archived_at is null
  for update;
  if not found then
    raise exception 'caller has no active company' using errcode = '42501';
  end if;
  if v_company.status <> 'rejected' then
    raise exception 'cannot request a review in status %', v_company.status using errcode = '55000';
  end if;

  update public.companies set status = 'pending_review' where id = v_company.id;
  return 'pending_review';
end;
$$;

-- Same as 20261015060000_fleet.sql, except carrier becomes manager. Still the
-- manager only: coordinators get their scope by business unit in G1a.2.
create or replace function public.auth_fleet_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.profiles p
  join public.companies c on c.id = p.company_id
  where p.id = (select auth.uid())
    and p.role = 'manager'
    and c.type = 'carrier'
    and c.archived_at is null;
$$;

-- Same as 20261015200000_chat_notifications.sql, except it notifies the managers
-- (notify_carrier_staff, with coordinators, comes with business units in G1a.2).
create or replace function public.notify_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_data jsonb := jsonb_build_object(
    'offerId', new.id, 'negotiationId', new.negotiation_id, 'amountCents', new.amount_cents, 'side', new.side
  ) || public.load_route_data(new.load_id);
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    if new.side = 'carrier' then
      perform public.notify_company(
        new.shipper_company_id, 'shipper',
        case when new.parent_offer_id is null then 'offer_received' else 'counter_offer_received' end::public.notification_type,
        v_data
      );
    else
      perform public.notify_company(new.carrier_company_id, 'manager', 'counter_offer_received', v_data);
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    if new.side = 'carrier' then
      perform public.notify_company(new.carrier_company_id, 'manager', 'offer_accepted', v_data);
    else
      perform public.notify_company(new.shipper_company_id, 'shipper', 'offer_accepted', v_data);
    end if;
  end if;
  return null;
end;
$$;

-- Same as 20261015200000_chat_notifications.sql, except carrier becomes manager.
create or replace function public.notify_trip_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
  v_data jsonb;
begin
  if new.to_status is null or new.event_type = 'created' then
    return null;
  end if;
  select * into v_trip from public.trips where id = new.trip_id;
  v_data := jsonb_build_object('tripId', v_trip.id, 'eventType', new.event_type, 'status', new.to_status)
    || public.load_route_data(v_trip.load_id);

  perform public.notify_company(v_trip.shipper_company_id, 'shipper', 'trip_status_changed', v_data);
  perform public.notify_company(v_trip.carrier_company_id, 'manager', 'trip_status_changed', v_data);

  if new.event_type in ('assigned', 'cancelled') then
    insert into public.notifications (user_id, type, data)
    select o.profile_id,
           case new.event_type when 'assigned' then 'trip_assigned' else 'trip_status_changed' end::public.notification_type,
           v_data
    from public.operators o
    where o.id = v_trip.operator_id
      and o.profile_id is not null
      and o.profile_id is distinct from (select auth.uid())
      -- An owner-operator (D13) already got it as the manager.
      and not exists (
        select 1 from public.profiles p
        where p.id = o.profile_id and p.role = 'manager' and p.company_id = v_trip.carrier_company_id
      );
  end if;
  return null;
end;
$$;

-- Same as 20261016200000_matching.sql, except carrier becomes manager.
create or replace function public.notify_load_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match record;
  v_route jsonb := public.load_route_data(new.id);
begin
  for v_match in
    select * from (
      select distinct on (m.company_id) m.company_id, m.vehicle_id, m.empty_km
      from public.match_pairs(null, new.id, 150) m
      where greatest(m.available_from, now()) + make_interval(secs => m.empty_km * 1.3 / 60 * 3600)
            <= m.pickup_window_end
      order by m.company_id, m.empty_km
    ) best
    order by best.empty_km
    limit 50
  loop
    perform public.notify_company(
      v_match.company_id, 'manager', 'load_match',
      v_route || jsonb_build_object('vehicleId', v_match.vehicle_id, 'emptyKm', round(v_match.empty_km)::integer)
    );
  end loop;
  return null;
end;
$$;

-- Same as 20261015200000_chat_notifications.sql, except the role comes from
-- staff_role_for_company_type.
create or replace function public.notify_document_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_type public.company_type;
begin
  if old.status <> 'pending_review' or new.status not in ('approved', 'rejected') then
    return null;
  end if;
  select c.type into v_company_type from public.companies c where c.id = new.company_id;
  perform public.notify_company(
    new.company_id,
    public.staff_role_for_company_type(v_company_type),
    case new.status when 'approved' then 'document_approved' else 'document_rejected' end::public.notification_type,
    jsonb_build_object(
      'documentId', new.id,
      'ownerType', new.owner_type,
      'ownerId', new.owner_id,
      'requirementName', (select r.name from public.document_requirements r where r.id = new.requirement_id),
      'reviewNotes', new.review_notes
    )
  );
  return null;
end;
$$;

-- Same as 20261017090000_notification_dispatch.sql, except the role comes from
-- staff_role_for_company_type.
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
    perform public.notify_company(
      v_doc.company_id, public.staff_role_for_company_type(v_doc.company_type), 'document_expiring', v_data
    );
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
