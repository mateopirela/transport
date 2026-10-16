import { productEventArgs, type ProductEvent } from '@transport/shared';

import type { Supabase } from './supabase';

// Product events (B25), written by the track_product_event RPC with the
// user's JWT: the server takes the user and company from the session.
// Fire and forget: analytics never blocks nor breaks a screen.

type Rpc = Pick<Supabase, 'rpc'>;

/**
 * Sends one event. Invalid events are dropped before the network (the shared
 * schema mirrors the SQL allowlist); failures only reach `onError`.
 */
export async function trackEvent(
  client: Rpc,
  event: ProductEvent,
  onError: (error: unknown) => void = () => undefined,
): Promise<boolean> {
  const args = productEventArgs(event);
  if (!args) {
    onError(new Error(`invalid product event: ${event.name}`));
    return false;
  }
  try {
    const { error } = await client.rpc('track_product_event', args);
    if (error) throw error;
    return true;
  } catch (error) {
    onError(error);
    return false;
  }
}
