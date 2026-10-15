import { describe, expect, it } from 'vitest';

import {
  INVITATION_CODE_ALPHABET,
  formatInvitationCode,
  isInvitationCode,
  normalizeInvitationCode,
} from './invitation-code';

describe('operator invitation codes (B04)', () => {
  it('uses a 32-symbol alphabet without ambiguous letters', () => {
    expect(new Set(INVITATION_CODE_ALPHABET).size).toBe(32);
    expect(INVITATION_CODE_ALPHABET).not.toMatch(/[ILOU]/u);
  });

  it('normalizes case, spaces and hyphens like accept_operator_invitation', () => {
    expect(normalizeInvitationCode(' abcd-efgh 1234\t5678 ')).toBe('ABCDEFGH12345678');
  });

  it('recognizes well-formed codes', () => {
    expect(isInvitationCode('ABCD-EFGH-1234-5678')).toBe(true);
    expect(isInvitationCode('abcdefgh12345678')).toBe(true);
  });

  it('rejects codes with the wrong length or excluded letters', () => {
    expect(isInvitationCode('ABCDEFGH1234567')).toBe(false);
    expect(isInvitationCode('ABCDEFGH123456789')).toBe(false);
    expect(isInvitationCode('ABCDEFGH1234567U')).toBe(false);
    expect(isInvitationCode('')).toBe(false);
  });

  it('formats codes in blocks of four', () => {
    expect(formatInvitationCode('abcdefgh12345678')).toBe('ABCD-EFGH-1234-5678');
    expect(formatInvitationCode('ABCDEF')).toBe('ABCD-EF');
    expect(formatInvitationCode('')).toBe('');
  });
});
