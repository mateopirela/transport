// Spanish copy of the operator's trip screen (B21): assigned trip, status
// controls, estimated end of unloading, incidents and the offline queue.
import type { OperatorTripEvent } from '../trips';

/** Button of each status step, in the operator's words. */
export const operatorStepActionLabels: Record<OperatorTripEvent, string> = {
  departed: 'Salir a recolección',
  arrived_at_pickup: 'Llegué a recolección',
  loading_started: 'Iniciar carga',
  loading_finished: 'Terminar carga y salir',
  arrived_at_delivery: 'Llegué a destino',
  unloading_started: 'Iniciar descarga',
  unloading_finished: 'Terminar descarga',
};

/** Question of the confirmation dialog of each status step. */
export const operatorStepConfirmLabels: Record<OperatorTripEvent, string> = {
  departed: '¿Confirmas que ya saliste hacia la recolección?',
  arrived_at_pickup: '¿Confirmas que llegaste al punto de recolección?',
  loading_started: '¿Confirmas que empezó la carga?',
  loading_finished: '¿Confirmas que terminó la carga y sales hacia el destino?',
  arrived_at_delivery: '¿Confirmas que llegaste al destino?',
  unloading_started: '¿Confirmas que empezó la descarga?',
  unloading_finished: '¿Confirmas que terminó la descarga?',
};

export const operatorTripCopy = {
  loadFailed: 'No pudimos cargar tu viaje. Revisa tu conexión e inténtalo de nuevo.',
  noTripTitle: 'Sin viaje asignado',
  noTrip:
    'No tienes un viaje asignado por ahora. Cuando tu transportista te asigne uno, aparecerá aquí.',
  refresh: 'Actualizar',
  origin: 'Origen',
  destination: 'Destino',
  pickupWindow: (from: string, to: string) => `Recolección: ${from} – ${to}`,
  deliveryWindow: (from: string, to: string) => `Entrega: ${from} – ${to}`,
  directionsTo: (place: string) => `Cómo llegar a ${place}`,
  instructions: 'Instrucciones',
  weight: (kg: string) => `Peso: ${kg} kg`,
  requirements: (list: string) => `Requisitos especiales: ${list}`,
  notes: (notes: string) => `Notas del cliente: ${notes}`,
  unit: (plate: string) => `Unidad: ${plate}`,
  progress: 'Avance del viaje',
  confirmTitle: 'Confirmar',
  confirm: 'Sí, confirmar',
  cancel: 'Cancelar',
  locationDenied:
    'No tenemos permiso para usar tu ubicación. Cada cambio de estado guarda la hora y el lugar: actívalo en la configuración del teléfono.',
  locationUnavailable:
    'No pudimos obtener tu ubicación. Activa el GPS o muévete a un lugar abierto e inténtalo de nuevo.',
  openSettings: 'Abrir configuración',
  delivered: 'Entregaste esta carga. Cuando el cliente confirme la entrega, el viaje se cerrará.',
  // Estimated end of unloading (D11).
  unloadEstimateTitle: 'Fin estimado de descarga',
  unloadEstimateHelp:
    'Con esta hora sabremos cuándo queda libre tu unidad para el siguiente viaje.',
  unloadEstimateCurrent: (at: string) => `Fin estimado: ${at}`,
  unloadEstimateDate: 'Fecha (AAAA-MM-DD)',
  unloadEstimateTime: 'Hora (HH:MM)',
  unloadEstimateSave: 'Guardar fin estimado',
  unloadEstimateBeforeNow: 'El fin estimado no puede ser antes de ahora.',
  unloadEstimateTooFar: 'El fin estimado no puede ser más de 30 días después.',
  // Offline queue.
  pendingTitle: 'Pendiente de enviar',
  pendingBody: (count: number) =>
    count === 1
      ? 'Hay 1 registro guardado en el teléfono. Se enviará con su hora original al recuperar la conexión.'
      : `Hay ${count} registros guardados en el teléfono. Se enviarán con su hora original al recuperar la conexión.`,
  syncNow: 'Enviar ahora',
  rejectedTitle: 'No se pudo registrar',
  rejectedBody: (what: string) =>
    `El servidor rechazó "${what}": el viaje pudo cambiar o reasignarse. Revisa su estado actual.`,
  dismiss: 'Entendido',
  saveFailed: 'No pudimos guardar el registro en el teléfono. Inténtalo de nuevo.',
  // Timeline.
  timeline: 'Línea de tiempo',
  timelineEmpty: 'Aún no hay eventos.',
  pendingTag: 'Por enviar',
  // Incidents.
  incidents: 'Incidencias',
  reportIncident: 'Reportar incidencia',
  incidentKind: 'Tipo de incidencia',
  incidentDescription: 'Qué pasó',
  incidentSubmit: 'Enviar incidencia',
  incidentSent: 'Incidencia enviada. Tu transportista y el equipo de soporte ya la ven.',
  incidentFailed: 'No pudimos enviar la incidencia. Revisa tu conexión e inténtalo de nuevo.',
  noIncidents: 'Sin incidencias.',
} as const;
