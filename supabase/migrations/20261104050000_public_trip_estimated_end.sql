-- Public tracking (G7) with the estimated end of unloading of H5 (D32).
--
-- The shipper's trip page shows trip_estimated_end: before unloading starts,
-- the estimated arrival plus the typical time at the delivery site (measured
-- or the default 4 h); once unloading started, the operator's estimate. The
-- public tracking page only showed trips.estimated_unload_end_at, so it was
-- empty until the operator started unloading.
--
-- Same as G7 (20261027020100_share_links.sql), except that
-- 'estimatedUnloadEndAt' is the ends_at of trip_end_estimate(trip, shipper
-- view), and null once unloading finished (the timeline already has the real
-- end) or for a cancelled trip:
--   * the shipper view: the statistics count only the trips of the shipper
--     who shared the link (site_dwell_stats with p_shipper_viewer), never the
--     carrier's trips for other shippers;
--   * only the time leaves the function: not the source, the basis tier or
--     the sample size (how many trips the shipper had at that site), so the
--     JSON keeps exactly the keys of G7.
create or replace function public.public_shared_trip(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link public.share_links;
  v_trip public.trips;
  v_load public.loads;
  v_timeline jsonb;
  v_position jsonb;
  v_carrier_name text;
  v_unit_type public.unit_type;
  v_plate text;
  v_unload_end timestamptz;
begin
  v_link := public.share_link_by_token(p_token, 'trip_tracking_public');
  if v_link.id is null then
    raise exception 'share link not found' using errcode = '42501';
  end if;
  select * into v_trip from public.trips t where t.id = v_link.trip_id;
  if not found then
    raise exception 'share link not found' using errcode = '42501';
  end if;
  select * into v_load from public.loads l where l.id = v_trip.load_id;

  select coalesce(jsonb_agg(jsonb_build_object('type', e.event_type, 'occurredAt', e.occurred_at)
                            order by e.occurred_at, e.recorded_at), '[]'::jsonb)
  into v_timeline
  from public.trip_events e
  where e.trip_id = v_trip.id;

  -- Only while the unit is on the road (same rule as the shipper's map, B15).
  if public.trip_is_active(v_trip.status) then
    select jsonb_build_object('lat', p.latitude, 'lng', p.longitude, 'recordedAt', p.recorded_at)
    into v_position
    from public.trip_locations p
    where p.trip_id = v_trip.id
    order by p.recorded_at desc
    limit 1;
  end if;

  -- H5: what the shipper sees on its trip page (trip_estimated_end), only the time.
  select e.ends_at into v_unload_end
  from public.trip_end_estimate(v_trip.id, true) e
  where e.source <> 'finished';

  select c.legal_name into v_carrier_name from public.companies c where c.id = v_trip.carrier_company_id;
  select v.unit_type, v.plate into v_unit_type, v_plate from public.vehicles v where v.id = v_trip.vehicle_id;

  perform public.share_link_record_view(v_link.id);

  return jsonb_build_object(
    'kind', 'trip',
    'status', v_trip.status,
    'origin', jsonb_build_object('city', v_load.origin_city, 'state', v_load.origin_state),
    'destination', jsonb_build_object('city', v_load.destination_city, 'state', v_load.destination_state),
    'pickupWindow', jsonb_build_object('start', v_load.pickup_window_start, 'end', v_load.pickup_window_end),
    'deliveryWindow', jsonb_build_object('start', v_load.delivery_window_start, 'end', v_load.delivery_window_end),
    'estimatedUnloadEndAt', v_unload_end,
    'carrierName', v_carrier_name,
    'unitType', v_unit_type,
    'plateMasked', case when v_plate is null then null else '***' || right(v_plate, 3) end,
    'timeline', v_timeline,
    'lastPosition', v_position,
    'expiresAt', v_link.expires_at
  );
end;
$$;

revoke all on function public.public_shared_trip(text) from public;
grant execute on function public.public_shared_trip(text) to anon, authenticated;
