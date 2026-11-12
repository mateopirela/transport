// Spanish copy of the client's web in "Fulmis" (V3, docs/plan-fulmis.md §2):
// the dashboard of the start page, the tables of the lists and the pieces of
// the detail pages that are new. The rest of the client's text stays where it
// was (loads.ts, client-trips.ts, negotiation.ts, freight.ts).

const plural = (count: number, one: string, many: string) =>
  count === 1 ? `1 ${one}` : `${count} ${many}`;

/** The start page of the client: a dashboard (§1.5). */
export const clientHomeCopy = {
  title: 'Inicio',
  /** What the row of indicators is, for a screen reader. */
  summary: 'Resumen',
  kpis: {
    offers: 'Ofertas por revisar',
    offersHint: (loads: number) =>
      loads === 0 ? 'Ninguna espera tu respuesta' : `En ${plural(loads, 'carga', 'cargas')}`,
    published: 'Cargas publicadas',
    publishedHint: (total: number, waiting: number) => {
      if (total === 0) return 'Ninguna en el mercado';
      if (waiting === 0) return 'Todas tienen ofertas';
      return `${plural(waiting, 'espera', 'esperan')} ofertas`;
    },
    trips: 'Viajes en curso',
    tripsHint: (toConfirm: number) =>
      toConfirm === 0
        ? 'Ninguno por confirmar'
        : `${plural(toConfirm, 'entrega', 'entregas')} por confirmar`,
    balance: 'Saldo por pagar',
    balanceOverdue: (amount: string) => `Vencido: ${amount}`,
    balanceClear: 'Nada vencido',
  },
  attention: {
    title: 'Requiere tu atención',
    empty: 'Nada espera tu respuesta.',
    emptyHelp:
      'Aquí aparecen las ofertas nuevas, los precios por aprobar y las entregas por confirmar.',
    more: (count: number) => `Y ${plural(count, 'pendiente más', 'pendientes más')}.`,
    offer: {
      tag: 'Oferta nueva',
      detail: (carrier: string, amount: string) => `${carrier} ofrece ${amount}`,
      action: 'Revisar oferta',
    },
    quote: {
      tag: 'Precio listo',
      detail: (amount: string) => `Tu precio: ${amount}. Apruébalo para publicarla.`,
      action: 'Revisar precio',
    },
    delivery: {
      tag: 'Por confirmar',
      detail: 'El operador marcó la entrega. Confírmala para cerrar el viaje.',
      action: 'Confirmar entrega',
    },
    overdue: {
      tag: 'Vencido',
      detail: (amount: string, date: string) => `${amount} por pagar desde el ${date}`,
      action: 'Ver cartera',
    },
    draft: {
      tag: 'Borrador',
      detail: 'Los transportistas no la ven hasta que la publiques.',
      action: 'Revisar y publicar',
    },
  },
  activeLoads: {
    title: 'Cargas activas',
    seeAll: 'Ver todas',
    empty: 'No tienes cargas activas.',
    emptyHelp: 'Publica una carga y aquí verás su estado y sus ofertas.',
  },
  currentTrip: {
    title: 'Viaje en curso',
    none: 'Ningún viaje en camino.',
    noneHelp: 'Cuando aceptes una oferta, aquí verás el avance del viaje.',
    open: 'Ver viaje',
    seeAll: 'Ver viajes',
  },
  portfolio: {
    title: 'Cartera',
    open: 'Ver cartera',
  },
} as const;

/** The four steps of a trip as the client follows it (§1.5 "avance por pasos"). */
export const tripProgressCopy = {
  label: 'Avance del viaje',
  steps: {
    assignment: 'Asignación',
    pickup: 'Recolección',
    transit: 'En tránsito',
    delivery: 'Entrega',
  },
} as const;

/** The tables and the details of the client's loads and trips. */
export const clientListsCopy = {
  loads: {
    emptyHelp: 'Publica tu primera carga y los transportistas verificados te harán ofertas.',
    emptyFiltered: 'No hay cargas con este estado.',
    seeAll: 'Ver todas',
    price: 'Precio',
  },
  trips: {
    emptyHelp: 'Cuando aceptes una oferta, el viaje aparece aquí con su avance.',
  },
  load: {
    details: 'Detalles de la carga',
  },
  offer: {
    /** The amount of an offer against the client's price: "+$2,000 contra tu precio". */
    delta: (delta: string) => `${delta} contra tu precio`,
    /** A carrier's offer that waits for the client's answer. */
    respond: 'Por responder',
    counterTitle: 'Haz tu contraoferta',
    counterHelp: (amount: string, carrier: string) =>
      `${carrier} ofrece ${amount}. Propón otro monto; la negociación sigue en el chat.`,
    rejectTitle: '¿Rechazar esta oferta?',
    rejectHelp: (carrier: string) =>
      `${carrier} verá que rechazaste su oferta. No se puede deshacer.`,
  },
  negotiation: {
    latest: 'Última oferta',
    yourPrice: 'Tu precio propuesto',
    unit: 'Unidad propuesta',
  },
  trip: {
    assignment: 'Asignación',
  },
  loadForm: {
    /** The index of the form's steps, beside it. */
    steps: 'Pasos',
  },
} as const;
