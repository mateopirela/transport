// Spanish copy of G5 (D20): cancelling a trip with a reason, and releasing a
// unit whose trip was cancelled after it set off. Shared by the web (carrier
// and shipper) and the app.
import type { TripCancellationReason } from '../enums';

export const tripCancellationReasonLabels: Record<TripCancellationReason, string> = {
  shipper_request: 'A solicitud del cliente',
  carrier_request: 'A solicitud del transportista',
  mechanical_failure: 'Falla mecánica',
  accident: 'Accidente',
  cargo_issue: 'Problema con la carga',
  documentation: 'Documentación',
  other: 'Otro',
};

export const tripCancelCopy = {
  open: 'Cancelar el viaje',
  title: '¿Cancelar el viaje?',
  help: 'Avisaremos a la otra parte y al operador. Un viaje solo se cancela antes de que el operador empiece a cargar.',
  /** The unit already set off: it will wait for its release (D20). */
  onTheWay:
    'La unidad ya salió: quedará "Pendiente de liberar" hasta que su coordinador confirme dónde está el camión.',
  reason: 'Motivo',
  choose: 'Elige un motivo',
  notes: 'Notas',
  notesHint: 'Obligatorias si el motivo es "Otro".',
  confirm: 'Sí, cancelar el viaje',
  keep: 'No cancelar',
  cancelling: 'Cancelando…',
  done: 'El viaje quedó cancelado.',
} as const;

export const vehicleReleaseCopy = {
  /** Label of the unit in the lists. */
  badge: 'Pendiente de liberar',
  home: {
    title: (count: number) => `Unidades por liberar (${count})`,
    help: 'Su viaje se canceló después de salir. Confirma dónde está cada camión para que vuelva a recibir cargas.',
    item: (unit: string, route: string) => `${unit} · viaje ${route}`,
    open: 'Liberar',
  },
  screen: {
    title: 'Liberar unidad',
    help: (route: string) =>
      `El viaje ${route} se canceló después de salir. Confirma dónde quedó el camión y desde cuándo está libre: con eso vuelve a recibir recomendaciones de cargas cercanas.`,
    lastKnown: (at: string) => `Última ubicación conocida: ${at}`,
    noLastKnown: 'No tenemos la última ubicación del camión: elige una ciudad.',
    where: '¿Dónde está el camión?',
    places: {
      last: 'En su última ubicación',
      city: 'En una ciudad',
      map: 'Un punto en el mapa',
    },
    near: (city: string, state: string) => `Cerca de ${city}, ${state}`,
    city: 'Ciudad',
    mapHint: 'Haz clic en el mapa para marcar dónde está el camión.',
    mapPicked: (city: string, state: string) => `Punto marcado cerca de ${city}, ${state}`,
    mapUnavailable: 'El mapa no está disponible. Elige su última ubicación o una ciudad.',
    when: '¿Desde cuándo está libre?',
    whenHint: 'Por defecto, ahora. Hora del centro de México.',
    date: 'Fecha (AAAA-MM-DD)',
    time: 'Hora (HH:MM)',
    notes: 'Notas (opcional)',
    submit: 'Liberar unidad',
    submitting: 'Liberando…',
    done: (city: string) =>
      `Unidad liberada en ${city}. Ya vuelve a recibir recomendaciones de cargas cercanas.`,
    recommendations: 'Cargas recomendadas desde aquí',
    noRecommendations: 'Por ahora no hay cargas compatibles cerca.',
  },
  errors: {
    /** set_vehicle_availability, assign_trip and the offers while the unit waits. */
    pendingRelease: 'Primero libera la unidad.',
    notFound: 'Esta unidad ya no está pendiente de liberar o no la operas.',
    alreadyReleased: 'Esta unidad ya se liberó.',
    invalidPlace: 'Elige dónde está el camión.',
    archived: 'La unidad está dada de baja.',
    generic: 'No pudimos liberar la unidad. Inténtalo de nuevo.',
  },
} as const;
