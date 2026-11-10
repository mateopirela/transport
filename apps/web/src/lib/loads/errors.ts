import { brokeredCopy, loadsCopy } from '@transport/shared';

type PostgrestLikeError = { code?: string | null; message?: string | null } | null | undefined;

/**
 * Spanish message for an error of the load RPCs (create_load, update_load,
 * publish_load, cancel_load, request_brokered_load, approve_brokered_quote). They raise SQLSTATE codes with fixed English
 * messages; only known ones are mapped, so database text never reaches the user.
 */
export function loadErrorMessage(error: PostgrestLikeError): string {
  const e = loadsCopy.errors;
  const message = error?.message ?? '';
  switch (error?.code) {
    case '42501':
      if (message.startsWith('company is not approved')) return e.notApproved;
      if (message.startsWith('load not found')) return e.notFound;
      return e.generic;
    case '55000':
      // Brokered loads (I6): the price changed under the client, there is no
      // quote to approve, or the client tried to edit one.
      if (message.startsWith('the quote changed')) return brokeredCopy.errors.quoteChanged;
      if (message.startsWith('there is no quote to approve')) return brokeredCopy.errors.noQuote;
      if (message.startsWith('a brokered load')) return brokeredCopy.errors.notEditable;
      return e.invalidStatus;
    case '22023':
      if (message.includes('pickup window already ended')) return e.pickupEnded;
      if (message.includes('dates out of range')) return e.datesOutOfRange;
      return e.invalid;
    default:
      return e.generic;
  }
}
