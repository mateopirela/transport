import { appShareLink, isShareToken, shareLinksCopy, shellCopy } from '@transport/shared';
import type { Metadata } from 'next';

import { AppShell, PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { buttonVariants } from '@/components/ui/button';
import { MOBILE_ONLY_SHARE_PARAM, paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

const c = shellCopy.mobileOnly;

export const metadata: Metadata = { title: c.title };

/**
 * Operators work from the mobile app (D06; the carrier staff has the web since
 * G10a, D06-E1). An operator who opened a team link on the web (G7) lands here
 * with its token and gets the app's deep link to the same shared load.
 */
export default async function MobileOnlyPage({ searchParams }: PageProps<'/solo-app'>) {
  const viewer = await requireAccess(paths.mobileOnly);
  const shared = (await searchParams)[MOBILE_ONLY_SHARE_PARAM];
  const token = typeof shared === 'string' && isShareToken(shared) ? shared : null;
  return (
    <AppShell viewer={viewer}>
      <div className="mx-auto max-w-2xl space-y-4">
        <PageHeading title={c.title} description={c.description} />
        {token && (
          <Notice tone="info">
            <span className="flex flex-wrap items-center justify-between gap-3">
              {shareLinksCopy.internal.operatorHandoff}
              <a href={appShareLink(token)} className={buttonVariants({ variant: 'accent' })}>
                {shareLinksCopy.internal.openInApp}
              </a>
            </span>
          </Notice>
        )}
      </div>
    </AppShell>
  );
}
