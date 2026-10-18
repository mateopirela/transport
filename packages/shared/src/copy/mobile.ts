// Spanish copy of the carrier/operator app shell (B17): authentication,
// invitations, navigation and connectivity.

export const mobileAuthCopy = {
  appName: 'Transport',
  tagline: 'Tu siguiente viaje, antes de terminar el actual.',
  emailLabel: 'Correo electrónico',
  identifierLabel: 'Correo o teléfono',
  optionalEmailLabel: 'Correo electrónico (opcional)',
  passwordLabel: 'Contraseña',
  passwordConfirmLabel: 'Confirma tu contraseña',
  fullNameLabel: 'Nombre completo',
  phoneLabel: 'Teléfono',
  signInTitle: 'Iniciar sesión',
  signInAction: 'Entrar',
  signUpTitle: 'Registro de transportista',
  signUpSubtitle: 'Crea tu cuenta para registrar tu empresa y tu flota.',
  signUpKindLabel: '¿Qué vas a registrar?',
  signUpKindCarrier: 'Soy transportista (empresa)',
  signUpKindOwnerOperator: 'Soy hombre camión',
  signUpKindOwnerOperatorHint:
    'Manejas tu propio camión: tendrás las pantallas del transportista y las del operador.',
  signUpAction: 'Crear cuenta',
  goToSignUp: 'Soy transportista: crear cuenta',
  goToInvite: 'Tengo un enlace de invitación',
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

/** Invitation links in the app (G1b, G2): transport://invitacion/<token>. */
export const mobileInviteCopy = {
  title: 'Unirme con invitación',
  subtitle: 'Tu Gerente o Coordinador te envió un enlace. Ábrelo desde este teléfono.',
  linkLabel: 'Enlace o código de invitación',
  openLinkAction: 'Abrir invitación',
  noLinkTitle: 'Falta tu invitación',
  noLinkBody:
    'Tu cuenta aún no pertenece a una empresa. Pide a tu Gerente el enlace de invitación y ábrelo desde este teléfono, o pégalo aquí.',
  loading: 'Revisando la invitación…',
  invalidTitle: 'Este enlace no sirve',
  invalidBody:
    'La invitación no es válida, ya se usó o venció. Pide a tu Gerente o Coordinador un enlace nuevo.',
  invitedBy: (name: string) => `Te invita ${name}.`,
  expires: (date: string) => `Vence el ${date}.`,
  coordinatorSubtitle: (company: string) =>
    `${company} te invita como Coordinador. Crea tu cuenta para operar sus unidades de negocio.`,
  coordinatorUnits: 'Unidades de negocio',
  coordinatorJoin: 'Unirme',
  coordinatorJoinSubtitle: (company: string) =>
    `Tu cuenta está lista. Únete a ${company} para empezar.`,
  coordinatorWrongAccount:
    'Esta invitación es para una cuenta nueva de Coordinador. Cierra sesión para aceptarla con otra cuenta.',
  operatorSubtitle: (company: string) =>
    `${company} te invita como Operador. Crea tu cuenta con tu teléfono: con él entrarás a la app.`,
  operatorUnit: 'Unidad de negocio',
  operatorSubmit: 'Crear mi cuenta',
  operatorSigningIn: 'Entrando con tu teléfono…',
  operatorDone: 'Tu cuenta está lista. Entra con tu teléfono y tu contraseña.',
  resetSubtitle: (company: string) =>
    `${company} te generó este enlace para restablecer tu acceso. Escribe una contraseña nueva.`,
  resetSubmit: 'Guardar contraseña',
  resetDone: 'Contraseña actualizada. Entra con tu teléfono (o tu correo) y tu nueva contraseña.',
  createAccountAction: 'Crear cuenta y unirme',
  accepting: 'Uniéndote a tu transportista…',
  pendingTokenNotice: 'Al confirmar tu correo te uniremos automáticamente a la empresa.',
  signOutHint: 'Si quieres usar otra cuenta, cierra sesión primero.',
} as const;

export const mobileCompanyCopy = {
  title: 'Datos de tu empresa',
  subtitle:
    'Como aparecen en tu constancia de situación fiscal. Los revisaremos antes de que puedas ofertar.',
  kindLabel: 'Tipo de registro',
  kindCarrier: 'Transportista (empresa)',
  kindOwnerOperator: 'Hombre camión',
  kindOwnerOperatorHint: 'Serás Gerente y Operador de tu propia empresa (D13).',
  legalNameLabel: 'Razón social o nombre',
  rfcLabel: 'RFC',
  personTypeLabel: 'Tipo de persona',
  personTypeMoral: 'Persona moral',
  personTypeFisica: 'Persona física',
  fiscalAddressTitle: 'Domicilio fiscal',
  streetLabel: 'Calle',
  exteriorNumberLabel: 'Número exterior',
  interiorNumberLabel: 'Número interior (opcional)',
  neighborhoodLabel: 'Colonia',
  postalCodeLabel: 'Código postal',
  municipalityLabel: 'Municipio o alcaldía',
  stateLabel: 'Estado',
  statePlaceholder: 'Selecciona un estado',
  stateClose: 'Cerrar',
  legalRepresentativeLabel: 'Representante legal',
  legalRepresentativeHint: 'Obligatorio para personas morales.',
  contactTitle: 'Contacto',
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
    'La app móvil es para Gerentes, Coordinadores y operadores. Los clientes y administradores entran desde la web.',
  account: 'Cuenta',
  role: 'Perfil',
  /** The hombre-camión's own trip, next to the carrier tabs (D13). */
  myTrip: 'Mi viaje',
} as const;

/** "Completa tu teléfono" (G2): accounts from before the phone was required. */
export const mobilePhoneCopy = {
  title: 'Completa tu teléfono',
  body: 'Tu cuenta no tiene teléfono. Agrégalo para que tu empresa y los clientes puedan contactarte.',
  label: 'Teléfono',
  save: 'Guardar teléfono',
  saved: 'Teléfono guardado.',
  current: (phone: string) => `Teléfono: ${phone}`,
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
    'La invitación no es válida, ya se usó o venció. Pide una nueva a tu Gerente o Coordinador.',
  invitationWrongAccount:
    'Esta cuenta no puede usar esta invitación. Cierra sesión y ábrela de nuevo.',
  emailNotConfirmedForInvitation: 'Confirma tu correo antes de unirte a la empresa.',
  alreadyInCompany: 'Tu cuenta ya pertenece a una empresa.',
  phoneTaken:
    'Ya existe una cuenta con ese teléfono. Pide a tu transportista restablecer tu acceso.',
  passwordNotSaved:
    'El enlace se usó, pero no pudimos guardar la contraseña. Pide a tu transportista un enlace nuevo.',
  sessionsNotRevoked:
    'Guardamos tu contraseña nueva, pero no pudimos cerrar las sesiones abiertas. Pide a tu transportista un enlace nuevo para cerrarlas.',
  rfcTaken: 'Ya hay una empresa registrada con este RFC.',
  missingFiscalData: 'Faltan datos fiscales. Revisa el domicilio fiscal y el representante legal.',
  phoneInvalid: 'Escribe un teléfono válido de 10 dígitos.',
  unknown: 'Algo salió mal. Inténtalo de nuevo.',
} as const;

export type MobileErrorKey = keyof typeof mobileErrorCopy;
