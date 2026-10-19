// Documents shared with the shipper (G6): the viewer route and the signed URL
// it redirects to. Pure, so the route and its tests share one definition.
import { uuidField } from '@transport/shared';

/** Viewer of a shared document in the shipper area (redirects to a 60 s signed URL). */
export const sharedDocumentHref = (shareId: string) =>
  `/cliente/viajes/documento-compartido?id=${encodeURIComponent(shareId)}`;

/** The share id of the viewer route, or null when it is malformed. */
export function parseShareId(value: string | null): string | null {
  const parsed = uuidField.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const SIGNED_PATH = /^\/storage\/v1\/object\/sign\/documents\/[^?#]+\?token=[^#&]+$/u;

/**
 * Absolute signed URL for the path the Edge Function returned, on the
 * Supabase URL the web already uses. Anything else (another bucket, another
 * host, an absolute URL) is refused, so the redirect never leaves Storage.
 */
export function signedDocumentUrl(supabaseUrl: string, signedPath: unknown): string | null {
  if (typeof signedPath !== 'string' || !SIGNED_PATH.test(signedPath)) return null;
  try {
    const base = new URL(supabaseUrl);
    if (!['http:', 'https:'].includes(base.protocol)) return null;
    const url = new URL(`${base.origin}${base.pathname.replace(/\/+$/u, '')}${signedPath}`);
    return url.origin === base.origin ? url.toString() : null;
  } catch {
    return null;
  }
}
