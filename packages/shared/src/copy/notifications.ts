// Spanish text of the notifications (B07). Postgres stores only the type and
// the data of each notification; the in-app inbox (B14, B19) and the push and
// email dispatcher (B09) render them here, so the text lives in one place.
import type { NotificationType, TripDocumentKind, TripEventType, TripStatus } from '../enums';
import { formatMxn } from '../formatters';
import { tripDocumentKindLabels, tripEventTypeLabels, tripStatusLabels } from './catalogs';
import { internalChatCopy } from './internal-chat';

export interface NotificationContent {
  title: string;
  body: string;
}

function text(data: unknown, key: string): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function count(data: unknown, key: string): number | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** " MTY → GDL" style suffix, or nothing when the route is unknown. */
function route(data: unknown): string {
  const origin = text(data, 'originCity');
  const destination = text(data, 'destinationCity');
  return origin && destination ? ` ${origin} → ${destination}` : '';
}

function amount(data: unknown): string {
  const cents = count(data, 'amountCents');
  return cents === undefined ? '' : ` de ${formatMxn(cents)}`;
}

function documentName(data: unknown): string {
  return text(data, 'requirementName') ?? 'tu documento';
}

function tripStep(data: unknown): string | undefined {
  const event = text(data, 'eventType');
  if (event && Object.hasOwn(tripEventTypeLabels, event)) {
    return tripEventTypeLabels[event as TripEventType];
  }
  const status = text(data, 'status');
  if (status && Object.hasOwn(tripStatusLabels, status)) {
    return tripStatusLabels[status as TripStatus];
  }
  return undefined;
}

function expiry(data: unknown): string {
  const days = count(data, 'daysLeft');
  if (days === undefined) return 'vence pronto';
  if (days === 0) return 'vence hoy';
  return days === 1 ? 'vence mañana' : `vence en ${days} días`;
}

/** Title and body of a notification, from its type and its `data`. */
export function notificationContent(type: NotificationType, data: unknown): NotificationContent {
  switch (type) {
    case 'load_match':
      return {
        title: 'Carga compatible',
        body: `Hay una carga nueva${route(data)} compatible con tu unidad.`,
      };
    case 'offer_received':
      return {
        title: 'Nueva oferta',
        body: `Recibiste una oferta${amount(data)} por tu carga${route(data)}.`,
      };
    case 'counter_offer_received':
      return {
        title: 'Nueva contraoferta',
        body: `Recibiste una contraoferta${amount(data)} por la carga${route(data)}.`,
      };
    case 'offer_accepted':
      return {
        title: 'Oferta aceptada',
        body: `Aceptaron tu oferta${amount(data)} por la carga${route(data)}. El viaje ya está creado.`,
      };
    case 'trip_assigned':
      return {
        title: 'Viaje asignado',
        body: `Se te asignó el viaje${route(data)}. Revisa los detalles antes de salir.`,
      };
    case 'trip_unassigned':
      return {
        title: 'Viaje reasignado',
        body: `El viaje${route(data)} se asignó a otro operador. Ya no lo tienes a tu cargo.`,
      };
    case 'trip_status_changed': {
      const step = tripStep(data);
      return {
        title: `Viaje${route(data)}`,
        body: step ? `${step}.` : 'El estado del viaje cambió.',
      };
    }
    case 'document_approved':
      return {
        title: 'Documento aprobado',
        body: `Aprobamos ${documentName(data)}.`,
      };
    case 'document_rejected': {
      const notes = text(data, 'reviewNotes');
      return {
        title: 'Documento rechazado',
        body: `Rechazamos ${documentName(data)}.${notes ? ` Motivo: ${notes}` : ''} Sube una nueva versión.`,
      };
    }
    case 'document_expiring': {
      const name = text(data, 'requirementName') ?? 'Uno de tus documentos';
      const owner = text(data, 'ownerLabel');
      return {
        title: 'Documento por vencer',
        body: `${name}${owner ? ` (${owner})` : ''} ${expiry(data)}. Actualízalo para seguir operando.`,
      };
    }
    case 'documents_shared': {
      const n = count(data, 'count');
      const what =
        n === undefined || n === 0 ? 'documentos' : n === 1 ? '1 documento' : `${n} documentos`;
      return {
        title: 'Documentos del transportista',
        body: `Ya puedes consultar ${what} del transportista del viaje${route(data)}.`,
      };
    }
    case 'provider_status_changed': {
      const shipper = text(data, 'shipperName') ?? 'El cliente';
      const status = text(data, 'status');
      const body =
        status === 'approved'
          ? `${shipper} dio de alta a tu empresa como proveedor aprobado.`
          : status === 'rejected'
            ? `${shipper} rechazó el alta de tu empresa como proveedor.`
            : status === 'revoked'
              ? `${shipper} revocó el alta de tu empresa como proveedor.`
              : `${shipper} cambió el alta de tu empresa como proveedor.`;
      return { title: 'Alta de proveedor', body };
    }
    case 'trip_document_added': {
      const kind = text(data, 'documentKind');
      const label =
        kind && Object.hasOwn(tripDocumentKindLabels, kind)
          ? tripDocumentKindLabels[kind as TripDocumentKind]
          : 'un documento';
      return {
        title: 'Nuevo documento del viaje',
        body: `Se agregó ${label} al viaje${route(data)}.`,
      };
    }
    case 'vehicle_release_pending': {
      const unit = text(data, 'vehicleLabel');
      return {
        title: 'Unidad pendiente de liberar',
        body: `Se canceló el viaje${route(data)} después de salir. Confirma dónde está ${unit ?? 'la unidad'} para liberarla.`,
      };
    }
    case 'vehicle_released': {
      const unit = text(data, 'vehicleLabel');
      const city = text(data, 'city');
      return {
        title: 'Unidad liberada',
        body: `${unit ?? 'La unidad'} ya está disponible${city ? ` en ${city}` : ''} y vuelve a recibir recomendaciones.`,
      };
    }
    // H1 (D28): a message of the carrier's internal trip chat. The preview is
    // the text (Postgres cuts it at 80 characters), or "📷 Foto" when the
    // message only carries attachments.
    case 'internal_message': {
      const sender = text(data, 'senderName');
      return {
        title: sender ? `Mensaje de ${sender}` : `Mensaje del viaje${route(data)}`,
        body: text(data, 'preview') ?? internalChatCopy.photoPreview,
      };
    }
    // A message of the chat with the shipper: of the trip or of the
    // negotiation (`kind`). The sender is the person for their colleagues and
    // their company for the other party. Same preview as the internal chat.
    case 'chat_message': {
      const sender = text(data, 'senderName');
      const where = text(data, 'kind') === 'negotiation' ? 'de la negociación' : 'del viaje';
      return {
        title: sender ? `Mensaje de ${sender}` : `Mensaje ${where}${route(data)}`,
        body: text(data, 'preview') ?? internalChatCopy.photoPreview,
      };
    }
    case 'trip_location_stale': {
      const hours = count(data, 'hoursWithoutLocation');
      const since =
        hours !== undefined && hours >= 2
          ? `en las últimas ${hours} horas`
          : 'en las últimas horas';
      return {
        title: 'No recibimos tu ubicación',
        body: `No hemos recibido la ubicación del viaje${route(data)} ${since}. Abre la app para reanudar el seguimiento.`,
      };
    }
  }
}
