import { describe, expect, it } from 'vitest';

import { emailCodeCopy } from './copy/access';
import {
  canResend,
  isEmailRateLimitError,
  RESEND_COOLDOWN_SECONDS,
  resendWaitSeconds,
} from './resend-cooldown';

const T0 = Date.UTC(2026, 10, 19, 12, 0, 0);

describe('resendWaitSeconds', () => {
  it('waits a minute, which is never shorter than the hosted max_frequency (60 s)', () => {
    expect(RESEND_COOLDOWN_SECONDS).toBeGreaterThanOrEqual(60);
  });

  it('has no wait before the first send', () => {
    expect(resendWaitSeconds(null, T0)).toBe(0);
    expect(resendWaitSeconds(undefined, T0)).toBe(0);
    expect(canResend(null, T0)).toBe(true);
  });

  it('counts down from the cooldown to zero, rounding up', () => {
    expect(resendWaitSeconds(T0, T0)).toBe(60);
    expect(resendWaitSeconds(T0, T0 + 1)).toBe(60);
    expect(resendWaitSeconds(T0, T0 + 1_000)).toBe(59);
    expect(resendWaitSeconds(T0, T0 + 59_001)).toBe(1);
    expect(resendWaitSeconds(T0, T0 + 60_000)).toBe(0);
    expect(resendWaitSeconds(T0, T0 + 3_600_000)).toBe(0);
  });

  it('offers the button only when the wait is over', () => {
    expect(canResend(T0, T0 + 59_999)).toBe(false);
    expect(canResend(T0, T0 + 60_000)).toBe(true);
  });

  it('takes another cooldown', () => {
    expect(resendWaitSeconds(T0, T0 + 500, 1)).toBe(1);
    expect(resendWaitSeconds(T0, T0 + 1_000, 1)).toBe(0);
    expect(resendWaitSeconds(T0, T0, 0)).toBe(0);
    expect(resendWaitSeconds(T0, T0, -5)).toBe(0);
  });

  it('never waits more than the cooldown when the clock goes backwards, nor on junk', () => {
    expect(resendWaitSeconds(T0, T0 - 600_000)).toBe(60);
    expect(resendWaitSeconds(Number.NaN, T0)).toBe(0);
    expect(resendWaitSeconds(T0, Number.NaN)).toBe(0);
    expect(resendWaitSeconds(Number.POSITIVE_INFINITY, T0)).toBe(0);
  });

  it('has a text for every second of the wait', () => {
    expect(emailCodeCopy.resendIn(1)).toContain('1 segundo');
    expect(emailCodeCopy.resendIn(59)).toContain('59 segundos');
  });
});

describe('isEmailRateLimitError', () => {
  it('recognizes the email limits of Supabase Auth', () => {
    expect(isEmailRateLimitError({ code: 'over_email_send_rate_limit' })).toBe(true);
    expect(isEmailRateLimitError({ code: 'over_request_rate_limit' })).toBe(true);
    expect(isEmailRateLimitError({ status: 429 })).toBe(true);
  });

  it('is false for other errors and for none', () => {
    expect(isEmailRateLimitError({ code: 'otp_expired', status: 403 })).toBe(false);
    expect(isEmailRateLimitError({})).toBe(false);
    expect(isEmailRateLimitError(null)).toBe(false);
    expect(isEmailRateLimitError(undefined)).toBe(false);
  });
});

describe('emailCodeCopy.validFor', () => {
  it('says how long the code lasts', () => {
    expect(emailCodeCopy.validFor(60)).toBe('El código vence en 1 hora.');
    expect(emailCodeCopy.validFor(120)).toBe('El código vence en 2 horas.');
    expect(emailCodeCopy.validFor(15)).toBe('El código vence en 15 minutos.');
  });
});
