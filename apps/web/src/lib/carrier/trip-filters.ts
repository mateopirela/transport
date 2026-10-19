// Filters of the carrier's trips list (G10b), from untrusted query
// parameters. Pure, so it is unit-tested; the query itself runs through RLS
// and the business unit selection of the layout (D19).
import {
  ACTIVE_TRIP_STATUSES,
  carrierTripGroup,
  TRIP_STATUSES,
  uuidField,
  type CarrierTripGroup,
  type TripStatus,
} from '@transport/shared';

/** Tabs of the trips list: every unfinished trip, one section of them, or the history. */
export type CarrierTripsView = 'open' | CarrierTripGroup;

/** Query parameter names (Spanish, like the rest of the web). */
export const TRIP_FILTER_PARAMS = { view: 'vista', businessUnit: 'unidad' } as const;

/** `vista` values of each tab; the default tab has none. */
export const TRIP_VIEW_PARAMS: Record<CarrierTripsView, string | undefined> = {
  open: undefined,
  to_assign: 'por-asignar',
  upcoming: 'proximos',
  active: 'en-curso',
  history: 'historial',
};

/** Tabs in display order. */
export const CARRIER_TRIPS_VIEWS: readonly CarrierTripsView[] = [
  'open',
  'to_assign',
  'upcoming',
  'active',
  'history',
];

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The tab from the `vista` parameter; anything unknown shows the open trips. */
export function parseCarrierTripsView(params: Params): CarrierTripsView {
  const raw = first(params[TRIP_FILTER_PARAMS.view]);
  const view = CARRIER_TRIPS_VIEWS.find((v) => v !== 'open' && TRIP_VIEW_PARAMS[v] === raw);
  return view ?? 'open';
}

/**
 * A business unit asked for in the URL (`unidad`, as the Gerente's home links
 * it in G4), only when the viewer operates it; otherwise null and the list
 * follows the picker. Postgres enforces the scope again (RLS).
 */
export function parseTripsBusinessUnit(
  params: Params,
  operableIds: readonly string[],
): string | null {
  const parsed = uuidField.safeParse(first(params[TRIP_FILTER_PARAMS.businessUnit]));
  return parsed.success && operableIds.includes(parsed.data) ? parsed.data : null;
}

/** Trip statuses each tab lists (mirrors carrierTripGroup). */
export function tripsViewStatuses(view: CarrierTripsView): TripStatus[] {
  if (view === 'open') {
    return TRIP_STATUSES.filter((status) => carrierTripGroup(status) !== 'history');
  }
  if (view === 'active') return [...ACTIVE_TRIP_STATUSES];
  return TRIP_STATUSES.filter((status) => carrierTripGroup(status) === view);
}
