import {
  parseDwellEstimate,
  parseTripEndEstimate,
  type DwellEstimate,
  type LatLng,
  type TripEndEstimate,
  type TripStop,
} from '@transport/shared';

import type { Supabase } from './supabase';

// Waiting times at the sites in the app (H5, D32). Postgres measures them and
// applies the privacy rule (site_dwell_estimate, trip_estimated_end, with the
// caller's JWT); they are an extra, so a failure answers null and the screen
// goes on without them.

/** The typical time at a site for the caller; `at` null leaves out the hour band. */
export async function siteDwellEstimate(
  client: Supabase,
  stop: TripStop,
  site: LatLng,
  options: { shipperCompanyId?: string | null; at?: Date | null } = {},
): Promise<DwellEstimate | null> {
  try {
    const { data, error } = await client.rpc('site_dwell_estimate', {
      p_stop: stop,
      p_lat: site.lat,
      p_lng: site.lng,
      ...(options.shipperCompanyId ? { p_shipper_company_id: options.shipperCompanyId } : {}),
      // Omitted: now. Null: no hour band (the generated Args do not say null).
      ...(options.at !== undefined ? { p_at: options.at?.toISOString() ?? null } : {}),
    } as { p_stop: TripStop; p_lat: number; p_lng: number });
    return error ? null : parseDwellEstimate(data);
  } catch {
    return null;
  }
}

/** The estimated end of unloading of a trip the caller sees. */
export async function tripEndEstimate(
  client: Supabase,
  tripId: string,
): Promise<TripEndEstimate | null> {
  try {
    const { data, error } = await client.rpc('trip_estimated_end', { p_trip_id: tripId });
    return error ? null : parseTripEndEstimate(data);
  } catch {
    return null;
  }
}

/**
 * The typical waiting and loading time at a load's pickup for the carrier
 * (the "Ruta sugerida"), at the hour its pickup window opens; with the load's
 * shipper, so a pickup without enough measurements falls back to the
 * shipper's other sites.
 */
export async function loadPickupDwell(
  client: Supabase,
  load: { id: string; origin_lat: number; origin_lng: number; pickup_window_start: string },
): Promise<DwellEstimate | null> {
  const { data } = await client
    .from('loads')
    .select('shipper_company_id')
    .eq('id', load.id)
    .maybeSingle();
  return siteDwellEstimate(
    client,
    'pickup',
    { lat: load.origin_lat, lng: load.origin_lng },
    { shipperCompanyId: data?.shipper_company_id ?? null, at: new Date(load.pickup_window_start) },
  );
}
