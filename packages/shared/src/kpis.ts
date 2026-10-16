// Pilot indicators (producto §5, B16). The numbers come from the SQL views
// kpi_* (supabase/migrations/*_admin_operations.sql); this turns the one-row
// kpi_pilot_summary into the dashboard tiles.
import { APP_LOCALE } from './constants';
import { adminOpsCopy } from './copy/admin-ops';
import { formatDistance, formatDuration } from './formatters';
import { DEFAULT_ROAD_DISTANCE_FACTOR } from './geo';

/**
 * A trip is a return trip when its pickup is within this radius of the
 * previous destination of the unit and its delivery within this radius of
 * the previous origin. Mirrors the constant in kpi_trip_metrics.
 */
export const RETURN_TRIP_RADIUS_KM = 150;

/** First milestone of the pilot (deck): the first 5 return trips. */
export const RETURN_TRIPS_GOAL = 5;

/** Row of kpi_pilot_summary (every column may be null in the generated types). */
export interface PilotKpiSummary {
  loads_published: number | null;
  offers_total: number | null;
  trips_total: number | null;
  trips_closed: number | null;
  return_trips: number | null;
  avg_empty_km: number | null;
  total_avoided_empty_km: number | null;
  avg_avoided_empty_km: number | null;
  median_minutes_to_first_offer: number | null;
  median_minutes_to_contract: number | null;
  median_minutes_to_carrier_approval: number | null;
  avg_abs_unload_error_minutes: number | null;
  unload_estimates_measured: number | null;
}

export interface KpiTile {
  key: string;
  label: string;
  value: string;
  hint?: string;
}

const c = adminOpsCopy.kpis;
const count = new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 0 });

/** Durations in minutes; a day or more as days and hours ("2 d 4 h"). */
export function formatLongDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new RangeError(`Invalid duration: ${minutes}`);
  }
  const totalHours = Math.round(minutes / 60);
  if (totalHours < 24) return formatDuration(minutes);
  return adminOpsCopy.days(Math.floor(totalHours / 24), totalHours % 24);
}

/** Straight-line km from the views -> estimated road km, as text (whole km under 1 km). */
function roadKm(km: number | null, factor: number): string | null {
  if (km === null) return null;
  const road = Math.max(km, 0) * factor;
  return road < 1 ? '0 km' : formatDistance(road);
}

/** The dashboard tiles, in display order. Missing values show as "Sin datos". */
export function pilotKpiTiles(
  summary: PilotKpiSummary,
  roadFactor: number = DEFAULT_ROAD_DISTANCE_FACTOR,
): KpiTile[] {
  const n = (value: number | null) => count.format(value ?? 0);
  const duration = (minutes: number | null) =>
    minutes === null ? c.noData : formatLongDuration(minutes);
  const avoidedPerTrip = roadKm(summary.avg_avoided_empty_km, roadFactor);
  return [
    { key: 'loads', label: c.loadsPublished, value: n(summary.loads_published) },
    { key: 'offers', label: c.offers, value: n(summary.offers_total) },
    {
      key: 'trips',
      label: c.trips,
      value: n(summary.trips_total),
      hint: c.tripsClosed(summary.trips_closed ?? 0),
    },
    {
      key: 'returnTrips',
      label: c.returnTrips,
      value: n(summary.return_trips),
      hint: c.returnTripsGoal(RETURN_TRIPS_GOAL),
    },
    {
      key: 'emptyKm',
      label: c.avgEmptyKm,
      value: roadKm(summary.avg_empty_km, roadFactor) ?? c.noData,
    },
    {
      key: 'avoidedKm',
      label: c.avoidedKm,
      value: roadKm(summary.total_avoided_empty_km ?? 0, roadFactor) ?? c.noData,
      hint: avoidedPerTrip ? c.avoidedKmHint(avoidedPerTrip) : undefined,
    },
    {
      key: 'firstOffer',
      label: c.timeToFirstOffer,
      value: duration(summary.median_minutes_to_first_offer),
      hint: c.median,
    },
    {
      key: 'contract',
      label: c.timeToContract,
      value: duration(summary.median_minutes_to_contract),
      hint: c.median,
    },
    {
      key: 'onboarding',
      label: c.carrierOnboarding,
      value: duration(summary.median_minutes_to_carrier_approval),
      hint: c.median,
    },
    {
      key: 'unloadAccuracy',
      label: c.unloadAccuracy,
      value: duration(summary.avg_abs_unload_error_minutes),
      hint: c.unloadAccuracyHint(summary.unload_estimates_measured ?? 0),
    },
  ];
}
