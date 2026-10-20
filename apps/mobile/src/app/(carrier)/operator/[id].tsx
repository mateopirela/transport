import { fleetCopy, managerCompanyCopy, type BusinessUnitRef } from '@transport/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { MoveToBusinessUnit } from '../../../components/business-unit-fields';
import { DocumentList } from '../../../components/document-list';
import { InvitationLinkIssuer } from '../../../components/invitation-link';
import { InvitationSection } from '../../../components/invitation-section';
import { useOperatorForm } from '../../../components/operator-form';
import { ConfirmSheet, type ConfirmSheetHandle } from '../../../components/sheet';
import {
  BottomBar,
  Button,
  Footnote,
  LoadError,
  Notice,
  Screen,
  SectionHeader,
  Skeleton,
} from '../../../components/ui';
import { issueInvitation, listOperableBusinessUnits, moveOperator } from '../../../lib/company-api';
import {
  archiveOperator,
  listOperators,
  loadCompanyContext,
  type CompanyContext,
  type OperatorSummary,
} from '../../../lib/fleet-api';
import { fleetErrorMessage } from '../../../lib/fleet-errors';
import { useCarrierData, type CarrierContext } from '../../../lib/use-carrier';
import { useSession } from '../../../providers/session';

const copy = fleetCopy.operators;

/**
 * Registers an operator (`/operator/new`, the save in the bottom bar) or
 * shows one: data, invitation (or access reset, G4), documents and, for the
 * Gerente, move and archive (B18).
 */
export default function OperatorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  return (
    <>
      <Stack.Screen options={{ title: isNew ? copy.newTitle : copy.editTitle }} />
      {isNew ? <NewOperator /> : <ExistingOperator id={id} />}
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

function NewOperator() {
  const { carrier, state, reload } = useCarrierData(loadUnits);
  if (state.status !== 'ready' || !carrier) {
    return <NotReady failed={state.status === 'error'} onRetry={() => void reload()} />;
  }
  return <NewOperatorForm carrier={carrier} units={state.data} />;
}

function NewOperatorForm({
  carrier,
  units,
}: {
  carrier: CarrierContext;
  units: readonly BusinessUnitRef[];
}) {
  const router = useRouter();
  const [barHeight, setBarHeight] = useState(0);
  const form = useOperatorForm({
    client: carrier.client,
    companyId: carrier.companyId,
    operator: null,
    businessUnits: units,
    onSaved: (id) => router.replace({ pathname: '/operator/[id]', params: { id } }),
  });
  return (
    <>
      <Screen belowHeader bottom={barHeight}>
        {form.section}
      </Screen>
      <BottomBar action={form.save} onHeight={setBarHeight} />
    </>
  );
}

function ExistingOperator({ id }: { id: string }) {
  const load = useCallback(
    async ({ client, companyId }: CarrierContext) => {
      const [context, operators, units] = await Promise.all([
        loadCompanyContext(client, companyId),
        listOperators(client, companyId),
        listOperableBusinessUnits(client, companyId),
      ]);
      const operator = operators.find((o) => o.id === id);
      if (!operator) throw new Error('operator not found');
      return { context, operator, units };
    },
    [id],
  );
  const { carrier, state, reload } = useCarrierData(load);
  if (state.status !== 'ready' || !carrier) {
    return <NotReady failed={state.status === 'error'} onRetry={() => void reload()} />;
  }
  return <OperatorDetail carrier={carrier} {...state.data} reload={reload} />;
}

function OperatorDetail({
  carrier,
  context,
  operator,
  units,
  reload,
}: {
  carrier: CarrierContext;
  context: CompanyContext;
  operator: OperatorSummary;
  units: readonly BusinessUnitRef[];
  reload: () => Promise<void>;
}) {
  const router = useRouter();
  const userId = useSession().session?.user.id;
  const confirmSheet = useRef<ConfirmSheetHandle>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const form = useOperatorForm({
    client: carrier.client,
    companyId: carrier.companyId,
    operator,
    onSaved: () => void reload(),
  });

  function confirmArchive() {
    confirmSheet.current?.ask({
      title: copy.archiveConfirmTitle,
      body: copy.archiveConfirmBody,
      confirmLabel: copy.archive,
      cancelLabel: fleetCopy.units.cancel,
      destructive: true,
      onConfirm: async () => {
        try {
          await archiveOperator(carrier.client, operator.id);
          router.back();
        } catch (error) {
          setArchiveError(fleetErrorMessage(error));
        }
      },
    });
  }

  return (
    <Screen belowHeader>
      {form.section}
      {/* The invitation (or the access reset) is the screen's primary action. */}
      <Button
        label={form.save.label}
        variant="secondary"
        onPress={form.save.onPress}
        loading={form.save.loading}
      />
      {operator.profile_id ? (
        <>
          <Notice tone="info">{copy.linked}</Notice>
          {/* A hombre-camión's own row is a manager account: never reset (G2). */}
          {operator.profile_id === userId ? null : (
            <>
              <SectionHeader title={managerCompanyCopy.operators.resetTitle} />
              <Footnote>{managerCompanyCopy.operators.resetDescription}</Footnote>
              <InvitationLinkIssuer
                label={managerCompanyCopy.operators.resetAccess}
                replacesPrevious
                issue={() =>
                  issueInvitation(carrier.client, {
                    kind: 'operator_access_reset',
                    operatorId: operator.id,
                  })
                }
                shareMessage={(link) =>
                  managerCompanyCopy.operators.resetShareMessage(carrier.companyName, link)
                }
              />
            </>
          )}
        </>
      ) : (
        <InvitationSection
          client={carrier.client}
          companyName={carrier.companyName}
          operator={operator}
          onChanged={reload}
        />
      )}
      <SectionHeader title={copy.documentsTitle} />
      <DocumentList
        client={carrier.client}
        context={context}
        owner={{ type: 'operator', id: operator.id }}
        onChanged={reload}
      />
      {carrier.isManager ? (
        <MoveToBusinessUnit
          units={units}
          currentId={operator.businessUnitId}
          move={(unitId) => moveOperator(carrier.client, operator.id, unitId)}
          onMoved={reload}
        />
      ) : null}
      {archiveError ? <Notice tone="danger">{archiveError}</Notice> : null}
      {carrier.isManager ? (
        <Button label={copy.archive} variant="destructive" onPress={confirmArchive} />
      ) : null}
      <ConfirmSheet ref={confirmSheet} />
    </Screen>
  );
}
