// Spanish copy of the return loads (I7, D40): the notification when a trip
// reaches its destination and the "Para el regreso" section of the trip.

const loads = (n: number) => (n === 1 ? '1 carga' : `${n} cargas`);

export const backhaulCopy = {
  /** Section of the trip in progress (app and web of the carrier). */
  section: 'Para el regreso',
  /** Under the title: where and when the unit is free. */
  description: (city: string, at: string | null) =>
    at
      ? `Cargas compatibles cerca de ${city} para cuando la unidad quede libre (${at}).`
      : `Cargas compatibles cerca de ${city} para cuando la unidad quede libre.`,
  empty: 'Por ahora no hay cargas compatibles cerca del destino.',
  /** The notification ("backhaul_suggestions"). */
  notificationTitle: 'Carga de regreso',
  notificationBody: (
    count: number | undefined,
    city: string | undefined,
    unit: string | undefined,
  ) =>
    `${count === undefined || count === 0 ? 'Hay cargas' : loads(count)} cerca de ${city ?? 'tu destino'} para cuando ${unit ? `la unidad ${unit}` : 'tu unidad'} quede libre.`,
} as const;
