// Suggested route (H4, D31): which corridor of the catalog to follow for a
// load, what its tolls cost for the truck's class and which unsafe segments
// the truck crosses inside their risky hours. Pure: the Edge Function
// `recommendations`, the load detail and the apps' local fallback share it.
import { APP_TIME_ZONE } from '../constants';
import type { VehicleKind, UnitType } from '../enums';
import { haversineKm, type LatLng } from '../geo';
// The matching's average truck speed also estimates when each segment is crossed.
import { ESTIMATED_TRUCK_SPEED_KMH } from '../matching/distance';
import type {
  RoadCorridor,
  RoadDataStatus,
  RoadPreference,
  RoadRisk,
  RoadSegment,
  SegmentPreference,
  TollVehicleClass,
} from './catalog';

/**
 * Ranking of corridors, in pesos so tolls compare directly: each crossing of
 * a risky segment inside its band adds a penalty and each preferred segment
 * subtracts a bonus. Tuning values, not data.
 */
export const ROUTE_RISK_PENALTY_MXN: Readonly<Record<RoadRisk['level'], number>> = Object.freeze({
  low: 0,
  medium: 500,
  high: 2000,
});
export const ROUTE_PREFERRED_BONUS_MXN = 1000;

/** Default axles: tractor-trailer T3S2 = 5, torton 3, rabón and 3.5 t 2, other rigid trucks 3. */
export function defaultAxleCount(kind: VehicleKind, unitType: UnitType | null): number {
  if (unitType === 'rabon' || unitType === 'pickup_3_5t') return 2;
  if (unitType === 'torton') return 3;
  return kind === 'rigid' ? 3 : 5;
}

/** Toll class for a number of axles (C2 … C9; out of range is clamped). */
export function tollClassFor(axleCount: number): TollVehicleClass {
  const axles = Math.min(9, Math.max(2, Math.round(Number.isFinite(axleCount) ? axleCount : 5)));
  return `c${axles}` as TollVehicleClass;
}

const hourFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

/** Hour of the day in Mexico City, with minutes as a fraction (e.g. 22.5). */
export function mexicoCityHour(date: Date): number {
  const parts = hourFormat.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour + minute / 60;
}

/** Whether an hour of the day (0–24) falls in a band; from > to crosses midnight. */
export function inHourBand(hour: number, fromHour: number, toHour: number): boolean {
  return fromHour < toHour ? hour >= fromHour && hour < toHour : hour >= fromHour || hour < toHour;
}

const HOUR_MS = 3_600_000;

/** Whether a crossing between two instants touches a risk band at any moment. */
export function crossesBand(enter: Date, exit: Date, fromHour: number, toHour: number): boolean {
  // Sample the start, every whole hour in between and the end: bands are whole hours.
  const start = enter.getTime();
  const end = Math.max(exit.getTime(), start);
  if (end - start >= 24 * HOUR_MS) return true;
  for (let t = start; t < end; t += HOUR_MS) {
    if (inHourBand(mexicoCityHour(new Date(t)), fromHour, toHour)) return true;
  }
  return inHourBand(mexicoCityHour(new Date(end)), fromHour, toHour);
}

export interface SuggestedSegment {
  id: string;
  code: string;
  name: string;
  highway: string | null;
  fromCity: string;
  toCity: string;
  distanceKm: number;
  /** Estimated time the truck enters and leaves it. */
  enterAt: string;
  exitAt: string;
  isToll: boolean;
  /** Toll for the truck's class; null when it charges and the tariff is unknown. */
  tollCents: number | null;
  preference: RoadPreference | null;
  dataStatus: RoadDataStatus;
}

export interface RiskWarning {
  segmentId: string;
  segmentName: string;
  level: RoadRisk['level'];
  fromHour: number;
  toHour: number;
  description: string;
  source: string;
  observedOn: string;
  /** When the truck enters the segment. */
  passAt: string;
}

export interface TollSource {
  source: string;
  sourceUrl: string | null;
  validFrom: string;
  dataStatus: RoadDataStatus;
}

export interface SuggestedRoute {
  source: 'catalog';
  corridor: { id: string; code: string; name: string };
  /** The corridor is run from its destination to its origin. */
  reversed: boolean;
  segments: SuggestedSegment[];
  distanceKm: number;
  tollClass: TollVehicleClass;
  /** Sum of the known tolls of the class. */
  tollsCents: number;
  /** Some toll segment has no tariff for the class: the total is a floor. */
  tollsMissing: boolean;
  tollSources: TollSource[];
  /** Risky segments crossed inside their band, in crossing order. */
  warnings: RiskWarning[];
  highRiskCount: number;
  /** Every corridor uses a segment the carrier avoids; this is the best of them. */
  usesAvoided: boolean;
  preferredCount: number;
}

export type RoadSuggestion = SuggestedRoute | { source: 'none' };

export interface SuggestRouteInput {
  origin: LatLng;
  destination: LatLng;
  /** When the truck leaves the pickup. */
  departAt: string | Date;
  axleCount: number;
  corridors: readonly RoadCorridor[];
  preferences?: readonly SegmentPreference[];
}

const reverseSegment = (s: RoadSegment): RoadSegment => ({ ...s, from: s.to, to: s.from });

const within = (point: LatLng, area: LatLng & { radiusKm: number }) =>
  haversineKm(point, area) <= area.radiusKm;

interface Candidate {
  route: SuggestedRoute;
  avoided: number;
  riskPenalty: number;
}

function followCorridor(
  corridor: RoadCorridor,
  reversed: boolean,
  departAt: Date,
  tollClass: TollVehicleClass,
  preferences: ReadonlyMap<string, RoadPreference>,
): Candidate {
  const ordered = reversed
    ? [...corridor.segments].reverse().map(reverseSegment)
    : corridor.segments;
  const segments: SuggestedSegment[] = [];
  const warnings: RiskWarning[] = [];
  const sources = new Map<string, TollSource>();
  let km = 0;
  let tollsCents = 0;
  let tollsMissing = false;
  let riskPenalty = 0;
  let avoided = 0;
  let preferred = 0;
  for (const s of ordered) {
    const enter = new Date(departAt.getTime() + (km / ESTIMATED_TRUCK_SPEED_KMH) * HOUR_MS);
    km += s.distanceKm;
    const exit = new Date(departAt.getTime() + (km / ESTIMATED_TRUCK_SPEED_KMH) * HOUR_MS);
    const toll = s.tolls.find((t) => t.vehicleClass === tollClass);
    const tollCents = s.isToll ? (toll?.amountCents ?? null) : 0;
    if (tollCents === null) tollsMissing = true;
    else tollsCents += tollCents;
    if (s.isToll && toll && toll.amountCents !== null) {
      sources.set(`${toll.source}|${toll.validFrom}|${toll.dataStatus}`, {
        source: toll.source,
        sourceUrl: toll.sourceUrl,
        validFrom: toll.validFrom,
        dataStatus: toll.dataStatus,
      });
    }
    const preference = preferences.get(s.id) ?? null;
    if (preference === 'avoid') avoided += 1;
    if (preference === 'prefer') preferred += 1;
    // One penalty per segment, its worst risk crossed (reports may overlap).
    let segmentPenalty = 0;
    for (const r of s.risks) {
      if (!crossesBand(enter, exit, r.fromHour, r.toHour)) continue;
      segmentPenalty = Math.max(segmentPenalty, ROUTE_RISK_PENALTY_MXN[r.level]);
      warnings.push({
        segmentId: s.id,
        segmentName: s.name,
        level: r.level,
        fromHour: r.fromHour,
        toHour: r.toHour,
        description: r.description,
        source: r.source,
        observedOn: r.observedOn,
        passAt: enter.toISOString(),
      });
    }
    riskPenalty += segmentPenalty;
    segments.push({
      id: s.id,
      code: s.code,
      name: reversed ? `${s.from.city} – ${s.to.city}` : s.name,
      highway: s.highway,
      fromCity: s.from.city,
      toCity: s.to.city,
      distanceKm: s.distanceKm,
      enterAt: enter.toISOString(),
      exitAt: exit.toISOString(),
      isToll: s.isToll,
      tollCents,
      preference,
      dataStatus: s.dataStatus,
    });
  }
  return {
    avoided,
    riskPenalty,
    route: {
      source: 'catalog',
      corridor: { id: corridor.id, code: corridor.code, name: corridor.name },
      reversed,
      segments,
      distanceKm: Math.round(km * 10) / 10,
      tollClass,
      tollsCents,
      tollsMissing,
      tollSources: [...sources.values()],
      warnings,
      // Distinct segments: several reports on one stretch are one unsafe stretch.
      highRiskCount: new Set(warnings.filter((w) => w.level === 'high').map((w) => w.segmentId))
        .size,
      usesAvoided: false,
      preferredCount: preferred,
    },
  };
}

/**
 * The corridor to follow from origin to destination, or `{ source: 'none' }`
 * when no corridor of the catalog covers the pair.
 *
 * Corridors whose origin and destination areas contain the load's points (in
 * either direction if bidirectional) compete. Those that use a segment the
 * carrier avoids drop out, unless all do (then the best is marked). The rest
 * are ranked by tolls + risk penalty − preferred bonus, in pesos. Tolls only
 * count when every competitor's total is complete: an unknown tariff is not
 * a free road, so with missing data the comparison falls to risk, preference
 * and, last, the shorter distance.
 */
export function suggestRoute(input: SuggestRouteInput): RoadSuggestion {
  const departAt = new Date(input.departAt);
  if (!Number.isFinite(departAt.getTime())) return { source: 'none' };
  const tollClass = tollClassFor(input.axleCount);
  const preferences = new Map((input.preferences ?? []).map((p) => [p.segmentId, p.preference]));

  const candidates: Candidate[] = [];
  for (const corridor of input.corridors) {
    if (within(input.origin, corridor.origin) && within(input.destination, corridor.destination)) {
      candidates.push(followCorridor(corridor, false, departAt, tollClass, preferences));
    } else if (
      corridor.bidirectional &&
      within(input.origin, corridor.destination) &&
      within(input.destination, corridor.origin)
    ) {
      candidates.push(followCorridor(corridor, true, departAt, tollClass, preferences));
    }
  }
  if (candidates.length === 0) return { source: 'none' };

  const clean = candidates.filter((c) => c.avoided === 0);
  const pool = clean.length > 0 ? clean : candidates;
  const tollsComparable = pool.every((c) => !c.route.tollsMissing);
  const cost = (c: Candidate) =>
    (tollsComparable ? c.route.tollsCents / 100 : 0) +
    c.riskPenalty -
    ROUTE_PREFERRED_BONUS_MXN * c.route.preferredCount;
  const [best] = [...pool].sort(
    (a, b) =>
      a.avoided - b.avoided ||
      cost(a) - cost(b) ||
      a.route.distanceKm - b.route.distanceKm ||
      a.route.corridor.code.localeCompare(b.route.corridor.code),
  );
  if (!best) return { source: 'none' };
  return { ...best.route, usesAvoided: best.avoided > 0 };
}
