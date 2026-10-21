import {
  dwellCopy,
  formatDateTime,
  formatDwell,
  type DwellEstimate,
  type TripEndEstimate,
} from '@transport/shared';

import { ValueRow } from '@/components/ui/cell';
import { Group } from '@/components/ui/group';

/**
 * "Fin estimado de descarga" of a trip (H5, D32), as a row of a group: the
 * time and what it is based on (the operator, the trips measured at the
 * site, or the default 4 h). Nothing once unloading finished.
 */
export function TripEndRow({ estimate }: { estimate: TripEndEstimate | null }) {
  if (!estimate || estimate.source === 'finished') return null;
  const basis = dwellCopy.tripEndBasis(estimate);
  return (
    <ValueRow label={dwellCopy.tripEnd}>
      <span className="block text-right">{formatDateTime(estimate.endsAt)}</span>
      {basis && <span className="block text-right text-footnote text-text-dim">{basis}</span>}
    </ValueRow>
  );
}

/** "Tiempo típico en tu sitio" (H5): the shipper's own times at the pickup and the delivery. */
export function SiteDwellGroup({
  pickup,
  delivery,
}: {
  pickup: DwellEstimate | null;
  delivery: DwellEstimate | null;
}) {
  if (!pickup && !delivery) return null;
  return (
    <Group label={dwellCopy.siteTitle} footer={dwellCopy.siteHint}>
      {pickup && <ValueRow label={dwellCopy.sitePickup}>{formatDwell(pickup)}</ValueRow>}
      {delivery && <ValueRow label={dwellCopy.siteDelivery}>{formatDwell(delivery)}</ValueRow>}
    </Group>
  );
}
