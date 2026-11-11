import { brokeredCopy, type LoadStatus } from '@transport/shared';

import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { Tag } from '@/components/ui/tag';

/**
 * "Publicada por Transport" (I6, D39): all a carrier learns about a brokered
 * load. Its price is the carriers' rate; the client's price never reaches it.
 */
export function BrokeredTag({ className }: { className?: string }) {
  return (
    <Tag tone="progress" className={className} data-testid="brokered-badge">
      {brokeredCopy.badge}
    </Tag>
  );
}

/** The status of a load for the carrier, with the brokered badge when it applies. */
export function CarrierLoadBadges({ load }: { load: { status: LoadStatus; brokered: boolean } }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <LoadStatusBadge status={load.status} />
      {load.brokered && <BrokeredTag />}
    </span>
  );
}
