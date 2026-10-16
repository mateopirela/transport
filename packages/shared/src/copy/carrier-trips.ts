// Spanish copy of the carrier's trips in the app (B20): won trips, assigning
// the unit and the operator, monitoring trips on the road, the history and the
// trip documents (Carta Porte, D09). The chat reuses chatCopy.
import type { AssignmentBlocker, AssignmentWarning, CarrierTripGroup } from '../carrier-trips';

const minutesAgo = (minutes: number) =>
  minutes < 1 ? 'hace un momento' : minutes === 1 ? 'hace 1 min' : `hace ${minutes} min`;

export const carrierTripsCopy = {
  list: {
    title: 'Viajes',
    subtitle: 'Tus viajes ganados: asigna unidad y operador y sigue los que están en camino.',
    groups: {
      to_assign: 'Por asignar',
      active: 'En curso',
      upcoming: 'Próximos',
      history: 'Historial',
    } satisfies Record<CarrierTripGroup, string>,
    empty: {
      to_assign: 'No tienes viajes por asignar.',
      active: 'No hay viajes en camino.',
      upcoming: 'No hay viajes asignados por salir.',
      history: 'Aún no hay viajes terminados.',
    } satisfies Record<CarrierTripGroup, string>,
    none: 'Todavía no tienes viajes. Cuando un cliente acepte tu oferta, el viaje aparecerá aquí.',
    route: (origin: string, destination: string) => `${origin} → ${destination}`,
    pickup: (date: string) => `Recolección: ${date}`,
    assignedTo: (unit: string, operator: string) => `${unit} · ${operator}`,
    unassigned: 'Sin unidad ni operador',
    assignAction: 'Asignar operador',
    refresh: 'Actualizar',
  },
  monitor: {
    title: 'Viajes en el mapa',
    help: 'Última ubicación de cada unidad en camino.',
    placeholder:
      'Mapa esquemático: muestra origen, destino y última ubicación. El mapa con calles llegará con la clave de Google Maps.',
    origin: 'Origen',
    destination: 'Destino',
    lastPosition: 'Última ubicación',
    live: (minutes: number) => `Ubicación ${minutesAgo(minutes)}`,
    stale: (time: string) => `Sin señal desde ${time}`,
    none: 'Sin ubicación todavía',
    progress: (percent: number) => `${percent} % del trayecto con carga`,
    openPosition: 'Ver ubicación en mapas',
    legend: (index: number, route: string) => `${index}. ${route}`,
  },
  detail: {
    title: 'Viaje',
    notFound: 'Este viaje ya no está disponible.',
    status: 'Estado',
    route: 'Ruta',
    agreedPrice: 'Precio acordado',
    pickupWindow: 'Ventana de recolección',
    deliveryWindow: 'Ventana de entrega',
    window: (from: string, to: string) => `${from} – ${to}`,
    cargo: 'Mercancía',
    unloadEstimate: 'Fin estimado de descarga',
    cancelled: (reason: string | null) =>
      reason ? `Viaje cancelado: ${reason}` : 'Viaje cancelado.',
    delivered: 'El operador terminó la descarga. Falta que el cliente confirme la entrega.',
    timeline: 'Línea de tiempo',
    timelineEmpty: 'Aún no hay eventos.',
    incidents: 'Incidencias',
    evidence: 'Evidencia fotográfica',
    evidenceCount: (pickup: number, delivery: number) =>
      `Recolección: ${pickup} · Entrega: ${delivery}`,
    chat: 'Chat del viaje',
    chatUnavailable: 'El chat de este viaje no está disponible.',
  },
  assign: {
    title: 'Asignación',
    help: 'Elige la unidad y el operador. El operador recibe una notificación al asignar.',
    reassignHelp: 'Puedes cambiar la unidad o el operador hasta que el operador salga.',
    locked: 'El operador ya salió: la asignación ya no se puede cambiar.',
    unit: 'Unidad',
    operator: 'Operador',
    current: (unit: string, operator: string) => `Asignado: ${unit} con ${operator}`,
    noUnits: 'No tienes unidades registradas. Da de alta una en "Unidades".',
    noOperators: 'No tienes operadores. Invita uno en "Más" → "Operadores".',
    unitExpiredTag: 'Documentos vencidos',
    noAccountTag: 'Sin cuenta',
    submit: 'Asignar operador',
    resubmit: 'Guardar cambios',
    confirmTitle: 'Confirmar asignación',
    confirmBody: (unit: string, operator: string) =>
      `¿Asignar la unidad ${unit} a ${operator}? Le avisaremos con una notificación.`,
    confirm: 'Sí, asignar',
    cancel: 'Cancelar',
    done: (operator: string) => `Listo. Avisamos a ${operator} de su nuevo viaje.`,
    blockers: {
      missingSelection: 'Elige una unidad y un operador.',
      operatorWithoutAccount:
        'Este operador aún no acepta su invitación: no podría registrar el viaje. Invítalo o elige otro.',
      unitExpired: 'Esta unidad tiene documentos vencidos. Actualízalos o elige otra unidad.',
    } satisfies Record<AssignmentBlocker, string>,
    warnings: {
      unitTypeMismatch: 'El tipo de esta unidad es distinto al que pidió el cliente.',
      unitBusy: 'Esta unidad ya tiene otro viaje sin terminar.',
      operatorBusy: 'Este operador ya tiene otro viaje sin terminar.',
    } satisfies Record<AssignmentWarning, string>,
  },
  documents: {
    title: 'Documentos del viaje',
    help: 'Sube la Carta Porte y otros documentos del viaje. El cliente y el operador los verán. Solo se guardan; no se emiten ni se validan.',
    empty: 'Aún no hay documentos.',
    kind: 'Tipo de documento',
    uploadCamera: 'Tomar foto',
    uploadLibrary: 'Elegir foto',
    uploadPdf: 'Subir PDF',
    uploading: 'Subiendo…',
    uploaded: 'Documento guardado.',
    open: 'Abrir',
    uploadedAt: (at: string) => `Subido: ${at}`,
    cancelled: 'El viaje está cancelado: ya no se pueden subir documentos.',
    cameraDenied:
      'No tenemos permiso para usar la cámara. Actívalo en la configuración del teléfono.',
    openFailed: 'No pudimos abrir el documento. Inténtalo de nuevo.',
  },
  errors: {
    notFound: 'Este viaje ya no está disponible.',
    notAssignable: 'El operador ya salió: la asignación ya no se puede cambiar.',
    notApproved: 'Tu empresa debe estar aprobada para asignar viajes.',
    operatorUnavailable: 'Este operador ya no está disponible o no tiene cuenta. Elige otro.',
    unitUnavailable: 'Esta unidad ya no está disponible. Elige otra.',
    unitExpired: 'Esta unidad tiene documentos vencidos. Actualízalos o elige otra unidad.',
    tripCancelled: 'El viaje está cancelado.',
    invalidFile: 'El archivo no es válido. Sube un PDF o una foto de hasta 15 MB.',
    generic: 'No pudimos guardar el cambio. Inténtalo de nuevo.',
  },
} as const;
