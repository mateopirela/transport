import { isShareToken, tripDeepLink, tripLinkCopy } from '@transport/shared';
import type { Metadata } from 'next';

import { AuthCard } from '@/components/auth-card';
import { buttonVariants } from '@/components/ui/button';

const c = tripLinkCopy.public;

// The token is the operator's way into their trip: never indexed, never
// cached (the Referrer-Policy and X-Robots-Tag headers come from next.config.ts).
export const metadata: Metadata = {
  title: c.title,
  robots: { index: false, follow: false, noarchive: true, nocache: true },
};

/**
 * /viaje/[token] (H2, D29): the web side of the trip link the coordinator
 * sends the operator. It never looks the token up and shows nothing of the
 * trip: only "Abrir en la app" (the deep link with the same token), the store
 * buttons when they are configured, and that the app asks for the phone and
 * password. With the universal links set up (/.well-known), the phone opens
 * the app directly and this page is only the fallback.
 */
export default async function TripLinkPage({ params }: PageProps<'/viaje/[token]'>) {
  const { token } = await params;
  const appLink = isShareToken(token) ? tripDeepLink(token) : null;
  const iosUrl = storeUrl(process.env.NEXT_PUBLIC_IOS_APP_URL);
  const androidUrl = storeUrl(process.env.NEXT_PUBLIC_ANDROID_APP_URL);
  return (
    <AuthCard title={c.title} description={c.description}>
      {appLink && (
        <a href={appLink} className={buttonVariants({ variant: 'primary', className: 'w-full' })}>
          {c.openInApp}
        </a>
      )}
      {(iosUrl || androidUrl) && (
        <div className="space-y-2">
          <p className="text-subhead text-text-dim">{c.noApp}</p>
          <div className="flex flex-wrap gap-2">
            {iosUrl && (
              <a
                href={iosUrl}
                rel="noreferrer"
                className={buttonVariants({ variant: 'secondary', className: 'flex-1' })}
              >
                {c.appStore}
              </a>
            )}
            {androidUrl && (
              <a
                href={androidUrl}
                rel="noreferrer"
                className={buttonVariants({ variant: 'secondary', className: 'flex-1' })}
              >
                {c.googlePlay}
              </a>
            )}
          </div>
        </div>
      )}
      <p className="text-footnote text-text-dim">{c.signIn}</p>
    </AuthCard>
  );
}

/** A store URL from the environment, only when it is https. */
function storeUrl(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).protocol === 'https:' ? raw : null;
  } catch {
    return null;
  }
}
