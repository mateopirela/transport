import { fleetCopy, managerCompanyCopy } from '@transport/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { MoveToBusinessUnit } from '../../../components/business-unit-fields';
import { DocumentList } from '../../../components/document-list';
import { Loaded, SectionTitle } from '../../../components/fleet-ui';
import { InvitationLinkIssuer } from '../../../components/invitation-link';
import { InvitationSection } from '../../../components/invitation-section';
import { OperatorForm } from '../../../components/operator-form';
import { Body, Button, Notice, Screen } from '../../../components/ui';
import { issueInvitation, listOperableBusinessUnits, moveOperator } from '../../../lib/company-api';
import { archiveOperator, listOperators, loadCompanyContext } from '../../../lib/fleet-api';
import { fleetErrorMessage } from '../../../lib/fleet-errors';
import { useCarrierData, type CarrierContext } from '../../../lib/use-carrier';
import { useSession } from '../../../providers/session';

const copy = fleetCopy.operators;

/**
 * Registers an operator (`/operator/new`) or shows one: data, invitation (or
 * access reset, G4), documents and, for the Gerente, move and archive (B18).
 */
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

const loadUnits = ({ client, companyId }: CarrierContext) =>
  listOperableBusinessUnits(client, companyId);

function NewOperator() {
  const router = useRouter();
  const { carrier, state, reload } = useCarrierData(loadUnits);
  return (
    <Loaded state={state} onRetry={() => void reload()}>
      {(units) =>
        carrier ? (
          <OperatorForm
            client={carrier.client}
            companyId={carrier.companyId}
            operator={null}
            businessUnits={units}
            onSaved={(id) => router.replace({ pathname: '/operator/[id]', params: { id } })}
          />
        ) : null
      }
    </Loaded>
  );
}

function ExistingOperator({ id }: { id: string }) {
  const router = useRouter();
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
  const userId = useSession().session?.user.id;
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
      {({ context, operator, units }) =>
        carrier ? (
          <>
            <OperatorForm
              client={carrier.client}
              companyId={carrier.companyId}
              operator={operator}
              onSaved={() => void reload()}
            />
            {operator.profile_id ? (
              <>
                <Notice tone="info">{copy.linked}</Notice>
                {/* A hombre-camión's own row is a manager account: never reset (G2). */}
                {operator.profile_id === userId ? null : (
                  <>
                    <SectionTitle>{managerCompanyCopy.operators.resetTitle}</SectionTitle>
                    <Body>{managerCompanyCopy.operators.resetDescription}</Body>
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
            <SectionTitle>{copy.documentsTitle}</SectionTitle>
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
              <Button label={copy.archive} variant="link" onPress={confirmArchive} />
            ) : null}
          </>
        ) : null
      }
    </Loaded>
  );
}
