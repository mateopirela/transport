// Spanish copy of the access security (R5, D46): the admins' second factor,
// the temporary lock after failed attempts and the end of a session. Its own
// file so it does not collide with the sign-up and sign-in copy (auth.ts).

/** The admin's second factor (TOTP), on the web: /segundo-factor. */
export const secondFactorCopy = {
  pageTitle: 'Verificación en dos pasos',
  enroll: {
    title: 'Protege tu cuenta de administrador',
    description:
      'Para entrar al panel necesitas un segundo factor: un código de 6 dígitos de una app autenticadora (Google Authenticator, Microsoft Authenticator, 1Password u otra).',
    start: 'Configurar app autenticadora',
    starting: 'Preparando…',
    stepScan:
      'Escanea este código QR con tu app autenticadora o escribe la clave a mano. Después escribe el código de 6 dígitos que te muestra.',
    qrAlt: 'Código QR para agregar Transport a tu app autenticadora',
    secretLabel: 'Clave para escribir a mano',
    submit: 'Activar y entrar',
    backupHint:
      'Si pierdes tu teléfono, pide a otro administrador que borre tu factor desde el panel de Supabase. Guarda la clave en un lugar seguro.',
  },
  challenge: {
    title: 'Escribe tu código de verificación',
    description: 'Abre tu app autenticadora y escribe el código de 6 dígitos de Transport.',
    submit: 'Verificar y entrar',
    lostDevice:
      '¿Perdiste tu teléfono? Pide a otro administrador que borre tu factor desde el panel de Supabase y vuelve a configurarlo.',
  },
  codeLabel: 'Código de 6 dígitos',
  pending: 'Verificando…',
  codeHint: 'Cambia cada 30 segundos.',
  errors: {
    invalidCode: 'El código no es correcto o ya cambió. Escribe el que muestra tu app ahora.',
    codeFormat: 'Escribe los 6 dígitos del código.',
    expired: 'Pasó demasiado tiempo. Vuelve a empezar la configuración.',
    alreadyEnrolled: 'Tu cuenta ya tiene una app autenticadora. Escribe su código.',
    notEnrolled: 'Tu cuenta aún no tiene una app autenticadora. Configúrala primero.',
    notAllowed: 'Solo las cuentas de administrador usan el segundo factor.',
  },
} as const;

/** The temporary lock of an account and the end of a web session. */
export const accessSecurityCopy = {
  /** After 5 failed passwords or codes in a row (LOGIN_LOCKOUT). */
  accountLocked: (minutes: number) =>
    `Por seguridad bloqueamos el acceso a esta cuenta durante ${minutes} minutos tras varios intentos fallidos. Espera e inténtalo de nuevo.`,
  session: {
    /** The admin's 30 minutes without activity. */
    idle: 'Cerramos tu sesión porque estuvo inactiva. Vuelve a entrar.',
    /** The maximum length of a session (8 h for an admin, 30 days for the rest). */
    expired: 'Tu sesión terminó por seguridad. Vuelve a entrar.',
  },
} as const;
