import {
  adminBillingCopy,
  billingCopy,
  formatDate,
  planPriceLabel,
  subscriptionStatusLabels,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import {
  EnforcementForm,
  PilotEndForm,
  PilotModeForm,
  PlanForm,
} from '@/components/billing/admin-billing-forms';
import { PageSection, textLink } from '@/components/page-section';
import { Empty } from '@/components/ui/empty';
import { Group } from '@/components/ui/group';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { Table } from '@/components/ui/table';
import { loadBillingSettings, loadCompanySubscriptions, loadPlans } from '@/lib/billing/queries';
import { adminCompanyPath, paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { subscriptionStatusTone } from '@/lib/status-tones';
import { createClient } from '@/lib/supabase/server';

const c = adminBillingCopy;

export const metadata: Metadata = { title: c.title };

/**
 * Admin: the subscription (H3, D30). The pilot flag, its end date (only for
 * the notices) and the mode without a subscription after the pilot (block
 * asks first); the plans (price "Por definir" until set); and each carrier's
 * state. Every change is an RPC that checks the admin and is audited.
 */
export default async function AdminSubscriptionsPage() {
  await requireAccess(paths.adminSubscriptions);
  const supabase = await createClient();
  if (!supabase) return <PageHeader title={c.title} />;
  const [settings, plans, companies] = await Promise.all([
    loadBillingSettings(supabase),
    loadPlans(supabase),
    loadCompanySubscriptions(supabase),
  ]);

  return (
    <>
      <PageHeader
        title={c.title}
        description={c.description}
        status={
          <Pill tone={settings.pilotMode ? 'accent' : 'neutral'} data-testid="pilot-mode">
            {settings.pilotMode ? c.pilotOn : c.pilotOff}
          </Pill>
        }
      />
      <div className="max-w-4xl space-y-14">
        <PageSection title={c.sections.pilot} description={c.pilotModeHelp}>
          <div className="space-y-6 rounded-2xl border bg-cell p-5">
            <PilotModeForm pilotMode={settings.pilotMode} />
            <PilotEndForm pilotEndsAt={settings.pilotEndsAt} />
          </div>
        </PageSection>

        <PageSection title={c.sections.enforcement}>
          <div className="rounded-2xl border bg-cell p-5">
            <EnforcementForm enforcement={settings.enforcement} />
          </div>
        </PageSection>

        <PageSection title={c.sections.plans}>
          <Table headers={[c.columns.plan, c.columns.audience, c.columns.price, c.columns.active]}>
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td className="font-semibold">{plan.name}</td>
                <td className="text-text-dim">{c.audience[plan.audience]}</td>
                <td className="tabular-nums">
                  {planPriceLabel(plan.amount_cents, plan.billing_interval)}
                </td>
                <td>{plan.active ? c.yes : c.no}</td>
              </tr>
            ))}
          </Table>
          <Group>
            {plans.map((plan) => (
              <PlanForm key={plan.id} plan={plan} />
            ))}
          </Group>
        </PageSection>

        <PageSection title={c.sections.companies}>
          {companies.length === 0 ? (
            <Empty title={c.noCompanies} />
          ) : (
            <Table
              headers={[c.columns.company, c.columns.status, c.columns.plan, c.columns.periodEnd]}
            >
              {companies.map((row) => {
                const effective = settings.pilotMode ? 'pilot_free' : row.status;
                return (
                  <tr key={row.companyId}>
                    <td>
                      <Link href={adminCompanyPath(row.companyId)} className={textLink}>
                        {row.legalName}
                      </Link>
                      {row.isOwnerOperator && (
                        <span className="ml-2 text-footnote text-text-dim">
                          {c.audience.owner_operator}
                        </span>
                      )}
                    </td>
                    <td>
                      <Pill tone={subscriptionStatusTone(effective)}>
                        {subscriptionStatusLabels[effective]}
                      </Pill>
                      {settings.pilotMode && row.status !== 'none' && (
                        <span className="ml-2 text-footnote text-text-dim">
                          {c.columns.stored}: {subscriptionStatusLabels[row.status]}
                        </span>
                      )}
                    </td>
                    <td className="text-text-dim">{row.planName ?? '—'}</td>
                    <td className="text-text-dim tabular-nums">
                      {row.currentPeriodEnd ? formatDate(row.currentPeriodEnd) : '—'}
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
          <p className="px-1 text-footnote text-text-dim">{billingCopy.pilotBody}</p>
        </PageSection>
      </div>
    </>
  );
}
