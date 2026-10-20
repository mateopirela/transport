import { vehicleReadinessLabels, type VehicleReadiness } from '@transport/shared';

import { Pill, type PillTone } from '@/components/ui/pill';

/** The tone of each readiness: red when the unit cannot work, green when it is free. */
const TONES: Record<VehicleReadiness, PillTone> = {
  pending_release: 'red',
  expired_documents: 'red',
  unset: 'neutral',
  scheduled: 'accent',
  available: 'ok',
};

/** Whether a unit can take a load, as a status pill (G10b, G5). */
export function ReadinessPill({ readiness }: { readiness: VehicleReadiness }) {
  return <Pill tone={TONES[readiness]}>{vehicleReadinessLabels[readiness]}</Pill>;
}
