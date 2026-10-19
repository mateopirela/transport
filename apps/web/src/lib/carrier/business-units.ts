// Business unit picker of the carrier web (G10a, D19). Pure: the layout
// resolves the cookie against the units the viewer operates (the Gerente has
// every active unit of the company, a Coordinador only theirs, as
// auth_business_unit_ids says), so the screens never show a unit the viewer
// cannot operate. Postgres enforces the same scope through RLS; this only
// narrows what the screens list.
import { uuidField } from '@transport/shared';

/** Cookie with the chosen business unit id, or `all`. */
export const BUSINESS_UNIT_COOKIE = 'transport_business_unit';

/** Picker value that shows every business unit the viewer operates. */
export const ALL_BUSINESS_UNITS = 'all';

export interface BusinessUnitOption {
  id: string;
  name: string;
}

export interface BusinessUnitSelection {
  /** Units the viewer operates, by name. */
  operable: BusinessUnitOption[];
  /** The unit chosen in the picker; null when every operable unit is shown. */
  selected: BusinessUnitOption | null;
  /** Ids the screens filter by: the selected unit, or every operable one. */
  ids: string[];
}

/**
 * The selection from the cookie: a unit the viewer still operates, or all of
 * them when the cookie is missing, stale or says `all`. One operable unit is
 * always "selected", so a Coordinador of one unit never sees a picker.
 */
export function resolveBusinessUnitSelection(
  operable: readonly BusinessUnitOption[],
  cookie: string | undefined,
): BusinessUnitSelection {
  const units = [...operable].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const chosen = units.length === 1 ? units[0] : units.find((unit) => unit.id === cookie);
  return {
    operable: units,
    selected: chosen ?? null,
    ids: chosen ? [chosen.id] : units.map((unit) => unit.id),
  };
}

/** Picker value from a form: `all`, a unit id, or null when malformed. */
export function parseBusinessUnitChoice(value: FormDataEntryValue | null): string | null {
  if (value === ALL_BUSINESS_UNITS) return ALL_BUSINESS_UNITS;
  const parsed = uuidField.safeParse(value);
  return parsed.success ? parsed.data : null;
}
