// Spanish copy of the operator's trip screen (B21): assigned trip, status
// controls, estimated end of unloading, incidents and the offline queue; and
// its photo evidence (B23).
import type { GatedEvidenceStage } from '../evidence';
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
  /** The departure was refused for missing trip documents (D22, blocks_departure). */
  rejectedMissingDocuments: (documents: string) =>
    `No puedes salir todavía: falta ${documents}. Pide a tu coordinador que lo suba y vuelve a registrar la salida.`,
  dismiss: 'Entendido',
  saveFailed: 'No pudimos guardar el registro en el teléfono. Inténtalo de nuevo.',
  // Timeline.
  timeline: 'Línea de tiempo',
  timelineEmpty: 'Aún no hay eventos.',
  pendingTag: 'Por enviar',
  // Trip documents (D22): the operator reads the service order and the Carta Porte on the road.
  documents: 'Documentos del viaje',
  documentsHelp:
    'La orden de servicio y la Carta Porte de este viaje, por si te las piden en el camino.',
  documentsEmpty: 'Tu coordinador aún no sube documentos de este viaje.',
  documentOpenFailed: 'No pudimos abrir el documento. Revisa tu conexión e inténtalo de nuevo.',
  // Incidents.
  incidents: 'Incidencias',
  reportIncident: 'Reportar incidencia',
  incidentKind: 'Tipo de incidencia',
  incidentDescription: 'Qué pasó',
  incidentSubmit: 'Enviar incidencia',
  // Incidents go through the offline queue (F7): saved first, sent when possible.
  incidentQueued:
    'Incidencia guardada en el teléfono. Se envía en cuanto haya conexión; mientras tanto ya puedes agregarle fotos.',
  incidentPendingTag: 'Pendiente de enviar',
  noIncidents: 'Sin incidencias.',
} as const;

const photos = (count: number) => (count === 1 ? '1 foto' : `${count} fotos`);

/** Photo evidence of the operator's trip (B23). */
export const operatorEvidenceCopy = {
  title: {
    pickup: 'Fotos de recolección',
    delivery: 'Fotos de entrega',
  } satisfies Record<GatedEvidenceStage, string>,
  help: {
    pickup: 'Fotografía la carga ya acomodada en la unidad, con los sellos o etiquetas a la vista.',
    delivery:
      'Fotografía la carga entregada en destino y, si hay, el documento firmado de recibido.',
  } satisfies Record<GatedEvidenceStage, string>,
  progress: (taken: number, minimum: number) =>
    minimum > 0 ? `${taken} de ${minimum} fotos mínimas` : `${photos(taken)} (sin mínimo)`,
  missing: (stage: GatedEvidenceStage, count: number) =>
    stage === 'pickup'
      ? `Toma ${count === 1 ? '1 foto más' : `${count} fotos más`} de la recolección para poder salir con la carga.`
      : `Toma ${count === 1 ? '1 foto más' : `${count} fotos más`} de la entrega para poder terminar la descarga.`,
  take: 'Tomar foto',
  takeIncident: 'Agregar foto',
  cameraOnly: 'Solo se aceptan fotos tomadas en este momento con la cámara.',
  cameraDenied:
    'No tenemos permiso para usar la cámara. Actívalo en la configuración del teléfono para tomar la evidencia.',
  captureFailed: 'No pudimos guardar la foto en el teléfono. Inténtalo de nuevo.',
  saved: 'Foto guardada. Se subirá en cuanto haya conexión.',
  pendingTag: 'Por subir',
  uploadedTag: 'Subida',
  takenAt: (at: string) => `Tomada: ${at}`,
  pendingUploads: (count: number) =>
    count === 1
      ? '1 foto espera para subirse. Se reintenta automáticamente.'
      : `${count} fotos esperan para subirse. Se reintenta automáticamente.`,
  uploadNow: 'Subir ahora',
  rejectedTitle: 'Fotos no aceptadas',
  rejectedBody: (count: number) =>
    `El servidor no aceptó ${photos(count)}: el viaje pudo cambiar o reasignarse. Si aún hace falta, toma la foto de nuevo.`,
  incidentPhotos: (count: number) => (count === 0 ? 'Sin fotos' : photos(count)),
  // Receiver at delivery.
  receiverTitle: 'Quién recibe',
  receiverHelp: 'Escribe el nombre completo de la persona que recibe la carga en destino.',
  receiverName: 'Nombre de quien recibe',
  receivedBy: (name: string) => `Recibió: ${name}`,
} as const;
