// Background location of the operator (B22): consent screen, "sharing
// location" indicator, Android's persistent notification and the account
// section to withdraw the consent. The consent text has a version
// (LOCATION_CONSENT_VERSION in tracking.ts): change both together.

export const locationConsentCopy = {
  title: 'Compartir tu ubicación durante el viaje',
  intro:
    'Para que tu transportista y el cliente sepan dónde va la carga, la app comparte tu ubicación mientras haces un viaje.',
  points: [
    'Solo durante un viaje activo: empieza cuando registras "Salir a recoger" y termina sola al registrar la entrega. Fuera de un viaje no se registra tu ubicación.',
    'Funciona en segundo plano, también con la pantalla apagada o la app cerrada. En Android verás una notificación fija mientras se comparte.',
    'Se guarda un punto aproximadamente cada minuto o cada 500 metros. Si no hay señal, los puntos se guardan en el teléfono y se envían después.',
    'La ven tu transportista y el equipo de soporte de la plataforma; el cliente de la carga, solo mientras el viaje está activo.',
    'Puedes retirar tu consentimiento cuando quieras en "Más". Sin él, no se comparte tu ubicación en segundo plano.',
  ],
  legalTitle: 'Aviso de privacidad',
  legal:
    'Conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares, tu ubicación se usa solo para dar seguimiento a los viajes que se te asignan, estimar llegadas y atender incidencias y la seguridad de la carga. No se vende ni se usa con fines publicitarios. Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición escribiendo al equipo de soporte. Tu aceptación queda registrada con la fecha, la versión de este texto y tu tipo de teléfono.',
  version: (version: string) => `Versión del texto: ${version}`,
  accept: 'Acepto compartir mi ubicación',
  decline: 'Ahora no',
  acceptFailed:
    'No pudimos registrar tu consentimiento. Necesitas conexión a internet para aceptarlo.',
  // After accepting: the operating system permission.
  permissionTitle: 'Permite la ubicación "Siempre"',
  permissionIos:
    'En la siguiente ventana elige "Permitir al usar la app" y después, cuando el iPhone lo pregunte, "Cambiar a Siempre permitir". También puedes hacerlo en Configuración > Transport > Ubicación > Siempre.',
  permissionAndroid:
    'En la siguiente pantalla elige "Permitir todo el tiempo". Sin ese permiso la ubicación se detiene cuando sales de la app.',
  permissionGrant: 'Dar permiso',
  permissionDenied:
    'El teléfono no dio permiso de ubicación "Siempre". Actívalo en la configuración para compartir tu ubicación durante el viaje.',
  openSettings: 'Abrir configuración',
  done: 'Listo',
} as const;

export const trackingCopy = {
  // Indicator on the trip screen.
  sharingTitle: 'Compartiendo ubicación',
  sharingBody:
    'Tu transportista y el cliente ven dónde va la carga. Se detiene sola al registrar la entrega.',
  queued: (count: number) =>
    count === 1
      ? '1 punto guardado en el teléfono, por enviar.'
      : `${count} puntos guardados en el teléfono, por enviar.`,
  needsConsentTitle: 'Falta tu consentimiento de ubicación',
  needsConsentBody:
    'Durante el viaje tu transportista y el cliente necesitan ver dónde va la carga. Revisa cómo se usa tu ubicación y acepta para compartirla.',
  needsConsentAction: 'Revisar y aceptar',
  needsPermissionTitle: 'Falta el permiso de ubicación "Siempre"',
  needsPermissionBody:
    'Sin él la ubicación se detiene cuando sales de la app. Actívalo para compartirla durante el viaje.',
  needsPermissionAction: 'Dar permiso',
  unavailable:
    'Este teléfono no permite compartir la ubicación en segundo plano. Mantén la app abierta durante el viaje.',
  // Android foreground service notification (persistent while tracking).
  notificationTitle: 'Compartiendo ubicación del viaje',
  notificationBody: 'Se detiene sola al registrar la entrega.',
  // Account ("Más").
  accountTitle: 'Ubicación en viajes',
  accountGiven: (date: string) => `Diste tu consentimiento el ${date}.`,
  accountMissing: 'No has dado tu consentimiento para compartir tu ubicación en viajes.',
  accountReview: 'Revisar consentimiento',
  revoke: 'Retirar consentimiento',
  revokeConfirm:
    'Dejaremos de compartir tu ubicación y se borrarán los puntos que aún no se envían. Tu transportista verá que el viaje no tiene ubicación.',
  revokeFailed: 'No pudimos retirar tu consentimiento. Revisa tu conexión e inténtalo de nuevo.',
  revoked: 'Retiraste tu consentimiento. Ya no se comparte tu ubicación.',
  cancel: 'Cancelar',
  confirm: 'Sí, retirar',
} as const;
