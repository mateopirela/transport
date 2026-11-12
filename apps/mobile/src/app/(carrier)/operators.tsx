import { documentGateCopy, fleetCopy, formatDate, managerCompanyCopy } from '@transport/shared';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import { StatusRow } from '../../components/status-row';
import {
  BottomBar,
  Group,
  LoadError,
  Screen,
  Skeleton,
  TextCell,
  type PillTone,
} from '../../components/ui';
import {
  listOperators,
  loadCompanyContext,
  ownerDocumentIssue,
  type OperatorSummary,
} from '../../lib/fleet-api';
import { useCarrierData, type CarrierContext } from '../../lib/use-carrier';

const copy = fleetCopy.operators;

/** The operators with what their documents block (R4, D45). */
async function loadOperators({ client, companyId }: CarrierContext) {
  const [context, operators] = await Promise.all([
    loadCompanyContext(client, companyId),
    listOperators(client, companyId),
  ]);
  return operators.map((operator) => ({
    ...operator,
    documentIssue: ownerDocumentIssue(
      context,
      { type: 'operator', id: operator.id },
      operator.full_name,
    ),
  }));
}

/** Whether the operator already uses the app, was invited or not yet. */
function operatorPill(operator: OperatorSummary): { label: string; tone: PillTone } {
  if (operator.profile_id) return { label: copy.linked, tone: 'done' };
  if (operator.invitation) {
    return { label: copy.invited(formatDate(operator.invitation.expires_at)), tone: 'pending' };
  }
  return { label: copy.notInvited, tone: 'inactive' };
}

/**
 * The carrier's operators and whether they already use the app (B18, D15).
 * The Gerente and the Coordinador invite new operators by link (G4), the
 * screen's primary fixed at the bottom, or register a row first and invite it
 * from its screen.
 */
export default function Operators() {
  const router = useRouter();
  const { state, reload } = useCarrierData(loadOperators);
  const [barHeight, setBarHeight] = useState(0);
  return (
    <>
      <Screen belowHeader bottom={barHeight}>
        <Stack.Screen options={{ title: copy.title }} />
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
            {state.data.map((operator) => (
              <StatusRow
                key={operator.id}
                title={operator.full_name}
                lines={[
                  operator.phone ?? operator.email,
                  operator.businessUnitName
                    ? fleetCopy.businessUnit(operator.businessUnitName)
                    : null,
                  // R4 (D45): whether the documents let them travel and, if not, why.
                  operator.documentIssue
                    ? `${documentGateCopy.fleet.cannotTravel}. ${operator.documentIssue}`
                    : documentGateCopy.fleet.canTravel,
                ]}
                pill={operatorPill(operator)}
                onPress={() =>
                  router.push({ pathname: '/operator/[id]', params: { id: operator.id } })
                }
              />
            ))}
          </Group>
        )}
      </Screen>
      <BottomBar
        action={{
          label: managerCompanyCopy.operators.invite,
          onPress: () => router.push('/invite-operator'),
        }}
        secondary={{ label: copy.add, onPress: () => router.push('/operator/new') }}
        onHeight={setBarHeight}
      />
    </>
  );
}
