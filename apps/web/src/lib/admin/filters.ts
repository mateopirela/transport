// Filters of the admin supervision screens (B16), read from untrusted query
// parameters. Pure, so they are unit-tested.
import {
  INCIDENT_STATUSES,
  LOAD_STATUSES,
  TRIP_STATUSES,
  type IncidentStatus,
  type LoadStatus,
  type TripStatus,
} from '@transport/shared';

import { parsePage } from '../pagination';

type Param = string | string[] | undefined;

const first = (value: Param) => (Array.isArray(value) ? value[0] : value);

function oneOf<T extends string>(values: readonly T[], value: Param): T | undefined {
  const raw = first(value);
  return values.find((v) => v === raw);
}

/**
 * Free text for an ilike filter inside a PostgREST `or=(...)`: only letters,
 * digits, spaces and a few punctuation marks survive, so it cannot close the
 * expression or add wildcards. At most 60 characters.
 */
export function cleanSearch(value: Param): string {
  return (first(value) ?? '')
    .replace(/[^\p{L}\p{N} .'-]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 60)
    .trim();
}

export interface LoadFilters {
  status?: LoadStatus;
  city: string;
  page: number;
}

export function parseLoadFilters(params: Record<string, Param>): LoadFilters {
  return {
    status: oneOf(LOAD_STATUSES, params.estado),
    city: cleanSearch(params.ciudad),
    page: parsePage(params.p),
  };
}

export interface TripFilters {
  status?: TripStatus;
  page: number;
}

export function parseTripFilters(params: Record<string, Param>): TripFilters {
  return { status: oneOf(TRIP_STATUSES, params.estado), page: parsePage(params.p) };
}

export interface IncidentFilters {
  status: IncidentStatus;
  page: number;
}

export function parseIncidentFilters(params: Record<string, Param>): IncidentFilters {
  return {
    status: oneOf(INCIDENT_STATUSES, params.estado) ?? 'open',
    page: parsePage(params.p),
  };
}

/** PostgREST `or` filter: origin or destination city contains the text. */
export function cityFilter(city: string): string {
  const pattern = `*${city}*`;
  return `origin_city.ilike.${pattern},destination_city.ilike.${pattern}`;
}

/** "Monterrey, Nuevo León → Guadalajara, Jalisco". */
export function formatRoute(load: {
  origin_city: string;
  origin_state: string;
  destination_city: string;
  destination_state: string;
}): string {
  return `${load.origin_city}, ${load.origin_state} → ${load.destination_city}, ${load.destination_state}`;
}
