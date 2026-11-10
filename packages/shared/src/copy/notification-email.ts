// Email version of a notification (B09): the dispatcher sends it to the web
// users (Cliente and Admin, D06). Title and body come from notificationContent,
// so push, email and the in-app inbox always say the same thing.
import type { NotificationType, UserRole } from '../enums';
import { INTERNAL_CHAT_PARAM, SHIPPER_CHAT_PARAM } from '../internal-chat';
import { authCopy } from './auth';
import { BACKHAUL_SECTION_ID } from './backhaul';
import { notificationContent } from './notifications';

export interface NotificationEmail {
  subject: string;
  text: string;
  html: string;
}

export const notificationEmailCopy = {
  openLink: 'Abrir en la plataforma',
  footer:
    'Recibes este correo porque tienes una cuenta en la plataforma. Todos tus avisos están en la bandeja de notificaciones.',
} as const;

/**
 * Types sent by push and kept in the inbox, never by email: the messages of
 * the internal trip chat (H1) and of the chat with the shipper are too
 * frequent for the mailbox.
 */
export const PUSH_ONLY_NOTIFICATION_TYPES: readonly NotificationType[] = [
  'internal_message',
  'chat_message',
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function uuid(data: unknown, key: string): string | null {
  const value =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>)[key] : null;
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

/**
 * Web page a notification links to, for the roles that use the web (same
 * routes as apps/web/src/lib/routing.ts): the shipper's trip (B15) or load;
 * the carrier staff's negotiation or load (G10a; trips come with G10b, until
 * then the load, which links to its trip once there is one). The operator
 * only uses the app (D06-E1). With the type, the return loads (I7) open the
 * trip on "Para el regreso", as the web inbox does.
 */
export function notificationWebPath(
  role: UserRole | null,
  data: unknown,
  type?: NotificationType,
): string | null {
  // The freight ledger (I3): the admin's reconciliation, the carrier's
  // "Cobranza" and the client's "Cartera".
  const freight = uuid(data, 'ledgerId') !== null;
  if (role === 'admin') return freight ? '/admin/flete' : '/admin';
  const loadId = uuid(data, 'loadId');
  const tripId = uuid(data, 'tripId');
  if (role === 'manager' || role === 'coordinator') {
    if (freight) return '/transportista/cobranza';
    // A chat message carries its conversation: the internal trip chat (H1) on
    // its tab; the trip chat with the shipper (`kind` 'trip') on the shipper's.
    if (tripId && uuid(data, 'conversationId')) {
      const shipperChat = (data as Record<string, unknown>).kind === 'trip';
      return `/transportista/viajes/${tripId}?chat=${shipperChat ? SHIPPER_CHAT_PARAM : INTERNAL_CHAT_PARAM}`;
    }
    // The return loads of a trip (I7, D40), in its "Para el regreso".
    if (type === 'backhaul_suggestions') {
      return tripId ? `/transportista/viajes/${tripId}#${BACKHAUL_SECTION_ID}` : null;
    }
    const negotiationId = uuid(data, 'negotiationId');
    if (negotiationId) return `/transportista/negociaciones/${negotiationId}`;
    // A unit to release, or released (G5): its screen, where it is released.
    const vehicleId = uuid(data, 'vehicleId');
    if (uuid(data, 'taskId') && vehicleId) return `/transportista/flota/unidades/${vehicleId}`;
    // Trips of the carrier web (G10b); the fleet's documents go to the inbox,
    // which links each one to its unit or operator.
    if (tripId) return `/transportista/viajes/${tripId}`;
    return loadId ? `/transportista/cargas/${loadId}` : '/transportista/notificaciones';
  }
  if (role !== 'shipper') return null;
  if (freight) return '/cliente/cartera';
  if (tripId) return `/cliente/viajes/${tripId}`;
  return loadId ? `/cliente/cargas/${loadId}` : '/cliente/notificaciones';
}

/** Absolute link, only for an http(s) site URL without credentials. */
function absoluteLink(siteUrl: string | undefined, path: string | null): string | null {
  if (!siteUrl || !path) return null;
  try {
    const base = new URL(siteUrl);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) return null;
    return new URL(path, `${base.origin}/`).toString();
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Subject, plain text and HTML of the email of a notification. */
export function notificationEmail(
  type: NotificationType,
  data: unknown,
  options: { role: UserRole | null; siteUrl?: string },
): NotificationEmail {
  const { title, body } = notificationContent(type, data);
  const link = absoluteLink(options.siteUrl, notificationWebPath(options.role, data, type));
  const subject = `${title} · ${authCopy.appName}`;

  const text = [
    title,
    '',
    body,
    ...(link ? ['', `${notificationEmailCopy.openLink}: ${link}`] : []),
  ]
    .concat(['', '—', notificationEmailCopy.footer])
    .join('\n');

  const button = link
    ? `<p><a href="${escapeHtml(link)}" style="background: #2f7bf0; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none">${escapeHtml(notificationEmailCopy.openLink)}</a></p>`
    : '';
  const html = [
    '<!doctype html>',
    '<html lang="es-MX">',
    '<body style="font-family: Arial, sans-serif; color: #131f33">',
    `<h2>${escapeHtml(title)}</h2>`,
    `<p>${escapeHtml(body)}</p>`,
    button,
    `<p style="color: #5b6b82; font-size: 12px">${escapeHtml(notificationEmailCopy.footer)}</p>`,
    '</body>',
    '</html>',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, text, html };
}
