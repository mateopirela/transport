// Spanish copy of the access without friction (ola S, plan-acceso.md): the
// confirmation code and its resend (D15-E3), "Completa tu cuenta" (D42-E1),
// what a company that is not approved yet cannot do (D48) and the page a
// confirmation link ends on. In its own file so S2 (copy/auth.ts) and S3
// (copy/mobile.ts) do not collide with it.

/** The confirmation code of the email (D15-E3): six digits, next to the link. */
export const emailCodeCopy = {
  label: 'Código de 6 dígitos',
  hint: 'Está en el correo que te enviamos. También puedes abrir el enlace del mismo correo.',
  invalid: 'Escribe los 6 dígitos del código.',
  /** Supabase answers the same for a wrong and for an expired code. */
  rejected: 'El código no es correcto o ya venció. Revisa el correo más reciente o pide otro.',
  submit: 'Confirmar correo',
  pending: 'Confirmando…',
  /** How long a code lasts (supabase/config.toml, `otp_expiry`). */
  validFor: (minutes: number) =>
    minutes % 60 === 0
      ? minutes === 60
        ? 'El código vence en 1 hora.'
        : `El código vence en ${minutes / 60} horas.`
      : `El código vence en ${minutes} minutos.`,
  resend: 'Reenviar correo',
  resending: 'Reenviando…',
  resent: 'Te enviamos otro correo. Usa el código más reciente.',
  resendIn: (seconds: number) =>
    seconds === 1 ? 'Podrás reenviarlo en 1 segundo.' : `Podrás reenviarlo en ${seconds} segundos.`,
  /** The hourly limit of emails (Auth's rate limit): nothing to do but wait. */
  resendLimit:
    'Enviamos demasiados correos en poco tiempo. Espera unos minutos e inténtalo de nuevo.',
  changeEmail: 'Cambiar correo',
  sentTo: (email: string) => `Enviamos un código y un enlace a ${email}.`,
  /** The sign-in of an account whose email is not confirmed yet. */
  confirmFirst: 'Confirma tu correo para entrar. Escribe el código que te enviamos o pide otro.',
} as const;

/**
 * The page a confirmation link opened from the app's sign-up ends on (the
 * link is the web's, so it works on any device): the app is where the
 * account goes on.
 */
export const emailConfirmedCopy = {
  title: 'Correo confirmado',
  description:
    'Tu cuenta ya está activa. Abre la app e inicia sesión con tu correo y tu contraseña.',
  openApp: 'Abrir la app',
  continueOnWeb: 'Continuar en la web',
} as const;

/** "Completa tu cuenta" (D42-E1): the steps of D42 that moved inside the panel. */
export const accountChecklistCopy = {
  title: 'Completa tu cuenta',
  /** What the list is of, for a screen reader. */
  label: 'Pasos para completar tu cuenta',
  steps: {
    fiscal: 'Datos fiscales',
    documents: 'Documentos',
    profile: 'Tu perfil',
    verification: 'Verificación',
  },
  progress: (done: number, total: number) => `${done} de ${total} pasos`,
  /** The line under the title, by the state of the account. */
  status: {
    incomplete: 'Termina estos pasos para que revisemos tu cuenta.',
    in_review: 'Recibimos todo. Estamos revisando tu cuenta; te avisamos en cuanto esté lista.',
    rejected: 'Encontramos algo por corregir. Revisa el motivo y vuelve a enviar tu información.',
    expired: 'Uno de tus documentos venció. Sube uno vigente para seguir operando.',
    suspended: 'Tu cuenta está suspendida. Escríbenos para revisarla.',
    approved: 'Tu cuenta está aprobada.',
  },
  /** The next thing to do, by step. */
  next: {
    fiscal: 'Captura los datos fiscales de tu empresa.',
    documents: 'Sube los documentos de tu empresa.',
    profile: 'Completa lo propio de tu perfil.',
    verification: 'Consulta el estado de tu revisión.',
  },
  continue: 'Continuar',
  /** The contact of the company comes from the account (D50-1). */
  contactPrefilled: 'Usamos los datos de tu cuenta como contacto. Puedes cambiarlos.',
} as const;

/**
 * Why an action is not available yet (D48): the company must be approved to
 * publish, offer, get recommendations or assign. The reason says what is
 * missing; the action stays visible and disabled.
 */
export const accountBlockCopy = {
  actions: {
    publish_load: 'publicar cargas',
    make_offer: 'hacer ofertas',
    recommendations: 'recibir cargas recomendadas',
    assign_trip: 'asignar viajes',
  },
  reason: {
    no_company: (action: string) => `Captura tus datos fiscales para ${action}.`,
    incomplete: (action: string) => `Termina de completar tu cuenta para ${action}.`,
    in_review: (action: string) =>
      `Estamos revisando tu cuenta. Podrás ${action} en cuanto la aprobemos.`,
    rejected: (action: string) => `Corrige lo que te pedimos en tu cuenta para ${action}.`,
    expired: (action: string) => `Sube tus documentos vigentes para ${action}.`,
    suspended: (action: string) => `Tu cuenta está suspendida: no puedes ${action}. Escríbenos.`,
  },
  /** The link next to the reason. */
  goToAccount: 'Ir a Completa tu cuenta',
  /** A draft is what a shipper can leave ready before the approval. */
  draftAllowed: 'Mientras tanto puedes guardar tus cargas como borrador.',
  fleetAllowed: 'Mientras tanto puedes registrar tus camiones, operadores y documentos.',
} as const;
