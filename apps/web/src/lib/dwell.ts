import 'server-only';

import {
  parseDwellEstimate,
  parseTripEndEstimate,
  type DwellEstimate,
  type LatLng,
  type TripEndEstimate,
  type TripStop,
} from '@transport/shared';

import type { Supabase } from './viewer';

// Waiting times at the sites on the web (H5, D32), as in
// apps/mobile/src/lib/dwell-api.ts. Postgres measures them and applies the
// privacy rule (site_dwell_estimate, trip_estimated_end, with the caller's
// JWT); they are an extra, so a failure answers null and the page goes on.

/** The typical time at a site for the caller; `at` null leaves out the hour band. */
export async function siteDwellEstimate(
  supabase: Supabase,
  stop: TripStop,
  site: LatLng,
  options: { shipperCompanyId?: string | null; at?: Date | null } = {},
): Promise<DwellEstimate | null> {
  try {
    const { data, error } = await supabase.rpc('site_dwell_estimate', {
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
  supabase: Supabase,
  tripId: string,
): Promise<TripEndEstimate | null> {
  try {
    const { data, error } = await supabase.rpc('trip_estimated_end', { p_trip_id: tripId });
    return error ? null : parseTripEndEstimate(data);
  } catch {
    return null;
  }
}

/**
 * The shipper's own times at the pickup and the delivery of one of its loads
 * (only those two sites, at any hour: not its other sites).
 */
export async function ownSiteDwells(
  supabase: Supabase,
  load: {
    origin_lat: number;
    origin_lng: number;
    destination_lat: number;
    destination_lng: number;
  },
): Promise<{ pickup: DwellEstimate | null; delivery: DwellEstimate | null }> {
  const options = { at: null };
  const [pickup, delivery] = await Promise.all([
    siteDwellEstimate(supabase, 'pickup', { lat: load.origin_lat, lng: load.origin_lng }, options),
    siteDwellEstimate(
      supabase,
      'delivery',
      { lat: load.destination_lat, lng: load.destination_lng },
      options,
    ),
  ]);
  return { pickup, delivery };
}
