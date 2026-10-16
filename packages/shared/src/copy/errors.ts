// Error boundaries of web and mobile (B25): what the user sees when a screen
// fails unexpectedly. Never the raw error; at most a reference for support.

export const errorBoundaryCopy = {
  title: 'Algo salió mal',
  body: 'Tuvimos un problema al mostrar esta pantalla. Ya registramos el error; intenta de nuevo.',
  globalBody:
    'La aplicación tuvo un problema inesperado. Ya registramos el error; recarga la página para continuar.',
  retry: 'Intentar de nuevo',
  reload: 'Recargar',
  home: 'Ir al inicio',
  reference: (id: string) => `Referencia del error: ${id}`,
} as const;
