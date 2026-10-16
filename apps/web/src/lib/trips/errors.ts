import { clientTripsCopy } from '@transport/shared';

type PostgrestLikeError = { code?: string | null; message?: string | null } | null | undefined;

/**
 * Spanish message for an error of the shipper's trip RPCs (confirm_delivery,
 * report_incident). They raise SQLSTATE codes with fixed English messages;
 * only known ones are mapped, so database text never reaches the user.
 */
export function tripErrorMessage(error: PostgrestLikeError): string {
  const e = clientTripsCopy.errors;
  const message = error?.message ?? '';
  switch (error?.code) {
    case '42501':
      return message.startsWith('trip not found') ? e.notFound : e.generic;
    case '55000':
      if (message.startsWith('cannot confirm delivery')) return e.notDelivered;
      if (message.startsWith('trip is cancelled')) return e.cancelled;
      return e.generic;
    default:
      return e.generic;
  }
}
