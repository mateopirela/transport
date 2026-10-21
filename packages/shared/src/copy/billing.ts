// Subscription of the carrier (H3, D24-E1, D30): the web of the Gerente, the
// app (information only: it never sells nor links to the purchase) and the
// admin panel.

export const subscriptionStatusLabels = {
  pilot_free: 'Piloto gratis',
  active: 'Activa',
  past_due: 'Vencida',
  canceled: 'Cancelada',
  none: 'Sin suscripción',
} as const;

export const billingEnforcementLabels = {
  off: 'Apagado: nada se bloquea ni se avisa',
  notice: 'Aviso: se muestra un aviso, nada se bloquea',
  block: 'Bloqueo: sin ofertas ni disponibilidad nuevas',
} as const;

export const billingCopy = {
  title: 'Suscripción',
  description: 'El estado de la suscripción de tu empresa a Transport.',
  status: 'Estado',
  plan: 'Plan',
  plans: 'Planes',
  price: 'Precio',
  priceToBeDefined: 'Por definir',
  perMonth: (amount: string) => `${amount} al mes`,
  perYear: (amount: string) => `${amount} al año`,
  pilotEndsAt: 'Fin de la prueba piloto',
  pilotEndsAtNone: 'Sin fecha',
  periodEnd: 'Siguiente cobro',
  cancelsAtPeriodEnd: (date: string) => `Se cancela el ${date}`,
  pilotTitle: 'Piloto gratis',
  pilotBody:
    'Durante la prueba piloto la plataforma es gratis. Te avisaremos antes de que termine.',
  plansReadOnly: 'Los precios se darán a conocer antes de que termine la prueba piloto.',
  coordinatorOnly: 'Solo el Gerente administra la suscripción.',
  subscribe: 'Suscribirme',
  managePayment: 'Administrar pago',
  checkoutUnavailable: 'Por ahora no se puede contratar este plan.',
  returnOk: 'Listo: recibimos tu pago. El estado se actualiza en unos segundos.',
  returnCanceled: 'No se completó el pago. Puedes intentarlo de nuevo cuando quieras.',
  /** The app never sells (App Store 3.1.1/3.1.3, Google Play): text, no link. */
  appManagedOnWeb: 'La suscripción se administra desde la web de Transport.',
  banner: {
    pilotEnding: (date: string) =>
      `La prueba piloto gratis termina el ${date}. El Gerente podrá contratar la suscripción en la web.`,
    pilotEndingNoDate: 'La prueba piloto gratis termina pronto.',
    inactive: 'Tu suscripción no está activa. El Gerente puede reactivarla en la web.',
    link: 'Ver suscripción',
  },
  errors: {
    billingDisabled: 'Durante la prueba piloto la plataforma es gratis.',
    pilotActive: 'Durante la prueba piloto la plataforma es gratis.',
    managerOnly: 'Solo el Gerente administra la suscripción.',
    planUnavailable: 'Este plan no está disponible.',
    alreadySubscribed: 'Tu empresa ya tiene una suscripción. Usa "Administrar pago".',
    noCustomer: 'Todavía no hay un pago que administrar.',
    checkoutInProgress: 'Ya estamos abriendo el pago. Intenta de nuevo en unos segundos.',
    subscriptionRequired: 'Tu suscripción no está activa. El Gerente puede reactivarla en la web.',
    generic: 'No se pudo abrir el pago. Intenta de nuevo.',
  },
} as const;

export const adminBillingCopy = {
  nav: 'Suscripciones',
  title: 'Suscripciones',
  description:
    'Prueba piloto, modo de bloqueo, planes y estado de cada empresa transportista. Cada cambio queda en la bitácora.',
  sections: {
    pilot: 'Prueba piloto',
    enforcement: 'Sin suscripción después del piloto',
    plans: 'Planes',
    companies: 'Empresas transportistas',
  },
  pilotMode: 'Prueba piloto activa',
  pilotModeHelp: 'Mientras esté activa, todas las empresas están en "Piloto gratis" y no se cobra.',
  pilotOn: 'Activa',
  pilotOff: 'Terminada',
  endPilot: 'Terminar la prueba piloto',
  endPilotConfirmTitle: '¿Terminar la prueba piloto?',
  endPilotConfirmBody:
    'Las empresas dejarán de estar en "Piloto gratis" y el Gerente podrá contratar un plan con precio.',
  resumePilot: 'Reactivar la prueba piloto',
  pilotEndsAt: 'Fecha de fin',
  pilotEndsAtHelp: 'Solo para los avisos: 14 días antes se avisa a las empresas.',
  clearDate: 'Quitar fecha',
  saveDate: 'Guardar fecha',
  enforcement: 'Modo',
  saveEnforcement: 'Guardar modo',
  blockConfirmTitle: '¿Activar el bloqueo?',
  blockConfirmBody:
    'Con la prueba piloto terminada, las empresas sin suscripción activa no podrán hacer ofertas ni publicar disponibilidad. Los viajes en curso no se bloquean.',
  confirm: 'Confirmar',
  cancel: 'Cancelar',
  saved: 'Cambio guardado.',
  columns: {
    plan: 'Plan',
    audience: 'Para',
    price: 'Precio',
    stripePrice: 'Precio de Stripe',
    active: 'Activo',
    actions: 'Acciones',
    company: 'Empresa',
    status: 'Estado',
    stored: 'Estado en Stripe',
    periodEnd: 'Siguiente cobro',
  },
  audience: {
    fleet: 'Empresa transportista',
    owner_operator: 'Hombre camión',
  },
  planName: 'Nombre',
  planDescription: 'Descripción',
  planPrice: 'Precio mensual (MXN)',
  planPriceHelp: 'Vacío: "Por definir".',
  planStripePrice: 'Precio de Stripe (price_…)',
  planActive: 'Activo',
  savePlan: 'Guardar plan',
  yes: 'Sí',
  no: 'No',
  noCompanies: 'Todavía no hay empresas transportistas.',
  companySection: 'Suscripción',
  errors: {
    notAdmin: 'Solo un administrador puede hacer este cambio.',
    invalid: 'Revisa el valor.',
    generic: 'No se pudo guardar. Intenta de nuevo.',
  },
} as const;
