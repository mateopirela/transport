import { vehicleReadinessLabels, type VehicleReadiness } from '@transport/shared';

import { Pill, type PillTone } from '@/components/ui/pill';

/** The tone of each readiness: a problem when the unit cannot work, done when it is free. */
const TONES: Record<VehicleReadiness, PillTone> = {
  pending_release: 'problem',
  expired_documents: 'problem',
  missing_documents: 'problem',
  unset: 'inactive',
  scheduled: 'progress',
  available: 'done',
};

/** Whether a unit can take a load, as a status pill (G10b, G5, R4). */
export function ReadinessPill({ readiness }: { readiness: VehicleReadiness }) {
  return <Pill tone={TONES[readiness]}>{vehicleReadinessLabels[readiness]}</Pill>;
}
