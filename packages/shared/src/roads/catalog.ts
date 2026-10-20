// Road catalog (H4, D31): the shape road_catalog() returns, and a tolerant
// parser so a malformed row drops out instead of breaking a screen or the
// Edge Function. Pure and free of Node and browser APIs (Deno imports it).
import { Constants } from '../db';
import { haversineKm, type LatLng } from '../geo';

const DB_ENUMS = Constants.public.Enums;

/** Truck classes of the published toll tariffs: C2 … C9 (2 to 9 axles). */
export const TOLL_VEHICLE_CLASSES = DB_ENUMS.toll_vehicle_class;
export type TollVehicleClass = (typeof TOLL_VEHICLE_CLASSES)[number];

export const ROAD_RISK_LEVELS = DB_ENUMS.road_risk_level;
export type RoadRiskLevel = (typeof ROAD_RISK_LEVELS)[number];

export const ROAD_DATA_STATUSES = DB_ENUMS.road_data_status;
export type RoadDataStatus = (typeof ROAD_DATA_STATUSES)[number];

export const ROAD_PREFERENCES = DB_ENUMS.road_preference;
export type RoadPreference = (typeof ROAD_PREFERENCES)[number];

export interface RoadPlace extends LatLng {
  city: string;
  state: string;
}

export interface RoadToll {
  vehicleClass: TollVehicleClass;
  /** Null: the class is charged but its tariff is unknown ("Sin dato"). */
  amountCents: number | null;
  source: string;
  sourceUrl: string | null;
  validFrom: string;
  dataStatus: RoadDataStatus;
}

export interface RoadRisk {
  id: string;
  level: RoadRiskLevel;
  /** Hour band in Mexico City time; fromHour > toHour crosses midnight; 0–24 is all day. */
  fromHour: number;
  toHour: number;
  description: string;
  source: string;
  sourceUrl: string | null;
  observedOn: string;
  dataStatus: RoadDataStatus;
}

export interface RoadSegment {
  id: string;
  code: string;
  name: string;
  highway: string | null;
  from: RoadPlace;
  to: RoadPlace;
  distanceKm: number;
  isToll: boolean;
  source: string;
  sourceUrl: string | null;
  sourceDate: string;
  dataStatus: RoadDataStatus;
  tolls: RoadToll[];
  risks: RoadRisk[];
}

export interface RoadCorridor {
  id: string;
  code: string;
  name: string;
  bidirectional: boolean;
  origin: RoadPlace & { radiusKm: number };
  destination: RoadPlace & { radiusKm: number };
  /** In order from the origin. */
  segments: RoadSegment[];
}

/** A preference of the carrier (carrier_road_preferences), already filtered to the load's route. */
export interface SegmentPreference {
  segmentId: string;
  preference: RoadPreference;
}

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const num = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const oneOf = <T extends string>(values: readonly T[], value: unknown): T | null =>
  values.includes(value as T) ? (value as T) : null;

function place(value: unknown): RoadPlace | null {
  if (!isObject(value)) return null;
  const city = str(value.city);
  const state = str(value.state);
  const lat = num(value.lat);
  const lng = num(value.lng);
  return city && state && lat !== null && lng !== null ? { city, state, lat, lng } : null;
}

function toll(value: unknown): RoadToll | null {
  if (!isObject(value)) return null;
  const vehicleClass = oneOf(TOLL_VEHICLE_CLASSES, value.vehicleClass);
  const source = str(value.source);
  const validFrom = str(value.validFrom);
  const dataStatus = oneOf(ROAD_DATA_STATUSES, value.dataStatus);
  if (!vehicleClass || !source || !validFrom || !dataStatus) return null;
  return {
    vehicleClass,
    amountCents: value.amountCents === null ? null : num(value.amountCents),
    source,
    sourceUrl: str(value.sourceUrl),
    validFrom,
    dataStatus,
  };
}

function risk(value: unknown): RoadRisk | null {
  if (!isObject(value)) return null;
  const id = str(value.id);
  const level = oneOf(ROAD_RISK_LEVELS, value.level);
  const fromHour = num(value.fromHour);
  const toHour = num(value.toHour);
  const description = str(value.description);
  const source = str(value.source);
  const observedOn = str(value.observedOn);
  const dataStatus = oneOf(ROAD_DATA_STATUSES, value.dataStatus);
  if (!id || !level || fromHour === null || toHour === null || !description) return null;
  if (!source || !observedOn || !dataStatus) return null;
  return {
    id,
    level,
    fromHour,
    toHour,
    description,
    source,
    sourceUrl: str(value.sourceUrl),
    observedOn,
    dataStatus,
  };
}

const compact = <T>(values: readonly (T | null)[]): T[] => values.filter((v): v is T => v !== null);

function segment(value: unknown): RoadSegment | null {
  if (!isObject(value)) return null;
  const id = str(value.id);
  const code = str(value.code);
  const name = str(value.name);
  const from = place(value.from);
  const to = place(value.to);
  const distanceKm = num(value.distanceKm);
  const source = str(value.source);
  const sourceDate = str(value.sourceDate);
  const dataStatus = oneOf(ROAD_DATA_STATUSES, value.dataStatus);
  if (!id || !code || !name || !from || !to || distanceKm === null || distanceKm <= 0) return null;
  if (!source || !sourceDate || !dataStatus) return null;
  return {
    id,
    code,
    name,
    highway: str(value.highway),
    from,
    to,
    distanceKm,
    isToll: value.isToll === true,
    source,
    sourceUrl: str(value.sourceUrl),
    sourceDate,
    dataStatus,
    tolls: Array.isArray(value.tolls) ? compact(value.tolls.map(toll)) : [],
    risks: Array.isArray(value.risks) ? compact(value.risks.map(risk)) : [],
  };
}

function area(value: unknown): (RoadPlace & { radiusKm: number }) | null {
  const p = place(value);
  const radiusKm = isObject(value) ? num(value.radiusKm) : null;
  return p && radiusKm !== null && radiusKm > 0 ? { ...p, radiusKm } : null;
}

function corridor(value: unknown): RoadCorridor | null {
  if (!isObject(value) || !Array.isArray(value.segments)) return null;
  const id = str(value.id);
  const code = str(value.code);
  const name = str(value.name);
  const origin = area(value.origin);
  const destination = area(value.destination);
  const segments = value.segments.map(segment);
  // A corridor with a malformed segment cannot be followed: drop it whole.
  if (!id || !code || !name || !origin || !destination || segments.length === 0) return null;
  if (segments.some((s) => s === null)) return null;
  return {
    id,
    code,
    name,
    bidirectional: value.bidirectional !== false,
    origin,
    destination,
    segments: segments as RoadSegment[],
  };
}

/** The corridors of a road_catalog() answer; anything malformed is left out. */
export function parseRoadCatalog(json: unknown): RoadCorridor[] {
  return Array.isArray(json) ? compact(json.map(corridor)) : [];
}

/** A usual route's end within this distance of the load's matches it (as match_pairs does). */
export const ROUTE_MATCH_RADIUS_KM = 50;

/** One end of a usual route or a load: its city and, when known, its point. */
export interface RouteEnd {
  city: string;
  point: LatLng | null;
}

function sameEnd(a: RouteEnd, b: RouteEnd): boolean {
  if (a.point && b.point) return haversineKm(a.point, b.point) <= ROUTE_MATCH_RADIUS_KM;
  return a.city.trim().toLowerCase() === b.city.trim().toLowerCase();
}

/**
 * The preferences that apply to a load: those for every route (no route) and
 * those of the carrier's usual routes that the load follows, in either
 * direction (a segment is avoided both ways). A route's end matches the load's
 * within ROUTE_MATCH_RADIUS_KM when both points are known, or by city name.
 * When both kinds mark a segment, the route's own one wins.
 */
export function preferencesForLoad(
  preferences: readonly {
    segmentId: string;
    preference: RoadPreference;
    route: { origin: RouteEnd; destination: RouteEnd } | null;
  }[],
  load: { origin: RouteEnd; destination: RouteEnd },
): SegmentPreference[] {
  const bySegment = new Map<string, SegmentPreference & { specific: boolean }>();
  for (const p of preferences) {
    const specific = p.route !== null;
    if (
      p.route &&
      !(
        (sameEnd(p.route.origin, load.origin) && sameEnd(p.route.destination, load.destination)) ||
        (sameEnd(p.route.origin, load.destination) && sameEnd(p.route.destination, load.origin))
      )
    ) {
      continue;
    }
    const current = bySegment.get(p.segmentId);
    if (!current || (specific && !current.specific)) {
      bySegment.set(p.segmentId, { segmentId: p.segmentId, preference: p.preference, specific });
    }
  }
  return [...bySegment.values()].map(({ segmentId, preference }) => ({ segmentId, preference }));
}
