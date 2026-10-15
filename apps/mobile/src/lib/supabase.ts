import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@transport/shared';
import { AppState, Platform } from 'react-native';

import { readMobileEnv } from './env';
import { sessionStorage } from './secure-store';

// EXPO_PUBLIC_* values are inlined at build time, so each one is read with a
// static `process.env.NAME` access.
export const envResult = readMobileEnv(
  {
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_EAS_PROJECT_ID: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
  },
  { allowInsecureLocal: __DEV__ },
);

export type Supabase = SupabaseClient<Database>;

function createSupabase(): Supabase | null {
  if (!envResult.ok) {
    console.warn(`[config] ${envResult.problems.join('; ')}`);
    return null;
  }
  return createClient<Database>(envResult.env.supabaseUrl, envResult.env.supabaseAnonKey, {
    auth: {
      storage: sessionStorage,
      persistSession: true,
      autoRefreshToken: true,
      // Deep links are handled explicitly (app/auth/callback.tsx), PKCE only.
      detectSessionInUrl: false,
      flowType: 'pkce',
      lock: processLock,
    },
  });
}

/** Null when the public configuration is missing (the app shows a notice). */
export const supabase = createSupabase();

// Refresh tokens only while the app is in the foreground (Supabase guidance
// for React Native: timers do not run reliably in the background).
if (supabase && Platform.OS !== 'web') {
  const { auth } = supabase;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void auth.startAutoRefresh();
    else void auth.stopAutoRefresh();
  });
}
