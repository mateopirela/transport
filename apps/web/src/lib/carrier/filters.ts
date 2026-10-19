// Filters of the carrier's load search (G10a), from untrusted query
// parameters. Pure, so it is unit-tested; the query itself runs through RLS.
import { cityPreset, UNIT_TYPES, type CityPreset, type UnitType } from '@transport/shared';

export interface LoadSearchFilters {
  origin: CityPreset | undefined;
  destination: CityPreset | undefined;
  unitType: UnitType | undefined;
}

/** Query parameter names (Spanish, like the rest of the web). */
export const LOAD_FILTER_PARAMS = { origin: 'origen', destination: 'destino', unitType: 'unidad' };

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Parses the search filters: city presets by id and the unit type. Unknown
 * values are dropped, so a stale or forged URL just shows every load.
 */
export function parseLoadFilters(params: Params): LoadSearchFilters {
  const unitType = first(params[LOAD_FILTER_PARAMS.unitType]);
  return {
    origin: cityPreset(first(params[LOAD_FILTER_PARAMS.origin]) ?? ''),
    destination: cityPreset(first(params[LOAD_FILTER_PARAMS.destination]) ?? ''),
    unitType: UNIT_TYPES.find((type) => type === unitType),
  };
}

/** The filters as query parameters (for links that keep them). */
export function loadFilterParams(filters: LoadSearchFilters): Record<string, string | undefined> {
  return {
    [LOAD_FILTER_PARAMS.origin]: filters.origin?.id,
    [LOAD_FILTER_PARAMS.destination]: filters.destination?.id,
    [LOAD_FILTER_PARAMS.unitType]: filters.unitType,
  };
}

/** True when at least one filter is set. */
export function hasLoadFilters(filters: LoadSearchFilters): boolean {
  return Boolean(filters.origin || filters.destination || filters.unitType);
}
