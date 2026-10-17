import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@transport/shared';

import { supabaseEnv } from '../env';

export type AnonSupabase = SupabaseClient<Database>;

/**
 * Supabase client with the anon key and no session at all: the public share
 * pages (G7) never read cookies, so a visitor's own session (if any) plays no
 * part in what they see. Returns `null` when Supabase is not configured.
 */
export function createAnonClient(): AnonSupabase | null {
  const env = supabaseEnv();
  if (!env) return null;
  return createClient<Database>(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
