// Documents shared with the shipper of a trip and the provider approval (D21,
// G6): the shipper web, the carrier web and the carrier app.
import type { DocumentShareRevokeReason, ProviderStatus } from '../enums';
import type { ProviderState } from '../shared-documents';

export const providerStateLabels: Record<ProviderState, string> = {
  pending: 'Alta pendiente',
  approved: 'Proveedor aprobado',
  rejected: 'Alta rechazada',
  revoked: 'Alta revocada',
};

/** Buttons of the shipper, by the status they move the carrier to. */
export const providerActionLabels: Record<ProviderStatus, string> = {
  approved: 'Dar de alta como proveedor',
  rejected: 'Rechazar',
  revoked: 'Revocar alta',
};

export const documentShareRevokeReasonLabels: Record<DocumentShareRevokeReason, string> = {
  trip_closed: 'El viaje se cerró',
  trip_cancelled: 'El viaje se canceló',
  reassigned: 'Cambió la unidad o el operador',
  document_replaced: 'El documento se reemplazó o dejó de estar vigente',
  manager_revoked: 'El Gerente lo revocó',
};

export const sharedDocumentsCopy = {
  owner: {
    company: 'Empresa',
    vehicle: (plate: string | null) => (plate ? `Unidad ${plate}` : 'Unidad'),
    operator: (name: string | null) => (name ? `Operador: ${name}` : 'Operador'),
  },
  expires: (date: string) => `Vigente hasta ${date}`,
  sharedAt: (date: string) => `Compartido el ${date}`,
  /** A share that stopped without a stored reason (it expired or left the trip). */
  revokeFallback: 'Ya no está vigente',
  /** Shipper web: /cliente/viajes/[id]. */
  client: {
    title: 'Documentos del transportista',
    description:
      'Documentos aprobados de la empresa transportista y, cuando se asignan, de la unidad y del operador. Son de solo lectura, cada consulta queda registrada y el acceso termina al cerrar o cancelar el viaje.',
    empty: 'Todavía no hay documentos compartidos en este viaje.',
    view: 'Ver',
    viewLabel: (name: string) => `Ver ${name}`,
    unavailable: 'Este documento ya no está disponible. Recarga la página.',
    rateLimited: 'Abriste muchos documentos seguidos. Espera un minuto e intenta de nuevo.',
  },
  /** Carrier web and app: the trip detail. */
  carrier: {
    title: 'Documentos compartidos con el cliente',
    description:
      'Al aceptar la oferta el cliente ve los documentos aprobados de la empresa; al asignar, los de la unidad y el operador. El acceso termina al cerrar o cancelar el viaje.',
    empty: 'Aún no se comparte ningún documento en este viaje.',
    active: 'Compartido',
    revoked: (reason: string) => `Ya no se comparte · ${reason}`,
    revoke: 'Dejar de compartir',
    cancel: 'Cancelar',
    revokeConfirm:
      '¿Dejar de compartir este documento con el cliente? No se vuelve a compartir en este viaje.',
    revokeDone: 'Listo, el cliente ya no ve este documento.',
    managerOnly: 'Solo el Gerente puede dejar de compartir un documento.',
  },
  provider: {
    title: 'Alta de proveedor',
    status: 'Estado con este cliente',
    informative: 'En esta etapa el alta es informativa: no bloquea la asignación ni la salida.',
    notes: 'Nota (opcional)',
    notesHint: 'El transportista verá esta nota.',
    saved: {
      approved: 'Listo, diste de alta al transportista como proveedor.',
      rejected: 'Listo, rechazaste el alta del transportista.',
      revoked: 'Listo, revocaste el alta del transportista.',
    } satisfies Record<ProviderStatus, string>,
    decidedAt: (date: string) => `Desde el ${date}`,
  },
  errors: {
    generic: 'No pudimos guardar el cambio. Intenta de nuevo.',
    notAllowed: 'No puedes cambiar el alta de este transportista.',
    changed: 'El alta cambió mientras tanto. Recarga la página.',
    notesTooLong: 'La nota debe tener como máximo 1000 caracteres.',
    shareNotFound: 'No encontramos este documento compartido.',
  },
} as const;

type PostgrestLikeError = { code?: string | null; message?: string | null } | null | undefined;

/**
 * Spanish message for an error of set_provider_status. Only known SQLSTATE
 * codes are mapped, so database text never reaches the user.
 */
export function providerErrorMessage(error: PostgrestLikeError): string {
  const e = sharedDocumentsCopy.errors;
  switch (error?.code) {
    case '42501':
      return e.notAllowed;
    // An invalid transition (someone else changed it) or a lost race.
    case '55000':
    case '40001':
      return e.changed;
    case '22023':
      return (error.message ?? '').startsWith('notes are too long') ? e.notesTooLong : e.generic;
    default:
      return e.generic;
  }
}

/** Spanish message for an error of revoke_document_share (web and app). */
export function revokeShareErrorMessage(error: PostgrestLikeError): string {
  if (error?.code !== '42501') return sharedDocumentsCopy.errors.generic;
  return (error.message ?? '').startsWith('only the manager')
    ? sharedDocumentsCopy.carrier.managerOnly
    : sharedDocumentsCopy.errors.shareNotFound;
}
