import { fleetCopy } from '@transport/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { AvailabilitySection } from '../../../components/availability-section';
import { DocumentList } from '../../../components/document-list';
import { Loaded, SectionTitle } from '../../../components/fleet-ui';
import { Body, Button, Notice, Screen } from '../../../components/ui';
import { VehicleForm } from '../../../components/vehicle-form';
import { archiveVehicle, listVehicles, loadCompanyContext } from '../../../lib/fleet-api';
import { fleetErrorMessage } from '../../../lib/fleet-errors';
import { EMPTY_VEHICLE_FORM, vehicleFormFromRow } from '../../../lib/fleet-forms';
import { useCarrier, useCarrierData, type CarrierContext } from '../../../lib/use-carrier';

const copy = fleetCopy.units;

/** Registers a unit (`/vehicle/new`) or shows one: data, availability and documents (B18). */
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

function NewVehicle() {
  const carrier = useCarrier();
  const router = useRouter();
  if (!carrier) return null;
  return (
    <>
      <VehicleForm
        client={carrier.client}
        companyId={carrier.companyId}
        vehicleId={null}
        initial={EMPTY_VEHICLE_FORM}
        onSaved={(id) => router.replace({ pathname: '/vehicle/[id]', params: { id } })}
      />
      <Body>{copy.saveFirst}</Body>
    </>
  );
}

function ExistingVehicle({ id }: { id: string }) {
  const router = useRouter();
  const load = useCallback(
    async ({ client, companyId }: CarrierContext) => {
      const context = await loadCompanyContext(client, companyId);
      const vehicle = (await listVehicles(client, context)).find((v) => v.id === id);
      if (!vehicle) throw new Error('vehicle not found');
      return { context, vehicle };
    },
    [id],
  );
  const { carrier, state, reload } = useCarrierData(load);
  const [archiveError, setArchiveError] = useState<string | null>(null);

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
      {({ context, vehicle }) =>
        carrier ? (
          <>
            <VehicleForm
              client={carrier.client}
              companyId={carrier.companyId}
              vehicleId={vehicle.id}
              initial={vehicleFormFromRow(vehicle)}
              onSaved={() => void reload()}
            />
            <AvailabilitySection
              client={carrier.client}
              vehicleId={vehicle.id}
              current={vehicle.availability}
              blocked={vehicle.readiness === 'expired_documents'}
              onChanged={reload}
            />
            <SectionTitle>{copy.documentsTitle}</SectionTitle>
            <DocumentList
              client={carrier.client}
              context={context}
              owner={{ type: 'vehicle', id: vehicle.id }}
              onChanged={reload}
            />
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
