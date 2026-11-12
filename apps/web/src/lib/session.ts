import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { resolveRoute } from './routing';
import { ACTIVITY_COOKIE, signInAfterSessionEnd, viewerSessionEnd } from './session-limits';
import { createClient } from './supabase/server';
import { loadViewer, type ViewerDetails } from './viewer';

/** The current user, loaded once per request. */
export const getViewer = cache(async (): Promise<ViewerDetails | null> => {
  const supabase = await createClient();
  return supabase ? loadViewer(supabase) : null;
});

/**
 * Authoritative access check for a protected area, used by its layout or page.
 * The proxy already redirects optimistically; this runs on every render. It
 * also refuses a session past its limits (D46: the proxy signs it out when
 * the sign-in page loads) and an admin without the second factor (aal2).
 */
export async function requireAccess(pathname: string): Promise<ViewerDetails> {
  const viewer = await getViewer();
  if (viewer) {
    const activity = (await cookies()).get(ACTIVITY_COOKIE)?.value;
    const end = viewerSessionEnd(viewer, activity, Date.now());
    if (end) redirect(signInAfterSessionEnd(end, pathname));
  }
  const target = resolveRoute(pathname, viewer);
  if (target) redirect(target);
  if (!viewer) redirect('/login');
  return viewer;
}
