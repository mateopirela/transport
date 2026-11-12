import { accessSecurityCopy, authErrors, LOGIN_LOCKOUT, secondFactorCopy } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { authErrorMessage } from './auth-errors';
import { secondFactorErrorMessage } from './auth/second-factor-errors';
import {
  activityCookieOptions,
  activityCookieValue,
  lastActivityAt,
  sessionEndFromParam,
  signInAfterSessionEnd,
  tracksActivity,
  viewerSessionEnd,
} from './session-limits';

const MINUTE = 60_000;
const now = Date.UTC(2026, 10, 12, 18, 0, 0);
const sessionId = '0b6a3d4e-2f61-4c2a-9d8e-5a1f2b3c4d5e';
const signedInAgo = (ms: number) => ({ firstAt: now - ms, lastAt: now - ms });

describe('the activity cookie (R5, D46)', () => {
  it('reads back the last request of the same session', () => {
    const cookie = activityCookieValue(sessionId, now - 5 * MINUTE);
    expect(lastActivityAt(cookie, sessionId, now)).toBe(now - 5 * MINUTE);
  });

  it('ignores a cookie of another session, malformed or from the future', () => {
    const other = activityCookieValue('11111111-2f61-4c2a-9d8e-5a1f2b3c4d5e', now);
    expect(lastActivityAt(other, sessionId, now)).toBeNull();
    expect(lastActivityAt(undefined, sessionId, now)).toBeNull();
    expect(lastActivityAt(activityCookieValue(sessionId, now), null, now)).toBeNull();
    for (const bad of [
      `${sessionId}.`,
      `${sessionId}.abc`,
      `.${now}`,
      sessionId,
      `${sessionId}.-5`,
    ]) {
      expect(lastActivityAt(bad, sessionId, now)).toBeNull();
    }
    expect(lastActivityAt(activityCookieValue(sessionId, now + MINUTE), sessionId, now)).toBeNull();
  });

  it('is httpOnly, same-site and lasts as long as an admin session', () => {
    expect(activityCookieOptions(true)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60,
    });
    expect(activityCookieOptions(false).secure).toBe(false);
  });

  it('is kept only for the admins, the only ones idleness signs out', () => {
    expect(tracksActivity('admin')).toBe(true);
    for (const role of ['shipper', 'manager', 'coordinator', 'operator'] as const) {
      expect(tracksActivity(role)).toBe(false);
    }
  });
});

describe('viewerSessionEnd', () => {
  const admin = { role: 'admin' as const, sessionId, authTimes: signedInAgo(2 * 60 * MINUTE) };

  it('signs out an admin after 30 minutes without a request', () => {
    expect(
      viewerSessionEnd(admin, activityCookieValue(sessionId, now - 10 * MINUTE), now),
    ).toBeNull();
    expect(viewerSessionEnd(admin, activityCookieValue(sessionId, now - 31 * MINUTE), now)).toBe(
      'idle',
    );
    // Without a cookie of this session, the sign-in two hours ago is the last activity.
    expect(viewerSessionEnd(admin, undefined, now)).toBe('idle');
  });

  it('signs out an admin 8 hours after the sign-in', () => {
    const old = { ...admin, authTimes: signedInAgo(8 * 60 * MINUTE + MINUTE) };
    expect(viewerSessionEnd(old, activityCookieValue(sessionId, now), now)).toBe('expired');
  });

  it('leaves a carrier signed in while idle', () => {
    const manager = {
      role: 'manager' as const,
      sessionId,
      authTimes: signedInAgo(7 * 24 * 60 * MINUTE),
    };
    expect(viewerSessionEnd(manager, undefined, now)).toBeNull();
  });
});

describe('the sign-in page after a session ended', () => {
  it('says why and keeps the page to come back to', () => {
    expect(signInAfterSessionEnd('idle', '/admin/flete')).toBe(
      '/login?sesion=inactiva&next=%2Fadmin%2Fflete',
    );
    expect(signInAfterSessionEnd('expired', '/')).toBe('/login?sesion=expirada');
  });

  it('reads the reason back, and nothing else', () => {
    expect(sessionEndFromParam('inactiva')).toBe('idle');
    expect(sessionEndFromParam('expirada')).toBe('expired');
    expect(sessionEndFromParam('otra')).toBeNull();
    expect(sessionEndFromParam(['inactiva'])).toBeNull();
    expect(accessSecurityCopy.session.idle).not.toBe(accessSecurityCopy.session.expired);
  });
});

describe('the lock after failed attempts (R5, D46)', () => {
  const locked = accessSecurityCopy.accountLocked(LOGIN_LOCKOUT.lockMinutes);

  it('is told apart from a wrong password at sign-in', () => {
    expect(
      authErrorMessage({
        code: 'invalid_credentials',
        message: 'Too many failed attempts: account temporarily locked',
      }),
    ).toBe(locked);
    expect(
      authErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' }),
    ).toBe(authErrors.invalidCredentials);
    expect(locked).toContain('15 minutos');
  });

  it('is told apart from a wrong code at the second factor', () => {
    expect(secondFactorErrorMessage({ code: 'mfa_verification_rejected' })).toBe(locked);
    expect(secondFactorErrorMessage({ code: 'mfa_verification_failed' })).toBe(
      secondFactorCopy.errors.invalidCode,
    );
    expect(secondFactorErrorMessage({ code: 'mfa_challenge_expired' })).toBe(
      secondFactorCopy.errors.expired,
    );
    expect(secondFactorErrorMessage({ code: 'over_request_rate_limit' })).toBe(
      authErrors.rateLimited,
    );
    expect(secondFactorErrorMessage({ code: 'something_else' })).toBe(authErrors.generic);
    expect(secondFactorErrorMessage(null)).toBe(authErrors.generic);
  });
});
