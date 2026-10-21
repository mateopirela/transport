// Spanish copy of the carrier's internal trip chat (H1, D28): the operator
// reports to their coordinator ("Reportar al coordinador") and the carrier
// staff sees it next to the chat with the shipper. The chat itself reuses
// chatCopy.

/** Quick reports of the operator, sent as they read (one tap). */
export const QUICK_REPORTS = [
  'Ya llegué a cargar',
  'Ya llegué a descargar',
  'Voy con retraso',
  'Estoy esperando turno',
  'Tengo un problema en carretera',
  'Todo en orden',
] as const;

export type QuickReport = (typeof QUICK_REPORTS)[number];

export const internalChatCopy = {
  /** The operator's main action on their trip. */
  report: 'Reportar al coordinador',
  reportUnread: (count: number) =>
    count === 1 ? '1 mensaje sin leer' : `${count} mensajes sin leer`,
  title: 'Reportar al coordinador',
  description: 'Solo lo ven tu coordinador y el gerente de tu empresa. El cliente no lo ve.',
  staffDescription:
    'Chat interno con el operador del viaje. El cliente no lo ve: lo que haya que decirle, díselo en la pestaña Cliente.',
  quickReports: 'Mensajes rápidos',
  sendPhoto: 'Enviar foto',
  sendingPhoto: 'Enviando foto…',
  sendLocation: 'Enviar mi ubicación',
  sendingLocation: 'Enviando ubicación…',
  /** Text of the location message; the link opens Google Maps at the point. */
  location: (url: string) => `Mi ubicación: ${url}`,
  photoPreview: '📷 Foto',
  /** A photo of the chat in the app: it opens with a short-lived link. */
  viewPhoto: 'Ver foto',
  /** A shared location: opens the map at the point. */
  openMap: 'Abrir en el mapa',
  openAttachment: (name: string) => `Abrir ${name}`,
  tabs: { label: 'Chat del viaje', shipper: 'Cliente', internal: 'Interno' },
  unreadBadge: (count: number) => (count > 99 ? '99+' : String(count)),
  unreadLabel: (count: number) =>
    count === 1 ? '1 mensaje interno sin leer' : `${count} mensajes internos sin leer`,
  inbox: {
    title: (count: number) => `Mensajes de operadores (${count})`,
    empty: 'Sin mensajes nuevos de tus operadores.',
    route: (origin: string, destination: string) => `${origin} → ${destination}`,
    noOperator: 'Sin operador',
  },
  cancelledTrip: 'Este viaje se canceló. Puedes seguir escribiendo a tu coordinador.',
  closedTrip: 'Este viaje ya terminó. Puedes seguir escribiendo a tu coordinador.',
  notFound: 'No encontramos la conversación de este viaje.',
  roles: { manager: 'Gerente', coordinator: 'Coordinador' },
  errors: {
    photo: 'No se pudo enviar la foto. Intenta de nuevo.',
    location: 'No pudimos obtener tu ubicación. Revisa que la ubicación esté activada.',
    locationDenied: 'Activa el permiso de ubicación para enviarla.',
    cameraDenied: 'Activa el permiso de cámara para enviar fotos.',
  },
} as const;
