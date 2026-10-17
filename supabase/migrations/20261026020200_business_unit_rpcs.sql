-- G1a.2 · RPCs by business unit (follow-up of the previous migrations).
--   Where an RPC checked that a row was of the caller's company
--   (auth_fleet_company_id, the manager), it now checks that the caller
--   operates the row's business unit (can_operate_unit): for the manager that
--   is still the whole company; for a coordinator, their business units. Each
--   function is the same as its last version except for what its comment says.
--   Lock orders are unchanged (F5: trip, then units by id).

-- The coordinators of an active business unit, except the caller.
create function public.notify_business_unit_coordinators(
  p_business_unit_id uuid,
  p_type public.notification_type,
  p_data jsonb
)
returns void
language sql
set search_path = ''
as $$
  insert into public.notifications (user_id, type, data)
  select bc.profile_id, p_type, p_data
  from public.business_unit_coordinators bc
  join public.business_units b on b.id = bc.business_unit_id and b.archived_at is null
  join public.profiles p on p.id = bc.profile_id and p.role = 'coordinator' and p.company_id = b.company_id
  where bc.business_unit_id = p_business_unit_id
    and bc.profile_id is distinct from (select auth.uid());
$$;

-- The carrier staff of a business unit: the managers of the company and, if
-- p_business_unit_id is not null, the coordinators of that business unit;
-- never the caller. Replaces notify_company(..., 'manager', ...).
create function public.notify_carrier_staff(
  p_company_id uuid,
  p_business_unit_id uuid,
  p_type public.notification_type,
  p_data jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.notify_company(p_company_id, 'manager', p_type, p_data);
  if p_business_unit_id is not null then
    perform public.notify_business_unit_coordinators(p_business_unit_id, p_type, p_data);
  end if;
end;
$$;

revoke all on function public.notify_business_unit_coordinators(uuid, public.notification_type, jsonb)
  from public, anon, authenticated;
revoke all on function public.notify_carrier_staff(uuid, uuid, public.notification_type, jsonb)
  from public, anon, authenticated;

-- Same as G1a.1, except it notifies the carrier staff of the negotiation's business unit.
create or replace function public.notify_offer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid := (select n.business_unit_id from public.negotiations n where n.id = new.negotiation_id);
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
      perform public.notify_carrier_staff(new.carrier_company_id, v_unit, 'counter_offer_received', v_data);
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status <> 'accepted' then
    if new.side = 'carrier' then
      perform public.notify_carrier_staff(new.carrier_company_id, v_unit, 'offer_accepted', v_data);
    else
      perform public.notify_company(new.shipper_company_id, 'shipper', 'offer_accepted', v_data);
    end if;
  end if;
  return null;
end;
$$;

-- Same as G1a.1, except it notifies the carrier staff of the trip's business unit.
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
  perform public.notify_carrier_staff(v_trip.carrier_company_id, v_trip.business_unit_id, 'trip_status_changed', v_data);

  if new.event_type in ('assigned', 'cancelled') then
    insert into public.notifications (user_id, type, data)
    select o.profile_id,
           case new.event_type when 'assigned' then 'trip_assigned' else 'trip_status_changed' end::public.notification_type,
           v_data
    from public.operators o
    where o.id = v_trip.operator_id
      and o.profile_id is not null
      and o.profile_id is distinct from (select auth.uid())
      -- An owner-operator (D13) already got it as the manager. Operators are
      -- never coordinators (one role per profile), so nobody gets it twice.
      and not exists (
        select 1 from public.profiles p
        where p.id = o.profile_id and p.role = 'manager' and p.company_id = v_trip.carrier_company_id
      );
  end if;
  return null;
end;
$$;

-- Same as 20261016200000_matching.sql (and G1a.1), except it notifies by business unit.
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
  -- The best unit of the whole company goes to its managers, and the best
  -- unit among the business units each coordinator runs goes to them, so each
  -- person gets one notification. At most 50 companies, nearest first.
  create temp table load_match_units on commit drop as
    with fits as (
      select m.company_id, v.business_unit_id, m.vehicle_id, m.empty_km
      from public.match_pairs(null, new.id, 150) m
      join public.vehicles v on v.id = m.vehicle_id
      where greatest(m.available_from, now()) + make_interval(secs => m.empty_km * 1.3 / 60 * 3600)
            <= m.pickup_window_end
    ),
    companies as (
      select * from (
        select distinct on (f.company_id) f.company_id, f.empty_km
        from fits f
        order by f.company_id, f.empty_km
      ) best
      order by best.empty_km
      limit 50
    ),
    units as (
      select distinct on (f.business_unit_id) f.company_id, f.business_unit_id, f.vehicle_id, f.empty_km
      from fits f
      join companies c on c.company_id = f.company_id
      order by f.business_unit_id, f.empty_km
    )
    select u.company_id, u.business_unit_id, u.vehicle_id, u.empty_km,
           u.empty_km = (select c.empty_km from companies c where c.company_id = u.company_id) as best_of_company
    from units u;

  -- The managers: the best unit of their company, once even when two business
  -- units tie (trucks at the same yard).
  for v_match in
    select distinct on (company_id) *
    from load_match_units
    where best_of_company
    order by company_id, empty_km, business_unit_id
  loop
    perform public.notify_carrier_staff(
      v_match.company_id, null, 'load_match',
      v_route || jsonb_build_object('vehicleId', v_match.vehicle_id, 'emptyKm', round(v_match.empty_km)::integer)
    );
  end loop;

  -- The coordinators: the best unit among their business units, once each.
  insert into public.notifications (user_id, type, data)
  select distinct on (bc.profile_id) bc.profile_id, 'load_match',
         v_route || jsonb_build_object('vehicleId', u.vehicle_id, 'emptyKm', round(u.empty_km)::integer)
  from load_match_units u
  join public.business_unit_coordinators bc on bc.business_unit_id = u.business_unit_id
  join public.business_units b on b.id = bc.business_unit_id and b.archived_at is null
  join public.profiles p on p.id = bc.profile_id and p.role = 'coordinator' and p.company_id = b.company_id
  where bc.profile_id is distinct from (select auth.uid())
  order by bc.profile_id, u.empty_km, u.business_unit_id;

  drop table load_match_units;
  return null;
end;
$$;

-- Same as 20261015060000_fleet.sql, except it checks the business unit.
create or replace function public.set_vehicle_availability(p_vehicle_id uuid, p_available_from timestamp with time zone, p_latitude double precision, p_longitude double precision, p_city text, p_state text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles%rowtype;
  v_expired text;
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
  if p_available_from is null then
    raise exception 'p_available_from is required' using errcode = '22023';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'invalid coordinates' using errcode = '22023';
  end if;

  -- Ownership was checked above, so reading the documents as definer is safe.
  select string_agg(e.code, ', ' order by e.sort_order, e.code) into v_expired
  from public.vehicle_expired_requirements(v_vehicle.id) e;
  if v_expired is not null then
    raise exception 'vehicle has expired documents: %', v_expired using errcode = '55000';
  end if;

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

-- Same as its last version, except it checks the business unit.
create or replace function public.clear_vehicle_availability(p_vehicle_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles%rowtype;
begin
  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found or not public.can_operate_unit(v_vehicle.business_unit_id) then
    raise exception 'vehicle not found' using errcode = '42501';
  end if;

  update public.vehicle_availability
  set archived_at = coalesce(archived_at, now()), ended_by_trip_id = null
  where vehicle_id = v_vehicle.id and (archived_at is null or ended_by_trip_id is not null);
end;
$$;

-- Same as 20261015060000_fleet.sql, except it checks the business unit.
create or replace function public.create_operator_invitation(p_operator_id uuid, p_valid_for_hours integer default 168)
returns TABLE(invitation_id uuid, code text, expires_at timestamp with time zone)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  -- Crockford base32 (no I, L, O, U): easy to read aloud and type.
  c_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_uid uuid := (select auth.uid());
  v_operator public.operators%rowtype;
  v_bytes bytea;
  v_code text := '';
  v_invitation_id uuid;
  v_expires_at timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_valid_for_hours is null or p_valid_for_hours not between 1 and 720 then
    raise exception 'p_valid_for_hours must be between 1 and 720' using errcode = '22023';
  end if;

  -- Lock order (shared with accept_operator_invitation): operator, then its
  -- invitations.
  select * into v_operator from public.operators where id = p_operator_id for update;
  if not found or not public.can_operate_unit(v_operator.business_unit_id) then
    raise exception 'operator not found' using errcode = '42501';
  end if;
  if v_operator.archived_at is not null then
    raise exception 'operator is archived' using errcode = '22023';
  end if;
  if v_operator.profile_id is not null then
    raise exception 'operator already has an account' using errcode = '22023';
  end if;
  if v_operator.email is null then
    raise exception 'operator has no email' using errcode = '22023';
  end if;

  -- 16 characters x 5 bits = 80 bits of entropy (256 is a multiple of 32, so
  -- the modulo is unbiased).
  v_bytes := extensions.gen_random_bytes(16);
  for i in 0..15 loop
    v_code := v_code || substr(c_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;

  update public.operator_invitations
  set revoked_at = now()
  where operator_id = v_operator.id and accepted_at is null and revoked_at is null;

  v_expires_at := now() + make_interval(hours => p_valid_for_hours);

  insert into public.operator_invitations (company_id, operator_id, email, code_hash, expires_at, created_by)
  values (v_operator.company_id, v_operator.id, v_operator.email, sha256(convert_to(v_code, 'UTF8')), v_expires_at, v_uid)
  returning id into v_invitation_id;

  return query select v_invitation_id, v_code, v_expires_at;
end;
$$;

-- Same as 20261015060000_fleet.sql, except it checks the operator's business unit.
create or replace function public.revoke_operator_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.operator_invitations%rowtype;
begin
  select * into v_invitation from public.operator_invitations where id = p_invitation_id for update;
  if not found or not public.can_operate_unit(
    (select o.business_unit_id from public.operators o where o.id = v_invitation.operator_id)
  ) then
    raise exception 'invitation not found' using errcode = '42501';
  end if;
  if v_invitation.accepted_at is not null or v_invitation.revoked_at is not null then
    raise exception 'invitation is no longer pending' using errcode = '22023';
  end if;

  update public.operator_invitations set revoked_at = now() where id = p_invitation_id;
end;
$$;

-- Same as its last version, except it checks the business unit of the unit.
create or replace function public.match_candidates(p_vehicle_id uuid default null, p_availability_id uuid default null, p_max_empty_km integer default 150, p_limit integer default 50)
returns setof public.match_candidate
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_vehicle_id uuid := p_vehicle_id;
  v_company_id uuid;
  v_unit_id uuid;
  v_is_admin boolean := public.is_admin();
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if (p_vehicle_id is null) = (p_availability_id is null) then
    raise exception 'pass either p_vehicle_id or p_availability_id' using errcode = '22023';
  end if;
  if p_max_empty_km is null or p_max_empty_km not between 1 and 500 then
    raise exception 'p_max_empty_km must be between 1 and 500' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 200 then
    raise exception 'p_limit must be between 1 and 200' using errcode = '22023';
  end if;

  if p_availability_id is not null then
    select a.vehicle_id into v_vehicle_id
    from public.vehicle_availability a
    where a.id = p_availability_id and a.archived_at is null;
  end if;
  select v.company_id, v.business_unit_id into v_company_id, v_unit_id from public.vehicles v where v.id = v_vehicle_id;

  if v_company_id is null or (not v_is_admin and not public.can_operate_unit(v_unit_id)) then
    raise exception 'vehicle not found' using errcode = '42501';
  end if;
  if not v_is_admin and not public.is_company_approved() then
    raise exception 'company is not approved' using errcode = '42501';
  end if;

  return query
  select m.*
  from public.match_pairs(v_vehicle_id, null, p_max_empty_km, p_availability_id) m
  order by m.empty_km, m.pickup_window_start, m.load_id
  limit p_limit;
end;
$$;
-- ---------------------------------------------------------------------------
-- Offers
-- ---------------------------------------------------------------------------

-- A proposed unit must be of the negotiation's business unit.
create function public.assert_vehicle_in_unit(p_vehicle_id uuid, p_business_unit_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_vehicle_id is not null and not exists (
    select 1 from public.vehicles v where v.id = p_vehicle_id and v.business_unit_id = p_business_unit_id
  ) then
    raise exception 'invalid offer: vehicle not found' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.assert_vehicle_in_unit(uuid, uuid) from public, anon, authenticated;

-- Same as 20261015160000_loads_negotiation.sql, except:
--   * managers and coordinators offer (auth_carrier_company_id);
--   * the negotiation belongs to a business unit: p_business_unit_id, or the
--     one of p_vehicle_id, or the only one the caller operates; the caller must
--     operate it and the unit must be of it;
--   * still one negotiation per load and company: if another business unit of
--     the company already negotiates the load and the caller does not operate
--     it, 23505 (a manager operates every business unit, so they continue it).
drop function public.make_offer(uuid, bigint, text, uuid);

create function public.make_offer(
  p_load_id uuid,
  p_amount_cents bigint,
  p_conditions text default null,
  p_vehicle_id uuid default null,
  p_business_unit_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_carrier_id uuid := public.auth_carrier_company_id();
  v_units uuid[] := public.auth_business_unit_ids();
  v_unit_id uuid := p_business_unit_id;
  v_load public.loads;
  v_negotiation public.negotiations;
  v_negotiation_id uuid;
  v_offer_id uuid;
  v_conditions text := nullif(btrim(p_conditions), '');
begin
  if v_carrier_id is null then
    raise exception 'only carriers can make offers' using errcode = '42501';
  end if;
  if not public.is_company_approved() then
    raise exception 'company is not approved' using errcode = '42501';
  end if;

  -- Authorize before locking: a carrier may only touch loads that are open or
  -- that it already negotiated, so it can never lock other shippers' drafts.
  -- The status is only revealed to carriers that negotiated the load.
  if not exists (
    select 1 from public.loads l
    where l.id = p_load_id
      and l.archived_at is null
      and (
        l.status in ('published', 'negotiating')
        or exists (
          select 1 from public.negotiations n
          where n.load_id = l.id and n.carrier_company_id = v_carrier_id and public.can_operate_unit(n.business_unit_id)
        )
      )
  ) then
    raise exception 'load not found' using errcode = '42501';
  end if;

  -- Lock order: load, then offers (shared by every RPC of this file). The
  -- status is re-read under the lock (it may have changed while waiting).
  select * into v_load from public.loads where id = p_load_id for update;

  -- Under the load lock, so the company's negotiation cannot appear meanwhile.
  select * into v_negotiation from public.negotiations n
  where n.load_id = v_load.id and n.carrier_company_id = v_carrier_id;

  if v_load.status not in ('published', 'negotiating') then
    if v_negotiation.id is null or not public.can_operate_unit(v_negotiation.business_unit_id) then
      raise exception 'load not found' using errcode = '42501';
    end if;
    raise exception 'cannot offer on a load in status %', v_load.status using errcode = '55000';
  end if;
  if v_load.pickup_window_end <= clock_timestamp() then
    raise exception 'pickup window already ended' using errcode = '55000';
  end if;
  -- Re-checked under the load lock: the carrier may have been suspended while
  -- this call waited for it.
  if not public.lock_company_approved(v_carrier_id) then
    raise exception 'company is not approved' using errcode = '42501';
  end if;

  perform public.check_offer_fields(v_carrier_id, 'carrier', p_amount_cents, v_conditions, p_vehicle_id);

  if v_negotiation.id is not null then
    if not public.can_operate_unit(v_negotiation.business_unit_id)
       or (v_unit_id is not null and v_unit_id <> v_negotiation.business_unit_id) then
      raise exception 'another business unit of the company already negotiates this load' using errcode = '23505';
    end if;
    v_unit_id := v_negotiation.business_unit_id;
  else
    if v_unit_id is null and p_vehicle_id is not null then
      select v.business_unit_id into v_unit_id from public.vehicles v where v.id = p_vehicle_id;
    end if;
    if v_unit_id is null and cardinality(v_units) = 1 then
      v_unit_id := v_units[1];
    end if;
    if v_unit_id is null then
      raise exception 'business_unit_id is required' using errcode = '22023';
    end if;
    if not public.can_operate_unit(v_unit_id) then
      raise exception 'business unit not found' using errcode = '42501';
    end if;
  end if;
  perform public.assert_vehicle_in_unit(p_vehicle_id, v_unit_id);

  insert into public.negotiations (load_id, shipper_company_id, carrier_company_id, business_unit_id, created_by)
  values (v_load.id, v_load.shipper_company_id, v_carrier_id, v_unit_id, v_uid)
  on conflict (load_id, carrier_company_id) do update set updated_at = now()
  returning id into v_negotiation_id;

  if exists (select 1 from public.offers where negotiation_id = v_negotiation_id and status = 'pending') then
    raise exception 'negotiation already has a pending offer' using errcode = '55000';
  end if;

  insert into public.offers (
    negotiation_id, load_id, shipper_company_id, carrier_company_id, side, amount_cents, conditions, vehicle_id, created_by
  ) values (
    v_negotiation_id, v_load.id, v_load.shipper_company_id, v_carrier_id, 'carrier', p_amount_cents, v_conditions,
    p_vehicle_id, v_uid
  )
  returning id into v_offer_id;

  perform public.sync_load_negotiation_status(v_load.id);
  return v_offer_id;
end;
$$;

revoke all on function public.make_offer(uuid, bigint, text, uuid, uuid) from public, anon;
grant execute on function public.make_offer(uuid, bigint, text, uuid, uuid) to authenticated;

-- Same as 20261015160000_loads_negotiation.sql, except the carrier side is whoever
-- operates the negotiation's business unit.
create or replace function public.lock_offer_for_response(p_offer_id uuid, p_by text)
returns public.offers
language plpgsql
set search_path = ''
as $$
declare
  v_offer public.offers;
  v_caller_side public.offer_side;
  v_load_status public.load_status;
begin
  -- The parties and the load of an offer never change, so the caller is
  -- authorized before any lock is taken: strangers cannot lock other loads.
  select * into v_offer from public.offers where id = p_offer_id;
  if found and v_offer.shipper_company_id = public.auth_shipper_company_id() then
    v_caller_side := 'shipper';
  elsif found and v_offer.carrier_company_id = public.auth_carrier_company_id() and public.can_operate_unit(
    (select n.business_unit_id from public.negotiations n where n.id = v_offer.negotiation_id)
  ) then
    v_caller_side := 'carrier';
  else
    raise exception 'offer not found' using errcode = '42501';
  end if;

  select l.status into v_load_status from public.loads l where l.id = v_offer.load_id for update;
  select * into v_offer from public.offers where id = p_offer_id for update;

  if (p_by = 'author') <> (v_caller_side = v_offer.side) then
    raise exception 'offer cannot be answered by this side' using errcode = '42501';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'offer is no longer pending (status %)', v_offer.status using errcode = '55000';
  end if;
  if v_load_status not in ('published', 'negotiating') then
    raise exception 'load is no longer open (status %)', v_load_status using errcode = '55000';
  end if;
  if p_by = 'counterparty' and not public.lock_company_approved(
    case v_caller_side when 'shipper' then v_offer.shipper_company_id else v_offer.carrier_company_id end
  ) then
    raise exception 'company is not approved' using errcode = '42501';
  end if;

  return v_offer;
end;
$$;

-- Same as 20261015160000_loads_negotiation.sql, except a proposed unit must be of the
-- negotiation's business unit.
create or replace function public.counter_offer(p_offer_id uuid, p_amount_cents bigint, p_conditions text default null, p_vehicle_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_offer public.offers := public.lock_offer_for_response(p_offer_id, 'counterparty');
  v_side public.offer_side := case v_offer.side when 'carrier' then 'shipper' else 'carrier' end::public.offer_side;
  v_conditions text := nullif(btrim(p_conditions), '');
  v_new_id uuid;
begin
  perform public.assert_pickup_open(v_offer.load_id);
  perform public.check_offer_fields(v_offer.carrier_company_id, v_side, p_amount_cents, v_conditions, p_vehicle_id);
  perform public.assert_vehicle_in_unit(
    p_vehicle_id, (select n.business_unit_id from public.negotiations n where n.id = v_offer.negotiation_id)
  );

  update public.offers
  set status = 'countered', responded_by = v_uid, responded_at = now()
  where id = v_offer.id;

  insert into public.offers (
    negotiation_id, load_id, shipper_company_id, carrier_company_id, side, amount_cents, conditions, vehicle_id,
    parent_offer_id, created_by
  ) values (
    v_offer.negotiation_id, v_offer.load_id, v_offer.shipper_company_id, v_offer.carrier_company_id, v_side,
    p_amount_cents, v_conditions, p_vehicle_id, v_offer.id, v_uid
  )
  returning id into v_new_id;

  update public.negotiations set updated_at = now() where id = v_offer.negotiation_id;
  return v_new_id;
end;
$$;

-- Same as 20261017000000_admin_operations.sql, except the negotiation gets a business unit.
create or replace function public.admin_create_offer(p_load_id uuid, p_carrier_company_id uuid, p_amount_cents bigint, p_conditions text default null, p_vehicle_id uuid default null, p_accept boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_load public.loads;
  v_offer public.offers;
  v_negotiation_id uuid;
  v_unit_id uuid;
  v_conditions text := nullif(btrim(p_conditions), '');
begin
  if not public.is_admin() then
    raise exception 'only admins can offer on behalf of a carrier' using errcode = '42501';
  end if;
  if p_accept is null then
    raise exception 'p_accept is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.companies c
    where c.id = p_carrier_company_id and c.type = 'carrier' and c.archived_at is null
  ) then
    raise exception 'carrier not found' using errcode = '22023';
  end if;

  select * into v_load from public.loads where id = p_load_id and archived_at is null for update;
  if not found then
    raise exception 'load not found' using errcode = '22023';
  end if;
  if v_load.status not in ('published', 'negotiating') then
    raise exception 'cannot offer on a load in status %', v_load.status using errcode = '55000';
  end if;
  perform public.assert_pickup_open(v_load.id);
  if not public.lock_company_approved(p_carrier_company_id) then
    raise exception 'company is not approved' using errcode = '55000';
  end if;
  perform public.check_offer_fields(p_carrier_company_id, 'carrier', p_amount_cents, v_conditions, p_vehicle_id);

  -- The business unit: the one of the company's negotiation, or of the unit;
  -- without either, the default trigger takes the only one of the company.
  select n.business_unit_id into v_unit_id from public.negotiations n
  where n.load_id = v_load.id and n.carrier_company_id = p_carrier_company_id;
  if v_unit_id is null and p_vehicle_id is not null then
    select v.business_unit_id into v_unit_id from public.vehicles v where v.id = p_vehicle_id;
  end if;
  if v_unit_id is not null then
    perform public.assert_vehicle_in_unit(p_vehicle_id, v_unit_id);
  end if;

  insert into public.negotiations (load_id, shipper_company_id, carrier_company_id, business_unit_id, created_by)
  values (v_load.id, v_load.shipper_company_id, p_carrier_company_id, v_unit_id, v_uid)
  on conflict (load_id, carrier_company_id) do update set updated_at = now()
  returning id into v_negotiation_id;

  if exists (select 1 from public.offers where negotiation_id = v_negotiation_id and status = 'pending') then
    raise exception 'negotiation already has a pending offer' using errcode = '55000';
  end if;

  insert into public.offers (
    negotiation_id, load_id, shipper_company_id, carrier_company_id, side, amount_cents, conditions, vehicle_id, created_by
  ) values (
    v_negotiation_id, v_load.id, v_load.shipper_company_id, p_carrier_company_id, 'carrier', p_amount_cents,
    v_conditions, p_vehicle_id, v_uid
  )
  returning * into v_offer;

  if p_accept then
    perform public.apply_offer_acceptance(v_offer);
  else
    perform public.sync_load_negotiation_status(v_load.id);
  end if;
  return v_offer.id;
end;
$$;

-- Same as its last version, except the trip takes the negotiation's business unit.
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

  insert into public.trips (load_id, offer_id, shipper_company_id, carrier_company_id, business_unit_id)
  values (
    v_offer.load_id, v_offer.id, v_offer.shipper_company_id, v_offer.carrier_company_id,
    (select n.business_unit_id from public.negotiations n where n.id = v_offer.negotiation_id)
  )
  returning id into v_trip_id;

  insert into public.trip_events (trip_id, event_type, to_status, occurred_at, actor_id, actor_role)
  values (v_trip_id, 'created', 'pending_assignment', now(), (select auth.uid()), public.auth_role());

  return v_trip_id;
end;
$$;

-- Same as its last version, except the business unit: a coordinator assigns
-- only a unit and an operator of the trip's business unit; the manager (and
-- the admin) any of the company, and the trip moves to the unit's business
-- unit. Lock order unchanged: trip, operator, units by id (F5).
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
  v_unit_id uuid;
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
  perform 1 from public.operators o
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
  select v.business_unit_id into v_unit_id from public.vehicles v
  where v.id = p_vehicle_id and v.company_id = v_trip.carrier_company_id and v.archived_at is null
    and (v_any_unit or v.business_unit_id = v_trip.business_unit_id);
  if not found then
    raise exception 'vehicle not found' using errcode = '22023';
  end if;
  if exists (select 1 from public.vehicle_expired_requirements(p_vehicle_id)) then
    raise exception 'vehicle has expired documents' using errcode = '55000';
  end if;

  update public.trips
  set status = 'assigned', vehicle_id = p_vehicle_id, operator_id = p_operator_id, assigned_at = now(),
      business_unit_id = v_unit_id
  where id = v_trip.id;

  insert into public.trip_events (trip_id, event_type, from_status, to_status, occurred_at, actor_id, actor_role)
  values (v_trip.id, 'assigned', v_trip.status, 'assigned', now(), (select auth.uid()), public.auth_role());
end;
$$;

-- Same as its last version, except the carrier side is whoever operates the
-- trip's business unit.
create or replace function public.cancel_trip(p_trip_id uuid, p_reason text)
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
           or (t.carrier_company_id = public.auth_carrier_company_id() and public.can_operate_unit(t.business_unit_id)))
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  select * into v_trip from public.trips where id = p_trip_id for update;
  -- Re-checked under the lock: the manager may have moved it meanwhile. The
  -- shipper comparison is null for carrier staff, so the whole test is
  -- coalesced: a null must refuse, never pass.
  if not found or not coalesce(
    v_is_admin
    or v_trip.shipper_company_id = public.auth_shipper_company_id()
    or public.can_operate_unit(v_trip.business_unit_id),
    false
  ) then
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

-- Same as its last version, except it checks the trip's business unit.
create or replace function public.add_trip_document(p_trip_id uuid, p_kind public.trip_document_kind, p_storage_path text, p_file_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_company uuid := public.auth_carrier_company_id();
  v_trip public.trips;
  v_object storage.objects%rowtype;
  v_name text := nullif(btrim(p_file_name), '');
  v_id uuid;
begin
  -- Authorize before locking: other companies' trips are never locked.
  if v_company is null or not exists (
    select 1 from public.trips t
    where t.id = p_trip_id and t.carrier_company_id = v_company and public.can_operate_unit(t.business_unit_id)
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  select * into v_trip from public.trips where id = p_trip_id for update;
  -- Re-checked under the lock: the manager may have moved it meanwhile.
  if not found or not public.can_operate_unit(v_trip.business_unit_id) then
    raise exception 'trip not found' using errcode = '42501';
  end if;

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

-- Same as its last version (F12), except it checks the trip's business unit.
create or replace function public.report_incident(p_trip_id uuid, p_kind public.incident_kind, p_description text, p_occurred_at timestamp with time zone default null, p_latitude double precision default null, p_longitude double precision default null, p_client_event_id uuid default null)
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
           or (t.carrier_company_id = public.auth_carrier_company_id() and public.can_operate_unit(t.business_unit_id))
           or t.operator_id = public.auth_operator_id())
  ) then
    raise exception 'trip not found' using errcode = '42501';
  end if;
  select * into v_trip from public.trips where id = p_trip_id for update;
  -- Re-checked under the lock: the trip may have been reassigned meanwhile.
  if not found or not coalesce(
    public.is_admin()
    or v_trip.shipper_company_id = public.auth_shipper_company_id()
    or (v_trip.carrier_company_id = public.auth_carrier_company_id() and public.can_operate_unit(v_trip.business_unit_id))
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

-- Same as its last version, plus the coordinators of the trip's business unit.
create or replace function public.trip_point_locations(p_trip_id uuid)
returns TABLE(source text, record_id uuid, occurred_at timestamp with time zone, latitude double precision, longitude double precision, accuracy_m real)
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
        or t.business_unit_id = any (public.auth_business_unit_ids())
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

-- Same as G1a.1, except a coordinator submits the documents of the units and
-- operators of their business units.
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
  if v_role is null or v_role not in ('shipper', 'manager', 'coordinator') then
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
  -- A coordinator submits the documents of the units and operators they run,
  -- never the company's.
  if v_role = 'coordinator' and not public.coordinator_runs_document_owner(p_owner_type, p_owner_id) then
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
