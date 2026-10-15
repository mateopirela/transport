import { fleetCopy } from '@transport/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { DocumentList } from '../../../components/document-list';
import { Loaded, SectionTitle } from '../../../components/fleet-ui';
import { InvitationSection } from '../../../components/invitation-section';
import { OperatorForm } from '../../../components/operator-form';
import { Button, Notice, Screen } from '../../../components/ui';
import { archiveOperator, listOperators, loadCompanyContext } from '../../../lib/fleet-api';
import { fleetErrorMessage } from '../../../lib/fleet-errors';
import { useCarrier, useCarrierData, type CarrierContext } from '../../../lib/use-carrier';

const copy = fleetCopy.operators;

/** Registers an operator (`/operator/new`) or shows one: data, invitation and documents (B18). */
export default function OperatorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  return (
    <Screen belowHeader>
      <Stack.Screen options={{ title: isNew ? copy.newTitle : copy.editTitle }} />
      {isNew ? <NewOperator /> : <ExistingOperator id={id} />}
    </Screen>
  );
}

function NewOperator() {
  const carrier = useCarrier();
  const router = useRouter();
  if (!carrier) return null;
  return (
    <OperatorForm
      client={carrier.client}
      companyId={carrier.companyId}
      operator={null}
      onSaved={(id) => router.replace({ pathname: '/operator/[id]', params: { id } })}
    />
  );
}

function ExistingOperator({ id }: { id: string }) {
  const router = useRouter();
  const load = useCallback(
    async ({ client, companyId }: CarrierContext) => {
      const [context, operators] = await Promise.all([
        loadCompanyContext(client, companyId),
        listOperators(client, companyId),
      ]);
      const operator = operators.find((o) => o.id === id);
      if (!operator) throw new Error('operator not found');
      return { context, operator };
    },
    [id],
  );
  const { carrier, state, reload } = useCarrierData(load);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  function confirmArchive() {
    if (!carrier) return;
    Alert.alert(copy.archiveConfirmTitle, copy.archiveConfirmBody, [
      { text: fleetCopy.units.cancel, style: 'cancel' },
      {
        text: copy.archive,
        style: 'destructive',
        onPress: () => {
          archiveOperator(carrier.client, id).then(
            () => router.back(),
            (error: unknown) => setArchiveError(fleetErrorMessage(error)),
          );
        },
      },
    ]);
  }

  return (
    <Loaded state={state} onRetry={() => void reload()}>
      {({ context, operator }) =>
        carrier ? (
          <>
            <OperatorForm
              client={carrier.client}
              companyId={carrier.companyId}
              operator={operator}
              onSaved={() => void reload()}
            />
            {operator.profile_id ? (
              <Notice tone="info">{copy.linked}</Notice>
            ) : (
              <InvitationSection
                client={carrier.client}
                companyName={carrier.companyName}
                operatorId={operator.id}
                pending={operator.invitation}
                onChanged={reload}
              />
            )}
            <SectionTitle>{copy.documentsTitle}</SectionTitle>
            <DocumentList
              client={carrier.client}
              context={context}
              owner={{ type: 'operator', id: operator.id }}
              onChanged={reload}
            />
            {archiveError ? <Notice tone="danger">{archiveError}</Notice> : null}
            <Button label={copy.archive} variant="link" onPress={confirmArchive} />
          </>
        ) : null
      }
    </Loaded>
  );
}
