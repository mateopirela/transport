import { createBrowserClient } from '@supabase/ssr';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Database } from '@transport/shared';

import { supabaseEnv } from '../env';

/**
 * Supabase client for Client Components, acting as the signed-in user (anon
 * key + the session cookies). Used for Storage uploads, so large files go
 * straight to Storage instead of through a Server Action, and for Realtime
 * subscriptions (RLS applies to every event). Returns `null` when Supabase
 * is not configured.
 */
export function createBrowserSupabase() {
  const env = supabaseEnv();
  return env ? createBrowserClient<Database>(env.url, env.anonKey) : null;
}

export type BrowserSupabase = NonNullable<ReturnType<typeof createBrowserSupabase>>;

/**
 * Realtime topic unique to one subscription, so a remount (React Strict Mode,
 * navigation) never re-joins a topic that is still closing. RLS, not the
 * topic, decides which rows arrive.
 */
export function channelTopic(name: string): string {
  return `${name}:${crypto.randomUUID()}`;
}

/**
 * Opens a Realtime channel as the signed-in user and returns its cleanup.
 * The session is read from the cookies asynchronously; a channel joined
 * before that would join with the anon key and RLS would reject it, so the
 * user's token is set first.
 */
export function subscribeAsUser(
  supabase: BrowserSupabase,
  open: () => RealtimeChannel,
): () => void {
  let channel: RealtimeChannel | null = null;
  let closed = false;
  supabase.realtime
    .setAuth()
    .then(() => {
      if (!closed) channel = open();
    })
    .catch(() => {
      // Without Realtime the page still works; it only stops updating by itself.
    });
  return () => {
    closed = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
