import {
  DEFAULT_THEME_CHOICE,
  parseThemeChoice,
  THEME_CHOICE_KEY,
  type ThemeChoice,
} from '@transport/shared';

/** The cookie that keeps the theme chosen in the account menu (D26). */
export const THEME_COOKIE = THEME_CHOICE_KEY;

/** A year: the choice is a preference, not a session. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function themeChoiceFromCookie(value: string | undefined): ThemeChoice {
  return parseThemeChoice(value) ?? DEFAULT_THEME_CHOICE;
}

/**
 * The class of `<html>` for a choice: `light` or `dark` force the theme
 * (globals.css), and no class follows the system's `prefers-color-scheme`.
 */
export function themeClass(choice: ThemeChoice): '' | 'light' | 'dark' {
  return choice === 'system' ? '' : choice;
}

/** The `document.cookie` assignment that keeps a choice. */
export function themeCookie(choice: ThemeChoice, secure: boolean): string {
  return [
    `${THEME_COOKIE}=${choice}`,
    'Path=/',
    `Max-Age=${MAX_AGE_SECONDS}`,
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}
