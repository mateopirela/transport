// Where a notification leads in the web (B14 for the shipper, G10a for the
// carrier staff). Pure: notification data is JSON written by the B07
// triggers, so every id is validated before use.
import { uuidField, type NotificationType } from '@transport/shared';

import {
  carrierLoadPath,
  carrierNegotiationPath,
  loadPath,
  negotiationPath,
  tripPath,
  type WebArea,
} from '../routing';

function id(data: unknown, key: string): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const parsed = uuidField.safeParse((data as Record<string, unknown>)[key]);
  return parsed.success ? parsed.data : null;
}

/** Screen of the web app for a notification, or null when the area has none. */
export function notificationHref(
  type: NotificationType,
  data: unknown,
  area: WebArea = 'cliente',
): string | null {
  const loadId = id(data, 'loadId');
  const negotiationId = id(data, 'negotiationId');
  if (area === 'transportista') {
    switch (type) {
      case 'offer_received':
      case 'counter_offer_received':
      case 'offer_accepted':
        if (negotiationId) return carrierNegotiationPath(negotiationId);
        return loadId && carrierLoadPath(loadId);
      case 'load_match':
        return loadId && carrierLoadPath(loadId);
      // Trips and fleet documents get their carrier screens with G10b; the
      // location reminder is for the operator.
      case 'trip_assigned':
      case 'trip_status_changed':
      case 'trip_unassigned':
      case 'trip_location_stale':
      case 'document_approved':
      case 'document_rejected':
      case 'document_expiring':
        return null;
    }
  }
  switch (type) {
    case 'offer_received':
    case 'counter_offer_received':
    case 'offer_accepted': {
      if (loadId && negotiationId) return negotiationPath(loadId, negotiationId);
      return loadId && loadPath(loadId);
    }
    // Trip tracking (B15); older notifications without a trip id, to the load.
    case 'trip_assigned':
    case 'trip_status_changed': {
      const tripId = id(data, 'tripId');
      if (tripId) return tripPath(tripId);
      return loadId && loadPath(loadId);
    }
    // Carrier-only (matching), operator-only (location reminder, B09; taken
    // off a trip, F2) or company documents, which have no screen for an
    // approved shipper.
    case 'load_match':
    case 'trip_location_stale':
    case 'trip_unassigned':
    case 'document_approved':
    case 'document_rejected':
    case 'document_expiring':
      return null;
  }
}
