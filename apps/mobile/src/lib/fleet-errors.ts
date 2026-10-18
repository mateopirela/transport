import { fleetErrorText, managerCompanyErrorText, mobileErrorCopy } from '@transport/shared';

import { toErrorKey } from './errors';

/**
 * Spanish message for an error of the fleet screens. The fleet RPCs and
 * constraints raise fixed English messages, mapped in packages/shared
 * (fleetErrorText, shared with the carrier web since G10b). Raw server
 * messages are never shown: unknown errors fall back to `fallback` or the
 * generic copy.
 */
export function fleetErrorMessage(error: unknown, fallback?: string): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  const known = fleetErrorText(message);
  if (known) return known;
  const key = toErrorKey(error);
  return key === 'unknown' && fallback ? fallback : mobileErrorCopy[key];
}

/**
 * Spanish message for an error of "Mi empresa" or of an invitation link (G4):
 * the manager RPCs first, then the fleet errors and the generic copy.
 */
export function companyErrorMessage(error: unknown, fallback?: string): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  return managerCompanyErrorText(message) ?? fleetErrorMessage(error, fallback);
}
