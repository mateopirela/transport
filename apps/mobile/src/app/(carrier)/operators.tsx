import { fleetCopy, formatDate } from '@transport/shared';
import { Stack, useRouter } from 'expo-router';

import { Badge, Card, Loaded } from '../../components/fleet-ui';
import { Body, Button, Screen } from '../../components/ui';
import { listOperators, type OperatorSummary } from '../../lib/fleet-api';
import { useCarrierData, type CarrierContext } from '../../lib/use-carrier';

const copy = fleetCopy.operators;

const loadOperators = ({ client, companyId }: CarrierContext) => listOperators(client, companyId);

function OperatorBadge({ operator }: { operator: OperatorSummary }) {
  if (operator.profile_id) return <Badge label={copy.linked} tone="success" />;
  if (operator.invitation) {
    return <Badge label={copy.invited(formatDate(operator.invitation.expires_at))} tone="info" />;
  }
  return <Badge label={copy.notInvited} tone="neutral" />;
}

/** The carrier's operators and whether they already use the app (B18, D15). */
export default function Operators() {
  const router = useRouter();
  const { state, reload } = useCarrierData(loadOperators);
  return (
    <Screen belowHeader>
      <Stack.Screen options={{ title: copy.title }} />
      <Button label={copy.add} onPress={() => router.push('/operator/new')} />
      <Loaded state={state} onRetry={() => void reload()}>
        {(operators) =>
          operators.length === 0 ? (
            <Body>{copy.empty}</Body>
          ) : (
            operators.map((operator) => (
              <Card
                key={operator.id}
                title={operator.full_name}
                subtitle={operator.email}
                onPress={() =>
                  router.push({ pathname: '/operator/[id]', params: { id: operator.id } })
                }
              >
                <OperatorBadge operator={operator} />
              </Card>
            ))
          )
        }
      </Loaded>
    </Screen>
  );
}
