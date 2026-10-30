// Where a notification leads in the web (B14 for the shipper, G10a for the
// carrier staff). Pure: notification data is JSON written by the B07
// triggers, so every id is validated before use.
import {
  chatMessageTarget,
  INTERNAL_CHAT_PARAM,
  SHIPPER_CHAT_PARAM,
  uuidField,
  type NotificationType,
} from '@transport/shared';

import {
  carrierLoadPath,
  carrierNegotiationPath,
  carrierOperatorPath,
  carrierTripPath,
  carrierUnitPath,
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

/**
 * Screen of a document notification in the carrier web (G10b): the unit or
 * the operator it belongs to. Company documents have no screen for an
 * approved carrier until "Mi empresa" (G4).
 */
function carrierDocumentHref(data: unknown): string | null {
  const ownerId = id(data, 'ownerId');
  if (!ownerId || typeof data !== 'object' || data === null) return null;
  switch ((data as Record<string, unknown>).ownerType) {
    case 'vehicle':
      return carrierUnitPath(ownerId);
    case 'operator':
      return carrierOperatorPath(ownerId);
    default:
      return null;
  }
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
      // Trips of the carrier web (G10b); older notifications without a trip
      // id, to the load, which links to its trip.
      case 'trip_assigned':
      case 'trip_status_changed':
      case 'trip_unassigned': {
        const tripId = id(data, 'tripId');
        if (tripId) return carrierTripPath(tripId);
        return loadId && carrierLoadPath(loadId);
      }
      case 'document_approved':
      case 'document_rejected':
      case 'document_expiring':
        return carrierDocumentHref(data);
      // G6: a document of the trip uploaded by the shipper; the shipper's
      // decision about the company, on its latest trip or negotiation.
      case 'trip_document_added': {
        const tripId = id(data, 'tripId');
        return tripId && carrierTripPath(tripId);
      }
      case 'provider_status_changed': {
        const tripId = id(data, 'tripId');
        if (tripId) return carrierTripPath(tripId);
        return negotiationId && carrierNegotiationPath(negotiationId);
      }
      // A unit to release, or released (G5): its screen, where it is released.
      case 'vehicle_release_pending':
      case 'vehicle_released': {
        const vehicleId = id(data, 'vehicleId');
        return vehicleId && carrierUnitPath(vehicleId);
      }
      // A message of the internal trip chat (H1): the trip, on its internal tab.
      case 'internal_message': {
        const tripId = id(data, 'tripId');
        return tripId && `${carrierTripPath(tripId)}?chat=${INTERNAL_CHAT_PARAM}`;
      }
      // A message of the chat with the shipper: the trip, on the shipper's
      // tab, or the negotiation.
      case 'chat_message': {
        const target = chatMessageTarget(data);
        if (!target) return null;
        return target.kind === 'trip'
          ? `${carrierTripPath(target.tripId)}?chat=${SHIPPER_CHAT_PARAM}`
          : carrierNegotiationPath(target.negotiationId);
      }
      // The location reminder is for the operator (B09); the shared documents,
      // for the shipper (G6).
      case 'trip_location_stale':
      case 'documents_shared':
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
    // A message of the chat with the carrier: the trip or the negotiation.
    case 'chat_message': {
      const target = chatMessageTarget(data);
      if (!target) return null;
      return target.kind === 'trip'
        ? tripPath(target.tripId)
        : negotiationPath(target.loadId, target.negotiationId);
    }
    // G6: the carrier's documents shared on the trip, or a document of it.
    case 'documents_shared':
    case 'trip_document_added': {
      const tripId = id(data, 'tripId');
      return tripId && tripPath(tripId);
    }
    // Carrier-only (matching), operator-only (location reminder, B09; taken
    // off a trip, F2) or company documents, which have no screen for an
    // approved shipper.
    // The internal trip chat is the carrier's only (H1, D28).
    case 'internal_message':
    case 'load_match':
    case 'provider_status_changed':
    case 'trip_location_stale':
    case 'trip_unassigned':
    case 'document_approved':
    case 'document_rejected':
    case 'document_expiring':
    case 'vehicle_release_pending':
    case 'vehicle_released':
      return null;
  }
}
