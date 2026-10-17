// Share links of the app (G7, D23): the carrier's staff share a load with
// their team (create_share_link, kind load_internal) and anyone of the company
// opens it with their session (open_internal_share). Postgres decides who may
// do what; the app only builds the link and parses the answer strictly.
import {
  appShareLink,
  internalSharedLoadSchema,
  isShareToken,
  shareLinksCopy,
  shareUrl,
  type InternalSharedLoad,
} from '@transport/shared';

import type { Supabase } from './supabase';

// Public web URL (B27). Static access so Expo inlines it in the bundle.
const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL;

/**
 * Where a shared load opens: the web page of the carrier's team when the
 * public site is configured (it works in any browser and asks to sign in),
 * otherwise the app's own deep link (local development).
 */
export function internalShareTarget(siteUrl: string | undefined, token: string): string {
  return shareUrl(siteUrl, 'load_internal', token) ?? appShareLink(token);
}

/** The text of the share sheet: a sentence and the link. */
export function shareSheetMessage(route: string, url: string): string {
  return `${shareLinksCopy.app.message(route)} ${url}`;
}

/** Creates an internal link to a load and returns what to share. */
export async function createTeamShareLink(
  client: Supabase,
  loadId: string,
): Promise<{ token: string; url: string }> {
  const { data, error } = await client.rpc('create_share_link', {
    p_kind: 'load_internal',
    p_load_id: loadId,
  });
  const link = data?.[0];
  if (error || !link) throw new Error(error?.message ?? 'empty response');
  return { token: link.token, url: internalShareTarget(SITE_URL, link.token) };
}

/**
 * The load behind an internal link, or null when it is not available to the
 * signed-in user (unknown, expired or revoked token, or another company's).
 */
export async function openTeamShareLink(
  client: Supabase,
  token: string,
): Promise<InternalSharedLoad | null> {
  if (!isShareToken(token)) return null;
  const { data, error } = await client.rpc('open_internal_share', { p_token: token });
  if (error) {
    if (error.code === '42501') return null;
    throw new Error(error.message);
  }
  const parsed = internalSharedLoadSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** `token` route param of the shared screen, as a string (or empty). */
export function shareTokenParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? '').trim();
}
