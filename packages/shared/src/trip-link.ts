// Trip link for the operator (H2, D29): pure helpers shared by the web, the
// app and their tests. Postgres owns the security side
// (create_trip_operator_link, open_trip_operator_link and
// 47_trip_operator_links.test.sql); this module builds the links, reads them
// back, writes the message and parses the answer of the RPC strictly.
import { z } from 'zod';

import { tripLinkCopy } from './copy/trip-link';
import { publicSiteOrigin } from './legal';
import { APP_SCHEME, isShareToken, SHARE_TOKEN_PATTERN } from './share-links';

/** Web path of the public page of a trip link (it only offers to open the app). */
export const TRIP_LINK_PATH = '/viaje';

/** Relative web path of a trip link. */
export function tripLinkPath(token: string): string {
  return `${TRIP_LINK_PATH}/${encodeURIComponent(token)}`;
}

/**
 * `https://<sitio>/viaje/<token>`, or null when `siteUrl` is missing or not
 * https (http only on loopback, for local development).
 */
export function tripLinkUrl(siteUrl: string | null | undefined, token: string): string | null {
  const origin = publicSiteOrigin(siteUrl);
  return origin ? `${origin}${tripLinkPath(token)}` : null;
}

/** Deep link that opens the trip link in the app: `transport://viaje/<token>`. */
export function tripDeepLink(token: string): string {
  return `${APP_SCHEME}://viaje/${encodeURIComponent(token)}`;
}

const LINK_TOKEN_PATTERN = /(?:^|\/)viaje\/([A-Za-z0-9_-]+)\/?$/u;

/**
 * The token of a trip link (web URL or deep link, with or without a query
 * string or fragment) or of a bare token; null when there is none.
 */
export function parseTripLink(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().slice(0, 300);
  if (SHARE_TOKEN_PATTERN.test(trimmed)) return trimmed;
  const withoutExtras = trimmed.split(/[?#]/u, 1)[0] ?? '';
  const token = LINK_TOKEN_PATTERN.exec(withoutExtras)?.[1];
  return token !== undefined && isShareToken(token) ? token : null;
}

/** The message to send: "Hola {nombre}, tienes un viaje asignado: {ruta}. Ábrelo en la app: {url}". */
export function tripLinkMessage(input: {
  operatorName: string;
  route: string;
  url: string;
}): string {
  return tripLinkCopy.message({
    operatorName: input.operatorName.trim().split(/\s+/u)[0] ?? input.operatorName,
    route: input.route,
    url: input.url,
  });
}

/** Digits of a phone for wa.me: no `+`, spaces or dashes; a 10-digit Mexican number gets 52. */
export function whatsappPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/gu, '');
  if (digits.length === 10) return `52${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** "Enviar por WhatsApp": `https://wa.me/<phone>?text=…`, or the chooser without a phone. */
export function whatsappUrl(phone: string | null | undefined, text: string): string {
  const number = whatsappPhone(phone);
  return `https://wa.me/${number ?? ''}?text=${encodeURIComponent(text)}`;
}

/** "Enviar por SMS": `sms:<phone>?body=…` (the form both iOS and Android read). */
export function smsUrl(phone: string | null | undefined, text: string): string {
  const number = whatsappPhone(phone);
  return `sms:${number ? `+${number}` : ''}?body=${encodeURIComponent(text)}`;
}

/** Trip statuses in which the link is issued (trip_operator_link_issuable in SQL). */
export const TRIP_LINK_STATUSES = [
  'assigned',
  'en_route_to_pickup',
  'at_pickup',
  'loading',
  'in_transit',
  'at_delivery',
  'unloading',
] as const;

/** Whether "Enviar viaje al operador" applies to a trip. */
export function canSendTripLink(trip: { status: string; operatorId: string | null }): boolean {
  return (
    trip.operatorId !== null && (TRIP_LINK_STATUSES as readonly string[]).includes(trip.status)
  );
}

/** The answer of open_trip_operator_link. */
export const openTripLinkSchema = z.strictObject({
  tripId: z.uuid(),
  target: z.enum(['operator', 'carrier']),
});
export type OpenTripLink = z.infer<typeof openTripLinkSchema>;

/**
 * The app route the link leads to: the operator to their trip (in the
 * operator's area `/trip`, a hombre-camión's "Mi viaje"), the staff to the
 * trip detail. `next` carries the trip so the operator's screen can tell
 * when it is not the one in course.
 */
export function tripLinkDestination(
  link: OpenTripLink,
  area: 'operator' | 'carrier',
): { pathname: string; params: Record<string, string> } {
  if (link.target === 'carrier') return { pathname: '/trip/[id]', params: { id: link.tripId } };
  return {
    pathname: area === 'operator' ? '/trip' : '/my-trip',
    params: { viaje: link.tripId },
  };
}

/** Spanish message for an error of create_trip_operator_link / revoke_share_link. */
export function tripLinkErrorText(code: string | undefined): string {
  switch (code) {
    case '42501':
      return tripLinkCopy.errors.notFound;
    case '55000':
      return tripLinkCopy.errors.noOperator;
    case 'PT429':
      return tripLinkCopy.errors.rateLimited;
    default:
      return tripLinkCopy.errors.generic;
  }
}

// ---------------------------------------------------------------------------
// Universal links (optional): the web serves these files only for /viaje/*,
// and only when the Apple Team ID / the Android certificate are configured.
// ---------------------------------------------------------------------------

const APPLE_TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/u;
const SHA256_FINGERPRINT_PATTERN = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/u;

/** apple-app-site-association for /viaje/*, or null when the Team ID is missing or malformed. */
export function appleAppSiteAssociation(
  teamId: string | null | undefined,
  bundleId: string,
): { applinks: { details: { appIDs: string[]; components: { '/': string }[] }[] } } | null {
  const id = teamId?.trim();
  if (!id || !APPLE_TEAM_ID_PATTERN.test(id)) return null;
  return {
    applinks: {
      details: [{ appIDs: [`${id}.${bundleId}`], components: [{ '/': `${TRIP_LINK_PATH}/*` }] }],
    },
  };
}

/** assetlinks.json of the app, or null when no valid SHA-256 fingerprint is configured. */
export function androidAssetLinks(
  fingerprints: string | null | undefined,
  packageName: string,
):
  | {
      relation: string[];
      target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
    }[]
  | null {
  const list = (fingerprints ?? '')
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter((f) => SHA256_FINGERPRINT_PATTERN.test(f));
  if (list.length === 0) return null;
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: list,
      },
    },
  ];
}
