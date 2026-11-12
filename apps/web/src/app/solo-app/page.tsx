import { appShareLink, isShareToken, shareLinksCopy, shellCopy } from '@transport/shared';
import { Smartphone } from 'lucide-react';
import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { buttonVariants } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { MOBILE_ONLY_SHARE_PARAM, paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

const c = shellCopy.mobileOnly;

export const metadata: Metadata = { title: c.title };

/**
 * Operators work from the mobile app (D06; the carrier staff has the web since
 * G10a, D06-E1). An operator who opened a team link on the web (G7) lands here
 * with its token and gets the app's deep link to the same shared load: the
 * only action of the screen, so its primary.
 */
export default async function MobileOnlyPage({ searchParams }: PageProps<'/solo-app'>) {
  const viewer = await requireAccess(paths.mobileOnly);
  const shared = (await searchParams)[MOBILE_ONLY_SHARE_PARAM];
  const token = typeof shared === 'string' && isShareToken(shared) ? shared : null;
  return (
    <AppShell viewer={viewer}>
      <div className="mx-auto max-w-lg border bg-cell sm:mt-8">
        <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-surface-high text-text">
            <Smartphone aria-hidden className="size-6" />
          </span>
          <div className="space-y-2">
            <h1 className="text-title2 text-text">{c.title}</h1>
            <p className="text-callout text-text-dim">{c.description}</p>
          </div>
        </div>
        {token && (
          <div className="space-y-4 border-t px-6 py-6">
            <Notice tone="info">{shareLinksCopy.internal.operatorHandoff}</Notice>
            <a
              href={appShareLink(token)}
              className={buttonVariants({ variant: 'primary', size: 'lg', className: 'w-full' })}
            >
              {shareLinksCopy.internal.openInApp}
            </a>
          </div>
        )}
      </div>
    </AppShell>
  );
}
