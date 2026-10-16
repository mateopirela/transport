// Permission prompts shown by iOS and Android. app.config.ts imports this file
// directly (outside the bundler), so it must not import anything.

/** Native permission prompts of the mobile app (expo-image-picker, B18). */
export const permissionCopy = {
  camera: 'Usamos la cámara para fotografiar tus documentos y los de tu flota.',
  photos: 'Usamos tus fotos para subir documentos de tu empresa y tu flota.',
  /** Foreground only (B21): each status change of a trip keeps where it happened (D11). */
  locationWhenInUse:
    'Usamos tu ubicación al registrar cada cambio de estado de tu viaje (salida, llegadas, carga y descarga).',
  /**
   * "Always" (B22, iOS NSLocationAlwaysAndWhenInUseUsageDescription): the
   * App Store asks that it says what is tracked, when and who sees it.
   */
  locationAlways:
    'Durante un viaje activo compartimos tu ubicación, también con la app cerrada, para que tu transportista y el cliente sigan la carga. Se detiene sola al entregar y nunca se usa fuera de un viaje.',
} as const;
