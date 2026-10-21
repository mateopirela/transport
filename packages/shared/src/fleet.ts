// Fleet helpers (B18): whether a unit can be offered, the cities a carrier
// picks while there is no Google Places key, and Mexico City date-times.
// Postgres enforces the same rules (set_vehicle_availability,
// vehicle_expired_requirements).
import { billingCopy } from './copy/billing';
import { fleetErrorCopy } from './copy/fleet';
import { vehicleReleaseCopy } from './copy/vehicle-release';
import type { DocumentOwnerType, Requirement, SubmittedDocument } from './verification';

/**
 * What the carrier sees for a unit:
 * - `pending_release`: its trip was cancelled after it set off; not available
 *   until its coordinator or the manager releases it (G5, D20).
 * - `expired_documents`: a required document expired; not available (B18).
 * - `unset`: no active availability.
 * - `scheduled`: free from a future date.
 * - `available`: free now.
 */
export type VehicleReadiness =
  'pending_release' | 'expired_documents' | 'unset' | 'scheduled' | 'available';

export function vehicleReadiness(
  input: { expiredDocuments: boolean; availableFrom: string | null; pendingRelease?: boolean },
  now: Date = new Date(),
): VehicleReadiness {
  // First: it is what the staff must do next (and the database refuses any
  // availability or commitment until then).
  if (input.pendingRelease) return 'pending_release';
  if (input.expiredDocuments) return 'expired_documents';
  if (!input.availableFrom) return 'unset';
  return Date.parse(input.availableFrom) > now.getTime() ? 'scheduled' : 'available';
}

/**
 * Required requirements whose document expired (status `expired`, or approved
 * and past its date) and has no current approved replacement. Mirrors `vehicle_expired_requirements` in SQL: a
 * renewal still in review does not lift the block.
 */
export function expiredRequirementIds(
  requirements: readonly Pick<Requirement, 'id' | 'is_required' | 'requires_expiry'>[],
  documents: readonly Pick<
    SubmittedDocument,
    'requirement_id' | 'owner_type' | 'owner_id' | 'status' | 'expires_at' | 'archived_at'
  >[],
  owner: { type: DocumentOwnerType; id: string },
  now: Date = new Date(),
): string[] {
  const active = documents.filter(
    (d) => d.archived_at === null && d.owner_type === owner.type && d.owner_id === owner.id,
  );
  const pastExpiry = (expiresAt: string | null) =>
    expiresAt !== null && Date.parse(expiresAt) <= now.getTime();
  // Expired: marked `expired` (e.g. by an expiry job) or approved and past its date.
  const isExpired = (d: (typeof active)[number]) =>
    d.status === 'expired' || (d.status === 'approved' && pastExpiry(d.expires_at));
  return requirements
    .filter((r) => r.is_required)
    .filter((r) => {
      const docs = active.filter((d) => d.requirement_id === r.id);
      const current = docs.some(
        (d) =>
          d.status === 'approved' &&
          !pastExpiry(d.expires_at) &&
          (!r.requires_expiry || d.expires_at !== null),
      );
      return !current && docs.some(isExpired);
    })
    .map((r) => r.id);
}

/** How a unit (vehicle) is named in the app and the web: its fleet number, else its plate. */
export function unitLabel(unit: { fleet_number: string | null; plate: string }): string {
  return unit.fleet_number || unit.plate;
}

/** A city the carrier can choose for availability and usual routes. */
export interface CityPreset {
  id: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
}

/**
 * Cities of the pilot corridor (Monterrey ↔ Guadalajara) and the main freight
 * hubs around it. Used until Places Autocomplete has an API key (B13/B19).
 */
export const CITY_PRESETS = [
  { id: 'mty', city: 'Monterrey', state: 'Nuevo León', lat: 25.6866, lng: -100.3161 },
  { id: 'apodaca', city: 'Apodaca', state: 'Nuevo León', lat: 25.7817, lng: -100.1886 },
  { id: 'saltillo', city: 'Saltillo', state: 'Coahuila', lat: 25.4383, lng: -100.9737 },
  { id: 'nld', city: 'Nuevo Laredo', state: 'Tamaulipas', lat: 27.4779, lng: -99.5496 },
  { id: 'slp', city: 'San Luis Potosí', state: 'San Luis Potosí', lat: 22.1565, lng: -100.9855 },
  { id: 'ags', city: 'Aguascalientes', state: 'Aguascalientes', lat: 21.8853, lng: -102.2916 },
  { id: 'leon', city: 'León', state: 'Guanajuato', lat: 21.1219, lng: -101.6826 },
  { id: 'qro', city: 'Querétaro', state: 'Querétaro', lat: 20.5888, lng: -100.3899 },
  { id: 'gdl', city: 'Guadalajara', state: 'Jalisco', lat: 20.6597, lng: -103.3496 },
  { id: 'tlaq', city: 'Tlaquepaque', state: 'Jalisco', lat: 20.6409, lng: -103.2933 },
  { id: 'cdmx', city: 'Ciudad de México', state: 'Ciudad de México', lat: 19.4326, lng: -99.1332 },
  { id: 'manzanillo', city: 'Manzanillo', state: 'Colima', lat: 19.1138, lng: -104.3385 },
] as const satisfies readonly CityPreset[];

export type CityPresetId = (typeof CITY_PRESETS)[number]['id'];

export function cityPreset(id: string): CityPreset | undefined {
  return CITY_PRESETS.find((c) => c.id === id);
}

/** The preset at a city and state, e.g. to preselect a stored availability. */
export function findCityPreset(city: string, state: string): CityPreset | undefined {
  return CITY_PRESETS.find((c) => c.city === city && c.state === state);
}

/** PostGIS EWKT for a `geography(Point, 4326)` column (longitude first). */
export function toEwktPoint({ lat, lng }: { lat: number; lng: number }): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new RangeError(`Invalid coordinates: ${lat}, ${lng}`);
  }
  return `SRID=4326;POINT(${lng} ${lat})`;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/u;

/**
 * A wall-clock date and time in Mexico City as an ISO timestamp, or null when
 * either part is invalid. Mexico City is UTC-6 all year since 2022.
 */
export function mexicoCityDateTime(date: string, time: string): string | null {
  const d = DATE.exec(date.trim());
  const t = TIME.exec(time.trim());
  if (!d || !t) return null;
  const check = new Date(Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3])));
  if (check.toISOString().slice(0, 10) !== date.trim()) return null;
  return `${date.trim()}T${time.trim()}:00-06:00`;
}

/** Date (YYYY-MM-DD) and time (HH:MM) parts of a moment in Mexico City. */
export function mexicoCityParts(value: Date): { date: string; time: string } {
  const shifted = new Date(value.getTime() - 6 * 60 * 60 * 1000);
  const iso = shifted.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/**
 * Errors raised by the fleet RPCs, triggers and constraints (supabase/
 * migrations), by a fragment of their fixed English message. Only known ones
 * are mapped, so database text never reaches the user. Shared by the app and
 * the web (G10b).
 */
const FLEET_ERRORS: readonly (readonly [RegExp, string])[] = [
  [/vehicles_company_plate_key/u, fleetErrorCopy.plateTaken],
  [/vehicle has expired documents/u, fleetErrorCopy.expiredDocuments],
  [/operator already has an account/u, fleetErrorCopy.operatorHasAccount],
  [/document is already expired/u, fleetErrorCopy.documentExpired],
  [/cannot archive: it is assigned to a trip in progress/u, fleetErrorCopy.archiveBlocked],
  [/only the manager can move or archive/u, fleetErrorCopy.managerOnly],
  [/business_unit_id is required/u, fleetErrorCopy.businessUnitRequired],
  [/vehicle is pending release/u, vehicleReleaseCopy.errors.pendingRelease],
  // H3: the subscription block of set_vehicle_availability.
  [/subscription required/u, billingCopy.errors.subscriptionRequired],
];

/** Spanish text for a known error message of a fleet write, or null when unknown. */
export function fleetErrorText(message: string): string | null {
  for (const [pattern, text] of FLEET_ERRORS) if (pattern.test(message)) return text;
  return null;
}
