import { loadsCopy } from '@transport/shared';

type PostgrestLikeError = { code?: string | null; message?: string | null } | null | undefined;

/**
 * Spanish message for an error of the load RPCs (create_load, update_load,
 * publish_load, cancel_load). They raise SQLSTATE codes with fixed English
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
      return e.invalidStatus;
    case '22023':
      return message.includes('pickup window already ended') ? e.pickupEnded : e.invalid;
    default:
      return e.generic;
  }
}
