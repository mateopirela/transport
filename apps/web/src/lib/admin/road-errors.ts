import { roadsCopy } from '@transport/shared';

type PostgrestLikeError = { code?: string | null; message?: string | null } | null | undefined;

/** Spanish message for an error of the admin road RPCs (fixed English messages). */
export function roadAdminErrorMessage(error: PostgrestLikeError): string {
  const e = roadsCopy.admin.errors;
  switch (error?.code) {
    case '23505':
      return e.duplicate;
    case '22023':
      return (error.message ?? '').startsWith('consecutive segments') ||
        (error.message ?? '').startsWith('unknown or archived segment')
        ? e.unknownSegment
        : e.invalid;
    case '23514':
      return e.invalid;
    default:
      return e.generic;
  }
}
