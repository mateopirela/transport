// Spanish copy for the web shell and authentication flows (B11).

/** Validation messages of the auth forms (../schemas/auth). */
export const authMessages = {
  passwordTooShort: (min: number) => `La contraseña debe tener al menos ${min} caracteres.`,
  passwordWeak: 'La contraseña debe incluir al menos una letra y un número.',
  passwordMismatch: 'Las contraseñas no coinciden.',
} as const;

/** Errors shown to the user when Supabase Auth or an RPC fails. */
export const authErrors = {
  invalidCredentials: 'El correo o la contraseña no son correctos.',
  emailNotConfirmed: 'Confirma tu correo antes de entrar. Revisa tu bandeja de entrada.',
  emailTaken: 'Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.',
  phoneTaken:
    'Ya existe una cuenta con ese teléfono. Inicia sesión o pide a tu transportista restablecer tu acceso.',
  invitationInvalid: 'El enlace de invitación no es válido, ya se usó o venció. Pide uno nuevo.',
  invitationWrongAccount: 'Esta cuenta no puede usar este enlace. Cierra sesión y ábrelo de nuevo.',
  alreadyInCompany: 'Tu cuenta ya pertenece a una empresa.',
  phoneRequired: 'Tu cuenta no tiene teléfono. Completa tu teléfono para continuar.',
  rfcTaken: 'Ya hay una empresa registrada con ese RFC. Escríbenos si crees que es un error.',
  weakPassword: 'La contraseña es demasiado débil. Usa otra más segura.',
  samePassword: 'La nueva contraseña debe ser distinta de la anterior.',
  rateLimited: 'Hiciste demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
  linkInvalid: 'El enlace no es válido o ya venció. Solicita uno nuevo.',
  notConfigured: 'El servicio de cuentas no está configurado en este entorno.',
  generic: 'Algo salió mal. Inténtalo de nuevo en unos minutos.',
} as const;

export const authCopy = {
  appName: 'Transporte de carga',
  appKicker: 'Transporte de carga · México',
  tagline: 'Conecta tus cargas con transportistas verificados y sigue cada viaje en tiempo real.',
  fields: {
    fullName: 'Nombre completo',
    email: 'Correo electrónico',
    identifier: 'Correo o teléfono',
    phone: 'Teléfono (10 dígitos)',
    optionalEmail: 'Correo electrónico (opcional)',
    password: 'Contraseña',
    newPassword: 'Nueva contraseña',
    passwordConfirmation: 'Confirma la contraseña',
    passwordHint: 'Mínimo 8 caracteres, con al menos una letra y un número.',
    personType: 'Tipo de persona',
    personTypeMoral: 'Persona moral (empresa)',
    personTypeFisica: 'Persona física',
    legalName: 'Razón social',
    rfc: 'RFC',
    fiscalAddress: 'Domicilio fiscal',
    fiscalStreet: 'Calle',
    fiscalExteriorNumber: 'Número exterior',
    fiscalInteriorNumber: 'Número interior (opcional)',
    fiscalNeighborhood: 'Colonia',
    fiscalPostalCode: 'Código postal',
    fiscalMunicipality: 'Municipio o alcaldía',
    fiscalState: 'Estado',
    fiscalStatePlaceholder: 'Selecciona un estado',
    legalRepresentativeName: 'Representante legal',
    legalRepresentativeHint:
      'Obligatorio para personas morales. Si eres persona física, eres tu propio representante.',
  },
  /** What the person registers (G2, D13). */
  registrationKinds: {
    label: '¿Qué vas a registrar?',
    shipper: 'Soy cliente',
    shipperHint: 'Publico cargas y contrato transportistas.',
    carrier: 'Soy transportista (empresa)',
    carrierHint: 'Tengo camiones y operadores; busco cargas.',
    owner_operator: 'Soy hombre camión',
    ownerOperatorHint: 'Manejo mi propio camión: busco cargas y hago los viajes.',
  },
  signIn: {
    title: 'Inicia sesión',
    description: 'Entra con tu correo o tu teléfono.',
    submit: 'Entrar',
    pending: 'Entrando…',
    forgotPassword: '¿Olvidaste tu contraseña?',
    noAccount: '¿Tu empresa aún no tiene cuenta?',
    signUpLink: 'Regístrala',
  },
  signUp: {
    title: 'Crea tu cuenta',
    description:
      'Registra tu empresa como cliente, transportista u hombre camión. La revisaremos antes de activarla.',
    accountSection: 'Tus datos',
    companySection: 'Datos fiscales',
    companyHint: 'Como aparecen en tu constancia de situación fiscal.',
    submit: 'Crear cuenta',
    pending: 'Creando cuenta…',
    haveAccount: '¿Ya tienes cuenta?',
    signInLink: 'Inicia sesión',
  },
  checkEmail: {
    title: 'Revisa tu correo',
    description:
      'Te enviamos un enlace para confirmar tu correo. Ábrelo desde este mismo navegador para activar tu cuenta.',
    back: 'Volver a iniciar sesión',
  },
  forgotPassword: {
    title: 'Recupera tu contraseña',
    description: 'Escribe el correo de tu cuenta y te enviaremos un enlace para crear una nueva.',
    submit: 'Enviar enlace',
    pending: 'Enviando…',
    sent: 'Si el correo tiene una cuenta, te llegará un enlace en unos minutos. Revisa también tu carpeta de spam.',
    back: 'Volver a iniciar sesión',
  },
  resetPassword: {
    title: 'Crea una nueva contraseña',
    description: 'Escribe tu nueva contraseña dos veces.',
    submit: 'Guardar contraseña',
    pending: 'Guardando…',
  },
  completeCompany: {
    title: 'Completa el registro de tu empresa',
    description:
      'Tu cuenta está activa, pero falta registrar tu empresa. Revisa los datos y envíalos.',
    submit: 'Registrar empresa',
    pending: 'Registrando…',
  },
  /** /invitacion/[token] (G2): what a link opens on the web. */
  invitation: {
    title: 'Te invitaron a Transport',
    invalidTitle: 'Este enlace no sirve',
    invalidDescription:
      'La invitación no es válida, ya se usó o venció. Pide a tu Gerente o Coordinador un enlace nuevo.',
    inviterLabel: 'Te invita',
    expiresLabel: 'Vence',
    coordinator: {
      description: (company: string) =>
        `${company} te invita como Coordinador. Crea tu cuenta para operar sus unidades de negocio.`,
      units: 'Unidades de negocio',
      invitedBy: (name: string) => `Te invita ${name}.`,
      expires: (date: string) => `El enlace vence el ${date}.`,
      submit: 'Crear cuenta y unirme',
      pending: 'Creando cuenta…',
      checkEmail:
        'Te enviamos un enlace para confirmar tu correo. Al abrirlo volverás aquí para unirte a la empresa.',
      join: 'Unirme',
      joinPending: 'Uniéndote…',
      joinDescription: (company: string) =>
        `Tu cuenta está lista. Únete a ${company} para empezar.`,
      wrongAccount:
        'Esta invitación es para una cuenta nueva de Coordinador. Cierra sesión para aceptarla con otra cuenta.',
    },
    operator: {
      description: (company: string) =>
        `${company} te invita como Operador. Crea tu cuenta con tu teléfono: con él entrarás a la app.`,
      unit: 'Unidad de negocio',
      submit: 'Crear mi cuenta',
      pending: 'Creando cuenta…',
      doneTitle: 'Tu cuenta está lista',
      doneDescription:
        'Descarga la app y entra con tu teléfono y tu contraseña. Los operadores trabajan desde la app móvil.',
      openApp: 'Abrir en la app',
    },
    reset: {
      description: (company: string) =>
        `${company} te generó este enlace para restablecer tu acceso. Escribe una contraseña nueva.`,
      submit: 'Guardar contraseña',
      pending: 'Guardando…',
      doneTitle: 'Contraseña actualizada',
      doneDescription:
        'Abre la app y entra con tu teléfono (o tu correo) y tu nueva contraseña. Tus sesiones anteriores se cerraron.',
    },
    errors: {
      invalid: 'La invitación no es válida, ya se usó o venció. Pide un enlace nuevo.',
      phoneTaken:
        'Ya existe una cuenta con ese teléfono. Pide a tu transportista restablecer tu acceso.',
      rateLimited: 'Hiciste demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
      passwordNotSaved:
        'El enlace se usó, pero no pudimos guardar la contraseña. Pide a tu transportista un enlace nuevo.',
      sessionsNotRevoked:
        'Guardamos tu contraseña nueva, pero no pudimos cerrar las sesiones abiertas. Pide a tu transportista un enlace nuevo para cerrarlas.',
      generic: 'No pudimos completar el registro. Inténtalo de nuevo en unos minutos.',
    },
  },
} as const;

export const shellCopy = {
  signOut: 'Cerrar sesión',
  shipperArea: 'Cliente',
  /** Carrier area (G9): the role, not the company type (D19). */
  managerArea: 'Gerente',
  coordinatorArea: 'Coordinador',
  adminArea: 'Administración',
  shipperHome: {
    title: 'Inicio',
    description: 'Aquí verás tus cargas, ofertas y viajes.',
  },
  adminHome: {
    title: 'Panel de administración',
    description: 'Verificación de empresas, supervisión de cargas y viajes, e incidencias.',
  },
  review: {
    pending_review: {
      title: 'Tu cuenta está en revisión',
      description:
        'Sube los documentos de tu empresa para que podamos verificarla. Mientras tu cuenta está en revisión no podrás publicar cargas.',
    },
    rejected: {
      title: 'No pudimos aprobar tu cuenta',
      description:
        'Revisa el motivo y los documentos rechazados. Al subirlos de nuevo, tu cuenta vuelve a revisión.',
    },
    suspended: {
      title: 'Tu cuenta está suspendida',
      description: 'Por ahora no puedes operar en la plataforma. Escríbenos para más información.',
    },
    expired: {
      title: 'La verificación de tu empresa venció',
      description: 'Actualiza tus documentos para volver a operar.',
    },
    reasonLabel: 'Motivo',
    companyLabel: 'Empresa',
  },
  mobileOnly: {
    title: 'Usa la app móvil',
    description:
      'Los operadores trabajan desde la app móvil. Descárgala e inicia sesión con la misma cuenta.',
  },
} as const;
