import { mobileNavCopy } from '@transport/shared';

import { PlaceholderScreen } from '../../components/placeholder-screen';

/** "Viaje asignado" (mockup): trip details and status controls arrive in B21. */
export default function AssignedTripTab() {
  return (
    <PlaceholderScreen title={mobileNavCopy.assignedTrip} message={mobileNavCopy.noAssignedTrip} />
  );
}
