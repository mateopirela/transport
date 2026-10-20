import { appShareLink, isShareToken, shareLinksCopy, shellCopy } from '@transport/shared';
import { Smartphone } from 'lucide-react';
import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { buttonVariants } from '@/components/ui/button';
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
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border bg-cell px-6 py-12 text-center sm:mt-8">
        <span className="flex size-12 items-center justify-center rounded-full bg-surface-high text-text-dim">
          <Smartphone aria-hidden className="size-6" />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-title2 text-text">{c.title}</h1>
          <p className="text-callout text-text-dim">{c.description}</p>
        </div>
        {token && (
          <div className="mt-2 w-full space-y-4 rounded-2xl bg-highlight px-4 py-4">
            <p className="text-subhead text-text" role="status">
              {shareLinksCopy.internal.operatorHandoff}
            </p>
            <a
              href={appShareLink(token)}
              className={buttonVariants({ variant: 'primary', className: 'w-full' })}
            >
              {shareLinksCopy.internal.openInApp}
            </a>
          </div>
        )}
      </div>
    </AppShell>
  );
}
