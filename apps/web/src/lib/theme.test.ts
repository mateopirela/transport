import { describe, expect, it } from 'vitest';

import { THEME_COOKIE, themeChoiceFromCookie, themeClass, themeCookie } from './theme';

describe('themeChoiceFromCookie', () => {
  it('reads a valid choice', () => {
    expect(themeChoiceFromCookie('dark')).toBe('dark');
    expect(themeChoiceFromCookie('light')).toBe('light');
    expect(themeChoiceFromCookie('system')).toBe('system');
  });

  it('falls back to the system without a cookie or with garbage', () => {
    expect(themeChoiceFromCookie(undefined)).toBe('system');
    expect(themeChoiceFromCookie('')).toBe('system');
    expect(themeChoiceFromCookie('purple')).toBe('system');
    expect(themeChoiceFromCookie('dark; Path=/')).toBe('system');
  });
});

describe('themeClass', () => {
  it('forces light or dark and leaves the system alone', () => {
    expect(themeClass('light')).toBe('light');
    expect(themeClass('dark')).toBe('dark');
    expect(themeClass('system')).toBe('');
  });
});

describe('themeCookie', () => {
  it('keeps the choice a year on the whole site', () => {
    const cookie = themeCookie('dark', false);
    expect(cookie.startsWith(`${THEME_COOKIE}=dark;`)).toBe(true);
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain(`Max-Age=${60 * 60 * 24 * 365}`);
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
  });

  it('is Secure over HTTPS', () => {
    expect(themeCookie('light', true).split('; ')).toContain('Secure');
  });

  it('round-trips through the reader', () => {
    for (const choice of ['system', 'light', 'dark'] as const) {
      const value = themeCookie(choice, true).split(';')[0]?.split('=')[1];
      expect(themeChoiceFromCookie(value)).toBe(choice);
    }
  });
});
