import type { FormState } from './forms';

/**
 * Idempotency key of a form submission attempt (an RPC's p_client_event_id).
 *
 * Every submission of the same attempt sends the same key, so a double submit
 * or a retry after an error never repeats the write. Only a successful result
 * starts a new attempt, so the next report gets a fresh key.
 */
export function nextAttemptKey(
  currentKey: string,
  result: FormState,
  generate: () => string = () => crypto.randomUUID(),
): string {
  return result.message ? generate() : currentKey;
}
