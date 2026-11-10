import {
  brokeredClientStage,
  brokeredCopy,
  loadStatusLabels,
  type BrokeredQuoteStatus,
  type LoadStatus,
} from '@transport/shared';

import { Pill } from '@/components/ui/pill';
import { loadStatusTone } from '@/lib/status-tones';

/**
 * The status of a load as a pill (§1.6). A load sent to the platform (I6)
 * shows where its quote is until Transport finds the carrier.
 */
export function LoadStatusBadge({
  status,
  quoteStatus = null,
}: {
  status: LoadStatus;
  quoteStatus?: BrokeredQuoteStatus | null;
}) {
  const stage = brokeredClientStage(quoteStatus, status);
  if (stage) {
    return (
      <Pill tone={stage === 'quoted' ? 'amber' : 'accent'}>
        {brokeredCopy.shipper.stage[stage]}
      </Pill>
    );
  }
  return <Pill tone={loadStatusTone(status)}>{loadStatusLabels[status]}</Pill>;
}
