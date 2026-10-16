import { carrierTripsCopy, mobileErrorCopy } from '@transport/shared';

import { toErrorKey } from './errors';

const e = carrierTripsCopy.errors;

/**
 * Errors raised by assign_trip (B06) and the trip document upload. They use
 * fixed English messages; only known ones are mapped, so database text never
 * reaches the user.
 */
const TRIP_ERRORS: [RegExp, string][] = [
  [/^trip not found/u, e.notFound],
  [/^cannot assign a trip in status/u, e.notAssignable],
  [/^company is not approved/u, e.notApproved],
  [/^operator not found or without account/u, e.operatorUnavailable],
  [/^vehicle not found/u, e.unitUnavailable],
  [/^vehicle has expired documents/u, e.unitExpired],
  [/^trip is cancelled/u, e.tripCancelled],
  [/^invalid storage path|^file was not uploaded|mime type|exceeded the maximum/iu, e.invalidFile],
];

/** Spanish message for an error of the carrier's trip screens. */
export function carrierTripErrorMessage(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  for (const [pattern, text] of TRIP_ERRORS) if (pattern.test(message)) return text;
  const key = toErrorKey(error);
  return key === 'unknown' ? e.generic : mobileErrorCopy[key];
}
