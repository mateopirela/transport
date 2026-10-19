import { carrierLoadsCopy, carrierOfferErrorText, mobileErrorCopy } from '@transport/shared';

import { toErrorKey } from './errors';

/**
 * Spanish message for an error of an offer action. The negotiation RPCs raise
 * fixed English messages, mapped in packages/shared (carrierOfferErrorText,
 * shared with the carrier web since G10a); anything else is a network or
 * session error.
 */
export function offerErrorMessage(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  const known = carrierOfferErrorText(message);
  if (known) return known;
  const key = toErrorKey(error);
  return key === 'unknown' ? carrierLoadsCopy.errors.generic : mobileErrorCopy[key];
}
