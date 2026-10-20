import type { ThemeChoice } from '../design/theme';

/** The theme switcher (D26): the account in the app, the account menu on the web. */
export const appearanceCopy = {
  title: 'Apariencia',
  system: 'Sistema',
  light: 'Claro',
  dark: 'Oscuro',
} as const satisfies { title: string } & Record<ThemeChoice, string>;
