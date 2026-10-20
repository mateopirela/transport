import { fleetCopy, formatDate, managerCompanyCopy } from '@transport/shared';
import { Stack, useRouter } from 'expo-router';

import { StatusRow } from '../../components/status-row';
import {
  Button,
  Group,
  LoadError,
  Screen,
  Skeleton,
  TextCell,
  type PillTone,
} from '../../components/ui';
import { listOperators, type OperatorSummary } from '../../lib/fleet-api';
import { useCarrierData, type CarrierContext } from '../../lib/use-carrier';

const copy = fleetCopy.operators;

const loadOperators = ({ client, companyId }: CarrierContext) => listOperators(client, companyId);

/** Whether the operator already uses the app, was invited or not yet. */
function operatorPill(operator: OperatorSummary): { label: string; tone: PillTone } {
  if (operator.profile_id) return { label: copy.linked, tone: 'ok' };
  if (operator.invitation) {
    return { label: copy.invited(formatDate(operator.invitation.expires_at)), tone: 'accent' };
  }
  return { label: copy.notInvited, tone: 'neutral' };
}

/**
 * The carrier's operators and whether they already use the app (B18, D15).
 * The Gerente and the Coordinador invite new operators by link (G4) or
 * register a row first and invite it from its screen.
 */
export default function Operators() {
  const router = useRouter();
  const { state, reload } = useCarrierData(loadOperators);
  return (
    <Screen belowHeader>
      <Stack.Screen options={{ title: copy.title }} />
      <Button
        label={managerCompanyCopy.operators.invite}
        icon="link"
        onPress={() => router.push('/invite-operator')}
      />
      <Button
        label={copy.add}
        variant="secondary"
        icon="add"
        onPress={() => router.push('/operator/new')}
      />
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
  );
}
