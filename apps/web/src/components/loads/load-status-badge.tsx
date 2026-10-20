import { loadStatusLabels, type LoadStatus } from '@transport/shared';

import { Pill } from '@/components/ui/pill';
import { loadStatusTone } from '@/lib/status-tones';

/** The status of a load as a pill (§1.6). */
export function LoadStatusBadge({ status }: { status: LoadStatus }) {
  return <Pill tone={loadStatusTone(status)}>{loadStatusLabels[status]}</Pill>;
}
