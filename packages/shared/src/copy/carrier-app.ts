// Spanish copy of the carrier's screens in the app laid out as Fulmis (V8,
// docs/plan-fulmis.md §1.5): the home as a dashboard, the filters of the
// loads and the groups of "Más". The home reuses the indicators and the
// attention rows of the web's dashboard (carrierWebCopy.dashboard), so both
// say the same.

export const carrierAppCopy = {
  home: {
    /** Under "Requiere tu atención": the rows of a kind left out. */
    moreExpiring: (count: number) =>
      count === 1 ? 'Y 1 documento más por vencer.' : `Y ${count} documentos más por vencer.`,
    /** An expiring document's row: the document and whose it is. */
    expiringItem: (document: string, owner: string) => `${document} · ${owner}`,
    /** The indicator while Cobranza cannot be read. */
    noFigure: '—',
  },
  loads: {
    /** The label over the filter chips. */
    filters: 'Filtrar por',
    /** A chip with its filter chosen: "Origen: Monterrey". */
    chosen: (filter: string, value: string) => `${filter}: ${value}`,
  },
  more: {
    groups: {
      company: 'Empresa',
      money: 'Dinero',
    },
  },
} as const;
