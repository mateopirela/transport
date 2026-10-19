import type {
  SpecialRequirement,
  Tables,
  TablesInsert,
  UnitType,
  VehicleFormValues,
  VehicleKind,
} from '@transport/shared';

// Pure helpers between the fleet forms (text inputs) and the database rows.

/** Text input → number for zod: blank is `undefined`, garbage is `NaN` (rejected). */
export function parseNumberInput(text: string): number | undefined {
  const clean = text.trim().replace(/[,\s]/gu, '');
  if (clean === '') return undefined;
  return /^\d+(\.\d+)?$/u.test(clean) ? Number(clean) : Number.NaN;
}

/** What the vehicle form edits, as text where the input is free text. */
export interface VehicleFormState {
  kind: VehicleKind;
  plate: string;
  fleetNumber: string;
  modelYear: string;
  unitType: UnitType | undefined;
  capacityKg: string;
  capacityM3: string;
  features: SpecialRequirement[];
}

export const EMPTY_VEHICLE_FORM: VehicleFormState = {
  kind: 'trailer',
  plate: '',
  fleetNumber: '',
  modelYear: '',
  unitType: undefined,
  capacityKg: '',
  capacityM3: '',
  features: [],
};

export type VehicleRow = Pick<
  Tables<'vehicles'>,
  | 'id'
  | 'kind'
  | 'plate'
  | 'fleet_number'
  | 'model_year'
  | 'unit_type'
  | 'capacity_kg'
  | 'capacity_m3'
  | 'features'
>;

export function vehicleFormFromRow(row: VehicleRow): VehicleFormState {
  return {
    kind: row.kind,
    plate: row.plate,
    fleetNumber: row.fleet_number ?? '',
    modelYear: row.model_year?.toString() ?? '',
    unitType: row.unit_type ?? undefined,
    capacityKg: row.capacity_kg?.toString() ?? '',
    capacityM3: row.capacity_m3?.toString() ?? '',
    features: row.features,
  };
}

/** Input for `vehicleFormSchema`. Tractors carry no body or capacity. */
export function vehicleSchemaInput(form: VehicleFormState) {
  const tractor = form.kind === 'tractor';
  return {
    kind: form.kind,
    plate: form.plate,
    fleetNumber: form.fleetNumber,
    modelYear: parseNumberInput(form.modelYear),
    unitType: tractor ? undefined : form.unitType,
    capacityKg: tractor ? undefined : parseNumberInput(form.capacityKg),
    capacityM3: tractor ? undefined : parseNumberInput(form.capacityM3),
    features: form.features,
  };
}

/** Columns written on insert and update (company_id is added on insert only). */
export function vehicleColumns(
  values: VehicleFormValues,
): Omit<TablesInsert<'vehicles'>, 'company_id' | 'kind' | 'business_unit_id'> {
  return {
    plate: values.plate,
    fleet_number: values.fleetNumber ?? null,
    model_year: values.modelYear ?? null,
    unit_type: values.unitType ?? null,
    capacity_kg: values.capacityKg ?? null,
    capacity_m3: values.capacityM3 ?? null,
    features: values.features,
  };
}

/**
 * New dimensions so the longest side of a photo is at most `maxSide` pixels,
 * or null when it is already small enough. Keeps the aspect ratio.
 */
export function photoResize(
  width: number,
  height: number,
  maxSide = 2000,
): { width: number } | { height: number } | null {
  if (width <= maxSide && height <= maxSide) return null;
  return width >= height ? { width: maxSide } : { height: maxSide };
}

/** Toggles a value in a list (multi-select chips). */
export function toggleItem<T>(items: readonly T[], item: T): T[] {
  return items.includes(item) ? items.filter((i) => i !== item) : [...items, item];
}
