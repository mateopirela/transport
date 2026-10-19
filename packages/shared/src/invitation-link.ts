// Invitation links (G1b, D15-E1 and D19). `create_invitation` returns a
// 43-character base64url token (32 random bytes) of which the database keeps
// only the SHA-256. The web opens `/invitacion/<token>` and the app
// `transport://invitacion/<token>`; both call `invitation_preview` with the
// token. These helpers build and read those links consistently.

/** Length of the token: 32 bytes in base64url without padding. */
export const INVITATION_TOKEN_LENGTH = 43;
/** Shape of a token (base64url alphabet, fixed length). */
export const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
/** Path of the web page that opens an invitation. */
export const INVITATION_WEB_PATH = '/invitacion';
/** Scheme of the deep link that opens the app (apps/mobile/app.config.ts). */
export const INVITATION_DEEP_LINK_SCHEME = 'transport';
/** Default lifetime of a link, in hours (7 days), and the maximum (30 days). */
export const INVITATION_DEFAULT_VALID_HOURS = 168;
export const INVITATION_MAX_VALID_HOURS = 720;

const LINK_TOKEN_PATTERN = /(?:^|\/)invitacion\/([A-Za-z0-9_-]+)\/?$/u;

/** True when the input has the shape of an invitation token. */
export function isInvitationToken(input: string | null | undefined): boolean {
  return typeof input === 'string' && INVITATION_TOKEN_PATTERN.test(input);
}

function assertToken(token: string): void {
  if (!isInvitationToken(token)) {
    throw new RangeError('invalid invitation token');
  }
}

/** Web link of an invitation: `<siteUrl>/invitacion/<token>`. */
export function invitationUrl(siteUrl: string, token: string): string {
  assertToken(token);
  const base = siteUrl.trim().replace(/\/+$/u, '');
  return `${base}${INVITATION_WEB_PATH}/${token}`;
}

/** Deep link that opens the invitation in the app: `transport://invitacion/<token>`. */
export function invitationDeepLink(token: string): string {
  assertToken(token);
  return `${INVITATION_DEEP_LINK_SCHEME}://invitacion/${token}`;
}

/**
 * Reads the token of an invitation link (web or deep link, with or without a
 * query string or fragment) or of a bare token; null when there is none.
 */
export function parseInvitationLink(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (isInvitationToken(trimmed)) return trimmed;
  const withoutExtras = trimmed.split(/[?#]/u, 1)[0] ?? '';
  const token = LINK_TOKEN_PATTERN.exec(withoutExtras)?.[1];
  return token !== undefined && isInvitationToken(token) ? token : null;
}
