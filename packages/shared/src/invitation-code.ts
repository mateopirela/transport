// Operator invitation codes (B04, D15). `create_operator_invitation` returns a
// 16-character Crockford base32 code; `accept_operator_invitation` ignores case,
// spaces and hyphens. These helpers keep the apps consistent with that SQL.

/** Crockford base32 alphabet used by the database (no I, L, O or U). */
export const INVITATION_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const INVITATION_CODE_LENGTH = 16;

const CODE_PATTERN = new RegExp(`^[${INVITATION_CODE_ALPHABET}]{${INVITATION_CODE_LENGTH}}$`, 'u');

/** Uppercases and strips spaces and hyphens, like the database does. */
export function normalizeInvitationCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/gu, '');
}

/** True when the input, once normalized, has the shape of an invitation code. */
export function isInvitationCode(input: string): boolean {
  return CODE_PATTERN.test(normalizeInvitationCode(input));
}

/** Groups a code in blocks of four to read it aloud or type it: `ABCD-EFGH-…`. */
export function formatInvitationCode(input: string): string {
  return (normalizeInvitationCode(input).match(/.{1,4}/gu) ?? []).join('-');
}
