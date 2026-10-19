// Spanish copy of the carrier onboarding and fleet screens (B18): company
// documents, units, operators and invitations, usual routes and availability.
import type { VehicleReadiness } from '../fleet';

export const vehicleReadinessLabels: Record<VehicleReadiness, string> = {
  expired_documents: 'No disponible: documentos vencidos',
  unset: 'Sin disponibilidad registrada',
  scheduled: 'Disponible próximamente',
  available: 'Disponible',
};

export const fleetCopy = {
  loadFailed: 'No pudimos cargar la información. Revisa tu conexión e inténtalo de nuevo.',
  onboarding: {
    title: 'Alta de tu empresa',
    subtitle: 'Completa estos pasos para empezar a recibir cargas.',
    companyDocuments: 'Documentos de la empresa',
    units: 'Unidades',
    operators: 'Operadores',
    routes: 'Rutas habituales',
    documentsProgress: (approved: number, required: number) =>
      `${approved} de ${required} aprobados`,
    count: (n: number) => (n === 1 ? '1 registrada' : `${n} registradas`),
    operatorsCount: (n: number) => (n === 1 ? '1 registrado' : `${n} registrados`),
    pending: 'Pendiente',
    open: 'Abrir',
  },
  documents: {
    title: 'Documentos',
    companyTitle: 'Documentos de la empresa',
    subtitle: 'Toma una foto o elige un PDF. Los revisamos y te avisamos si hay que corregir algo.',
    /** A coordinator sees the company's documents but only the manager sends them (G1a.2). */
    readOnlySubtitle: 'Solo el gerente sube los documentos de la empresa. Aquí ves su estado.',
    required: 'Obligatorio',
    optional: 'Opcional',
    rejectionReason: (reason: string) => `Motivo del rechazo: ${reason}`,
    validUntil: (date: string) => `Vigente hasta el ${date}`,
    expiresOnLabel: 'Fecha de vencimiento (AAAA-MM-DD)',
    expiresOnHint: 'La que aparece en el documento.',
    takePhoto: 'Tomar foto',
    choosePhoto: 'Elegir foto',
    chooseFile: 'Elegir PDF',
    uploading: 'Subiendo…',
    uploaded: 'Documento enviado. Lo revisaremos pronto.',
    cameraDenied: 'Permite el acceso a la cámara en los ajustes del teléfono para tomar la foto.',
    expiryRequired: 'Escribe la fecha de vencimiento antes de subir el documento.',
    empty: 'No hay documentos que subir.',
  },
  /** Business unit of a unit or an operator (G1a.2). */
  businessUnit: (name: string) => `Unidad de negocio: ${name}`,
  units: {
    title: 'Unidades',
    add: 'Agregar unidad',
    empty: 'Aún no registras unidades. Agrega tus tractocamiones, camiones y remolques.',
    newTitle: 'Nueva unidad',
    editTitle: 'Unidad',
    kindLabel: 'Tipo de vehículo',
    plateLabel: 'Placas',
    fleetNumberLabel: 'Número económico (opcional)',
    modelYearLabel: 'Año del modelo (opcional)',
    unitTypeLabel: 'Tipo de unidad',
    capacityKgLabel: 'Capacidad (kg)',
    capacityM3Label: 'Volumen (m³, opcional)',
    featuresLabel: 'Características',
    save: 'Guardar unidad',
    saved: 'Unidad guardada.',
    archive: 'Dar de baja la unidad',
    archiveConfirmTitle: '¿Dar de baja la unidad?',
    archiveConfirmBody: 'Dejará de aparecer en tu flota y en las recomendaciones.',
    cancel: 'Cancelar',
    documentsTitle: 'Documentos de la unidad',
    saveFirst: 'Guarda la unidad para subir sus documentos y registrar su disponibilidad.',
    plateTaken: 'Ya tienes una unidad activa con estas placas.',
  },
  availability: {
    title: 'Disponibilidad',
    subtitle: 'Dónde y desde cuándo queda libre la unidad.',
    current: (city: string, state: string, when: string) => `${city}, ${state} · desde ${when}`,
    none: 'La unidad no tiene disponibilidad registrada.',
    blocked:
      'La unidad tiene documentos vencidos. Sube los documentos vigentes para marcarla como disponible.',
    cityLabel: 'Ciudad',
    dateLabel: 'Fecha (AAAA-MM-DD)',
    timeLabel: 'Hora (HH:MM)',
    save: 'Guardar disponibilidad',
    clear: 'Marcar como no disponible',
    saved: 'Disponibilidad guardada.',
  },
  operators: {
    title: 'Operadores',
    add: 'Agregar operador',
    empty: 'Aún no registras operadores. Agrégalos e invítalos a la app.',
    newTitle: 'Nuevo operador',
    editTitle: 'Operador',
    fullNameLabel: 'Nombre completo',
    emailLabel: 'Correo electrónico',
    phoneLabel: 'Teléfono (opcional)',
    licenseNumberLabel: 'Número de licencia (opcional)',
    licenseTypeLabel: 'Tipo de licencia',
    licenseExpiresOnLabel: 'Vencimiento de la licencia (AAAA-MM-DD, opcional)',
    save: 'Guardar operador',
    saved: 'Operador guardado.',
    archive: 'Dar de baja al operador',
    archiveConfirmTitle: '¿Dar de baja al operador?',
    archiveConfirmBody: 'Perderá el acceso a la app y se le quitará la unidad asignada.',
    linked: 'Ya usa la app',
    invited: (date: string) => `Invitación vigente hasta el ${date}`,
    notInvited: 'Sin invitación',
    documentsTitle: 'Documentos del operador',
  },
  invitation: {
    title: 'Invitación',
    subtitle:
      'Comparte el enlace o el código. El operador crea su cuenta con este mismo correo y queda ligado a tu empresa.',
    create: 'Generar invitación',
    recreate: 'Generar un código nuevo',
    share: 'Compartir enlace',
    revoke: 'Cancelar invitación',
    code: 'Código',
    validUntil: (date: string) => `Vence el ${date}`,
    pendingNoCode:
      'Hay una invitación vigente. Por seguridad el código solo se muestra al generarlo; genera uno nuevo si lo perdiste.',
    shareMessage: (companyName: string, link: string, code: string) =>
      `${companyName} te invita a unirte como operador en Transport. Abre este enlace desde tu teléfono: ${link}\n\nO escribe el código: ${code}`,
  },
  routes: {
    title: 'Rutas habituales',
    subtitle: 'Las usamos para recomendarte cargas y viajes de regreso.',
    empty: 'Aún no registras rutas.',
    add: 'Agregar ruta',
    originLabel: 'Origen',
    destinationLabel: 'Destino',
    unitTypesLabel: 'Tipos de unidad (opcional)',
    save: 'Guardar ruta',
    remove: 'Quitar',
    item: (origin: string, destination: string) => `${origin} → ${destination}`,
  },
  more: {
    title: 'Más',
  },
} as const;

/** Errors of the fleet screens (B18), keyed by the app's error mapping. */
export const fleetErrorCopy = {
  plateTaken: 'Ya tienes una unidad activa con estas placas.',
  expiredDocuments:
    'La unidad tiene documentos vencidos. Sube los documentos vigentes para marcarla como disponible.',
  operatorHasAccount: 'Este operador ya tiene cuenta en la app.',
  operatorNoEmail: 'Agrega el correo del operador para invitarlo.',
  uploadFailed: 'No pudimos subir el archivo. Revisa tu conexión e inténtalo de nuevo.',
  documentExpired: 'El documento ya está vencido.',
} as const;

export type FleetErrorKey = keyof typeof fleetErrorCopy;
