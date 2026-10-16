import { isValidRfc } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { confirmationPath, hoursFromNow, testMoralRfc, toDateInput, toDateTimeLocal } from './data';

describe('testMoralRfc', () => {
  it('builds valid RFCs of a persona moral', () => {
    for (const n of [0, 1, 35, 36, 1295, 1296, 14255, 14256, -7, 1.9, Date.now()]) {
      const rfc = testMoralRfc(n);
      expect(rfc).toHaveLength(12);
      expect(isValidRfc(rfc, 'moral')).toBe(true);
    }
  });

  it('gives a different RFC for each n in range', () => {
    const seen = new Set(Array.from({ length: 14256 }, (_, n) => testMoralRfc(n)));
    expect(seen.size).toBe(14256);
  });
});

describe('toDateTimeLocal', () => {
  it('formats in Mexico City time (UTC-6, no DST)', () => {
    expect(toDateTimeLocal(new Date('2026-10-16T05:07:00Z'))).toBe('2026-10-15T23:07');
    expect(toDateTimeLocal(new Date('2026-07-01T18:30:59Z'))).toBe('2026-07-01T12:30');
  });

  it('uses a 24-hour clock', () => {
    expect(toDateTimeLocal(new Date('2026-01-01T06:00:00Z'))).toBe('2026-01-01T00:00');
  });

  it('accepts another time zone', () => {
    expect(toDateTimeLocal(new Date('2026-10-16T05:07:00Z'), 'UTC')).toBe('2026-10-16T05:07');
  });
});

describe('toDateInput', () => {
  it('keeps the Mexico City calendar day', () => {
    expect(toDateInput(new Date('2026-10-16T05:07:00Z'))).toBe('2026-10-15');
  });
});

describe('confirmationPath', () => {
  it('finds the link in the HTML template (escaped ampersand)', () => {
    const html =
      '<a href="http://127.0.0.1:3000/auth/confirm?token_hash=pkce_ab-12_CD&amp;type=email">Confirmar</a>';
    expect(confirmationPath(html)).toBe('/auth/confirm?token_hash=pkce_ab-12_CD&type=email');
  });

  it('finds the link in the text version', () => {
    expect(
      confirmationPath('Abre http://localhost:3000/auth/confirm?token_hash=abc123&type=signup'),
    ).toBe('/auth/confirm?token_hash=abc123&type=signup');
  });

  it('returns null without a confirmation link', () => {
    expect(confirmationPath('<a href="https://example.com">Hola</a>')).toBeNull();
  });
});

describe('hoursFromNow', () => {
  it('adds hours to the given instant', () => {
    const now = new Date('2026-10-16T00:00:00Z');
    expect(hoursFromNow(26, now).toISOString()).toBe('2026-10-17T02:00:00.000Z');
    expect(hoursFromNow(-1, now).toISOString()).toBe('2026-10-15T23:00:00.000Z');
  });
});
