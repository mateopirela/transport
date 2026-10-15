import { fleetErrorCopy, mobileErrorCopy, type FleetErrorKey } from '@transport/shared';

import { toErrorKey } from './errors';

/** Errors raised by the fleet RPCs and constraints (supabase/migrations). */
const FLEET_ERRORS: [RegExp, FleetErrorKey][] = [
  [/vehicles_company_plate_key/u, 'plateTaken'],
  [/vehicle has expired documents/u, 'expiredDocuments'],
  [/operator already has an account/u, 'operatorHasAccount'],
  [/operator has no email/u, 'operatorNoEmail'],
  [/document is already expired/u, 'documentExpired'],
];

/**
 * Spanish message for an error of the fleet screens. Raw server messages are
 * never shown: unknown errors fall back to `fallback` or the generic copy.
 */
export function fleetErrorMessage(error: unknown, fallback?: string): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  for (const [pattern, key] of FLEET_ERRORS) {
    if (pattern.test(message)) return fleetErrorCopy[key];
  }
  const key = toErrorKey(error);
  return key === 'unknown' && fallback ? fallback : mobileErrorCopy[key];
}
