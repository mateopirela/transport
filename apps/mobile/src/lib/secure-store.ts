import * as SecureStore from 'expo-secure-store';

import { createChunkedStorage, toStoreKey, type KeyValueBackend } from './chunked-storage';

// Items never leave the device (no iCloud Keychain sync; Android backups are
// disabled in app.config.ts). They stay readable after the first unlock so the
// operator's background location upload (B22) can refresh the session while
// the phone is locked.
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const backend: KeyValueBackend = {
  getItem: (key) => SecureStore.getItemAsync(key, OPTIONS),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, OPTIONS),
  removeItem: (key) => SecureStore.deleteItemAsync(key, OPTIONS),
};

/** Storage adapter for the Supabase session (tokens never touch AsyncStorage). */
export const sessionStorage = createChunkedStorage(backend);

const PENDING_INVITATION_KEY = toStoreKey('transport.pending_invitation_code');

/**
 * The invitation code an operator used to sign up, kept until their e-mail is
 * confirmed and the invitation is accepted (D15). Single-use and bound to the
 * invited e-mail server-side, but still treated as a secret.
 */
export const pendingInvitation = {
  get: () => SecureStore.getItemAsync(PENDING_INVITATION_KEY, OPTIONS),
  set: (code: string) => SecureStore.setItemAsync(PENDING_INVITATION_KEY, code, OPTIONS),
  clear: () => SecureStore.deleteItemAsync(PENDING_INVITATION_KEY, OPTIONS),
};
