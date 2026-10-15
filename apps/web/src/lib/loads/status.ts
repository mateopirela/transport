import { canTransition, LOAD_STATUSES, type LoadStatus } from '@transport/shared';

/** Statuses in which update_load accepts changes (until the load is contracted). */
const EDITABLE: readonly LoadStatus[] = ['draft', 'published', 'negotiating'];

/** What the shipper can do with a load in `status`; the RPCs enforce the same rules. */
export function shipperLoadActions(status: LoadStatus) {
  return {
    edit: EDITABLE.includes(status),
    publish: canTransition('load', status, 'published', 'shipper'),
    cancel: canTransition('load', status, 'cancelled', 'shipper'),
  };
}

/** Status filter of the list, from an untrusted query parameter. */
export function parseStatusFilter(value: string | string[] | undefined): LoadStatus | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return LOAD_STATUSES.find((status) => status === raw) ?? null;
}
