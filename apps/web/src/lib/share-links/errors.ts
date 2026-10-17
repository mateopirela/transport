import { shareLinksCopy } from '@transport/shared';

const e = shareLinksCopy.errors;

/** Spanish message for an error of create_share_link / revoke_share_link. */
export function shareErrorMessage(error: { code?: string; message?: string }): string {
  switch (error.code) {
    case '42501':
      return e.notFound;
    case 'PT429':
      return e.rateLimited;
    case '22023':
      return error.message?.includes('p_valid_for_hours') ? e.invalidValidity : e.notShareable;
    default:
      return e.generic;
  }
}
