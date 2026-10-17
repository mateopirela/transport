import {
  fleetCopy,
  formatDateTime,
  unitTypeLabels,
  vehicleKindLabels,
  vehicleReadinessLabels,
  type VehicleReadiness,
} from '@transport/shared';
import { useRouter } from 'expo-router';

import { Badge, Card, Loaded, type Tone } from '../../../components/fleet-ui';
import { Body, Button, Screen, Title } from '../../../components/ui';
import { listVehicles, loadCompanyContext, type VehicleSummary } from '../../../lib/fleet-api';
import { useCarrierData, type CarrierContext } from '../../../lib/use-carrier';

const copy = fleetCopy.units;

const READINESS_TONES: Record<VehicleReadiness, Tone> = {
  expired_documents: 'danger',
  unset: 'neutral',
  scheduled: 'info',
  available: 'success',
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

/** The carrier's units with their availability (B18). */
export default function UnitsTab() {
  const router = useRouter();
  const { carrier, state, reload } = useCarrierData(loadVehicles);

  return (
    <Screen>
      <Title>{copy.title}</Title>
      {/* Adding units is the manager's (G1a.2). */}
      {carrier?.isManager ? (
        <Button label={copy.add} onPress={() => router.push('/vehicle/new')} />
      ) : null}
      <Loaded state={state} onRetry={() => void reload()}>
        {(vehicles) =>
          vehicles.length === 0 ? (
            <Body>{copy.empty}</Body>
          ) : (
            vehicles.map((vehicle) => (
              <Card
                key={vehicle.id}
                title={vehicle.plate}
                subtitle={describe(vehicle)}
                onPress={() =>
                  router.push({ pathname: '/vehicle/[id]', params: { id: vehicle.id } })
                }
              >
                <Badge
                  label={vehicleReadinessLabels[vehicle.readiness]}
                  tone={READINESS_TONES[vehicle.readiness]}
                />
                {vehicle.availability && vehicle.readiness !== 'expired_documents' ? (
                  <Body>
                    {fleetCopy.availability.current(
                      vehicle.availability.city,
                      vehicle.availability.state,
                      formatDateTime(vehicle.availability.available_from),
                    )}
                  </Body>
                ) : null}
              </Card>
            ))
          )
        }
      </Loaded>
    </Screen>
  );
}
