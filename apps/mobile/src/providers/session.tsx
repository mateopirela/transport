import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { createAuthActions, type AuthActions } from '../lib/auth';
import { createSupabaseAuthBackend } from '../lib/auth-backend';
import { PROFILE_SELECT, toProfileDetails, type ProfileDetails } from '../lib/profile';
import { registerPushToken } from '../lib/push';
import { createPushTokenSession } from '../lib/push-session';
import { resolveArea, type Area, type SessionSnapshot } from '../lib/routing';
import { pendingInvitation } from '../lib/secure-store';
import { setSentryUser } from '../lib/sentry';
import type { Supabase } from '../lib/supabase';

interface SessionContextValue {
  area: Area;
  session: Session | null;
  profile: ProfileDetails | null;
  actions: AuthActions;
  refreshProfile: () => Promise<void>;
  pushEnabled: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

interface ProfileState {
  userId: string;
  profile: ProfileDetails | null;
  error: boolean;
}

/** Never rejects: any failure shows the "problem" screen with a retry. */
async function loadProfile(client: Supabase, userId: string): Promise<ProfileState> {
  try {
    const { data, error } = await client
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', userId)
      .maybeSingle();
    return {
      userId,
      profile: data ? toProfileDetails(data) : null,
      error: Boolean(error) || !data,
    };
  } catch {
    return { userId, profile: null, error: true };
  }
}

export function SessionProvider({
  client,
  easProjectId,
  children,
}: {
  client: Supabase;
  easProjectId: string | null;
  children: ReactNode;
}) {
  // undefined: the stored session has not been read yet.
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profileState, setProfileState] = useState<ProfileState | null>(null);
  const [pushUserId, setPushUserId] = useState<string | null>(null);
  // This device's push token for the signed-in user (lib/push-session.ts).
  const pushSession = useMemo(
    () =>
      createPushTokenSession({
        async register(token, platform, signal) {
          const { error } = await client
            .rpc('register_push_token', { p_token: token, p_platform: platform })
            .abortSignal(signal);
          if (error) throw error;
        },
        async unregister(token, signal) {
          const { error } = await client
            .rpc('unregister_push_token', { p_token: token })
            .abortSignal(signal);
          if (error) throw error;
        },
      }),
    [client],
  );

  useEffect(() => {
    // Emits INITIAL_SESSION first, then every sign-in, refresh and sign-out.
    // No Supabase calls inside the callback (they would deadlock on the auth lock).
    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, [client]);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void loadProfile(client, userId).then((next) => {
      if (!cancelled) setProfileState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [client, userId]);

  const refreshProfile = useCallback(async () => {
    if (userId) setProfileState(await loadProfile(client, userId));
  }, [client, userId]);

  // Ignore a profile that belongs to a previous user (sign-out, account switch).
  const current = profileState && profileState.userId === userId ? profileState : null;
  const profile = current?.profile ?? null;

  const snapshot: SessionSnapshot =
    session === undefined
      ? { status: 'loading' }
      : session === null
        ? { status: 'signed_out' }
        : { status: 'signed_in', profile, profileError: current?.error ?? false };
  const area = resolveArea(snapshot);

  // Errors are tagged with the user id and role only (B25).
  const role = profile?.role ?? null;
  useEffect(() => {
    setSentryUser(userId && role ? { id: userId, role } : null);
  }, [userId, role]);

  // Push token once per signed-in user, after they reach their area. It is
  // saved in `push_tokens` (register_push_token, B07) so the dispatcher (B09)
  // can send the trip assignment and other notices to this device.
  useEffect(() => {
    if (!userId || (area !== 'carrier' && area !== 'operator')) return;
    let cancelled = false;
    void registerPushToken(easProjectId, pushSession.sink()).then((result) => {
      if (!cancelled && result.status === 'registered') setPushUserId(userId);
    });
    return () => {
      cancelled = true;
    };
  }, [area, userId, easProjectId, pushSession]);

  const actions = useMemo<AuthActions>(() => {
    const auth = createAuthActions(createSupabaseAuthBackend(client), pendingInvitation, {
      redirectTo: Linking.createURL('/auth/callback'),
    });
    return {
      ...auth,
      // This device stops receiving the user's notifications before the
      // session ends (the RPC needs it). Bounded: requests abort after 5 s.
      async signOut() {
        await pushSession.end();
        await auth.signOut();
      },
    };
  }, [client, pushSession]);

  const value = useMemo<SessionContextValue>(
    () => ({
      area,
      session: session ?? null,
      profile,
      actions,
      refreshProfile,
      pushEnabled: pushUserId !== null && pushUserId === userId,
    }),
    [area, session, profile, actions, refreshProfile, pushUserId, userId],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
