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
    phone: 'Teléfono (10 dígitos)',
    password: 'Contraseña',
    newPassword: 'Nueva contraseña',
    passwordConfirmation: 'Confirma la contraseña',
    passwordHint: 'Mínimo 8 caracteres, con al menos una letra y un número.',
    personType: 'Tipo de persona',
    personTypeMoral: 'Persona moral (empresa)',
    personTypeFisica: 'Persona física',
    legalName: 'Razón social',
    rfc: 'RFC',
  },
  signIn: {
    title: 'Inicia sesión',
    description: 'Entra para publicar y dar seguimiento a tus cargas.',
    submit: 'Entrar',
    pending: 'Entrando…',
    forgotPassword: '¿Olvidaste tu contraseña?',
    noAccount: '¿Tu empresa aún no tiene cuenta?',
    signUpLink: 'Regístrala',
  },
  signUp: {
    title: 'Registra tu empresa',
    description:
      'Crea la cuenta de tu empresa para publicar cargas. La revisaremos antes de activarla.',
    accountSection: 'Tus datos',
    companySection: 'Datos de la empresa',
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
} as const;

export const shellCopy = {
  signOut: 'Cerrar sesión',
  shipperArea: 'Cliente',
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
      'Los transportistas y operadores trabajan desde la app móvil. Descárgala e inicia sesión con la misma cuenta.',
  },
} as const;
