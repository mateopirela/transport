-- B16 · Admin: operations and pilot statistics. No new tables.
--
--   * Manual assignment: an admin offers or contracts a load on behalf of the
--     parties. admin_create_offer creates a carrier-side offer in the name of
--     a carrier (and, with p_accept, accepts it in the name of the shipper);
--     admin_accept_offer accepts any pending offer in the name of its
--     counterparty. Both reuse the acceptance of accept_offer (now in
--     apply_offer_acceptance), so the same rules hold: open load, pickup
--     window not over, both companies approved, the other offers rejected and
--     the trip created.
--   * Audit: admin writes on loads and trips were already recorded (B05/B06);
--     offers and negotiations join them, so every manual contract leaves its
--     offer, negotiation, load and trip in audit_log with the admin as actor.
--   * KPI views (producto §5): kpi_load_times, kpi_trip_metrics,
--     kpi_carrier_onboarding and the one-row kpi_pilot_summary. They are
--     security_invoker (the caller's RLS applies) and return rows only to
--     admins. Distances are straight-line km (PostGIS); the web turns them
--     into road estimates with the matching road factor.
--
-- Lock order is the one of B05: load, then offers, then companies (share).

-- ---------------------------------------------------------------------------
-- Audit: offers and negotiations belong to the load's shipper company.
-- Same function as B06 with two more cases.
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
      when 'offers' then (v_row ->> 'shipper_company_id')::uuid
      when 'negotiations' then (v_row ->> 'shipper_company_id')::uuid
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

create trigger offers_audit_admin
after insert or update or delete on public.offers
for each row execute function public.audit_admin_action();

create trigger negotiations_audit_admin
after insert or update or delete on public.negotiations
for each row execute function public.audit_admin_action();

-- ---------------------------------------------------------------------------
-- Internal: accept a pending offer whose load the caller already locked
-- (FOR UPDATE) and validated as open. Body of B05's accept_offer.
-- ---------------------------------------------------------------------------
create function public.apply_offer_acceptance(p_offer public.offers)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  perform public.assert_pickup_open(p_offer.load_id);
  -- Share-locks both companies (always shipper, then carrier) so neither can be
  -- suspended between this check and the commit.
  if not public.lock_company_approved(p_offer.shipper_company_id)
     or not public.lock_company_approved(p_offer.carrier_company_id) then
    raise exception 'both companies must be approved to contract' using errcode = '55000';
  end if;

  update public.offers
  set status = 'accepted', responded_by = v_uid, responded_at = now()
  where id = p_offer.id;

  update public.offers
  set status = 'rejected', status_reason = 'other_offer_accepted', responded_by = v_uid, responded_at = now()
  where load_id = p_offer.load_id and status = 'pending' and id <> p_offer.id;

  update public.loads
  set status = 'contracted',
      accepted_offer_id = p_offer.id,
      carrier_company_id = p_offer.carrier_company_id,
      agreed_price_cents = p_offer.amount_cents,
      contracted_at = now()
  where id = p_offer.load_id;

  update public.negotiations set updated_at = now() where id = p_offer.negotiation_id;

  return public.create_trip_for_accepted_offer(p_offer.id);
end;
$$;

revoke all on function public.apply_offer_acceptance(public.offers) from public, anon, authenticated;

-- Same behavior as B05: lock_offer_for_response locks the load and the offer
-- and checks the caller's side; the acceptance itself is shared.
create or replace function public.accept_offer(p_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.apply_offer_acceptance(public.lock_offer_for_response(p_offer_id, 'counterparty'));
end;
$$;

revoke all on function public.accept_offer(uuid) from public, anon;
grant execute on function public.accept_offer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: an admin makes an offer on an open load in the name of a carrier
-- (side `carrier`, created_by = the admin). With p_accept the offer is
-- accepted at once in the name of the shipper and the trip is created.
-- Fails when the carrier already has a pending offer on the load (accept it
-- with admin_accept_offer instead). Returns the offer id.
-- ---------------------------------------------------------------------------
create function public.admin_create_offer(
  p_load_id uuid,
  p_carrier_company_id uuid,
  p_amount_cents bigint,
  p_conditions text default null,
  p_vehicle_id uuid default null,
  p_accept boolean default false
)
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

  insert into public.negotiations (load_id, shipper_company_id, carrier_company_id, created_by)
  values (v_load.id, v_load.shipper_company_id, p_carrier_company_id, v_uid)
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

revoke all on function public.admin_create_offer(uuid, uuid, bigint, text, uuid, boolean) from public, anon;
grant execute on function public.admin_create_offer(uuid, uuid, bigint, text, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: an admin accepts a pending offer in the name of its counterparty.
-- Returns the trip id.
-- ---------------------------------------------------------------------------
create function public.admin_accept_offer(p_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers;
  v_load_status public.load_status;
begin
  if not public.is_admin() then
    raise exception 'only admins can accept on behalf of a party' using errcode = '42501';
  end if;
  select * into v_offer from public.offers where id = p_offer_id;
  if not found then
    raise exception 'offer not found' using errcode = '22023';
  end if;

  -- Lock order: load, then the offer (re-read under the lock).
  select l.status into v_load_status from public.loads l where l.id = v_offer.load_id for update;
  select * into v_offer from public.offers where id = p_offer_id for update;
  if v_offer.status <> 'pending' then
    raise exception 'offer is no longer pending (status %)', v_offer.status using errcode = '55000';
  end if;
  if v_load_status not in ('published', 'negotiating') then
    raise exception 'load is no longer open (status %)', v_load_status using errcode = '55000';
  end if;

  return public.apply_offer_acceptance(v_offer);
end;
$$;

revoke all on function public.admin_accept_offer(uuid) from public, anon;
grant execute on function public.admin_accept_offer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- KPI views (producto §5). security_invoker: they read the base tables with
-- the caller's privileges and RLS, and the is_admin() filter leaves them
-- empty for everyone else.
-- ---------------------------------------------------------------------------

-- Published loads: time to the first offer and to the contract.
create view public.kpi_load_times
with (security_invoker = true)
as
select
  l.id as load_id,
  l.shipper_company_id,
  l.status,
  l.published_at,
  f.first_offer_at,
  l.contracted_at,
  round((extract(epoch from f.first_offer_at - l.published_at) / 60)::numeric, 1) as minutes_to_first_offer,
  round((extract(epoch from l.contracted_at - l.published_at) / 60)::numeric, 1) as minutes_to_contract
from public.loads l
left join lateral (
  select min(o.created_at) as first_offer_at
  from public.offers o
  where o.load_id = l.id and o.side = 'carrier'
) f on true
where l.published_at is not null
  and (select public.is_admin());

-- Trips: empty km from the unit's previous trip, return trips, empty km
-- avoided and accuracy of the estimated end of unloading.
--   * Previous trip: the latest earlier trip (not cancelled) of the same unit.
--   * Empty km: straight line from the previous trip's destination to this
--     pickup (unknown without a previous trip).
--   * Return trip (producto §6): the pickup is within 150 km of the previous
--     destination and the delivery within 150 km of the previous origin
--     (RETURN_TRIP_RADIUS_KM in packages/shared).
--   * Empty km avoided: on a return trip, the empty way back the unit would
--     have driven (previous destination -> previous origin) minus the empty
--     km it drove to this pickup; 0 on other trips with a previous trip.
--   * Unload estimate error: actual end of unloading minus the estimate given
--     when unloading started (positive = it took longer).
create view public.kpi_trip_metrics
with (security_invoker = true)
as
select
  t.id as trip_id,
  t.load_id,
  t.shipper_company_id,
  t.carrier_company_id,
  t.vehicle_id,
  t.status,
  t.created_at,
  p.trip_id as previous_trip_id,
  m.empty_km,
  coalesce(m.empty_km <= 150 and m.back_home_km <= 150, false) as is_return_trip,
  case
    when m.empty_km is null then null
    when m.empty_km <= 150 and m.back_home_km <= 150 then greatest(m.way_back_km - m.empty_km, 0)
    else 0
  end as avoided_empty_km,
  u.estimated_end_at as unload_estimated_end_at,
  u.finished_at as unload_finished_at,
  round((extract(epoch from u.finished_at - u.estimated_end_at) / 60)::numeric, 1) as unload_estimate_error_minutes
from public.trips t
join public.loads l on l.id = t.load_id
left join lateral (
  select pt.id as trip_id, pl.origin_location, pl.destination_location
  from public.trips pt
  join public.loads pl on pl.id = pt.load_id
  where t.vehicle_id is not null
    and pt.vehicle_id = t.vehicle_id
    and pt.id <> t.id
    and pt.status <> 'cancelled'
    and pt.created_at < t.created_at
  order by pt.created_at desc, pt.id
  limit 1
) p on true
left join lateral (
  select
    round((extensions.st_distance(p.destination_location, l.origin_location) / 1000)::numeric, 1) as empty_km,
    round((extensions.st_distance(p.origin_location, l.destination_location) / 1000)::numeric, 1) as back_home_km,
    round((extensions.st_distance(p.destination_location, p.origin_location) / 1000)::numeric, 1) as way_back_km
  where p.trip_id is not null
) m on true
left join lateral (
  select
    (select e.estimated_unload_end_at from public.trip_events e
     where e.trip_id = t.id and e.event_type = 'unloading_started'
     order by e.occurred_at, e.recorded_at limit 1) as estimated_end_at,
    (select e.occurred_at from public.trip_events e
     where e.trip_id = t.id and e.event_type = 'unloading_finished'
     order by e.occurred_at, e.recorded_at limit 1) as finished_at
) u on true
where (select public.is_admin());

-- Carriers: time from registration to the first approval by an admin (the
-- approval is read from the audit log, written by review_company).
create view public.kpi_carrier_onboarding
with (security_invoker = true)
as
select
  c.id as company_id,
  c.legal_name,
  c.status,
  c.created_at as registered_at,
  a.approved_at,
  round((extract(epoch from a.approved_at - c.created_at) / 60)::numeric, 1) as minutes_to_approval
from public.companies c
left join lateral (
  select min(al.occurred_at) as approved_at
  from public.audit_log al
  where al.table_name = 'companies'
    and al.record_id = c.id
    and al.new_data ->> 'status' = 'approved'
    and al.old_data ->> 'status' is distinct from 'approved'
) a on true
where c.type = 'carrier'
  and c.archived_at is null
  and (select public.is_admin());

-- One row with the pilot's indicators. Cancelled trips are left out of the
-- trip metrics; medians use percentile_cont.
create view public.kpi_pilot_summary
with (security_invoker = true)
as
select
  (select count(*) from public.kpi_load_times) as loads_published,
  (select count(*) from public.offers) as offers_total,
  (select count(*) from public.kpi_trip_metrics where status <> 'cancelled') as trips_total,
  (select count(*) from public.kpi_trip_metrics where status = 'closed') as trips_closed,
  (select count(*) from public.kpi_trip_metrics where status <> 'cancelled' and is_return_trip) as return_trips,
  (select round(avg(empty_km), 1) from public.kpi_trip_metrics
   where status <> 'cancelled' and empty_km is not null) as avg_empty_km,
  (select coalesce(sum(avoided_empty_km), 0) from public.kpi_trip_metrics
   where status <> 'cancelled') as total_avoided_empty_km,
  (select round(avg(avoided_empty_km), 1) from public.kpi_trip_metrics
   where status <> 'cancelled' and avoided_empty_km is not null) as avg_avoided_empty_km,
  (select round(percentile_cont(0.5) within group (order by minutes_to_first_offer)::numeric, 1)
   from public.kpi_load_times where minutes_to_first_offer is not null) as median_minutes_to_first_offer,
  (select round(percentile_cont(0.5) within group (order by minutes_to_contract)::numeric, 1)
   from public.kpi_load_times where minutes_to_contract is not null) as median_minutes_to_contract,
  (select round(percentile_cont(0.5) within group (order by minutes_to_approval)::numeric, 1)
   from public.kpi_carrier_onboarding where minutes_to_approval is not null) as median_minutes_to_carrier_approval,
  (select round(avg(abs(unload_estimate_error_minutes)), 1) from public.kpi_trip_metrics
   where unload_estimate_error_minutes is not null) as avg_abs_unload_error_minutes,
  (select count(*) from public.kpi_trip_metrics where unload_estimate_error_minutes is not null)
    as unload_estimates_measured
where (select public.is_admin());

revoke all on table public.kpi_load_times, public.kpi_trip_metrics, public.kpi_carrier_onboarding,
  public.kpi_pilot_summary from public, anon, authenticated;
grant select on table public.kpi_load_times, public.kpi_trip_metrics, public.kpi_carrier_onboarding,
  public.kpi_pilot_summary to authenticated;
