// Public legal pages (B27): the privacy notice (LFPDPPP) and the terms live on
// the web app; the mobile app and the store listings link to them.

/** Paths of the public legal pages on the web app. */
export const LEGAL_PATHS = {
  privacy: '/aviso-de-privacidad',
  terms: '/terminos',
} as const;

export type LegalDocumentKind = keyof typeof LEGAL_PATHS;

const LOOPBACK = new Set(['localhost', '127.0.0.1']);

/**
 * Origin of the public web app from its configured URL, or `null` when it is
 * missing or invalid (the caller hides the link). Only https is accepted,
 * except plain http on loopback for local development. Shared by the legal
 * pages and the share links (G7).
 */
export function publicSiteOrigin(siteUrl: string | null | undefined): string | null {
  const raw = siteUrl?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const secure = url.protocol === 'https:';
  const local = url.protocol === 'http:' && LOOPBACK.has(url.hostname);
  if (!secure && !local) return null;
  if (url.username || url.password) return null;
  return url.origin;
}

/** Absolute URL of a legal page on the public web app, or `null` (see publicSiteOrigin). */
export function legalUrl(
  siteUrl: string | null | undefined,
  kind: LegalDocumentKind,
): string | null {
  const origin = publicSiteOrigin(siteUrl);
  return origin ? `${origin}${LEGAL_PATHS[kind]}` : null;
}
