import { adminOpsCopy } from '@transport/shared';

type PostgrestLikeError = { code?: string | null; message?: string | null } | null | undefined;

/**
 * Spanish message for an error of the admin operation RPCs
 * (admin_create_offer, admin_accept_offer, resolve_incident). They raise
 * SQLSTATE codes with fixed English messages; only known ones are mapped, so
 * database text never reaches the user.
 */
export function adminOpsErrorMessage(error: PostgrestLikeError): string {
  const e = adminOpsCopy.errors;
  const message = error?.message ?? '';
  switch (error?.code) {
    case '42501':
      return message.startsWith('only admins') ? e.notAdmin : e.generic;
    case '55000':
      if (message.startsWith('company is not approved')) return e.notApproved;
      if (message.startsWith('both companies must be approved')) return e.bothApproved;
      if (message.startsWith('negotiation already has a pending offer')) return e.pendingExists;
      if (
        message.startsWith('cannot offer on a load') ||
        message.startsWith('load is no longer open')
      )
        return e.loadClosed;
      if (message.startsWith('pickup window already ended')) return e.pickupEnded;
      if (message.startsWith('offer is no longer pending')) return e.notPending;
      if (message.startsWith('incident is already resolved')) return e.incidentResolved;
      return e.generic;
    case '22023':
      if (message.startsWith('carrier not found')) return e.carrierNotFound;
      if (message.includes('amount')) return e.invalidAmount;
      return e.generic;
    default:
      return e.generic;
  }
}
