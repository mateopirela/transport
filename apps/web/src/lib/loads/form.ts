// Load form <-> loadFormSchema (packages/shared). Pure, so the browser
// (instant feedback) and the server action (authoritative) validate the same
// way, and it can be unit-tested.
import {
  loadFormSchema,
  mexicoCityDateTime,
  mexicoCityParts,
  parsePesosToCents,
  toCents,
  type LoadFormInput,
  type LoadFormValues,
  type Tables,
} from '@transport/shared';

import type { FormState } from '../forms';

export const PLACE_FIELDS = ['address', 'city', 'state', 'lat', 'lng', 'placeId'] as const;
export type PlaceKey = 'origin' | 'destination';

/** A place as the form keeps it: text values of its hidden inputs. */
export type PlaceValue = Record<(typeof PLACE_FIELDS)[number], string>;

const WINDOW_FIELDS = {
  pickupWindow: ['pickupStart', 'pickupEnd'],
  deliveryWindow: ['deliveryStart', 'deliveryEnd'],
} as const;

/** `datetime-local` value (wall clock in Mexico City) → ISO with offset. */
function toTimestamp(value: string | undefined): string | undefined {
  const [date, time] = (value ?? '').split('T');
  return (date && time && mexicoCityDateTime(date, time.slice(0, 5))) || undefined;
}

/** Number typed by a person ("1,200.5"); empty → undefined, garbage → NaN. */
function toNumber(value: string | undefined): number | undefined {
  const text = value?.replaceAll(',', '').trim();
  return text ? Number(text) : undefined;
}

function toPlace(entries: Record<string, string>, key: PlaceKey) {
  const get = (field: string) => entries[`${key}.${field}`];
  // Nothing picked: the schema reports "selecciona una ubicación".
  if (!get('address') && !get('lat')) return undefined;
  return {
    address: get('address') ?? '',
    city: get('city') ?? '',
    state: get('state') ?? '',
    lat: toNumber(get('lat')) ?? Number.NaN,
    lng: toNumber(get('lng')) ?? Number.NaN,
    placeId: get('placeId'),
  };
}

/**
 * Flat form entries (see LoadForm) → the shape loadFormSchema expects. Not
 * validated: missing or malformed values stay undefined/NaN for the schema.
 */
export function toLoadInput(
  entries: Record<string, string>,
  specialRequirements: readonly string[],
): Record<keyof LoadFormInput, unknown> {
  const price = entries.price ? parsePesosToCents(entries.price) : undefined;
  return {
    origin: toPlace(entries, 'origin'),
    destination: toPlace(entries, 'destination'),
    pickupWindow: {
      start: toTimestamp(entries.pickupStart),
      end: toTimestamp(entries.pickupEnd),
    },
    deliveryWindow: {
      start: toTimestamp(entries.deliveryStart),
      end: toTimestamp(entries.deliveryEnd),
    },
    cargoType: entries.cargoType,
    description: entries.description,
    weightKg: toNumber(entries.weightKg),
    volumeM3: toNumber(entries.volumeM3),
    unitType: entries.unitType,
    specialRequirements: [...specialRequirements],
    // A price that does not parse is NaN, so it reports "monto no válido".
    proposedPriceCents: price === null ? Number.NaN : price,
    notes: entries.notes,
  };
}

/** The form field that shows the error of a schema path. */
export function fieldForPath(path: readonly PropertyKey[]): string {
  const [head, sub] = path.map(String);
  if (head === 'pickupWindow' || head === 'deliveryWindow') {
    return WINDOW_FIELDS[head][sub === 'end' ? 1 : 0];
  }
  if (head === 'proposedPriceCents') return 'price';
  return head ?? '';
}

export type ParsedLoadForm =
  { success: true; data: LoadFormValues } | { success: false; state: FormState };

/** Validates the submitted entries. `values` refill the form on error. */
export function parseLoadForm(
  entries: Record<string, string>,
  specialRequirements: readonly string[],
): ParsedLoadForm {
  const parsed = loadFormSchema.safeParse(toLoadInput(entries, specialRequirements));
  if (parsed.success) return { success: true, data: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = fieldForPath(issue.path);
    if (key) fieldErrors[key] ??= issue.message;
  }
  return {
    success: false,
    state: {
      fieldErrors,
      values: { ...entries, specialRequirements: specialRequirements.join(',') },
    },
  };
}

/** Cents → the text a person would type: 1250050 → "12500.50". */
export function centsToPesosText(cents: number | string): string {
  const value = toCents(cents);
  const rest = String(value % 100).padStart(2, '0');
  return rest === '00' ? String(Math.trunc(value / 100)) : `${Math.trunc(value / 100)}.${rest}`;
}

/** ISO timestamp → `datetime-local` value in Mexico City. */
export function toLocalInput(timestamp: string): string {
  const { date, time } = mexicoCityParts(new Date(timestamp));
  return `${date}T${time}`;
}

type LoadRow = Tables<'loads'>;

/** A stored load → the form's initial values (edit screen). */
export function loadToFormValues(load: LoadRow): Record<string, string> {
  const place = (key: PlaceKey) => ({
    [`${key}.address`]: load[`${key}_address`],
    [`${key}.city`]: load[`${key}_city`],
    [`${key}.state`]: load[`${key}_state`],
    [`${key}.lat`]: String(load[`${key}_lat`]),
    [`${key}.lng`]: String(load[`${key}_lng`]),
    [`${key}.placeId`]: load[`${key}_place_id`] ?? '',
  });
  return {
    ...place('origin'),
    ...place('destination'),
    pickupStart: toLocalInput(load.pickup_window_start),
    pickupEnd: toLocalInput(load.pickup_window_end),
    deliveryStart: toLocalInput(load.delivery_window_start),
    deliveryEnd: toLocalInput(load.delivery_window_end),
    cargoType: load.cargo_type,
    description: load.description,
    weightKg: String(load.weight_kg),
    volumeM3: load.volume_m3 === null ? '' : String(load.volume_m3),
    unitType: load.unit_type,
    specialRequirements: load.special_requirements.join(','),
    price: centsToPesosText(load.proposed_price_cents),
    notes: load.notes ?? '',
  };
}

/** The place stored in the form values, or null when it is incomplete. */
export function placeFromValues(
  values: Record<string, string> | undefined,
  key: PlaceKey,
): PlaceValue | null {
  const place = Object.fromEntries(
    PLACE_FIELDS.map((field) => [field, values?.[`${key}.${field}`] ?? '']),
  ) as PlaceValue;
  const valid = place.address && Number.isFinite(Number.parseFloat(place.lat));
  return valid && Number.isFinite(Number.parseFloat(place.lng)) ? place : null;
}
