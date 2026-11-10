import { adminSettingsCopy, freightInvoicesCopy } from '@transport/shared';
import type { Metadata } from 'next';

import {
  FulmisSettingsForms,
  SupportSettingsForms,
} from '@/components/admin/support-settings-forms';
import { PageSection } from '@/components/page-section';
import { PageHeader } from '@/components/ui/page-header';
import { loadFulmisFiscalData } from '@/lib/freight/invoices';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { loadSupportSettings } from '@/lib/support/queries';

const c = adminSettingsCopy;

export const metadata: Metadata = { title: c.title };

/**
 * Admin: platform settings (I2). For now the pilot's support (D41): JP's
 * WhatsApp and the hours under "Ayuda"; and (I5) Fulmis' fiscal data, with
 * which the CFDI of the freight are validated. The subscription's settings
 * stay in Suscripciones (H3). Every change is an RPC that checks the admin
 * and is audited.
 */
export default async function AdminSettingsPage() {
  await requireAccess(paths.adminSettings);
  const supabase = await createClient();
  const [support, fulmis] = await Promise.all([
    loadSupportSettings(),
    supabase
      ? loadFulmisFiscalData(supabase)
      : { rfc: null, legalName: null, taxRegime: null, zip: null },
  ]);
  return (
    <>
      <PageHeader title={c.title} description={c.description} />
      <div className="max-w-3xl space-y-14">
        <PageSection title={c.sections.support} description={c.supportHelp}>
          <div className="rounded-2xl border bg-cell p-5">
            <SupportSettingsForms whatsapp={support.whatsapp} hours={support.hours} />
          </div>
        </PageSection>
        <PageSection
          title={freightInvoicesCopy.settings.section}
          description={freightInvoicesCopy.settings.help}
        >
          <div className="rounded-2xl border bg-cell p-5">
            <FulmisSettingsForms fulmis={fulmis} />
          </div>
        </PageSection>
      </div>
    </>
  );
}
