import {
  billingCopy,
  formatDate,
  isPlanOffered,
  planPriceLabel,
  subscriptionStatusLabels,
} from '@transport/shared';
import type { Metadata } from 'next';

import { CheckoutForm, PortalForm } from '@/components/billing/subscription-forms';
import { FactList } from '@/components/carrier/fact-list';
import { PageSection } from '@/components/page-section';
import { Cell } from '@/components/ui/cell';
import { Group } from '@/components/ui/group';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { loadBillingState, loadPlans } from '@/lib/billing/queries';
import { carrierContext } from '@/lib/carrier/context';
import { paths } from '@/lib/routing';
import { subscriptionStatusTone } from '@/lib/status-tones';

const c = billingCopy;

export const metadata: Metadata = { title: c.title };

/**
 * The subscription of the carrier (H3, D30). During the pilot: "Piloto
 * gratis", its explanation and the plans read-only ("Por definir"). After it,
 * the Gerente subscribes (Stripe Checkout) or manages the payment (Customer
 * Portal) and comes back with ?estado=ok|cancelado. The Coordinador only sees
 * the state. company_billing_state decides what is offered; the Edge
 * Functions check the Gerente again.
 */
export default async function CarrierSubscriptionPage({
  searchParams,
}: PageProps<'/transportista/suscripcion'>) {
  const { supabase, isManager } = await carrierContext(paths.carrierSubscription);
  const [state, plans] = await Promise.all([loadBillingState(supabase), loadPlans(supabase)]);
  const back = (await searchParams).estado;
  if (!state) return <PageHeader title={c.title} />;

  const pilot = state.effective_status === 'pilot_free';
  const canSubscribe = isManager && state.checkout_available;
  const facts: [string, string | null][] = [
    [c.plan, state.plan_name ?? null],
    [c.price, planPriceLabel(state.plan_amount_cents, state.plan_interval)],
    pilot
      ? [c.pilotEndsAt, state.pilot_ends_at ? formatDate(state.pilot_ends_at) : c.pilotEndsAtNone]
      : [
          c.periodEnd,
          state.current_period_end
            ? state.cancel_at_period_end
              ? c.cancelsAtPeriodEnd(formatDate(state.current_period_end))
              : formatDate(state.current_period_end)
            : null,
        ],
  ];

  return (
    <>
      <PageHeader
        title={c.title}
        description={c.description}
        status={
          <Pill
            tone={subscriptionStatusTone(state.effective_status)}
            data-testid="subscription-status"
          >
            {subscriptionStatusLabels[state.effective_status]}
          </Pill>
        }
      />
      <div className="max-w-3xl space-y-10">
        {back === 'ok' && <Notice tone="success">{c.returnOk}</Notice>}
        {back === 'cancelado' && <Notice tone="info">{c.returnCanceled}</Notice>}
        {pilot && (
          <div className="space-y-1 rounded-2xl bg-highlight px-5 py-4">
            <h2 className="text-headline text-text">{c.pilotTitle}</h2>
            <p className="text-subhead text-text-dim">{c.pilotBody}</p>
          </div>
        )}
        {!isManager && <Notice tone="info">{c.coordinatorOnly}</Notice>}

        <PageSection title={c.status}>
          <FactList rows={facts} />
          {isManager && state.has_customer && (
            <div className="pt-2">
              <PortalForm />
            </div>
          )}
        </PageSection>

        {isManager && (
          <PageSection title={c.plans} description={pilot ? c.plansReadOnly : undefined}>
            <Group>
              {plans.map((plan) => (
                <Cell
                  key={plan.id}
                  title={plan.name}
                  subtitle={plan.description ?? undefined}
                  value={planPriceLabel(plan.amount_cents, plan.billing_interval)}
                >
                  {canSubscribe && plan.code === state.plan_code && isPlanOffered(plan) && (
                    <div className="pt-2">
                      <CheckoutForm planCode={plan.code} />
                    </div>
                  )}
                </Cell>
              ))}
            </Group>
          </PageSection>
        )}
      </div>
    </>
  );
}
