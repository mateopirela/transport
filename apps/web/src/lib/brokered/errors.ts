import { brokeredCopy, loadsCopy } from '@transport/shared';

type PostgrestLikeError = { code?: string | null; message?: string | null } | null | undefined;

const e = brokeredCopy.errors;

/**
 * Spanish message for an error of the admin's brokered-load RPCs (I6):
 * admin_quote_brokered_load and the negotiation RPCs answered as Transport
 * (accept_offer, counter_offer, reject_offer). Only known messages are
 * mapped, so database text never reaches the user.
 */
export function brokeredAdminErrorMessage(error: PostgrestLikeError): string {
  const message = error?.message ?? '';
  if (message.includes('the carrier price cannot be over the client price')) {
    return message.startsWith('invalid quote') ? e.carrierOverClient : e.overClientPrice;
  }
  if (message.startsWith('the client already approved its price')) return e.clientApproved;
  if (message.startsWith('cannot quote a load')) return e.notQuotable;
  if (message.includes('pickup window already ended')) return loadsCopy.errors.pickupEnded;
  if (error?.code === '55000') return loadsCopy.errors.invalidStatus;
  return e.generic;
}
