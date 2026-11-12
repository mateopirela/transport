// Spanish copy of the admin panel in "Fulmis" (docs/plan-fulmis.md §2 V5):
// the dashboard, the confirmations of every action with an effect on money or
// on accounts, the settings gathered in one page and the paged audit log.

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const adminPanelCopy = {
  home: {
    kpis: {
      companies: 'Cuentas por verificar',
      companiesHint: (n: number) =>
        n === 0
          ? 'Ninguna empresa en revisión'
          : plural(n, '1 empresa en revisión', `${n} empresas en revisión`),
      documents: 'Documentos por revisar',
      documentsHint: (company: number, vehicle: number, operator: number) =>
        `${company} de empresa · ${vehicle} de unidades · ${operator} de operadores`,
      payments: 'Pagos por registrar',
      paymentsHint: (overdue: number, carrier: number) =>
        `${overdue} ${plural(overdue, 'cobro vencido', 'cobros vencidos')} · ${carrier} ${plural(carrier, 'pago', 'pagos')} al transportista`,
      incidents: 'Incidencias abiertas',
      incidentsHint: (n: number) =>
        n === 0 ? 'Sin incidencias abiertas' : 'Las más antiguas, primero',
    },
    attention: 'Requiere tu atención',
    attentionCount: (n: number) => plural(n, '1 pendiente', `${n} pendientes`),
    attentionEmpty: 'Nada pendiente',
    attentionEmptyBody: 'Las empresas, los documentos, los pagos y las incidencias están al día.',
    /** More items than the list shows. */
    attentionMore: (n: number) => plural(n, 'y 1 más', `y ${n} más`),
    tags: {
      company: 'Empresa',
      document: 'Documento',
      quickPay: 'Pago rápido',
      review: 'Revisión',
      overdue: 'Vencido',
      carrierPayment: 'Por pagar',
      incident: 'Incidencia',
      brokered: 'Por cotizar',
      brokeredOffers: 'Ofertas',
    },
    items: {
      company: (name: string) => `Verifica a ${name}`,
      companyDetail: (type: string, missing: string) => `${type} · ${missing}`,
      document: (requirement: string, owner: string) => `${requirement} de ${owner}`,
      quickPay: (route: string) => `Pago rápido pedido en ${route}`,
      quickPayDetail: (carrier: string) => `${carrier} espera tu respuesta`,
      review: (route: string) => `Viaje cancelado con pagos: ${route}`,
      reviewDetail: 'Resuélvelo a mano en el libro del flete',
      overdue: (route: string) => `Cobro vencido: ${route}`,
      overdueDetail: (shipper: string, due: string) => `${shipper} · venció el ${due}`,
      carrierPayment: (route: string) => `Paga al transportista: ${route}`,
      carrierPaymentDetail: (carrier: string) => `${carrier} · el cliente ya pagó`,
      incident: (kind: string, route: string) => `${kind} en ${route}`,
      brokered: (route: string) => `Cotiza ${route}`,
      brokeredOffers: (route: string) => `Responde las ofertas de ${route}`,
    },
    actions: {
      company: 'Revisar empresa',
      document: 'Revisar documento',
      quickPay: 'Ver solicitud',
      review: 'Resolver',
      overdue: 'Ver cobro',
      carrierPayment: 'Registrar pago',
      incident: 'Ver incidencia',
      brokered: 'Cotizar',
      brokeredOffers: 'Ver ofertas',
    },
  },
  lists: {
    /** The count over a table: "25 cargas". */
    count: (n: number, one: string, many: string) => `${n} ${plural(n, one, many)}`,
    loads: ['carga', 'cargas'] as const,
    trips: ['viaje', 'viajes'] as const,
    incidents: ['incidencia', 'incidencias'] as const,
    users: ['usuario', 'usuarios'] as const,
    companies: ['empresa', 'empresas'] as const,
    documents: ['documento', 'documentos'] as const,
    auditEntries: ['acción registrada', 'acciones registradas'] as const,
    noPrice: '—',
  },
  loadDetail: {
    eyebrow: 'Carga',
    proposed: 'Propuesto por el cliente',
    agreed: 'Acordado',
    shipper: 'Cliente',
    carrier: 'Transportista',
    pickup: 'Recolección',
    noCarrier: 'Sin transportista',
    pendingOffers: (n: number) => plural(n, '1 oferta pendiente', `${n} ofertas pendientes`),
  },
  brokered: {
    route: 'Ruta',
    clientPrice: 'Precio al cliente',
    carrierPrice: 'Tarifa',
    stage: 'Estado',
    open: 'Ver',
  },
  brokeredDetail: {
    eyebrow: 'Carga intermediada',
  },
  companyDetail: {
    progress: (approved: number, required: number) => `${approved} de ${required}`,
    progressHint: 'Documentos obligatorios aprobados',
  },
  incidents: {
    columns: {
      kind: 'Tipo',
      trip: 'Viaje',
      description: 'Descripción',
      reported: 'Reportada',
      resolution: 'Resolución',
    },
  },
  /** The confirmations of the admin's actions: what will happen, before it happens. */
  confirm: {
    recordPayment: {
      title: '¿Registrar este pago?',
      body: (direction: string, amount: string, reference: string) =>
        `${direction}: ${amount} con la clave de rastreo ${reference}. El pago queda registrado en el libro del flete y no se puede borrar.`,
      confirm: 'Registrar pago',
    },
    resolveReview: {
      title: '¿Marcar el viaje como resuelto?',
      body: 'El viaje sale de "Por revisar" con tu nota. Queda en la auditoría.',
      confirm: 'Marcar como resuelto',
    },
    commission: {
      title: '¿Cambiar la comisión general?',
      body: (value: string) =>
        `Los viajes nuevos usarán ${value}. Los viajes que ya existen conservan la suya.`,
      confirm: 'Cambiar comisión',
    },
    companyCommission: {
      title: '¿Cambiar la comisión de este transportista?',
      body: (value: string) =>
        `Sus viajes nuevos usarán ${value}. Los viajes que ya existen conservan la suya.`,
      general: 'la comisión general',
      confirm: 'Cambiar comisión',
    },
    terms: {
      title: '¿Cambiar el plazo de pago del cliente?',
      body: (value: string) =>
        `El cliente pagará a ${value}. Los viajes con el plazo por definir lo toman al guardarlo.`,
      confirm: 'Cambiar plazo',
    },
    quickPaySettings: {
      title: '¿Cambiar el pago rápido?',
      body: (fee: string, limit: string) =>
        `Tarifa: ${fee} puntos base. Límite de exposición: ${limit}. Las solicitudes nuevas usarán la tarifa nueva.`,
      noLimit: 'sin límite',
      confirm: 'Guardar pago rápido',
    },
    approveQuickPay: {
      title: '¿Aprobar el pago rápido?',
      body: (net: string) =>
        `Se programa el pago de ${net} al transportista antes de que pague el cliente. Fulmis asume el riesgo.`,
      confirm: 'Aprobar pago rápido',
    },
    rejectQuickPay: {
      title: '¿Rechazar la solicitud?',
      body: 'El transportista verá el motivo. Se le pagará cuando el cliente pague.',
      confirm: 'Rechazar solicitud',
    },
    approveCompany: {
      title: '¿Aprobar la empresa?',
      body: 'La empresa podrá operar en la plataforma: publicar cargas u ofertar. Queda en la auditoría.',
      confirm: 'Aprobar empresa',
    },
    reactivateCompany: {
      title: '¿Reactivar la empresa?',
      body: 'La empresa vuelve a operar en la plataforma. Queda en la auditoría.',
      confirm: 'Reactivar empresa',
    },
    rejectCompany: {
      title: '¿Rechazar la empresa?',
      body: 'La empresa no podrá operar y verá el motivo. Queda en la auditoría.',
      confirm: 'Rechazar empresa',
    },
    suspendCompany: {
      title: '¿Suspender la empresa?',
      body: 'Sus usuarios no podrán publicar ni ofertar hasta que la reactives. Queda en la auditoría.',
      confirm: 'Suspender empresa',
    },
    approveDocument: {
      title: '¿Aprobar el documento?',
      body: 'Cuenta para la verificación de la empresa. Queda en la auditoría.',
      confirm: 'Aprobar documento',
    },
    rejectDocument: {
      title: '¿Rechazar el documento?',
      body: 'La empresa verá el motivo y tendrá que subirlo de nuevo. Queda en la auditoría.',
      confirm: 'Rechazar documento',
    },
    contract: {
      title: '¿Registrar la oferta?',
      body: (carrier: string, amount: string) =>
        `Una oferta de ${amount} en nombre de ${carrier}. Queda en la auditoría.`,
      bodyAccept: (carrier: string, amount: string) =>
        `Una oferta de ${amount} en nombre de ${carrier}, aceptada en nombre del cliente: la carga queda contratada y se crea el viaje. Queda en la auditoría.`,
      confirm: 'Registrar',
    },
    acceptOffer: {
      title: '¿Aceptar la oferta?',
      confirm: 'Aceptar oferta',
    },
    resolveIncident: {
      title: '¿Resolver la incidencia?',
      body: 'Sale de las incidencias abiertas con tu resolución. Queda en la auditoría.',
      confirm: 'Resolver incidencia',
    },
    quote: {
      title: '¿Guardar los precios?',
      body: (client: string, carrier: string) =>
        `Precio al cliente: ${client}. Tarifa al transportista: ${carrier}. El cliente ve solo su precio y los transportistas solo la tarifa.`,
      confirm: 'Guardar precios',
    },
    acceptBrokeredOffer: {
      title: '¿Aceptar la oferta del transportista?',
      body: 'La carga queda contratada con este transportista y se crea el viaje.',
      confirm: 'Aceptar oferta',
    },
    rejectBrokeredOffer: {
      title: '¿Rechazar la oferta?',
      body: 'El transportista verá la oferta como rechazada.',
      confirm: 'Rechazar oferta',
    },
    counterBrokeredOffer: {
      title: '¿Enviar la contraoferta?',
      body: (amount: string) => `El transportista recibe una contraoferta de ${amount}.`,
      confirm: 'Enviar contraoferta',
    },
    resumePilot: {
      title: '¿Reactivar la prueba piloto?',
      body: 'Todas las empresas vuelven a "Piloto gratis" y no se les cobra.',
    },
    plan: {
      title: '¿Guardar el plan?',
      body: 'El precio y el estado del plan cambian para las empresas que lo contraten desde ahora.',
      confirm: 'Guardar plan',
    },
    archiveRisk: {
      title: '¿Archivar este riesgo?',
      body: 'Deja de mostrarse a los transportistas. Queda en la auditoría.',
      confirm: 'Archivar',
    },
  },
  settings: {
    description:
      'Todos los ajustes de la plataforma en un solo lugar. Cada cambio queda en la bitácora.',
    sectionsLabel: 'Secciones de ajustes',
    fiscal: 'Datos fiscales',
    commission: 'Comisión',
    commissionHelp: 'La comisión general de los viajes nuevos.',
    quickPay: 'Pago rápido',
    quickPayHelp: 'La tarifa y el límite de lo aprobado que el cliente todavía no paga.',
    subscription: 'Suscripción',
    subscriptionHelp: 'La prueba piloto, el modo sin suscripción y los planes.',
  },
  /** The rail of "Cuenta en revisión" (the company's own onboarding page). */
  review: {
    status: 'Estado',
    documents: 'Documentos',
    documentsHint: 'Documentos obligatorios aprobados',
    steps: 'Pasos de la verificación',
  },
  subscriptions: {
    description:
      'El estado de la suscripción de cada empresa transportista. La prueba piloto y los planes están en Ajustes.',
    settingsLink: 'Ajustes de suscripción',
  },
  freight: {
    settingsLink: 'Comisión y pago rápido',
    carrierPayableHint: 'El cliente ya pagó',
    trips: (n: number) => plural(n, '1 viaje', `${n} viajes`),
  },
} as const;
