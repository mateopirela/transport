// Permission prompts shown by iOS and Android. app.config.ts imports this file
// directly (outside the bundler), so it must not import anything.

/** Native permission prompts of the mobile app (expo-image-picker, B18). */
export const permissionCopy = {
  camera: 'Usamos la cámara para fotografiar tus documentos y los de tu flota.',
  photos: 'Usamos tus fotos para subir documentos de tu empresa y tu flota.',
  /** Foreground only (B21): each status change of a trip keeps where it happened (D11). */
  locationWhenInUse:
    'Usamos tu ubicación al registrar cada cambio de estado de tu viaje (salida, llegadas, carga y descarga).',
} as const;
