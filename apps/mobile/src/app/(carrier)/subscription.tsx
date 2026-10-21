import {
  billingCopy,
  formatDate,
  subscriptionStatusLabels,
  subscriptionStatusTone,
} from '@transport/shared';
import { Stack } from 'expo-router';

import {
  Cell,
  Footnote,
  Group,
  LoadError,
  Notice,
  Screen,
  Skeleton,
  ValueRow,
} from '../../components/ui';
import { loadBillingState } from '../../lib/billing-api';
import { useCarrierData, type CarrierContext } from '../../lib/use-carrier';

const loadState = ({ client }: CarrierContext) => loadBillingState(client);

/**
 * "Más → Suscripción" (H3, D30): the state, the plan and the notices of the
 * company, for the Gerente and the hombre camión. Information only: by the
 * store rules (App Store 3.1.1 and 3.1.3, Google Play), the app does not sell,
 * shows no price to contract and has no button or link to the purchase; it
 * only says that the subscription is managed on the web (docs/tiendas.md).
 */
export default function Subscription() {
  const { state, reload } = useCarrierData(loadState);

  let content;
  if (state.status === 'loading') {
    content = <Skeleton rows={3} />;
  } else if (state.status === 'error') {
    content = <LoadError onRetry={() => void reload()} />;
  } else if (state.data) {
    const s = state.data;
    const pilot = s.effective_status === 'pilot_free';
    content = (
      <>
        <Group>
          <Cell
            title={billingCopy.status}
            pill={{
              label: subscriptionStatusLabels[s.effective_status],
              tone: subscriptionStatusTone(s.effective_status),
            }}
          />
          {s.plan_name ? <ValueRow label={billingCopy.plan} value={s.plan_name} /> : null}
          {pilot ? (
            <ValueRow
              label={billingCopy.pilotEndsAt}
              value={s.pilot_ends_at ? formatDate(s.pilot_ends_at) : billingCopy.pilotEndsAtNone}
            />
          ) : s.current_period_end ? (
            <ValueRow
              label={billingCopy.periodEnd}
              value={
                s.cancel_at_period_end
                  ? billingCopy.cancelsAtPeriodEnd(formatDate(s.current_period_end))
                  : formatDate(s.current_period_end)
              }
            />
          ) : null}
        </Group>
        {pilot ? (
          <Notice tone="highlight" title={billingCopy.pilotTitle}>
            {billingCopy.pilotBody}
          </Notice>
        ) : null}
        {/* Text, never a link or a button (D30). No price to contract is shown. */}
        <Footnote>{billingCopy.appManagedOnWeb}</Footnote>
      </>
    );
  }

  return (
    <Screen belowHeader>
      <Stack.Screen options={{ title: billingCopy.title }} />
      {content}
    </Screen>
  );
}
