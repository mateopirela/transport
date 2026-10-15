import 'server-only';

import { redirect } from 'next/navigation';
import { cache } from 'react';

import { resolveRoute } from './routing';
import { createClient } from './supabase/server';
import { loadViewer, type ViewerDetails } from './viewer';

/** The current user, loaded once per request. */
export const getViewer = cache(async (): Promise<ViewerDetails | null> => {
  const supabase = await createClient();
  return supabase ? loadViewer(supabase) : null;
});

/**
 * Authoritative access check for a protected area, used by its layout or page.
 * The proxy already redirects optimistically; this runs on every render.
 */
export async function requireAccess(pathname: string): Promise<ViewerDetails> {
  const viewer = await getViewer();
  const target = resolveRoute(pathname, viewer);
  if (target) redirect(target);
  if (!viewer) redirect('/login');
  return viewer;
}
