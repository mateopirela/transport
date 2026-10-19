import { adminCopy, onboardingCopy } from '@transport/shared';

type PostgrestLikeError = { code?: string | null; message?: string | null } | null | undefined;

/**
 * Spanish message for an error of the verification RPCs (review_document,
 * review_company). The RPCs raise SQLSTATE codes with fixed English messages;
 * only known ones are mapped and the rest get the generic copy, so database
 * text never reaches the user.
 */
export function adminErrorMessage(error: PostgrestLikeError): string {
  const e = adminCopy.errors;
  const message = error?.message ?? '';
  switch (error?.code) {
    case '42501':
      return e.forbidden;
    case '55000':
      if (message.startsWith('company is missing required documents')) return e.missingDocuments;
      if (message.startsWith('company is missing fiscal data')) return e.missingFiscalData;
      if (message.startsWith('document is not pending review')) return e.notPending;
      return e.invalidTransition;
    case '22023':
      if (message.includes('needs an expiry date')) return e.expiryRequired;
      if (message.includes('already expired')) return e.expired;
      return e.generic;
    default:
      return e.generic;
  }
}

/** Same mapping for the shipper side (submit_document). */
export function onboardingErrorMessage(error: PostgrestLikeError): string {
  const e = onboardingCopy.errors;
  const message = error?.message ?? '';
  if (error?.code === '22023') {
    if (message.includes('needs an expiry date')) return e.expiryRequired;
    if (message.includes('already expired')) return e.expired;
  }
  return e.generic;
}
