// Spanish copy of the carrier/operator app shell (B17): authentication,
// invitations, navigation and connectivity.

export const mobileAuthCopy = {
  appName: 'Transport',
  tagline: 'Tu siguiente viaje, antes de terminar el actual.',
  emailLabel: 'Correo electrónico',
  passwordLabel: 'Contraseña',
  passwordConfirmLabel: 'Confirma tu contraseña',
  fullNameLabel: 'Nombre completo',
  phoneLabel: 'Teléfono',
  signInTitle: 'Iniciar sesión',
  signInAction: 'Entrar',
  signUpTitle: 'Registro de transportista',
  signUpSubtitle: 'Crea tu cuenta para registrar tu empresa y tu flota.',
  signUpAction: 'Crear cuenta',
  goToSignUp: 'Soy transportista: crear cuenta',
  goToInvite: 'Soy operador: tengo una invitación',
  goToSignIn: 'Ya tengo cuenta: iniciar sesión',
  checkEmailTitle: 'Confirma tu correo',
  checkEmailBody: (email: string) =>
    `Te enviamos un enlace a ${email}. Ábrelo desde este teléfono para activar tu cuenta.`,
  confirmingEmail: 'Confirmando tu correo…',
  confirmEmailFailed:
    'No pudimos confirmar tu correo. El enlace pudo haber vencido; inicia sesión o pide uno nuevo.',
  signOut: 'Cerrar sesión',
  loading: 'Cargando…',
  retry: 'Reintentar',
} as const;

export const mobileInviteCopy = {
  title: 'Unirme con invitación',
  subtitle:
    'Tu transportista te envió un enlace o un código. Usa el mismo correo al que llegó la invitación.',
  codeLabel: 'Código de invitación',
  createAccountAction: 'Crear cuenta y unirme',
  acceptAction: 'Unirme',
  haveAccountAction: 'Ya tengo cuenta: iniciar sesión y unirme',
  accepting: 'Uniéndote a tu transportista…',
  acceptedTitle: '¡Listo!',
  pendingCodeNotice: 'Al confirmar tu correo te uniremos automáticamente a tu transportista.',
} as const;

export const mobileCompanyCopy = {
  title: 'Datos de tu empresa',
  subtitle: 'Los revisaremos antes de que puedas ofertar en cargas.',
  legalNameLabel: 'Razón social o nombre',
  rfcLabel: 'RFC',
  personTypeLabel: 'Tipo de persona',
  personTypeMoral: 'Persona moral',
  personTypeFisica: 'Persona física',
  saveAction: 'Guardar y continuar',
  inReviewTitle: 'Tu cuenta está en revisión',
  inReviewBody:
    'Puedes completar tu perfil y tu flota, pero no podrás ofertar hasta que aprobemos tu empresa.',
  rejectedTitle: 'Tu empresa no fue aprobada',
  suspendedTitle: 'Tu cuenta está suspendida',
  expiredTitle: 'La verificación de tu empresa venció',
  contactSupport: 'Escríbenos para revisar tu caso.',
} as const;

export const mobileNavCopy = {
  home: 'Inicio',
  units: 'Unidades',
  loads: 'Cargas',
  trips: 'Viajes',
  more: 'Más',
  assignedTrip: 'Viaje asignado',
  comingSoon: 'Esta sección estará disponible pronto.',
  noAssignedTrip: 'No tienes un viaje asignado por ahora.',
  wrongPlatformTitle: 'Usa la versión web',
  wrongPlatformBody:
    'La app móvil es para transportistas y operadores. Los clientes y administradores entran desde la web.',
  account: 'Cuenta',
  role: 'Perfil',
} as const;

export const mobileSystemCopy = {
  offline: 'Sin conexión. Algunos datos pueden no estar actualizados.',
  missingConfigTitle: 'Falta configuración',
  missingConfigBody:
    'La app no tiene la dirección del servidor. Revisa EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  /** Android notification channel name (shown in the system settings). */
  notificationChannel: 'Avisos generales',
  profileLoadFailed: 'No pudimos cargar tu perfil. Revisa tu conexión e inténtalo de nuevo.',
} as const;

/** Errors shown to the user; keys are produced by the app's error mapping. */
export const mobileErrorCopy = {
  invalidCredentials: 'Correo o contraseña incorrectos.',
  emailNotConfirmed: 'Confirma tu correo antes de iniciar sesión.',
  userAlreadyExists: 'Ya existe una cuenta con este correo. Inicia sesión.',
  weakPassword: 'La contraseña es muy débil. Usa al menos 8 caracteres con letras y números.',
  rateLimited: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  network: 'No hay conexión con el servidor. Revisa tu internet.',
  invitationInvalid:
    'La invitación no es válida, ya se usó o venció. Pide una nueva a tu transportista.',
  invitationOtherEmail:
    'La invitación se envió a otro correo. Usa el mismo correo al que te llegó.',
  invitationWrongAccount: 'Esta cuenta no puede unirse con una invitación de operador.',
  alreadyInCompany: 'Tu cuenta ya pertenece a una empresa.',
  rfcTaken: 'Ya hay una empresa registrada con este RFC.',
  unknown: 'Algo salió mal. Inténtalo de nuevo.',
} as const;

export type MobileErrorKey = keyof typeof mobileErrorCopy;
