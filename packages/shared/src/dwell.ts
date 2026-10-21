// Waiting times at loading and unloading sites (H5, D32). The database
// measures them (trip_stop_dwells) and aggregates them with the privacy rule
// (site_dwell_estimate, trip_estimated_end); this module mirrors the tiers,
// the hour bands and the defaults so they are unit-tested, parses what the
// RPCs answer and turns an estimate into a suggested end or a text.
import { APP_TIME_ZONE } from './constants';
import type { LatLng } from './geo';

export type TripStop = 'pickup' | 'delivery';

/** Hour bands of an arrival in Mexico City: 0–6, 6–12, 12–18, 18–24. */
export type DwellHourBand = 'night' | 'morning' | 'afternoon' | 'evening';

/** Where an estimate comes from, most specific first (site_dwell_stats). */
export type DwellBasis = 'site_hour' | 'site' | 'shipper' | 'default';

/** Valid measurements a tier needs before it is used. */
export const DWELL_MIN_SAMPLES = 5;

/**
 * Minutes at a stop, waiting included, without enough measurements: the 4 h
 * the operator was always offered at the start of unloading.
 */
export const DEFAULT_DWELL_MINUTES: Readonly<Record<TripStop, number>> = {
  pickup: 240,
  delivery: 240,
};

/** Waits or handling over this many hours are outliers (`excluded`). */
export const MAX_DWELL_HOURS = 72;

export interface DwellEstimate {
  basis: DwellBasis;
  /** Valid measurements behind it (0 for the default). */
  sampleSize: number;
  waitMedianMinutes: number | null;
  waitP75Minutes: number | null;
  handlingMedianMinutes: number | null;
  handlingP75Minutes: number | null;
  /** Waiting plus handling: the time the truck spends at the site. */
  totalMedianMinutes: number;
  totalP75Minutes: number;
}

const hourFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  hour: 'numeric',
  hourCycle: 'h23',
});

/** The hour band of a moment in Mexico City (dwell_hour_band in SQL). */
export function hourBand(at: Date): DwellHourBand {
  const hour = Number(hourFormat.format(at));
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/** Percentile with linear interpolation (Postgres percentile_cont); null when empty. */
export function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  const low = sorted[below] ?? 0;
  const high = sorted[above] ?? low;
  return low + (high - low) * (position - below);
}

export const median = (values: readonly number[]) => percentile(values, 0.5);

/** One measured stop, as trip_stop_dwells keeps it. */
export interface DwellSample {
  site: LatLng;
  shipperCompanyId: string;
  carrierCompanyId: string;
  arrivedAt: Date;
  waitMinutes: number | null;
  handlingMinutes: number | null;
}

/** Who asks: a carrier counts its own trips, a shipper its own, an admin all. */
export type DwellViewer =
  | { kind: 'carrier'; companyId: string }
  | { kind: 'shipper'; companyId: string }
  | { kind: 'admin' };

/** The site of a point: rounded to 3 decimals (~100 m), as the database keeps it. */
export const roundSite = (p: LatLng): LatLng => ({
  lat: Math.round(p.lat * 1000) / 1000,
  lng: Math.round(p.lng * 1000) / 1000,
});

const sameSite = (a: LatLng, b: LatLng) => {
  const x = roundSite(a);
  const y = roundSite(b);
  return x.lat === y.lat && x.lng === y.lng;
};

/** Not an outlier, and both waiting and handling known (the `excluded` column). */
export function isValidSample(s: DwellSample): boolean {
  return (
    s.waitMinutes !== null &&
    s.handlingMinutes !== null &&
    s.waitMinutes >= 0 &&
    s.handlingMinutes >= 0 &&
    s.waitMinutes <= MAX_DWELL_HOURS * 60 &&
    s.handlingMinutes <= MAX_DWELL_HOURS * 60
  );
}

const round = (value: number | null) => (value === null ? null : Math.round(value));

/**
 * The estimate of a site for a viewer (site_dwell_stats): the first tier
 * with `minSamples` valid measurements among same site and hour band (unless
 * `at` is null), same site, and the shipper's sites (with `shipperCompanyId`);
 * otherwise the default. A tier counts other carriers' trips only when it has
 * trips of 2 or more carriers.
 */
export function dwellEstimate(
  samples: readonly DwellSample[],
  query: {
    stop: TripStop;
    site: LatLng;
    shipperCompanyId?: string | null;
    at: Date | null;
    viewer: DwellViewer;
  },
  options: { minSamples?: number; defaults?: Readonly<Record<TripStop, number>> } = {},
): DwellEstimate {
  const minSamples = options.minSamples ?? DWELL_MIN_SAMPLES;
  const defaults = options.defaults ?? DEFAULT_DWELL_MINUTES;
  const valid = samples.filter(isValidSample);
  const band = query.at ? hourBand(query.at) : null;
  const tiers: { basis: Exclude<DwellBasis, 'default'>; match: (s: DwellSample) => boolean }[] = [];
  if (band) {
    tiers.push({
      basis: 'site_hour',
      match: (s) => sameSite(s.site, query.site) && hourBand(s.arrivedAt) === band,
    });
  }
  tiers.push({ basis: 'site', match: (s) => sameSite(s.site, query.site) });
  const shipper = query.shipperCompanyId;
  if (shipper) tiers.push({ basis: 'shipper', match: (s) => s.shipperCompanyId === shipper });

  const viewer = query.viewer;
  for (const tier of tiers) {
    const inTier = valid.filter(tier.match);
    const shared = new Set(inTier.map((s) => s.carrierCompanyId)).size >= 2;
    const visible = inTier.filter((s) =>
      viewer.kind === 'admin'
        ? true
        : viewer.kind === 'shipper'
          ? s.shipperCompanyId === viewer.companyId
          : shared || s.carrierCompanyId === viewer.companyId,
    );
    if (visible.length < minSamples) continue;
    const waits = visible.map((s) => s.waitMinutes ?? 0);
    const handling = visible.map((s) => s.handlingMinutes ?? 0);
    const totals = visible.map((s) => (s.waitMinutes ?? 0) + (s.handlingMinutes ?? 0));
    return {
      basis: tier.basis,
      sampleSize: visible.length,
      waitMedianMinutes: round(median(waits)),
      waitP75Minutes: round(percentile(waits, 0.75)),
      handlingMedianMinutes: round(median(handling)),
      handlingP75Minutes: round(percentile(handling, 0.75)),
      totalMedianMinutes: round(median(totals)) ?? 0,
      totalP75Minutes: round(percentile(totals, 0.75)) ?? 0,
    };
  }
  return defaultDwellEstimate(query.stop, defaults);
}

export function defaultDwellEstimate(
  stop: TripStop,
  defaults: Readonly<Record<TripStop, number>> = DEFAULT_DWELL_MINUTES,
): DwellEstimate {
  return {
    basis: 'default',
    sampleSize: 0,
    waitMedianMinutes: null,
    waitP75Minutes: null,
    handlingMedianMinutes: null,
    handlingP75Minutes: null,
    totalMedianMinutes: defaults[stop],
    totalP75Minutes: defaults[stop],
  };
}

const MINUTE_MS = 60 * 1000;

/**
 * When the truck leaves a stop: from the start of handling, the measured
 * handling (or, by default, the whole time at the site); before it, from the
 * arrival, the whole time at the site (trip_end_estimate).
 */
export function estimatedStopEnd({
  arrivedAt,
  handlingStartedAt,
  estimate,
}: {
  arrivedAt: Date;
  handlingStartedAt?: Date | null;
  estimate: DwellEstimate;
}): Date {
  if (handlingStartedAt) {
    const minutes = estimate.handlingMedianMinutes ?? estimate.totalMedianMinutes;
    return new Date(handlingStartedAt.getTime() + minutes * MINUTE_MS);
  }
  return new Date(arrivedAt.getTime() + estimate.totalMedianMinutes * MINUTE_MS);
}

/**
 * Minutes from the start of handling to its suggested end (the operator's
 * estimate at the start of unloading): the measured handling at the site, at
 * least 15 minutes, or the default 4 h.
 */
export function suggestedHandlingMinutes(
  estimate: DwellEstimate | null | undefined,
  stop: TripStop = 'delivery',
): number {
  if (!estimate || estimate.basis === 'default') return DEFAULT_DWELL_MINUTES[stop];
  return Math.max(15, estimate.handlingMedianMinutes ?? estimate.totalMedianMinutes);
}

/** Row of site_dwell_estimate as PostgREST returns it. */
export interface DwellEstimateRow {
  basis: string;
  sample_size: number;
  wait_median_minutes: number | null;
  wait_p75_minutes: number | null;
  handling_median_minutes: number | null;
  handling_p75_minutes: number | null;
  total_median_minutes: number;
  total_p75_minutes: number;
}

const BASES: readonly DwellBasis[] = ['site_hour', 'site', 'shipper', 'default'];

const minutesOrNull = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** The first row of site_dwell_estimate; null when the answer is not one. */
export function parseDwellEstimate(rows: unknown): DwellEstimate | null {
  const row: unknown = Array.isArray(rows) ? rows[0] : rows;
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Partial<DwellEstimateRow>;
  const basis = BASES.find((b) => b === r.basis);
  const total = minutesOrNull(r.total_median_minutes);
  const sampleSize = minutesOrNull(r.sample_size);
  if (!basis || total === null || sampleSize === null) return null;
  return {
    basis,
    sampleSize,
    waitMedianMinutes: minutesOrNull(r.wait_median_minutes),
    waitP75Minutes: minutesOrNull(r.wait_p75_minutes),
    handlingMedianMinutes: minutesOrNull(r.handling_median_minutes),
    handlingP75Minutes: minutesOrNull(r.handling_p75_minutes),
    totalMedianMinutes: total,
    totalP75Minutes: minutesOrNull(r.total_p75_minutes) ?? total,
  };
}

/** Where trip_estimated_end's answer comes from. */
export type TripEndSource = 'finished' | 'operator' | 'measured' | 'default';

export interface TripEndEstimate {
  endsAt: string;
  source: TripEndSource;
  basis: DwellBasis | null;
  sampleSize: number | null;
}

const SOURCES: readonly TripEndSource[] = ['finished', 'operator', 'measured', 'default'];

/** The row of trip_estimated_end; null without one (cancelled trip) or when malformed. */
export function parseTripEndEstimate(rows: unknown): TripEndEstimate | null {
  const row: unknown = Array.isArray(rows) ? rows[0] : rows;
  if (typeof row !== 'object' || row === null) return null;
  const r = row as { ends_at?: unknown; source?: unknown; basis?: unknown; sample_size?: unknown };
  const source = SOURCES.find((s) => s === r.source);
  if (!source || typeof r.ends_at !== 'string' || Number.isNaN(Date.parse(r.ends_at))) return null;
  return {
    endsAt: r.ends_at,
    source,
    basis: BASES.find((b) => b === r.basis) ?? null,
    sampleSize: minutesOrNull(r.sample_size),
  };
}

/** Site of the delivery of a return trip, rounded: one request per site. */
export function dwellSiteKey(p: LatLng): string {
  const s = roundSite(p);
  return `${s.lat.toFixed(3)},${s.lng.toFixed(3)}`;
}

/**
 * The typical time at the delivery each return trip starts from ("Espera
 * típica en descarga"), one request per site; a site whose request fails is
 * left without it.
 */
export async function returnTripDwells(
  starts: readonly (LatLng | null)[],
  estimate: (site: LatLng) => Promise<DwellEstimate | null>,
): Promise<(DwellEstimate | undefined)[]> {
  const sites = new Map<string, LatLng>();
  for (const start of starts) if (start) sites.set(dwellSiteKey(start), start);
  const found = new Map<string, DwellEstimate>();
  await Promise.all(
    [...sites].map(async ([key, site]) => {
      try {
        const value = await estimate(site);
        if (value) found.set(key, value);
      } catch {
        // An extra: the recommendation is shown without it.
      }
    }),
  );
  return starts.map((start) => (start ? found.get(dwellSiteKey(start)) : undefined));
}
