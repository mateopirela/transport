// Lifecycle of this device's push token for the signed-in user: it is saved
// with register_push_token and removed with unregister_push_token before the
// session ends (B20: the operator gets the assignment push only on devices
// where they are signed in). Platform-independent, so the ordering between a
// registration in flight and the sign-out is unit-tested.

import type { PushTokenSink } from './push';

export interface PushTokenApi {
  register(token: string, platform: 'ios' | 'android', signal: AbortSignal): Promise<void>;
  unregister(token: string, signal: AbortSignal): Promise<void>;
}

/** Longest a register or unregister request may take before it is aborted. */
export const PUSH_REQUEST_TIMEOUT_MS = 5000;

/** Runs `request` with an abort signal; rejects when it takes longer than `ms`. */
function bounded(ms: number, request: (signal: AbortSignal) => Promise<void>): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('push token request timed out'));
    }, ms);
  });
  return Promise.race([request(controller.signal), timeout]).finally(() => clearTimeout(timer));
}

export interface PushTokenSession {
  /** Sink for registerPushToken, bound to the session that is signed in now. */
  sink(): PushTokenSink;
  /**
   * Call before signing out. Registrations of this session that have not sent
   * their request yet never will; the ones in flight are awaited (bounded); then
   * the token is removed. Never throws.
   */
  end(): Promise<void>;
}

export function createPushTokenSession(
  api: PushTokenApi,
  timeoutMs: number = PUSH_REQUEST_TIMEOUT_MS,
): PushTokenSession {
  let epoch = 0;
  let token: string | null = null;
  const inFlight = new Set<Promise<void>>();

  return {
    sink() {
      const session = epoch;
      return async (next, platform) => {
        if (epoch !== session) throw new Error('the session ended');
        // Known before the request: if its response is lost, end() still removes it.
        token = next;
        const request = bounded(timeoutMs, (signal) => api.register(next, platform, signal));
        inFlight.add(request);
        try {
          await request;
        } finally {
          inFlight.delete(request);
        }
      };
    },

    async end() {
      epoch += 1;
      await Promise.all([...inFlight].map((request) => request.catch(() => undefined)));
      const current = token;
      token = null;
      if (current) {
        await bounded(timeoutMs, (signal) => api.unregister(current, signal)).catch(
          () => undefined,
        );
      }
    },
  };
}
