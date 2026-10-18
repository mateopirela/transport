import { carrierTripErrorText, carrierTripsCopy, mobileErrorCopy } from '@transport/shared';

import { toErrorKey } from './errors';

/**
 * Spanish message for an error of the carrier's trip screens. assign_trip
 * (B06, D16) and the trip document upload raise fixed English messages,
 * mapped in packages/shared (carrierTripErrorText, shared with the carrier
 * web since G10b); anything else is a network or session error.
 */
export function carrierTripErrorMessage(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  const known = carrierTripErrorText(message);
  if (known) return known;
  const key = toErrorKey(error);
  return key === 'unknown' ? carrierTripsCopy.errors.generic : mobileErrorCopy[key];
}
