// Email version of a notification (B09): the dispatcher sends it to the web
// users (Cliente and Admin, D06). Title and body come from notificationContent,
// so push, email and the in-app inbox always say the same thing.
import type { NotificationType, UserRole } from '../enums';
import { authCopy } from './auth';
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
 * only uses the app (D06-E1).
 */
export function notificationWebPath(role: UserRole | null, data: unknown): string | null {
  if (role === 'admin') return '/admin';
  const loadId = uuid(data, 'loadId');
  const tripId = uuid(data, 'tripId');
  if (role === 'manager' || role === 'coordinator') {
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
  const link = absoluteLink(options.siteUrl, notificationWebPath(options.role, data));
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
