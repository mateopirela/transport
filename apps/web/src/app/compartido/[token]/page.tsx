import { shareLinksCopy, sharedTripRefreshMs } from '@transport/shared';
import type { Metadata } from 'next';

import {
  PublicShell,
  SharedLoad,
  SharedTrip,
  ShareUnavailable,
} from '@/components/share/public-share';
import { AutoRefresh } from '@/components/trips/auto-refresh';
import { fetchPublicShare } from '@/lib/share-links/public';

// The token is the only credential: never indexed, never cached (the
// Referrer-Policy and X-Robots-Tag headers come from next.config.ts).
export const metadata: Metadata = {
  title: shareLinksCopy.public.title.trip,
  robots: { index: false, follow: false, noarchive: true, nocache: true },
};
export const dynamic = 'force-dynamic';

/**
 * Public read-only view of a shared load or trip tracking (G7, D23). No
 * session is read: the anon client calls the sanitized RPCs with the token.
 * The tracking reloads itself every minute while the trip can still change.
 */
export default async function SharedPage({ params }: PageProps<'/compartido/[token]'>) {
  const { token } = await params;
  const share = await fetchPublicShare(token);
  const refreshMs = share?.kind === 'trip' ? sharedTripRefreshMs(share.data.status) : null;
  return (
    <PublicShell>
      {refreshMs !== null && <AutoRefresh intervalMs={refreshMs} />}
      {!share && <ShareUnavailable />}
      {share?.kind === 'trip' && <SharedTrip data={share.data} />}
      {share?.kind === 'load' && <SharedLoad data={share.data} />}
    </PublicShell>
  );
}
