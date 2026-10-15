import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@transport/shared';

import { supabaseEnv } from '../env';

/**
 * Supabase client for Client Components, acting as the signed-in user (anon
 * key + the session cookies). Used only for Storage uploads, so large files
 * go straight to Storage instead of through a Server Action. Returns `null`
 * when Supabase is not configured.
 */
export function createBrowserSupabase() {
  const env = supabaseEnv();
  return env ? createBrowserClient<Database>(env.url, env.anonKey) : null;
}
