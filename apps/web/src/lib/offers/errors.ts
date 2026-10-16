import { offersCopy } from '@transport/shared';

type PostgrestLikeError = { code?: string | null; message?: string | null } | null | undefined;

/**
 * Spanish message for an error of the offer RPCs (accept_offer, counter_offer,
 * reject_offer). They raise SQLSTATE codes with fixed English messages; only
 * known ones are mapped, so database text never reaches the user.
 */
export function offerErrorMessage(error: PostgrestLikeError): string {
  const e = offersCopy.errors;
  const message = error?.message ?? '';
  switch (error?.code) {
    case '42501':
      if (message.startsWith('company is not approved')) return e.notApproved;
      if (message.startsWith('offer not found')) return e.notFound;
      return e.generic;
    case '55000':
      if (message.startsWith('offer is no longer pending')) return e.notPending;
      if (message.startsWith('load is no longer open')) return e.loadClosed;
      if (message.startsWith('pickup window already ended')) return e.pickupEnded;
      if (message.startsWith('both companies must be approved')) return e.bothApproved;
      return e.generic;
    case '22023':
      return message.includes('amount') ? e.invalidAmount : e.generic;
    default:
      return e.generic;
  }
}
