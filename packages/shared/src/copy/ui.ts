/** Labels of the web UI kit and shell ("Fulmis", docs/plan-fulmis.md §1.5). */
export const uiCopy = {
  /** The close button of a dialog or a sheet (read by screen readers). */
  close: 'Cerrar',
  /** The account button of the sidebar (read by screen readers). */
  account: 'Cuenta',
  /** The navigation of the sidebar (read by screen readers). */
  sections: 'Secciones',
  /** The button of the top bar that opens the navigation under 1024 px, and its panel. */
  openMenu: 'Abrir menú',
  menu: 'Menú',
  /** The button that backs out of a confirmation dialog. */
  cancel: 'Cancelar',
  /** What a skeleton says to a screen reader while a page loads. */
  loading: 'Cargando…',
  /** The header of the column of row actions of a table (read by screen readers). */
  actions: 'Acciones',
  /** The state of a step of a sequence, next to its mark (read by screen readers). */
  steps: {
    done: 'Hecho',
    current: 'En curso',
    upcoming: 'Pendiente',
  },
} as const;

/** The names of the groups of the sidebar (docs/plan-fulmis.md §1.5). */
export const navCopy = {
  groups: {
    operation: 'Operación',
    company: 'Empresa',
    verification: 'Verificación',
    money: 'Dinero',
    system: 'Sistema',
  },
} as const;

/**
 * The brand panel of the access screens (docs/plan-fulmis.md §1.5): three lines
 * of value. It names no city or route: the public trip link (/viaje/<token>)
 * shares the panel and must reveal nothing that could pass for trip data.
 */
export const brandPanelCopy = {
  kicker: 'Transporte de carga en México',
  headline: 'Publica tu carga. Compara ofertas. Sigue el viaje.',
  lines: [
    'Ofertas de transportistas verificados',
    'Cada paso del viaje, registrado',
    'Facturación y cobranza en un solo lugar',
  ],
} as const;

/** The sample page of the web kit (/dev/kit, development only): its titles and sample data. */
export const devKitCopy = {
  title: 'Muestra del kit',
  description: 'Cada pieza del kit web y cada tono, en los dos temas.',
  route: 'Monterrey → Guadalajara',
  returnRoute: 'Guadalajara → Monterrey',
  city: 'Monterrey, Nuevo León',
  /** Sample amounts in cents: a whole one and one with cents. */
  priceCents: 3_880_000,
  feeCents: 1_234_550,
  weight: '15,000',
  date: '20 oct 2026',
  folio: 'V-000128',
  sections: {
    tones: 'Tonos de estado',
    buttons: 'Botones',
    fields: 'Campos',
    notices: 'Avisos',
    kpis: 'Indicadores',
    table: 'Tabla',
    tableCards: 'Tabla que pasa a tarjetas en el teléfono',
    detail: 'Detalle con riel',
    steps: 'Pasos',
    money: 'Dinero',
    dialogs: 'Diálogos',
    empties: 'Vacíos',
    skeletons: 'Esqueletos',
    lists: 'Grupos y celdas',
    tabs: 'Pestañas y segmentado',
  },
  tones: {
    attention: 'Atención',
    progress: 'En curso',
    pending: 'Pendiente',
    done: 'Hecho',
    problem: 'Problema',
    inactive: 'Inactivo',
  },
  kpis: {
    toReview: { label: 'Ofertas por revisar', hint: 'En 2 cargas' },
    inTransit: { label: 'Viajes en curso', hint: '1 llega hoy' },
    toPay: { label: 'Por pagar', hint: '3 facturas' },
    delivered: { label: 'Entregados este mes', hint: 'Sin incidencias' },
  },
  rail: {
    status: 'Estado',
    amount: 'Flete acordado',
    actions: 'Acciones',
  },
  confirm: {
    trigger: 'Cancelar la carga',
    title: '¿Cancelar esta carga?',
    description:
      'La carga deja de recibir ofertas y los transportistas que ofertaron reciben un aviso. No se puede deshacer.',
    confirm: 'Sí, cancelar la carga',
  },
  empty: {
    title: 'Todavía no hay cargas',
    description: 'Publica la primera y recibe ofertas de transportistas verificados.',
  },
  notices: {
    info: 'Los horarios se muestran en la hora de la Ciudad de México.',
    attention: 'Tienes 3 ofertas por revisar en esta carga.',
    pending: 'Tu documento está en revisión. Te avisamos en cuanto termine.',
    success: 'La oferta quedó aceptada.',
    error: 'No pudimos guardar los cambios. Inténtalo de nuevo.',
  },
} as const;

/** Shared display formatters (packages/shared/src/formatters.ts). */
export const formatterCopy = {
  /** In place of a stored date or time that cannot be read (e.g. past year 9999 in UTC). */
  invalidDate: 'fecha no válida',
} as const;
