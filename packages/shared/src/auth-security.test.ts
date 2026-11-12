import { describe, expect, it } from 'vitest';

import {
  isAccountLockedError,
  LOGIN_LOCKOUT,
  SESSION_LIMITS,
  sessionAuthTimes,
  sessionEnd,
  sessionLimitsFor,
  totpCodeField,
} from './auth-security';
import { USER_ROLES } from './enums';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const now = Date.UTC(2026, 10, 12, 18, 0, 0);

describe('session limits (D46)', () => {
  it('keeps the proposed values: 8 h and 30 min for admins, 30 days for the rest', () => {
    expect(SESSION_LIMITS.admin).toEqual({ maxAgeMs: 8 * HOUR, idleMs: 30 * MINUTE });
    expect(SESSION_LIMITS.default).toEqual({ maxAgeMs: 30 * DAY, idleMs: null });
  });

  it('gives the short limits only to admins', () => {
    for (const role of USER_ROLES) {
      expect(sessionLimitsFor(role)).toBe(
        role === 'admin' ? SESSION_LIMITS.admin : SESSION_LIMITS.default,
      );
    }
  });

  it('matches the lock of the Auth hooks', () => {
    expect(LOGIN_LOCKOUT).toEqual({ maxFailures: 5, windowMinutes: 15, lockMinutes: 15 });
  });
});

describe('sessionAuthTimes', () => {
  it('reads the first and the latest authentication of the amr claim', () => {
    const amr = [
      { method: 'totp', timestamp: now / 1000 - 60 },
      { method: 'password', timestamp: now / 1000 - 600 },
    ];
    expect(sessionAuthTimes(amr)).toEqual({ firstAt: now - 600_000, lastAt: now - 60_000 });
  });

  it('ignores malformed entries and answers null without a timestamp', () => {
    expect(sessionAuthTimes(undefined)).toBeNull();
    expect(sessionAuthTimes('password')).toBeNull();
    expect(sessionAuthTimes([{ method: 'password' }, null, { timestamp: 'x' }])).toBeNull();
    expect(sessionAuthTimes([{ timestamp: Number.NaN }, { timestamp: 10 }])).toEqual({
      firstAt: 10_000,
      lastAt: 10_000,
    });
  });
});

describe('sessionEnd', () => {
  const signedInAgo = (ms: number) => ({ firstAt: now - ms, lastAt: now - ms });

  it('ends an admin session 8 hours after the sign-in, even when active', () => {
    const base = { role: 'admin' as const, lastActivityAt: now - MINUTE, now };
    expect(sessionEnd({ ...base, authTimes: signedInAgo(8 * HOUR - MINUTE) })).toBeNull();
    expect(sessionEnd({ ...base, authTimes: signedInAgo(8 * HOUR + MINUTE) })).toBe('expired');
  });

  it('ends an admin session after 30 minutes without activity', () => {
    const authTimes = signedInAgo(2 * HOUR);
    const base = { role: 'admin' as const, authTimes, now };
    expect(sessionEnd({ ...base, lastActivityAt: now - 29 * MINUTE })).toBeNull();
    expect(sessionEnd({ ...base, lastActivityAt: now - 31 * MINUTE })).toBe('idle');
  });

  it('counts the latest authentication as activity when the last request is unknown', () => {
    const authTimes = { firstAt: now - 2 * HOUR, lastAt: now - 10 * MINUTE };
    expect(sessionEnd({ role: 'admin', authTimes, lastActivityAt: null, now })).toBeNull();
    expect(
      sessionEnd({ role: 'admin', authTimes, lastActivityAt: now - 3 * HOUR, now }),
    ).toBeNull();
    expect(
      sessionEnd({ role: 'admin', authTimes: signedInAgo(40 * MINUTE), lastActivityAt: null, now }),
    ).toBe('idle');
  });

  it('lets everybody else stay idle and signed in for 30 days', () => {
    for (const role of ['shipper', 'manager', 'coordinator', 'operator'] as const) {
      expect(
        sessionEnd({ role, authTimes: signedInAgo(29 * DAY), lastActivityAt: null, now }),
      ).toBeNull();
      expect(sessionEnd({ role, authTimes: signedInAgo(31 * DAY), lastActivityAt: now, now })).toBe(
        'expired',
      );
    }
  });

  it('ends an admin session it cannot date, and only an admin one', () => {
    expect(sessionEnd({ role: 'admin', authTimes: null, lastActivityAt: now, now })).toBe(
      'expired',
    );
    expect(sessionEnd({ role: 'manager', authTimes: null, lastActivityAt: null, now })).toBeNull();
  });
});

describe('isAccountLockedError', () => {
  it('recognizes the answers of the password and second-factor hooks', () => {
    expect(
      isAccountLockedError({
        code: 'invalid_credentials',
        message: 'Too many failed attempts: account temporarily locked',
      }),
    ).toBe(true);
    expect(isAccountLockedError({ code: 'mfa_verification_rejected', message: 'x' })).toBe(true);
  });

  it('does not confuse wrong credentials or other errors with a lock', () => {
    expect(
      isAccountLockedError({ code: 'invalid_credentials', message: 'Invalid login credentials' }),
    ).toBe(false);
    expect(isAccountLockedError({ code: 'over_request_rate_limit' })).toBe(false);
    expect(isAccountLockedError(null)).toBe(false);
  });
});

describe('totpCodeField', () => {
  it('accepts six digits, spaces dropped', () => {
    expect(totpCodeField.parse('123456')).toBe('123456');
    expect(totpCodeField.parse(' 123 456 ')).toBe('123456');
  });

  it('rejects anything else', () => {
    for (const value of ['12345', '1234567', 'abcdef', '', 123456]) {
      expect(totpCodeField.safeParse(value).success).toBe(false);
    }
  });
});
