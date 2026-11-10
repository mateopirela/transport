// Freight ledger (I3, D08-E2, D33-E1, D34-E1): "Cobranza" of the carrier (app
// and web), "Cartera" of the client (web) and the admin's reconciliation.

/** What the client owes Fulmis for a trip, as the client and the admin read it. */
export const freightClientStatusLabels = {
  pending: 'Por pagar',
  invoiced: 'Facturado',
  paid: 'Pagado',
  overdue: 'Vencido',
  written_off: 'Incobrable',
  cancelled: 'Cancelado',
} as const;

/** What Fulmis owes the carrier for a trip (D34-E1), as the carrier and the admin read it. */
export const freightCarrierStatusLabels = {
  pending: 'Por cobrar',
  on_hold: 'Retenido',
  quick_pay_requested: 'Pago rápido solicitado',
  scheduled: 'Programado',
  paid: 'Pagado',
  cancelled: 'Cancelado',
} as const;

export const freightPaymentDirectionLabels = {
  client_to_fulmis: 'Del cliente a Fulmis',
  fulmis_to_carrier: 'De Fulmis al transportista',
} as const;

export const freightCopy = {
  termsToBeDefined: 'Plazo por definir',
  termsDays: (days: number) => `${days} días`,
  dueOnAfterDelivery: 'Después de la entrega',
  route: (origin: string, destination: string) => `${origin} → ${destination}`,
  /** Cobranza (carrier, app and web). */
  collections: {
    title: 'Cobranza',
    description:
      'Lo que Fulmis te paga por cada viaje: el flete menos la comisión, al vencer el plazo del cliente y una vez que el cliente pagó.',
    receivable: 'Por cobrar',
    onHold: 'Retenido',
    paidThisMonth: 'Pagado este mes',
    onHoldHelp: 'Retenido: el cliente no ha pagado. Fulmis se encarga de la cobranza.',
    freight: 'Flete',
    commission: (percent: string) => `Comisión (${percent})`,
    commissionShort: 'Comisión',
    net: 'Neto',
    dueOn: 'Fecha de pago',
    status: 'Estado',
    paid: 'Pagado',
    trip: 'Viaje',
    empty: 'Todavía no hay viajes por cobrar.',
    emptyHelp: 'Cuando ganes un viaje, aquí verás cuánto te paga Fulmis y cuándo.',
    payments: 'Pagos recibidos',
    paymentLine: (amount: string, date: string, reference: string) =>
      `${amount} el ${date} · Clave de rastreo ${reference}`,
  },
  /** Cartera (client, web). */
  portfolio: {
    title: 'Cartera',
    description:
      'Lo que debes a Fulmis por cada viaje: el 100 % del flete, por SPEI, en el plazo acordado.',
    balance: 'Saldo total',
    overdue: 'Vencido',
    upcoming: 'Por vencer',
    trip: 'Viaje',
    invoice: 'Factura',
    amount: 'Flete',
    dueOn: 'Vencimiento',
    paid: 'Pagado',
    pending: 'Pendiente',
    status: 'Estado',
    empty: 'Todavía no hay viajes en tu cartera.',
    emptyHelp: 'Cuando contrates un viaje, aquí verás cuánto debes y cuándo vence.',
    termsNote: (terms: string) => `Tu plazo de pago: ${terms}.`,
    termsMissing: 'Tu plazo de pago está por definir. Fulmis te lo confirmará.',
  },
  /** Admin: /admin/flete. */
  admin: {
    nav: 'Flete',
    title: 'Libro del flete',
    description:
      'Cada viaje con lo que debe el cliente y lo que se le paga al transportista. Registra cada pago SPEI cuando llegue al banco.',
    filters: {
      label: 'Filtrar',
      all: 'Todos',
      overdue: 'Vencidos',
      clientOpen: 'Cliente por pagar',
      carrierOpen: 'Transportista por pagar',
      onHold: 'Retenidos',
      review: 'Por revisar',
    },
    empty: 'No hay viajes con este filtro.',
    client: 'Cliente',
    carrier: 'Transportista',
    trip: 'Viaje',
    trips: 'Viajes',
    clientSide: 'Lo que debe el cliente',
    carrierSide: 'Lo que se paga al transportista',
    amount: 'Flete',
    commission: 'Comisión',
    net: 'Neto',
    /** A brokered load (I6, D39): the client's price minus the carrier's. */
    margin: 'Margen',
    terms: 'Plazo',
    dueOn: 'Vence',
    paid: 'Pagado',
    payments: 'Pagos registrados',
    noPayments: 'Sin pagos registrados.',
    carrierWaitsForClient:
      'Al transportista se le paga cuando el cliente pague completo, o antes con un pago rápido aprobado.',
    needsReview: 'Viaje cancelado con pagos: resuélvelo a mano.',
    reviewNote: 'Cómo se resolvió',
    resolveReview: 'Marcar como resuelto',
    reviewResolved: 'Listo: quedó marcado como resuelto.',
    recordPayment: 'Registrar pago',
    direction: 'Pago',
    paymentAmount: 'Monto',
    paidOn: 'Fecha del pago',
    speiReference: 'Clave de rastreo SPEI',
    speiReferenceHelp: 'Hasta 30 letras y números. La misma clave no se registra dos veces.',
    note: 'Nota (opcional)',
    save: 'Registrar',
    saved: 'Listo: el pago quedó registrado.',
    settings: 'Comisión',
    commissionDefault: 'Comisión por viaje',
    commissionHelp:
      'En puntos base: 300 = 3 %. 0 (sin comisión) o de 300 a 500. Cada viaje congela la comisión al crearse.',
    saveCommission: 'Guardar comisión',
    commissionSaved: 'Listo: los viajes nuevos usarán esta comisión.',
    companyTerms: 'Plazo de pago del cliente',
    companyTermsHelp:
      'Días naturales después de la entrega con evidencia. Los viajes con el plazo por definir lo toman al guardarlo.',
    companyCommission: 'Comisión de este transportista',
    companyCommissionHelp:
      'Vacía: la comisión general. En puntos base: 0 o de 300 a 500. Solo aplica a los viajes nuevos.',
    noTerms: 'Por definir',
    generalCommission: 'General',
    saveTerms: 'Guardar plazo',
    saveCompanyCommission: 'Guardar comisión',
    companySaved: 'Listo: quedó guardado.',
    errors: {
      notAdmin: 'Solo el administrador puede hacer esto.',
      invalid: 'Revisa los datos: hay un valor que no es válido.',
      amount: 'Escribe un monto mayor a cero, con hasta dos decimales.',
      overpaid: 'El monto es mayor a lo que falta por pagar.',
      reference: 'La clave de rastreo lleva de 1 a 30 letras y números.',
      duplicateReference: 'Esa clave de rastreo ya se registró en otro pago.',
      date: 'La fecha del pago no puede ser futura ni anterior al viaje.',
      closed: 'Este lado ya está pagado o el viaje se canceló.',
      clientUnpaid:
        'El cliente aún no termina de pagar este viaje. Al transportista se le paga cuando el cliente pagó completo o con un pago rápido aprobado.',
      notFound: 'No encontramos ese viaje.',
      noReview: 'Este viaje no tiene una revisión pendiente.',
      note: 'Escribe una nota de hasta 500 caracteres.',
      generic: 'No se pudo guardar. Intenta de nuevo.',
    },
  },
} as const;
