import {
  adminBillingCopy,
  adminPanelCopy,
  billingCopy,
  formatDate,
  planPriceLabel,
  subscriptionStatusLabels,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageSection, textLink } from '@/components/page-section';
import { buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { loadBillingSettings, loadCompanySubscriptions, loadPlans } from '@/lib/billing/queries';
import { adminCompanyPath, paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { subscriptionStatusTone } from '@/lib/status-tones';
import { createClient } from '@/lib/supabase/server';

const c = adminBillingCopy;
const p = adminPanelCopy.subscriptions;

export const metadata: Metadata = { title: c.title };

/** Where the subscription's settings live now: the "Suscripción" section of Ajustes. */
const SETTINGS = `${paths.adminSettings}#suscripcion`;

/**
 * Admin: the subscription (H3, D30) as a list. Whether the pilot is on, each
 * carrier's state and the plans; the pilot, its mode and the plans are
 * changed in Ajustes, with every other setting of the platform.
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
        description={p.description}
        status={
          <Pill tone={settings.pilotMode ? 'progress' : 'inactive'} data-testid="pilot-mode">
            {settings.pilotMode ? c.pilotOn : c.pilotOff}
          </Pill>
        }
        action={
          <Link href={SETTINGS} className={buttonVariants({ variant: 'secondary' })}>
            {p.settingsLink}
          </Link>
        }
      />
      <div className="space-y-12">
        <PageSection title={c.sections.companies} description={billingCopy.pilotBody}>
          {companies.length === 0 ? (
            <Empty title={c.noCompanies} />
          ) : (
            <Table
              cards
              headers={[c.columns.company, c.columns.status, c.columns.plan, c.columns.periodEnd]}
            >
              {companies.map((row) => {
                const effective = settings.pilotMode ? 'pilot_free' : row.status;
                return (
                  <TableRow key={row.companyId}>
                    <TableCell primary>
                      <Link href={adminCompanyPath(row.companyId)} className={textLink}>
                        {row.legalName}
                      </Link>
                      {row.isOwnerOperator && (
                        <span className="ml-2 text-footnote font-normal text-text-dim">
                          {c.audience.owner_operator}
                        </span>
                      )}
                    </TableCell>
                    <TableCell label={c.columns.status}>
                      <Pill tone={subscriptionStatusTone(effective)}>
                        {subscriptionStatusLabels[effective]}
                      </Pill>
                      {settings.pilotMode && row.status !== 'none' && (
                        <span className="ml-2 text-footnote text-text-dim">
                          {c.columns.stored}: {subscriptionStatusLabels[row.status]}
                        </span>
                      )}
                    </TableCell>
                    <TableCell label={c.columns.plan} className="text-text-dim">
                      {row.planName ?? '—'}
                    </TableCell>
                    <TableCell label={c.columns.periodEnd} className="text-text-dim tabular-nums">
                      {row.currentPeriodEnd ? formatDate(row.currentPeriodEnd) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </Table>
          )}
        </PageSection>

        <PageSection
          title={c.sections.plans}
          action={
            <Link href={SETTINGS} className={textLink}>
              {p.settingsLink}
            </Link>
          }
        >
          <Table
            cards
            headers={[c.columns.plan, c.columns.audience, c.columns.price, c.columns.active]}
          >
            {plans.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell primary>{plan.name}</TableCell>
                <TableCell label={c.columns.audience} className="text-text-dim">
                  {c.audience[plan.audience]}
                </TableCell>
                <TableCell label={c.columns.price} className="tabular-nums">
                  {planPriceLabel(plan.amount_cents, plan.billing_interval)}
                </TableCell>
                <TableCell label={c.columns.active}>
                  <Pill tone={plan.active ? 'done' : 'inactive'}>{plan.active ? c.yes : c.no}</Pill>
                </TableCell>
              </TableRow>
            ))}
          </Table>
        </PageSection>
      </div>
    </>
  );
}
