import { parseThemeChoice, THEME_CHOICE_KEY, type ThemeChoice } from '@transport/shared';

/** The cookie that keeps the theme chosen in the account menu (D26). */
export const THEME_COOKIE = THEME_CHOICE_KEY;

/** A year: the choice is a preference, not a session. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * The web's theme before anyone chooses one (D26-E1): light, whatever the
 * system prefers. The system's theme applies only once "Sistema" is chosen.
 */
export const WEB_DEFAULT_THEME_CHOICE: ThemeChoice = 'light';

export function themeChoiceFromCookie(value: string | undefined): ThemeChoice {
  return parseThemeChoice(value) ?? WEB_DEFAULT_THEME_CHOICE;
}

/**
 * The class of `<html>` for a choice: `light` or `dark` force the theme
 * (globals.css), and no class follows the system's `prefers-color-scheme`
 * (only when "Sistema" was chosen: without a cookie the choice is light).
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

/**
 * The choice kept in a whole `document.cookie` string ("a=1; theme=dark"),
 * for the screens that render outside the root layout (global-error.tsx),
 * with the same fallback as the layout: light (D26-E1).
 */
export function themeChoiceFromCookieString(cookies: string): ThemeChoice {
  const entry = cookies
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${THEME_COOKIE}=`));
  return themeChoiceFromCookie(entry?.slice(THEME_COOKIE.length + 1));
}
