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

/** Web page a notification links to, for the roles that use the web. */
export function notificationWebPath(role: UserRole | null, data: unknown): string | null {
  if (role === 'admin') return '/admin';
  if (role !== 'shipper') return null;
  const loadId =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>).loadId : null;
  return typeof loadId === 'string' && UUID.test(loadId)
    ? `/cliente/cargas/${loadId.toLowerCase()}`
    : '/cliente/notificaciones';
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
