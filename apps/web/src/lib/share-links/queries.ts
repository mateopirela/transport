import 'server-only';

import type { ShareLinkKind } from '@transport/shared';

import type { Supabase } from '../viewer';

/** A link as the dialog lists it. The token is never stored, so it cannot be shown again. */
export interface ActiveShareLink {
  id: string;
  kind: ShareLinkKind;
  createdAt: string;
  expiresAt: string;
  viewCount: number;
  lastViewedAt: string | null;
}

/**
 * Active links (not revoked, not expired) of a load or a trip, newest first.
 * RLS already limits them to the viewer's company; the target narrows them
 * to the screen.
 */
export async function listActiveShareLinks(
  supabase: Supabase,
  target: { loadId: string } | { tripId: string },
): Promise<ActiveShareLink[]> {
  let query = supabase
    .from('share_links')
    .select('id, kind, created_at, expires_at, view_count, last_viewed_at')
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString());
  query =
    'loadId' in target ? query.eq('load_id', target.loadId) : query.eq('trip_id', target.tripId);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(`Share links query failed: ${error.message}`);
  return data.map((row) => ({
    id: row.id,
    kind: row.kind,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    viewCount: row.view_count,
    lastViewedAt: row.last_viewed_at,
  }));
}
