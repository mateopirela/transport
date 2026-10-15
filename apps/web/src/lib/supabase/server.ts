import 'server-only';

import { createServerClient } from '@supabase/ssr';
import type { Database } from '@transport/shared';
import { cookies } from 'next/headers';

import { supabaseEnv } from '../env';
import type { Supabase } from '../viewer';

/**
 * Supabase client for Server Components, Server Actions and Route Handlers,
 * acting as the signed-in user (anon key + the user's JWT from cookies).
 * Returns `null` when Supabase is not configured.
 */
export async function createClient(): Promise<Supabase | null> {
  // Read cookies first: it marks every caller as dynamic, so a protected page
  // is never prerendered, even in a build without Supabase settings.
  const cookieStore = await cookies();
  const env = supabaseEnv();
  if (!env) return null;
  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies; the proxy refreshes the session.
        }
      },
    },
  });
}
