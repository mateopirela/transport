import {
  fleetCopy,
  vehicleReleaseCopy,
  type BusinessUnitRef,
  type Recommendation,
} from '@transport/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';

import { useAvailability } from '../../../components/availability-section';
import { MoveToBusinessUnit } from '../../../components/business-unit-fields';
import { DocumentList } from '../../../components/document-list';
import { RecommendationCell } from '../../../components/load-card';
import { useRelease } from '../../../components/release-section';
import { ConfirmSheet, type ConfirmSheetHandle } from '../../../components/sheet';
import {
  BottomBar,
  Button,
  Footnote,
  Group,
  LoadError,
  Notice,
  Screen,
  SectionHeader,
  Skeleton,
  TextCell,
} from '../../../components/ui';
import { useVehicleForm, type FormSave } from '../../../components/vehicle-form';
import { listOperableBusinessUnits, moveVehicle } from '../../../lib/company-api';
import {
  archiveVehicle,
  listVehicles,
  loadCompanyContext,
  type CompanyContext,
  type VehicleSummary,
} from '../../../lib/fleet-api';
import { fleetErrorMessage } from '../../../lib/fleet-errors';
import { EMPTY_VEHICLE_FORM, vehicleFormFromRow } from '../../../lib/fleet-forms';
import { unitRecommendations } from '../../../lib/loads-api';
import { getReleaseContext, type ReleaseContext } from '../../../lib/release-api';
import { useCarrierData, type CarrierContext } from '../../../lib/use-carrier';

const copy = fleetCopy.units;

/**
 * Registers a unit (`/vehicle/new`) or shows one: data, availability and
 * documents (B18). A unit whose trip was cancelled after it set off shows the
 * release form instead of the availability (G5, D20), and once released, its
 * recommendations from where it is. The screen's next step (save, release or
 * the availability) sits in the bottom bar.
 */
export default function VehicleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  return (
    <>
      <Stack.Screen options={{ title: isNew ? copy.newTitle : copy.editTitle }} />
      {isNew ? <NewVehicle /> : <ExistingVehicle id={id} />}
    </>
  );
}

/** A screen under the header, with its primary action in the bottom bar. */
function WithBar({ children, action }: { children: ReactNode; action: FormSave | null }) {
  const [barHeight, setBarHeight] = useState(0);
  return (
    <>
      <Screen belowHeader bottom={action ? barHeight : 0}>
        {children}
      </Screen>
      {action ? <BottomBar action={action} onHeight={setBarHeight} /> : null}
    </>
  );
}

/** What a screen shows until its data is ready. */
function NotReady({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  return (
    <Screen belowHeader>{failed ? <LoadError onRetry={onRetry} /> : <Skeleton rows={5} />}</Screen>
  );
}

const loadUnits = ({ client, companyId }: CarrierContext) =>
  listOperableBusinessUnits(client, companyId);

function NewVehicle() {
  const { carrier, state, reload } = useCarrierData(loadUnits);
  if (state.status !== 'ready' || !carrier) {
    return <NotReady failed={state.status === 'error'} onRetry={() => void reload()} />;
  }
  return <NewVehicleForm carrier={carrier} units={state.data} />;
}

function NewVehicleForm({
  carrier,
  units,
}: {
  carrier: CarrierContext;
  units: readonly BusinessUnitRef[];
}) {
  const router = useRouter();
  const form = useVehicleForm({
    client: carrier.client,
    companyId: carrier.companyId,
    vehicleId: null,
    initial: EMPTY_VEHICLE_FORM,
    businessUnits: units,
    onSaved: (id) => router.replace({ pathname: '/vehicle/[id]', params: { id } }),
  });
  return (
    <WithBar action={form.save}>
      {form.section}
      <Footnote>{copy.saveFirst}</Footnote>
    </WithBar>
  );
}

function ExistingVehicle({ id }: { id: string }) {
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
  // After a release: the unit's recommendations from where it was released.
  const [released, setReleased] = useState<readonly Recommendation[] | null>(null);

  async function afterRelease() {
    if (!carrier) return;
    await reload();
    setReleased((await unitRecommendations(carrier.client, id)).recommendations);
  }

  if (state.status !== 'ready' || !carrier) {
    return <NotReady failed={state.status === 'error'} onRetry={() => void reload()} />;
  }
  const pendingRelease = state.data.vehicle.readiness === 'pending_release';
  return (
    // Once released, the availability form starts again from where the unit was released.
    <VehicleDetail
      key={pendingRelease ? 'pending-release' : 'released'}
      carrier={carrier}
      {...state.data}
      released={released}
      onReleased={afterRelease}
      reload={reload}
    />
  );
}

function VehicleDetail({
  carrier,
  context,
  vehicle,
  units,
  release,
  released,
  onReleased,
  reload,
}: {
  carrier: CarrierContext;
  context: CompanyContext;
  vehicle: VehicleSummary;
  units: readonly BusinessUnitRef[];
  release: ReleaseContext | null;
  released: readonly Recommendation[] | null;
  onReleased: () => Promise<void>;
  reload: () => Promise<void>;
}) {
  const router = useRouter();
  const confirmSheet = useRef<ConfirmSheetHandle>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const pendingRelease = vehicle.readiness === 'pending_release';

  const form = useVehicleForm({
    client: carrier.client,
    companyId: carrier.companyId,
    vehicleId: vehicle.id,
    initial: vehicleFormFromRow(vehicle),
    onSaved: () => void reload(),
  });
  const availability = useAvailability({
    client: carrier.client,
    vehicleId: vehicle.id,
    current: vehicle.availability,
    blocked: vehicle.readiness === 'expired_documents',
    onChanged: reload,
  });
  const releaseForm = useRelease({
    client: carrier.client,
    context: release,
    onReleased,
  });

  function confirmArchive() {
    confirmSheet.current?.ask({
      title: copy.archiveConfirmTitle,
      body: copy.archiveConfirmBody,
      confirmLabel: copy.archive,
      cancelLabel: copy.cancel,
      destructive: true,
      onConfirm: async () => {
        try {
          await archiveVehicle(carrier.client, vehicle.id);
          router.back();
        } catch (error) {
          setArchiveError(fleetErrorMessage(error));
        }
      },
    });
  }

  // One primary per screen: the release while the unit waits for it, else its availability.
  const action = releaseForm.submit ?? (pendingRelease ? null : availability.save);

  return (
    <WithBar action={action}>
      {releaseForm.section}
      {released ? (
        <>
          <Notice>
            {vehicleReleaseCopy.screen.done(vehicle.availability?.city ?? vehicle.plate)}
          </Notice>
          <SectionHeader title={vehicleReleaseCopy.screen.recommendations} />
          {released.length === 0 ? (
            <Group>
              <TextCell tone="dim">{vehicleReleaseCopy.screen.noRecommendations}</TextCell>
            </Group>
          ) : (
            <Group>
              {released.map((r, i) => (
                <RecommendationCell key={r.loadId} recommendation={r} rank={i + 1} />
              ))}
            </Group>
          )}
        </>
      ) : null}
      {form.section}
      <Button
        label={form.save.label}
        variant="secondary"
        onPress={form.save.onPress}
        loading={form.save.loading}
      />
      {pendingRelease ? (
        <>
          <SectionHeader title={fleetCopy.availability.title} />
          <Notice tone="danger">{vehicleReleaseCopy.errors.pendingRelease}</Notice>
        </>
      ) : (
        availability.section
      )}
      <SectionHeader title={copy.documentsTitle} />
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
        <Button label={copy.archive} variant="destructive" onPress={confirmArchive} />
      ) : null}
      <ConfirmSheet ref={confirmSheet} />
    </WithBar>
  );
}
