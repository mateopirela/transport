import { tripStatusLabels, type TripStatus } from '@transport/shared';

import { Pill } from '@/components/ui/pill';
import { tripStatusTone } from '@/lib/status-tones';

/** The status of a trip as a pill (§1.6). */
export function TripStatusBadge({ status }: { status: TripStatus }) {
  return <Pill tone={tripStatusTone(status)}>{tripStatusLabels[status]}</Pill>;
}
