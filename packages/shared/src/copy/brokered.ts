// Brokered loads (I6, D39): the client sends its load to the platform,
// Transport sets the client's price and publishes it to the carriers at a
// lower rate. The carrier only reads "Publicada por Transport"; the client
// only reads its price; the margin is the admin's only.

/** The name the platform negotiates under (D25: "Transport" until there is one). */
export const PLATFORM_NAME = 'Transport';

export const brokeredCopy = {
  /** The badge of a brokered load for the carriers (web and app). */
  badge: `Publicada por ${PLATFORM_NAME}`,
  /** The counterpart of the carrier in the negotiation of a brokered load. */
  counterpart: PLATFORM_NAME,
  /** The negotiation of a brokered load has no chat: Transport answers with offers. */
  carrierChatClosed: `${PLATFORM_NAME} responde tus ofertas aquí; esta negociación no tiene chat.`,
  /** Shipper (web): the new load form, the list and the detail. */
  shipper: {
    toggle: 'Que la plataforma consiga el transportista',
    toggleHint: `${PLATFORM_NAME} fija tu precio, publica la carga y negocia con los transportistas por ti.`,
    targetPrice: 'Precio objetivo (MXN, opcional)',
    targetPriceHint: 'Sin IVA. Déjalo vacío para pedir cotización.',
    submit: `Enviar a ${PLATFORM_NAME}`,
    toQuote: 'Por cotizar',
    stage: {
      requested: `Enviada a ${PLATFORM_NAME}`,
      quoted: 'Esperando tu aprobación',
      searching: 'Buscando transportista',
    },
    stageHelp: {
      requested: `${PLATFORM_NAME} revisa tu carga y te envía el precio.`,
      quoted: `${PLATFORM_NAME} cotizó tu carga. Acepta el precio para publicarla a los transportistas.`,
      searching: `${PLATFORM_NAME} publicó tu carga y negocia con los transportistas. Te avisamos cuando haya transportista asignado.`,
    },
    title: `Gestionada por ${PLATFORM_NAME}`,
    targetLabel: 'Tu precio objetivo',
    priceLabel: 'Tu precio',
    approve: (price: string) => `Aceptar ${price}`,
    approving: 'Aceptando…',
    approved: 'Precio aceptado: la carga ya está publicada.',
    cancelHint: 'Si no te conviene el precio, puedes cancelar la carga.',
  },
  /** Admin (web): the inbox /admin/intermediadas and its detail. */
  admin: {
    title: 'Cargas intermediadas',
    description: `Cargas que los clientes enviaron a la plataforma: fija el precio al cliente y la tarifa a los transportistas, y responde sus ofertas en nombre de ${PLATFORM_NAME}.`,
    empty: 'No hay cargas intermediadas.',
    stage: {
      toQuote: 'Por cotizar',
      waitingClient: 'Esperando al cliente',
      published: 'Publicada',
      contracted: 'Contratada',
      closed: 'Cerrada',
    },
    shipper: 'Cliente',
    pickup: 'Recolección',
    target: 'Precio objetivo del cliente',
    clientPrice: 'Precio al cliente (MXN)',
    carrierPrice: 'Tarifa al transportista (MXN)',
    agreedPrice: 'Precio acordado con el transportista',
    margin: 'Margen',
    pendingOffers: (count: number) =>
      count === 1 ? '1 oferta pendiente' : `${count} ofertas pendientes`,
    quoteTitle: 'Precios',
    quoteHelp:
      'El cliente ve solo su precio; los transportistas, solo la tarifa. Una vez que el cliente acepta, solo cambia la tarifa.',
    quote: 'Guardar y enviar al cliente',
    updateRate: 'Cambiar la tarifa',
    saving: 'Guardando…',
    saved: 'Precios guardados.',
    offersTitle: `Ofertas de los transportistas (respondes como ${PLATFORM_NAME})`,
    noOffers: 'Todavía no hay ofertas.',
    offerFrom: { carrier: 'Transportista', shipper: PLATFORM_NAME },
    accept: 'Aceptar',
    reject: 'Rechazar',
    counter: 'Contraofertar',
    counterAmount: 'Contraoferta (MXN)',
    conditions: 'Condiciones',
    send: 'Enviar',
    columns: {
      carrier: 'Transportista',
      from: 'De',
      amount: 'Monto',
      created: 'Fecha',
      status: 'Estado',
    },
    loadDetail: 'Ver la carga y su viaje',
    back: 'Volver a cargas intermediadas',
    nav: 'Intermediadas',
  },
  errors: {
    clientPrice: 'Escribe el precio al cliente.',
    carrierPrice: 'Escribe la tarifa al transportista.',
    carrierOverClient: 'La tarifa al transportista no puede ser mayor que el precio al cliente.',
    overClientPrice: 'El monto no puede ser mayor que el precio al cliente.',
    amount: 'Escribe un monto válido.',
    quoteChanged: `${PLATFORM_NAME} cambió el precio. Revisa el nuevo precio antes de aceptarlo.`,
    clientApproved: 'El cliente ya aceptó su precio: solo puedes cambiar la tarifa.',
    notQuotable: 'Esta carga ya no admite cambios de precio.',
    noQuote: 'Esta carga no tiene una cotización por aceptar.',
    notEditable: `Las cargas gestionadas por ${PLATFORM_NAME} no se editan. Cancélala y envía una nueva.`,
    generic: 'No pudimos guardar el cambio. Intenta de nuevo.',
  },
} as const;
