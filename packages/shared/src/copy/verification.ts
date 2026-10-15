// Spanish copy of the shipper onboarding and the admin verification panel (B12).
import type { DocumentFileIssue, DocumentOwnerType, RequirementState } from '../verification';

export const documentOwnerTypeLabels: Record<DocumentOwnerType, string> = {
  company: 'Empresa',
  vehicle: 'Unidad',
  operator: 'Operador',
};

export const requirementStateLabels: Record<RequirementState, string> = {
  missing: 'Pendiente de subir',
  pending_review: 'En revisión',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  expired: 'Vencido',
  suspended: 'Suspendido',
};

export const documentFileIssueMessages: Record<DocumentFileIssue, string> = {
  empty: 'El archivo está vacío.',
  tooLarge: 'El archivo pesa más de 10 MB.',
  type: 'Sube un PDF o una imagen (JPG, PNG, WEBP o HEIC).',
};

export const onboardingCopy = {
  steps: {
    company: 'Datos de la empresa',
    documents: 'Documentos',
    review: 'Revisión',
  },
  stepDone: 'Listo',
  stepCurrent: 'En curso',
  company: {
    title: 'Datos de la empresa',
    description:
      'Puedes corregirlos mientras tu cuenta está en revisión. El RFC no se puede cambiar.',
    readOnly: 'Para cambiar estos datos, escríbenos.',
    rfc: 'RFC',
    legalName: 'Razón social o nombre',
    contactName: 'Nombre de contacto',
    contactEmail: 'Correo de contacto',
    contactPhone: 'Teléfono de contacto',
    submit: 'Guardar datos',
    pending: 'Guardando…',
    saved: 'Datos guardados.',
  },
  documents: {
    title: 'Documentos',
    description:
      'Sube cada documento en PDF o imagen (máximo 10 MB). Revisaremos cada uno y te avisaremos si hay que corregir algo.',
    progress: (approved: number, required: number) =>
      `${approved} de ${required} documentos obligatorios aprobados`,
    allSent: 'Recibimos todos tus documentos obligatorios. Ahora los estamos revisando.',
    required: 'Obligatorio',
    optional: 'Opcional',
    file: 'Archivo',
    expiresOn: 'Fecha de vencimiento',
    expiresOnHint: 'La que aparece en el documento.',
    submittedFile: 'Archivo enviado',
    validUntil: (date: string) => `Vigente hasta el ${date}`,
    rejectionReason: 'Motivo del rechazo',
    upload: 'Subir documento',
    replace: 'Subir otra versión',
    uploading: 'Subiendo…',
    uploaded: 'Documento enviado. Lo revisaremos pronto.',
    chooseFile: 'Selecciona un archivo.',
  },
  errors: {
    generic: 'No pudimos guardar el cambio. Inténtalo de nuevo.',
    upload: 'No pudimos subir el archivo. Revisa tu conexión e inténtalo de nuevo.',
    notEditable: 'Tu cuenta ya no está en revisión; no puedes cambiar estos datos.',
    expiryRequired: 'Este documento necesita fecha de vencimiento.',
    expired: 'El documento ya está vencido.',
  },
} as const;

export const adminCopy = {
  nav: {
    home: 'Inicio',
    queue: 'Verificación',
    users: 'Usuarios',
    audit: 'Auditoría',
  },
  home: {
    pendingCompanies: 'Empresas por revisar',
    pendingDocuments: (owner: string) => `Documentos de ${owner.toLowerCase()} por revisar`,
    openQueue: 'Abrir la cola de verificación',
  },
  queue: {
    title: 'Cola de verificación',
    description:
      'Empresas en revisión y documentos pendientes de empresas, unidades y operadores, de la más antigua a la más reciente.',
    companies: 'Empresas en revisión',
    documents: 'Documentos pendientes',
    emptyCompanies: 'No hay empresas en revisión.',
    emptyDocuments: 'No hay documentos pendientes.',
    missing: (n: number) =>
      n === 0
        ? 'Documentos aprobados'
        : n === 1
          ? 'Falta aprobar 1 documento'
          : `Falta aprobar ${n} documentos`,
    open: 'Revisar',
  },
  columns: {
    company: 'Empresa',
    type: 'Tipo',
    rfc: 'RFC',
    status: 'Estado',
    since: 'Desde',
    document: 'Documento',
    owner: 'Titular',
    user: 'Usuario',
    email: 'Correo',
    role: 'Rol',
    lastSignIn: 'Último acceso',
    date: 'Fecha',
    actor: 'Quién',
    action: 'Acción',
    record: 'Registro',
    changes: 'Cambios',
  },
  company: {
    back: 'Volver a la cola',
    notFound: 'No encontramos esa empresa.',
    data: 'Datos de la empresa',
    contact: 'Contacto',
    createdAt: 'Registrada',
    statusReason: 'Motivo',
    members: 'Usuarios',
    companyDocuments: 'Documentos de la empresa',
    vehicles: 'Unidades',
    operators: 'Operadores',
    noVehicles: 'Sin unidades registradas.',
    noOperators: 'Sin operadores registrados.',
    missingDocuments: (n: number) =>
      n === 0
        ? 'Todos los documentos obligatorios están aprobados.'
        : n === 1
          ? 'Falta aprobar 1 documento obligatorio.'
          : `Falta aprobar ${n} documentos obligatorios.`,
    audit: 'Ver auditoría de la empresa',
    unlisted: 'Otros documentos pendientes',
    unlistedHint:
      'Su requisito o su unidad u operador ya no está activo, pero siguen en la cola. Revísalos aquí.',
  },
  document: {
    view: 'Ver archivo',
    noFile: 'Sin archivo',
    submittedAt: (date: string) => `Enviado el ${date}`,
    expiresOn: 'Vence el',
    expiresOnHint: 'Obligatoria si el documento vence.',
    notes: 'Motivo (obligatorio para rechazar)',
    approve: 'Aprobar',
    reject: 'Rechazar',
    reviewed: 'Revisión guardada.',
  },
  companyActions: {
    title: 'Decisión sobre la empresa',
    notes: 'Motivo (obligatorio para rechazar o suspender)',
    approve: 'Aprobar empresa',
    reactivate: 'Reactivar empresa',
    reject: 'Rechazar empresa',
    suspend: 'Suspender empresa',
    done: 'Estado de la empresa actualizado.',
    approveHint:
      'Solo se puede aprobar con todos los documentos obligatorios aprobados y vigentes.',
  },
  users: {
    title: 'Usuarios',
    description: 'Busca por nombre, correo, empresa o RFC. Suspende o reactiva desde la empresa.',
    search: 'Buscar',
    searchPlaceholder: 'Nombre, correo, empresa o RFC',
    empty: 'No hay usuarios que coincidan.',
    noCompany: 'Sin empresa',
    manage: 'Gestionar empresa',
    count: (shown: number, total: number) => `Mostrando ${shown} de ${total}`,
    previous: 'Anterior',
    firstPage: 'Volver a la primera página',
    next: 'Siguiente',
    never: 'Nunca',
  },
  audit: {
    title: 'Auditoría',
    description: 'Acciones administrativas registradas. La bitácora no se puede modificar.',
    filtered: 'Filtrado por empresa',
    clearFilter: 'Ver todo',
    empty: 'No hay acciones registradas.',
    unknownActor: 'Usuario eliminado',
    tables: {
      companies: 'Empresa',
      documents: 'Documento',
      document_requirements: 'Requisito',
    } as Record<string, string>,
    /** Readable names of the audited columns; unknown ones show as stored. */
    fields: {
      status: 'Estado',
      status_reason: 'Motivo',
      review_notes: 'Notas',
      reviewed_at: 'Fecha de revisión',
      reviewed_by: 'Revisó',
      expires_at: 'Vencimiento',
      archived_at: 'Archivado',
      legal_name: 'Razón social',
      contact_name: 'Contacto',
      contact_email: 'Correo de contacto',
      contact_phone: 'Teléfono de contacto',
      name: 'Nombre',
      description: 'Descripción',
      is_required: 'Obligatorio',
      requires_expiry: 'Requiere vencimiento',
      sort_order: 'Orden',
    } as Record<string, string>,
    actions: {
      insert: 'Alta',
      update: 'Cambio',
      delete: 'Baja',
    } as Record<string, string>,
  },
  errors: {
    generic: 'No pudimos guardar la decisión. Inténtalo de nuevo.',
    forbidden: 'No tienes permiso para esta acción.',
    notPending: 'Ya no está pendiente: alguien más lo revisó. Recarga la página.',
    missingDocuments: 'La empresa aún tiene documentos obligatorios sin aprobar o vencidos.',
    invalidTransition: 'Esa acción no aplica al estado actual de la empresa.',
    expiryRequired: 'Este documento necesita fecha de vencimiento.',
    expired: 'La fecha de vencimiento ya pasó.',
    fileUnavailable: 'No pudimos abrir el archivo.',
    loadFailed: 'No pudimos cargar la información. Recarga la página.',
  },
} as const;
