import { invitationUrl } from '@transport/shared';
import * as Linking from 'expo-linking';

const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL?.trim();

/**
 * The link to share: the web page `/invitacion/<token>` when the site URL is
 * configured (it opens the app or explains how to get it), otherwise the
 * deep link `transport://invitacion/<token>`.
 */
export function shareableLink(token: string): string {
  if (SITE_URL) {
    try {
      return invitationUrl(SITE_URL, token);
    } catch {
      // Fall back to the deep link.
    }
  }
  return Linking.createURL(`/invitacion/${token}`);
}
