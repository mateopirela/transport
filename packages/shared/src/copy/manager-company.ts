// "Mi empresa" of the Gerente (G4, D19), in the app and the web, and the
// invitation buttons the Coordinador sees in the fleet. Terms of §G.0:
// "Unidad de negocio" is a group; "camión" or "unidad" is the vehicle.

export const managerCompanyCopy = {
  title: 'Mi empresa',
  description:
    'Organiza tus unidades de negocio, coordinadores, camiones y operadores. Las bajas nunca dejan un viaje activo sin camión u operador.',
  managerOnly: 'Solo el Gerente administra la empresa.',
  columns: {
    name: 'Nombre',
    content: 'Contenido',
    actions: 'Acciones',
    kind: 'Tipo',
    invitee: 'Para',
    units: 'Unidades de negocio',
    expires: 'Vigencia',
  },
  sections: {
    businessUnits: 'Unidades de negocio',
    coordinators: 'Coordinadores',
    units: 'Camiones',
    operators: 'Operadores',
    invitations: 'Invitaciones pendientes',
  },
  businessUnits: {
    description:
      'Cada camión y operador pertenece a una unidad de negocio. Los coordinadores operan solo las suyas.',
    nameLabel: 'Nombre',
    create: 'Crear unidad de negocio',
    created: 'Unidad de negocio creada.',
    rename: 'Renombrar',
    renamed: 'Nombre guardado.',
    save: 'Guardar',
    cancel: 'Cancelar',
    archive: 'Archivar',
    archiveConfirmTitle: '¿Archivar la unidad de negocio?',
    archiveConfirmBody:
      'Sus coordinadores dejarán de verla. Solo se puede archivar si no tiene camiones, operadores, ofertas pendientes ni viajes abiertos.',
    archived: 'Unidad de negocio archivada.',
    counts: (units: number, operators: number, coordinators: number) =>
      `${units} ${units === 1 ? 'camión' : 'camiones'} · ${operators} ${
        operators === 1 ? 'operador' : 'operadores'
      } · ${coordinators} ${coordinators === 1 ? 'coordinador' : 'coordinadores'}`,
    viewTrips: 'Ver viajes',
  },
  coordinators: {
    description: 'Invítalos por enlace y elige qué unidades de negocio operan.',
    empty: 'Aún no tienes coordinadores.',
    invite: 'Invitar coordinador',
    inviteUnitsLabel: 'Unidades de negocio que operará',
    inviteeLabel: 'Nombre (opcional)',
    unitsLabel: 'Unidades de negocio',
    noUnits: 'Sin unidades de negocio asignadas',
    editUnits: 'Cambiar unidades de negocio',
    saveUnits: 'Guardar unidades de negocio',
    unitsSaved: 'Unidades de negocio guardadas.',
    remove: 'Dar de baja',
    removeConfirmTitle: '¿Dar de baja al coordinador?',
    removeConfirmBody:
      'Perderá el acceso a la empresa al instante. Sus mensajes se conservan y se cancelan los enlaces que haya generado.',
    removed: 'Coordinador dado de baja.',
  },
  fleet: {
    move: 'Mover a…',
    moveLabel: 'Unidad de negocio',
    moveSubmit: 'Mover',
    moved: 'Movido de unidad de negocio.',
    archive: 'Dar de baja',
    archivedUnit: 'Camión dado de baja.',
    archivedOperator: 'Operador dado de baja.',
    open: 'Abrir',
    unitsEmpty: 'Sin camiones.',
    operatorsEmpty: 'Sin operadores.',
    noBusinessUnit: 'Sin unidad de negocio',
  },
  operators: {
    invite: 'Invitar operador',
    inviteTitle: 'Invitar operador',
    inviteDescription:
      'Genera un enlace de un solo uso. El operador crea su cuenta con su teléfono y una contraseña, y queda en la unidad de negocio que elijas.',
    inviteeLabel: 'Nombre del operador (opcional)',
    unitLabel: 'Unidad de negocio',
    resetAccess: 'Restablecer acceso',
    resetTitle: 'Restablecer acceso',
    resetDescription:
      'Si el operador olvidó su contraseña o cambió de teléfono, genera un enlace para que elija una nueva. Al usarlo se cierran sus sesiones.',
    resetShareMessage: (companyName: string, link: string) =>
      `${companyName}: abre este enlace desde tu teléfono para restablecer tu acceso a Transport: ${link}`,
  },
  invitationLink: {
    generate: 'Generar enlace',
    generating: 'Generando…',
    link: 'Enlace',
    share: 'Compartir enlace',
    copy: 'Copiar enlace',
    copied: 'Enlace copiado.',
    validUntil: (date: string) => `Vence el ${date}`,
    onlyOnce:
      'Por seguridad el enlace solo se muestra ahora. Si lo pierdes, genera otro: el anterior deja de servir.',
    coordinatorShareMessage: (companyName: string, link: string) =>
      `${companyName} te invita a unirte como coordinador en Transport. Abre este enlace para crear tu cuenta: ${link}`,
    operatorShareMessage: (companyName: string, link: string) =>
      `${companyName} te invita a unirte como operador en Transport. Abre este enlace desde tu teléfono: ${link}`,
  },
  invitations: {
    description: 'Enlaces que todavía no se usan. Cancélalos si ya no deben servir.',
    empty: 'No hay invitaciones pendientes.',
    kind: {
      coordinator: 'Coordinador',
      operator: 'Operador',
      operator_access_reset: 'Restablecer acceso',
    },
    invitee: (name: string | null) => name ?? 'Sin nombre',
    revoke: 'Cancelar',
    revoked: 'Invitación cancelada.',
  },
  supervision: {
    title: 'Supervisión',
    description: 'Viajes activos y por asignar de cada unidad de negocio.',
    activeTrips: (count: number) => `${count} ${count === 1 ? 'viaje activo' : 'viajes activos'}`,
    toAssign: (count: number) => `${count} por asignar`,
    viewTrips: 'Ver viajes',
  },
} as const;

/** Errors of the "Mi empresa" RPCs (supabase/migrations/…_manager_company.sql). */
export const managerCompanyErrorCopy = {
  managerOnly: 'Solo el Gerente puede hacer este cambio.',
  nameLength: 'El nombre debe tener entre 1 y 80 caracteres.',
  nameTaken: 'Ya tienes una unidad de negocio con ese nombre.',
  businessUnitNotFound: 'No encontramos esa unidad de negocio.',
  businessUnitArchived: 'Esa unidad de negocio está archivada.',
  onlyBusinessUnit: 'Tu empresa necesita al menos una unidad de negocio activa.',
  businessUnitNotEmpty: 'Primero mueve o da de baja sus camiones y operadores.',
  businessUnitOpenWork: 'Tiene ofertas pendientes o viajes abiertos. Archívala cuando terminen.',
  unitsRequired: 'Elige al menos una unidad de negocio.',
  coordinatorNotFound: 'No encontramos a ese coordinador.',
  cannotRemoveSelf: 'No puedes darte de baja a ti mismo.',
  onlyCoordinators:
    'Solo se da de baja a coordinadores. A un operador se le da de baja en su ficha.',
  notFound: 'No encontramos ese camión u operador.',
  archived: 'Ya está dado de baja.',
  committed:
    'No se puede mover: está en un viaje, comprometido para uno o propuesto en una oferta pendiente.',
  operatorHasNoAccount: 'El operador todavía no tiene cuenta. Envíale una invitación.',
  generic: 'No pudimos guardar el cambio. Inténtalo de nuevo.',
} as const;
