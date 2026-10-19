// Route access rules for the web app (Cliente, Admin and, since G10a, the
// carrier's Gerente and Coordinador; D06-E1). Pure, so the proxy (optimistic
// redirects) and the layouts (authoritative checks) share one definition and
// it can be unit-tested. Data access itself is enforced by RLS in Postgres;
// this only decides which screens a user may open.
import { LEGAL_PATHS, type UserRole, type VerificationStatus } from '@transport/shared';

export const paths = {
  home: '/',
  signIn: '/login',
  signUp: '/registro',
  forgotPassword: '/recuperar',
  checkEmail: '/verificar-correo',
  resetPassword: '/restablecer',
  completeCompany: '/completar-registro',
  review: '/cuenta-en-revision',
  shipper: '/cliente',
  shipperLoads: '/cliente/cargas',
  newLoad: '/cliente/cargas/nueva',
  shipperNotifications: '/cliente/notificaciones',
  shipperTrips: '/cliente/viajes',
  carrier: '/transportista',
  carrierLoads: '/transportista/cargas',
  carrierNegotiations: '/transportista/negociaciones',
  carrierNotifications: '/transportista/notificaciones',
  admin: '/admin',
  adminQueue: '/admin/verificacion',
  adminUsers: '/admin/usuarios',
  adminAudit: '/admin/auditoria',
  adminLoads: '/admin/cargas',
  adminTrips: '/admin/viajes',
  adminIncidents: '/admin/incidencias',
  mobileOnly: '/solo-app',
  privacy: LEGAL_PATHS.privacy,
  terms: LEGAL_PATHS.terms,
} as const;

/** Shipper load detail and edit screens (B13). */
export const loadPath = (loadId: string) => `/cliente/cargas/${loadId}`;
export const editLoadPath = (loadId: string) => `/cliente/cargas/${loadId}/editar`;

/** Shipper negotiation (offer history and chat) of a load (B14). */
export const negotiationPath = (loadId: string, negotiationId: string) =>
  `/cliente/cargas/${loadId}/negociaciones/${negotiationId}`;

/** Shipper trip tracking (B15). */
export const tripPath = (tripId: string) => `/cliente/viajes/${tripId}`;

/** Redirect to a short-lived signed URL of a trip's evidence photo or document. */
export const tripFileHref = (kind: 'evidencia' | 'documentos', path: string) =>
  `/cliente/viajes/archivo?tipo=${kind}&ruta=${encodeURIComponent(path)}`;

/** Signed-in areas that share screens (chat attachments, notifications inbox). */
export type WebArea = 'cliente' | 'transportista';

/** Redirect to a short-lived signed URL of a chat attachment (`{conversation}/{file}`). */
export const chatAttachmentHref = (path: string, area: WebArea = 'cliente') =>
  `/${area}/adjuntos?ruta=${encodeURIComponent(path)}`;

/** Carrier web (G10a): a published or negotiated load, as the carrier staff sees it. */
export const carrierLoadPath = (loadId: string) => `/transportista/cargas/${loadId}`;

/** Carrier web (G10a): one negotiation of the company (offers and chat). */
export const carrierNegotiationPath = (negotiationId: string) =>
  `/transportista/negociaciones/${negotiationId}`;

/** Admin company detail (verification of its documents, fleet and status). */
export const adminCompanyPath = (companyId: string) => `/admin/empresas/${companyId}`;

/** Admin load supervision and manual contracting (B16). */
export const adminLoadPath = (loadId: string) => `/admin/cargas/${loadId}`;

/** Admin-only redirect to a short-lived signed URL of a document's file. */
export const adminDocumentFilePath = (documentId: string) =>
  `/admin/documentos/${documentId}/archivo`;

/** The signed-in user as far as routing is concerned; `null` when signed out. */
export type Viewer = {
  role: UserRole;
  company: { status: VerificationStatus } | null;
} | null;

/** Screens for signed-out visitors; a signed-in user is sent to their home. */
const GUEST_ONLY = [paths.signIn, paths.signUp, paths.forgotPassword, paths.checkEmail];

/**
 * Open to everyone: auth callbacks must work with or without a session, and
 * the legal pages (B27) are linked from the stores and the mobile app.
 */
const PUBLIC = ['/auth', paths.privacy, paths.terms];

/** Areas that only one kind of user may open: their home. */
const HOME_ONLY = [
  paths.shipper,
  paths.carrier,
  paths.review,
  paths.completeCompany,
  paths.mobileOnly,
] as const;

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Where a signed-in user lands. */
export function homeFor(viewer: NonNullable<Viewer>): string {
  switch (viewer.role) {
    case 'admin':
      return paths.admin;
    case 'shipper':
      if (!viewer.company) return paths.completeCompany;
      return viewer.company.status === 'approved' ? paths.shipper : paths.review;
    case 'manager':
    case 'coordinator':
      // The Gerente and the Coordinador work on the web too (D06-E1, G10a).
      // A Gerente without a company fills the current company form (G2
      // replaces it with the fiscal data); a Coordinador joins a company
      // through an invitation (G1b), so this is only a fallback for them.
      if (!viewer.company) return paths.completeCompany;
      return viewer.company.status === 'approved' ? paths.carrier : paths.review;
    case 'operator':
      // Operators only use the mobile app (D06).
      return paths.mobileOnly;
  }
}

/**
 * Decides whether `viewer` may open `pathname`. Returns `null` to allow it or
 * the path to redirect to.
 */
export function resolveRoute(pathname: string, viewer: Viewer): string | null {
  if (PUBLIC.some((base) => isUnder(pathname, base))) return null;

  if (GUEST_ONLY.some((base) => isUnder(pathname, base))) {
    return viewer ? homeFor(viewer) : null;
  }

  if (!viewer) {
    const next = pathname === paths.home ? '' : `?next=${encodeURIComponent(pathname)}`;
    return `${paths.signIn}${next}`;
  }

  const home = homeFor(viewer);
  if (pathname === paths.home) return home;
  if (isUnder(pathname, paths.admin)) return viewer.role === 'admin' ? null : home;
  for (const base of HOME_ONLY) {
    if (isUnder(pathname, base)) return home === base ? null : home;
  }
  // Anything else (e.g. /restablecer, unknown pages that render a 404).
  return null;
}

/**
 * Sanitizes a post-login `next` parameter: only same-origin relative paths
 * are accepted, so it cannot be used as an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next?.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
  const base = 'http://localhost';
  const url = new URL(next, base);
  // Normalization can turn `/a/..//evil.example` into a protocol-relative path.
  if (url.origin !== base || url.pathname.startsWith('//')) return null;
  return `${url.pathname}${url.search}`;
}
