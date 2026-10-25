// Spanish copy of the trip link for the operator (H2, D29): what the
// coordinator sends ("Enviar viaje al operador") in the app and on the web,
// the public page /viaje/<token> that only offers to open the app, and the
// screen of the app that opens the link.

export const tripLinkCopy = {
  /** The text of the message (WhatsApp, SMS, the share sheet). */
  message: ({ operatorName, route, url }: { operatorName: string; route: string; url: string }) =>
    `Hola ${operatorName}, tienes un viaje asignado: ${route}. Ábrelo en la app: ${url}`,
  send: {
    title: 'Enviar viaje al operador',
    description: (operatorName: string) =>
      `Mándale a ${operatorName} un enlace que abre este viaje en su app. Solo funciona con su sesión y deja de servir si cambias de operador, al cerrar o cancelar el viaje, o a los 30 días.`,
    /** App: opens the share sheet. */
    share: 'Enviar viaje al operador',
    preparing: 'Preparando enlace…',
    /** Web: creates the link and shows the ways to send it. */
    create: 'Crear enlace del viaje',
    creating: 'Creando…',
    renew: 'Crear un enlace nuevo',
    renewHelp: 'El enlace anterior deja de funcionar.',
    created: 'Enlace listo. Mándalo ahora: por seguridad no se vuelve a mostrar.',
    whatsapp: 'Enviar por WhatsApp',
    sms: 'Enviar por SMS',
    copy: 'Copiar enlace',
    copied: 'Enlace copiado',
    link: 'Enlace del viaje',
    active: (at: string) => `Hay un enlace activo, vence el ${at}.`,
    activeViewed: (at: string, count: number) =>
      `Hay un enlace activo, vence el ${at}. ${count === 1 ? 'Abierto 1 vez' : `Abierto ${count} veces`}.`,
    revoke: 'Revocar enlace',
    revoking: 'Revocando…',
    revoked: 'Enlace revocado. Ya no funciona.',
    noPhone:
      'El operador no tiene teléfono registrado: copia el enlace y mándaselo como prefieras.',
    failed: 'No pudimos crear el enlace. Intenta de nuevo.',
  },
  errors: {
    notFound: 'No encontramos el viaje o no lo operas.',
    noOperator: 'El viaje no tiene operador asignado o ya terminó.',
    rateLimited: 'Creaste muchos enlaces seguidos. Espera un minuto.',
    generic: 'No pudimos completar la acción. Intenta de nuevo.',
  },
  /** The public page /viaje/<token>: no data of the trip, only the way into the app. */
  public: {
    title: 'Abre este viaje en la app de Transport',
    description:
      'Tu coordinador te mandó un viaje. Ábrelo en la app de Transport para ver la ruta, compartir tu ubicación y reportarle.',
    openInApp: 'Abrir en la app',
    noApp: '¿Aún no tienes la app?',
    appStore: 'Descargar en App Store',
    googlePlay: 'Descargar en Google Play',
    signIn: 'Entra con tu teléfono y contraseña.',
  },
  /** The app's screen of a trip link. */
  app: {
    opening: 'Abriendo el viaje…',
    unavailable: 'Este enlace ya no está disponible. Pide uno nuevo a tu coordinador.',
    retry: 'Reintentar',
    goHome: 'Ir al inicio',
    /** The linked trip is not the one in course: read-only until it is its turn. */
    nextTrip: 'Siguiente viaje',
    pickup: (from: string, to: string) => `Recolección: ${from} – ${to}`,
    nextTripHelp:
      'Este viaje es el siguiente. Podrás iniciarlo cuando termines el que tienes en curso.',
  },
} as const;
