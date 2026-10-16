import { carrierLoadsCopy, mobileErrorCopy } from '@transport/shared';

import { toErrorKey } from './errors';

const e = carrierLoadsCopy.errors;

/**
 * Errors raised by the negotiation RPCs (make_offer, counter_offer,
 * accept_offer, reject_offer, withdraw_offer; supabase/migrations). They use
 * fixed English messages; only known ones are mapped, so database text never
 * reaches the user.
 */
const OFFER_ERRORS: [RegExp, string][] = [
  [/^company is not approved|^only carriers can make offers/u, e.notApproved],
  [/^load not found|^offer not found/u, e.loadGone],
  [/^cannot offer on a load in status|^load is no longer open/u, e.loadClosed],
  [/^pickup window already ended/u, e.pickupEnded],
  [/^negotiation already has a pending offer/u, e.pending],
  [/^offer is no longer pending|^offer cannot be answered by this side/u, e.notPending],
  [/^invalid offer: amount|^invalid offer: conditions/u, e.invalidAmount],
  [/^invalid offer: vehicle not found/u, e.invalidUnit],
  [/^both companies must be approved/u, e.bothApproved],
];

/** Spanish message for an error of an offer action. */
export function offerErrorMessage(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : '';
  for (const [pattern, text] of OFFER_ERRORS) if (pattern.test(message)) return text;
  const key = toErrorKey(error);
  return key === 'unknown' ? e.generic : mobileErrorCopy[key];
}
