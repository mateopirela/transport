import { describe, expect, it } from 'vitest';

import { base32Decode, DEMO_ADMIN_TOTP_KEY, totp } from './totp';

// RFC 6238, appendix B: the SHA-1 key "12345678901234567890" in base32.
const RFC_KEY = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp (RFC 6238)', () => {
  it('decodes base32 keys', () => {
    expect(base32Decode(RFC_KEY).toString('ascii')).toBe('12345678901234567890');
    expect(base32Decode('jbsw y3dp ehpk 3pxp').toString('hex')).toBe('48656c6c6f21deadbeef');
    expect(() => base32Decode('not base32!')).toThrow('invalid base32 key');
  });

  it.each([
    [59, '94287082'],
    [1_111_111_109, '07081804'],
    [1_111_111_111, '14050471'],
    [1_234_567_890, '89005924'],
    [2_000_000_000, '69279037'],
    [20_000_000_000, '65353130'],
  ])('matches the test vector at %i s', (seconds, code) => {
    expect(totp(RFC_KEY, seconds * 1000, 8)).toBe(code);
  });

  it('gives 6 digits by default and changes every 30 seconds', () => {
    expect(totp(RFC_KEY, 59_000)).toBe('287082');
    expect(totp(DEMO_ADMIN_TOTP_KEY, 0)).toBe(totp(DEMO_ADMIN_TOTP_KEY, 29_999));
    expect(totp(DEMO_ADMIN_TOTP_KEY, 0)).toMatch(/^\d{6}$/u);
  });
});
