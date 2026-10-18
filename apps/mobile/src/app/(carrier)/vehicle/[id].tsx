import { fleetCopy, vehicleReleaseCopy, type Recommendation } from '@transport/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { AvailabilitySection } from '../../../components/availability-section';
import { MoveToBusinessUnit } from '../../../components/business-unit-fields';
import { DocumentList } from '../../../components/document-list';
import { Loaded, SectionTitle } from '../../../components/fleet-ui';
import { RecommendationCard } from '../../../components/load-card';
import { ReleaseSection } from '../../../components/release-section';
import { Body, Button, Notice, Screen } from '../../../components/ui';
import { VehicleForm } from '../../../components/vehicle-form';
import { listOperableBusinessUnits, moveVehicle } from '../../../lib/company-api';
import { archiveVehicle, listVehicles, loadCompanyContext } from '../../../lib/fleet-api';
import { fleetErrorMessage } from '../../../lib/fleet-errors';
import { EMPTY_VEHICLE_FORM, vehicleFormFromRow } from '../../../lib/fleet-forms';
import { unitRecommendations } from '../../../lib/loads-api';
import { getReleaseContext } from '../../../lib/release-api';
import { useCarrier, useCarrierData, type CarrierContext } from '../../../lib/use-carrier';

const copy = fleetCopy.units;

/**
 * Registers a unit (`/vehicle/new`) or shows one: data, availability and
 * documents (B18). A unit whose trip was cancelled after it set off shows the
 * release form instead of the availability (G5, D20), and once released, its
 * recommendations from where it is.
 */
export default function VehicleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  return (
    <Screen belowHeader>
      <Stack.Screen options={{ title: isNew ? copy.newTitle : copy.editTitle }} />
      {isNew ? <NewVehicle /> : <ExistingVehicle id={id} />}
    </Screen>
  );
}

const loadUnits = ({ client, companyId }: CarrierContext) =>
  listOperableBusinessUnits(client, companyId);

function NewVehicle() {
  const router = useRouter();
  const { carrier, state, reload } = useCarrierData(loadUnits);
  return (
    <Loaded state={state} onRetry={() => void reload()}>
      {(units) =>
        carrier ? (
          <>
            <VehicleForm
              client={carrier.client}
              companyId={carrier.companyId}
              vehicleId={null}
              initial={EMPTY_VEHICLE_FORM}
              businessUnits={units}
              onSaved={(id) => router.replace({ pathname: '/vehicle/[id]', params: { id } })}
            />
            <Body>{copy.saveFirst}</Body>
          </>
        ) : null
      }
    </Loaded>
  );
}

function ExistingVehicle({ id }: { id: string }) {
  const router = useRouter();
  const load = useCallback(
    async ({ client, companyId }: CarrierContext) => {
      const [context, units] = await Promise.all([
        loadCompanyContext(client, companyId),
        listOperableBusinessUnits(client, companyId),
      ]);
      const vehicle = (await listVehicles(client, context)).find((v) => v.id === id);
      if (!vehicle) throw new Error('vehicle not found');
      const release =
        vehicle.readiness === 'pending_release' ? await getReleaseContext(client, id) : null;
      return { context, vehicle, units, release };
    },
    [id],
  );
  const { carrier, state, reload } = useCarrierData(load);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  // After a release: the unit's recommendations from where it was released.
  const [released, setReleased] = useState<readonly Recommendation[] | null>(null);

  async function afterRelease() {
    if (!carrier) return;
    await reload();
    setReleased((await unitRecommendations(carrier.client, id)).recommendations);
  }

  function confirmArchive() {
    if (!carrier) return;
    Alert.alert(copy.archiveConfirmTitle, copy.archiveConfirmBody, [
      { text: copy.cancel, style: 'cancel' },
      {
        text: copy.archive,
        style: 'destructive',
        onPress: () => {
          archiveVehicle(carrier.client, id).then(
            () => router.back(),
            (error: unknown) => setArchiveError(fleetErrorMessage(error)),
          );
        },
      },
    ]);
  }

  return (
    <Loaded state={state} onRetry={() => void reload()}>
      {({ context, vehicle, units, release }) =>
        carrier ? (
          <>
            {release ? (
              <ReleaseSection client={carrier.client} context={release} onReleased={afterRelease} />
            ) : null}
            {released ? (
              <>
                <Notice tone="info">
                  {vehicleReleaseCopy.screen.done(vehicle.availability?.city ?? vehicle.plate)}
                </Notice>
                <SectionTitle>{vehicleReleaseCopy.screen.recommendations}</SectionTitle>
                {released.length === 0 ? (
                  <Body>{vehicleReleaseCopy.screen.noRecommendations}</Body>
                ) : (
                  released.map((r, i) => (
                    <RecommendationCard key={r.loadId} recommendation={r} rank={i + 1} />
                  ))
                )}
              </>
            ) : null}
            <VehicleForm
              client={carrier.client}
              companyId={carrier.companyId}
              vehicleId={vehicle.id}
              initial={vehicleFormFromRow(vehicle)}
              onSaved={() => void reload()}
            />
            {vehicle.readiness === 'pending_release' ? (
              <>
                <SectionTitle>{fleetCopy.availability.title}</SectionTitle>
                <Notice tone="danger">{vehicleReleaseCopy.errors.pendingRelease}</Notice>
              </>
            ) : (
              <AvailabilitySection
                client={carrier.client}
                vehicleId={vehicle.id}
                current={vehicle.availability}
                blocked={vehicle.readiness === 'expired_documents'}
                onChanged={reload}
              />
            )}
            <SectionTitle>{copy.documentsTitle}</SectionTitle>
            <DocumentList
              client={carrier.client}
              context={context}
              owner={{ type: 'vehicle', id: vehicle.id }}
              onChanged={reload}
            />
            {carrier.isManager ? (
              <MoveToBusinessUnit
                units={units}
                currentId={vehicle.businessUnitId}
                move={(unitId) => moveVehicle(carrier.client, vehicle.id, unitId)}
                onMoved={reload}
              />
            ) : null}
            {archiveError ? <Notice tone="danger">{archiveError}</Notice> : null}
            {carrier.isManager ? (
              <Button label={copy.archive} variant="link" onPress={confirmArchive} />
            ) : null}
          </>
        ) : null
      }
    </Loaded>
  );
}
