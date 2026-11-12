import {
  adminBillingCopy,
  adminPanelCopy,
  adminSettingsCopy,
  centsToPesosInput,
  freightCopy,
  freightInvoicesCopy,
  quickPayCopy,
} from '@transport/shared';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import {
  FulmisSettingsForms,
  SupportSettingsForms,
} from '@/components/admin/support-settings-forms';
import { QuickPaySettingsForm } from '@/components/admin/quick-pay-forms';
import {
  EnforcementForm,
  PilotEndForm,
  PilotModeForm,
  PlanForm,
} from '@/components/billing/admin-billing-forms';
import { CommissionSettingForm } from '@/components/freight/admin-freight-forms';
import { PageSection } from '@/components/page-section';
import { Group } from '@/components/ui/group';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { loadBillingSettings, loadPlans } from '@/lib/billing/queries';
import { loadFulmisFiscalData } from '@/lib/freight/invoices';
import { loadCommissionSetting, loadQuickPayAdmin } from '@/lib/freight/queries';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { loadSupportSettings } from '@/lib/support/queries';

const c = adminSettingsCopy;
const s = adminPanelCopy.settings;
const b = adminBillingCopy;

export const metadata: Metadata = { title: c.title };

/** The sections of the page, in order, with their anchors. */
const SECTIONS = [
  { id: 'soporte', title: c.sections.support },
  { id: 'datos-fiscales', title: s.fiscal },
  { id: 'comision', title: s.commission },
  { id: 'pago-rapido', title: s.quickPay },
  { id: 'suscripcion', title: s.subscription },
] as const;

/** One section of the settings: its anchor, its title and line, and its forms in a cell. */
function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PageSection id={id} title={title} description={description}>
      <div className="space-y-6 border bg-cell p-5">{children}</div>
    </PageSection>
  );
}

/**
 * Admin: every setting of the platform in one page with sections
 * (docs/plan-fulmis.md §2 V5). The pilot's support (I2, D41); Fulmis' fiscal
 * data (I5), with which the CFDI of the freight are validated; the general
 * commission (I3); the quick pay fee and limit (I4); and the subscription's
 * pilot, mode and plans (H3). Every change that moves money asks first, and
 * every change is an RPC that checks the admin and is audited.
 */
export default async function AdminSettingsPage() {
  await requireAccess(paths.adminSettings);
  const supabase = await createClient();
  const [support, fulmis, commissionBps, quickPay, billing, plans] = await Promise.all([
    loadSupportSettings(),
    supabase
      ? loadFulmisFiscalData(supabase)
      : { rfc: null, legalName: null, taxRegime: null, zip: null },
    supabase ? loadCommissionSetting(supabase) : null,
    supabase ? loadQuickPayAdmin(supabase) : null,
    supabase ? loadBillingSettings(supabase) : null,
    supabase ? loadPlans(supabase) : [],
  ]);
  return (
    <>
      <PageHeader title={c.title} description={s.description} />
      <div className="grid gap-10 lg:grid-cols-[11rem_minmax(0,1fr)] lg:items-start">
        <nav aria-label={s.sectionsLabel} className="lg:sticky lg:top-6">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 lg:flex-col">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="rounded-sm text-subhead text-text-dim hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="max-w-3xl min-w-0 space-y-12">
          <SettingsSection id="soporte" title={c.sections.support} description={c.supportHelp}>
            <SupportSettingsForms whatsapp={support.whatsapp} hours={support.hours} />
          </SettingsSection>

          <SettingsSection
            id="datos-fiscales"
            title={freightInvoicesCopy.settings.section}
            description={freightInvoicesCopy.settings.help}
          >
            <FulmisSettingsForms fulmis={fulmis} />
          </SettingsSection>

          <SettingsSection
            id="comision"
            title={freightCopy.admin.settings}
            description={s.commissionHelp}
          >
            <CommissionSettingForm commissionBps={commissionBps} />
          </SettingsSection>

          {quickPay && (
            <SettingsSection
              id="pago-rapido"
              title={quickPayCopy.admin.settings}
              description={s.quickPayHelp}
            >
              <QuickPaySettingsForm
                feeBps={quickPay.feeBps}
                limitPesos={
                  quickPay.limitCents === null ? '' : centsToPesosInput(quickPay.limitCents)
                }
              />
            </SettingsSection>
          )}

          {billing && (
            <PageSection id="suscripcion" title={s.subscription} description={s.subscriptionHelp}>
              <div className="space-y-6 border bg-cell p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-headline text-text">{b.sections.pilot}</h3>
                    <p className="text-footnote text-text-dim">{b.pilotModeHelp}</p>
                  </div>
                  <Pill tone={billing.pilotMode ? 'progress' : 'inactive'}>
                    {billing.pilotMode ? b.pilotOn : b.pilotOff}
                  </Pill>
                </div>
                <PilotModeForm pilotMode={billing.pilotMode} />
                <PilotEndForm pilotEndsAt={billing.pilotEndsAt} />
              </div>
              <div className="space-y-4 border bg-cell p-5">
                <h3 className="text-headline text-text">{b.sections.enforcement}</h3>
                <EnforcementForm enforcement={billing.enforcement} />
              </div>
              <Group label={b.sections.plans}>
                {plans.map((plan) => (
                  <PlanForm key={plan.id} plan={plan} />
                ))}
              </Group>
            </PageSection>
          )}
        </div>
      </div>
    </>
  );
}
