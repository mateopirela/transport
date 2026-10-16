import { LOCATION_CONSENT_VERSION } from '@transport/shared';
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { stopTripTracking } from './background-location';
import { tripQueueStorage } from './secure-store';
import type { Supabase } from './supabase';

// The operator's consent to share the location during trips (B22). The
// server keeps the record (location_consents, record_location_consent) and
// refuses points without it; the phone keeps a copy so an offline restart
// mid-trip keeps tracking.

export interface ConsentState {
  userId: string | null;
  /** loading: not read yet; given: active consent to the current text. */
  status: 'loading' | 'given' | 'missing';
  acceptedAt: string | null;
}

interface StoredConsent {
  version: string;
  acceptedAt: string;
}

const EMPTY: ConsentState = { userId: null, status: 'loading', acceptedAt: null };

let state: ConsentState = EMPTY;
const listeners = new Set<() => void>();
function setState(next: ConsentState) {
  state = next;
  for (const listener of listeners) listener();
}

const cacheKey = (userId: string) => `transport.location_consent.${userId}`;

function fromStored(userId: string, stored: StoredConsent | null): ConsentState {
  // A consent to an older text does not count: the new text is shown again.
  return stored && stored.version === LOCATION_CONSENT_VERSION
    ? { userId, status: 'given', acceptedAt: stored.acceptedAt }
    : { userId, status: 'missing', acceptedAt: null };
}

async function readCache(userId: string): Promise<StoredConsent | null> {
  const raw = await tripQueueStorage.getItem(cacheKey(userId)).catch(() => null);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredConsent>;
    return typeof value.version === 'string' && typeof value.acceptedAt === 'string'
      ? { version: value.version, acceptedAt: value.acceptedAt }
      : null;
  } catch {
    return null;
  }
}

async function writeCache(userId: string, stored: StoredConsent | null): Promise<void> {
  await (
    stored
      ? tripQueueStorage.setItem(cacheKey(userId), JSON.stringify(stored))
      : tripQueueStorage.removeItem(cacheKey(userId))
  ).catch(() => undefined);
}

/** Reads the active consent from the server; offline, the copy on the phone. */
export async function loadLocationConsent(client: Supabase, userId: string): Promise<void> {
  if (state.userId !== userId) setState({ ...EMPTY, userId });
  let stored: StoredConsent | null;
  try {
    const { data, error } = await client
      .from('location_consents')
      .select('policy_version, accepted_at')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .maybeSingle();
    if (error) throw error;
    stored = data ? { version: data.policy_version, acceptedAt: data.accepted_at } : null;
    await writeCache(userId, stored);
  } catch {
    stored = await readCache(userId);
  }
  if (state.userId === userId) setState(fromStored(userId, stored));
}

/** Records the consent to the current text (needs connection). */
export async function acceptLocationConsent(client: Supabase, userId: string): Promise<void> {
  const { error } = await client.rpc('record_location_consent', {
    p_policy_version: LOCATION_CONSENT_VERSION,
    p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });
  if (error) throw error;
  await loadLocationConsent(client, userId);
}

/**
 * Withdraws the consent: the server stops taking points, tracking stops and
 * the unsent points are deleted from the phone.
 */
export async function revokeLocationConsent(client: Supabase, userId: string): Promise<void> {
  const { error } = await client.rpc('revoke_location_consent');
  if (error) throw error;
  await writeCache(userId, null);
  if (state.userId === userId) setState(fromStored(userId, null));
  await stopTripTracking({ purge: true });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The consent of `userId`, loaded once per user. */
export function useLocationConsent(client: Supabase | null, userId: string | null): ConsentState {
  useEffect(() => {
    if (!client || !userId || state.userId === userId) return;
    void loadLocationConsent(client, userId).catch(() => undefined);
  }, [client, userId]);
  const current = useSyncExternalStore(subscribe, () => state);
  return current.userId === userId ? current : EMPTY;
}
