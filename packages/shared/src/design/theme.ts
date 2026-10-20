import type { Theme } from './tokens';

/**
 * The person's choice of theme: one of the two, or the device's (§1.1, D26).
 * The web keeps it in the `theme` cookie; the app, on the phone.
 */
export const THEME_CHOICES = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

/** Name of the web cookie and key of the app's stored choice. */
export const THEME_CHOICE_KEY = 'theme';

/** Until the person chooses, the device decides. */
export const DEFAULT_THEME_CHOICE: ThemeChoice = 'system';

export function parseThemeChoice(value: unknown): ThemeChoice | null {
  return typeof value === 'string' && (THEME_CHOICES as readonly string[]).includes(value)
    ? (value as ThemeChoice)
    : null;
}

/**
 * The theme to draw: the choice when it names one, otherwise the device's
 * scheme, and light when the device says nothing.
 */
export function resolveTheme(
  choice: ThemeChoice | null | undefined,
  scheme: string | null | undefined,
): Theme {
  if (choice === 'light' || choice === 'dark') return choice;
  return scheme === 'dark' ? 'dark' : 'light';
}
