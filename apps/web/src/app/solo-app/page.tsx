import { shellCopy } from '@transport/shared';
import type { Metadata } from 'next';

import { AppShell, PageHeading } from '@/components/app-shell';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

const c = shellCopy.mobileOnly;

export const metadata: Metadata = { title: c.title };

/** Carriers and operators work from the mobile app (D06). */
export default async function MobileOnlyPage() {
  const viewer = await requireAccess(paths.mobileOnly);
  return (
    <AppShell viewer={viewer}>
      <div className="mx-auto max-w-2xl">
        <PageHeading title={c.title} description={c.description} />
      </div>
    </AppShell>
  );
}
