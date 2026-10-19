// Pure helpers between the fleet forms of the carrier web (G10b) and the zod
// schemas shared with the app (vehicleFormSchema, operatorDraftSchema,
// availabilityFormSchema, carrierRouteFormSchema). Unit-tested; the schemas
// decide what is valid.
import type { Tables } from '@transport/shared';

/** Text input → number for zod: blank is `undefined`, garbage is `NaN` (rejected). */
export function parseNumberInput(text: string | undefined): number | undefined {
  const clean = (text ?? '').trim().replace(/[,\s]/gu, '');
  if (clean === '') return undefined;
  return /^\d+(\.\d+)?$/u.test(clean) ? Number(clean) : Number.NaN;
}

type Entries = Record<string, string>;

/** Input for `vehicleFormSchema` from the form's text entries and checked features. */
export function vehicleSchemaInput(entries: Entries, features: readonly string[]) {
  // Body and capacity belong to the unit that carries the cargo, never to a tractor.
  const tractor = entries.kind === 'tractor';
  return {
    kind: entries.kind,
    plate: entries.plate,
    fleetNumber: entries.fleetNumber,
    modelYear: parseNumberInput(entries.modelYear),
    unitType: tractor ? undefined : entries.unitType,
    capacityKg: tractor ? undefined : parseNumberInput(entries.capacityKg),
    capacityM3: tractor ? undefined : parseNumberInput(entries.capacityM3),
    features: tractor ? [] : [...features],
  };
}

export type VehicleFormRow = Pick<
  Tables<'vehicles'>,
  'kind' | 'plate' | 'fleet_number' | 'model_year' | 'unit_type' | 'capacity_kg' | 'capacity_m3'
>;

/** The form's values from a unit row (to edit it). Features are checkboxes, apart. */
export function vehicleFormValues(row: VehicleFormRow): Entries {
  return {
    kind: row.kind,
    plate: row.plate,
    fleetNumber: row.fleet_number ?? '',
    modelYear: row.model_year?.toString() ?? '',
    unitType: row.unit_type ?? '',
    capacityKg: row.capacity_kg?.toString() ?? '',
    capacityM3: row.capacity_m3?.toString() ?? '',
  };
}

export type OperatorFormRow = Pick<
  Tables<'operators'>,
  'full_name' | 'email' | 'phone' | 'license_number' | 'license_type' | 'license_expires_on'
>;

/** The form's values from an operator row (to edit it). */
export function operatorFormValues(row: OperatorFormRow): Entries {
  return {
    fullName: row.full_name,
    email: row.email ?? '',
    phone: row.phone ?? '',
    licenseNumber: row.license_number ?? '',
    licenseType: row.license_type ?? '',
    licenseExpiresOn: row.license_expires_on ?? '',
  };
}

/** Flash parameter of the screen a successful write redirects to (`alta`, `baja`, `liberada`). */
export const FLEET_FLASH_PARAM = 'aviso';

const FLEET_FLASHES = ['alta', 'baja', 'liberada'] as const;
export type FleetFlash = (typeof FLEET_FLASHES)[number];

/** The flash of a fleet screen from its query parameter, or null. */
export function parseFleetFlash(value: string | string[] | undefined): FleetFlash | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return FLEET_FLASHES.find((flash) => flash === raw) ?? null;
}

/** Input for `operatorDraftSchema` from the form's entries (a blank license type is none). */
export function operatorSchemaInput(entries: Entries) {
  return {
    fullName: entries.fullName,
    email: entries.email,
    phone: entries.phone,
    licenseNumber: entries.licenseNumber,
    licenseType: entries.licenseType || undefined,
    licenseExpiresOn: entries.licenseExpiresOn,
  };
}
