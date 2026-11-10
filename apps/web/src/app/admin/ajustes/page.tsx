import { adminSettingsCopy } from '@transport/shared';
import type { Metadata } from 'next';

import { SupportSettingsForms } from '@/components/admin/support-settings-forms';
import { PageSection } from '@/components/page-section';
import { PageHeader } from '@/components/ui/page-header';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { loadSupportSettings } from '@/lib/support/queries';

const c = adminSettingsCopy;

export const metadata: Metadata = { title: c.title };

/**
 * Admin: platform settings (I2). For now the pilot's support (D41): JP's
 * WhatsApp and the hours under "Ayuda". The subscription's settings stay in
 * Suscripciones (H3). Every change is an RPC that checks the admin and is
 * audited.
 */
export default async function AdminSettingsPage() {
  await requireAccess(paths.adminSettings);
  const support = await loadSupportSettings();
  return (
    <>
      <PageHeader title={c.title} description={c.description} />
      <div className="max-w-3xl space-y-14">
        <PageSection title={c.sections.support} description={c.supportHelp}>
          <div className="rounded-2xl border bg-cell p-5">
            <SupportSettingsForms whatsapp={support.whatsapp} hours={support.hours} />
          </div>
        </PageSection>
      </div>
    </>
  );
}
