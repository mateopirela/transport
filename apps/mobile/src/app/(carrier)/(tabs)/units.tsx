import {
  fleetCopy,
  formatDateTime,
  unitTypeLabels,
  vehicleKindLabels,
  vehicleReadinessLabels,
  type VehicleReadiness,
} from '@transport/shared';
import { useRouter } from 'expo-router';

import { StatusRow } from '../../../components/status-row';
import {
  Button,
  Group,
  LoadError,
  Screen,
  Skeleton,
  TextCell,
  type PillTone,
} from '../../../components/ui';
import { listVehicles, loadCompanyContext, type VehicleSummary } from '../../../lib/fleet-api';
import { useCarrierData, type CarrierContext } from '../../../lib/use-carrier';

const copy = fleetCopy.units;

const READINESS_TONES: Record<VehicleReadiness, PillTone> = {
  pending_release: 'amber',
  expired_documents: 'red',
  unset: 'neutral',
  scheduled: 'accent',
  available: 'ok',
};

async function loadVehicles({ client, companyId }: CarrierContext) {
  return listVehicles(client, await loadCompanyContext(client, companyId));
}

function describe(vehicle: VehicleSummary): string {
  const parts = [vehicleKindLabels[vehicle.kind]];
  if (vehicle.unit_type) parts.push(unitTypeLabels[vehicle.unit_type]);
  if (vehicle.fleet_number) parts.push(vehicle.fleet_number);
  if (vehicle.businessUnitName) parts.push(fleetCopy.businessUnit(vehicle.businessUnitName));
  return parts.join(' · ');
}

/** Where and from when a unit is free, when it can take loads. */
function whereFree(vehicle: VehicleSummary): string | null {
  if (!vehicle.availability || vehicle.readiness === 'expired_documents') return null;
  return fleetCopy.availability.current(
    vehicle.availability.city,
    vehicle.availability.state,
    formatDateTime(vehicle.availability.available_from),
  );
}

/** The carrier's units with their availability (B18). */
export default function UnitsTab() {
  const router = useRouter();
  const { carrier, state, reload } = useCarrierData(loadVehicles);

  return (
    <Screen
      title={copy.title}
      right={
        // Adding units is the manager's (G1a.2).
        carrier?.isManager ? (
          <Button
            label={copy.add}
            size="small"
            icon="add"
            onPress={() => router.push('/vehicle/new')}
          />
        ) : null
      }
    >
      {state.status === 'loading' ? (
        <Skeleton />
      ) : state.status === 'error' ? (
        <LoadError onRetry={() => void reload()} />
      ) : state.data.length === 0 ? (
        <Group>
          <TextCell tone="dim">{copy.empty}</TextCell>
        </Group>
      ) : (
        <Group>
          {state.data.map((vehicle) => (
            <StatusRow
              key={vehicle.id}
              strong
              title={vehicle.plate}
              lines={[describe(vehicle), whereFree(vehicle)]}
              pill={{
                label: vehicleReadinessLabels[vehicle.readiness],
                tone: READINESS_TONES[vehicle.readiness],
              }}
              onPress={() => router.push({ pathname: '/vehicle/[id]', params: { id: vehicle.id } })}
            />
          ))}
        </Group>
      )}
    </Screen>
  );
}
