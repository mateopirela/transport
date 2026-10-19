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
      if (message.startsWith('trip not found')) return e.notFound;
      // add_trip_document (D22): the kind belongs to the carrier side.
      if (/^the \w+ side does not upload/u.test(message)) return e.documentSideNotAllowed;
      return e.generic;
    case '55000':
      if (message.startsWith('cannot confirm delivery')) return e.notDelivered;
      if (message.startsWith('trip is cancelled')) return e.cancelled;
      return e.generic;
    case '22023':
      if (
        message.startsWith('invalid storage path') ||
        message.startsWith('file was not uploaded')
      ) {
        return e.uploadFailed;
      }
      return e.generic;
    default:
      return e.generic;
  }
}
