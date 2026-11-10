/** Labels of the web UI kit and shell (U6, docs/plan-rediseno.md §1.6). */
export const uiCopy = {
  /** The close button of a dialog or a sheet (read by screen readers). */
  close: 'Cerrar',
  /** The account menu in the top bar (read by screen readers). */
  account: 'Cuenta',
  /** The section tabs of the top bar (read by screen readers). */
  sections: 'Secciones',
} as const;

/** The sample page of the web kit (/dev/kit, development only): its title and sample data. */
export const devKitCopy = {
  title: 'Muestra del kit',
  route: 'Monterrey → Guadalajara',
  returnRoute: 'Guadalajara → Monterrey',
  city: 'Monterrey, Nuevo León',
  price: '$38,000',
  weight: '15,000',
  date: '20/10/2026',
} as const;

/** Shared display formatters (packages/shared/src/formatters.ts). */
export const formatterCopy = {
  /** In place of a stored date or time that cannot be read (e.g. past year 9999 in UTC). */
  invalidDate: 'fecha no válida',
} as const;
