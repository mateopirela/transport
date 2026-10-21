// Route access rules for the web app (Cliente, Admin and, since G10a, the
// carrier's Gerente and Coordinador; D06-E1). Pure, so the proxy (optimistic
// redirects) and the layouts (authoritative checks) share one definition and
// it can be unit-tested. Data access itself is enforced by RLS in Postgres;
// this only decides which screens a user may open.
import {
  LEGAL_PATHS,
  SHARE_PATHS,
  type UserRole,
  type VerificationStatus,
} from '@transport/shared';

export const paths = {
  home: '/',
  signIn: '/login',
  signUp: '/registro',
  forgotPassword: '/recuperar',
  checkEmail: '/verificar-correo',
  resetPassword: '/restablecer',
  completeCompany: '/completar-registro',
  /** Invitation links (G1b, G2): /invitacion/<token>, open with or without a session. */
  invitation: '/invitacion',
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
  carrierTrips: '/transportista/viajes',
  carrierFleet: '/transportista/flota',
  carrierUnits: '/transportista/flota/unidades',
  newCarrierUnit: '/transportista/flota/unidades/nuevo',
  carrierOperators: '/transportista/flota/operadores',
  newCarrierOperator: '/transportista/flota/operadores/nuevo',
  inviteCarrierOperator: '/transportista/flota/operadores/invitar',
  carrierRoutes: '/transportista/rutas',
  carrierCompany: '/transportista/empresa',
  admin: '/admin',
  adminQueue: '/admin/verificacion',
  adminUsers: '/admin/usuarios',
  adminAudit: '/admin/auditoria',
  adminLoads: '/admin/cargas',
  adminTrips: '/admin/viajes',
  adminIncidents: '/admin/incidencias',
  adminRoads: '/admin/carreteras',
  mobileOnly: '/solo-app',
  privacy: LEGAL_PATHS.privacy,
  terms: LEGAL_PATHS.terms,
  /** Public share links (G7): a load or the tracking of a trip, read-only, no session. */
  shared: SHARE_PATHS.public,
  /** Internal share links (G7): a load shared with the carrier's team. */
  carrierShared: SHARE_PATHS.internal,
} as const;

/** The web page of an invitation link (G2). */
export const invitationPath = (token: string) => `${paths.invitation}/${token}`;

/** Shipper load detail and edit screens (B13). */
export const loadPath = (loadId: string) => `/cliente/cargas/${loadId}`;
export const editLoadPath = (loadId: string) => `/cliente/cargas/${loadId}/editar`;

/** Shipper negotiation (offer history and chat) of a load (B14). */
export const negotiationPath = (loadId: string, negotiationId: string) =>
  `/cliente/cargas/${loadId}/negociaciones/${negotiationId}`;

/** Shipper trip tracking (B15). */
export const tripPath = (tripId: string) => `/cliente/viajes/${tripId}`;

/** Signed-in areas that share screens (chat attachments, notifications inbox, trip files). */
export type WebArea = 'cliente' | 'transportista';

/** Redirect to a short-lived signed URL of a trip's evidence photo or document. */
export const tripFileHref = (
  kind: 'evidencia' | 'documentos',
  path: string,
  area: WebArea = 'cliente',
) => `/${area}/viajes/archivo?tipo=${kind}&ruta=${encodeURIComponent(path)}`;

/** Redirect to a short-lived signed URL of a chat attachment (`{conversation}/{file}`). */
export const chatAttachmentHref = (path: string, area: WebArea = 'cliente') =>
  `/${area}/adjuntos?ruta=${encodeURIComponent(path)}`;

/** Carrier web (G10a): a published or negotiated load, as the carrier staff sees it. */
export const carrierLoadPath = (loadId: string) => `/transportista/cargas/${loadId}`;

/** Carrier web (G10a): one negotiation of the company (offers and chat). */
export const carrierNegotiationPath = (negotiationId: string) =>
  `/transportista/negociaciones/${negotiationId}`;

/** Public view of a shared load or trip tracking (G7); no session. */
export const sharedPath = (token: string) => `${paths.shared}/${encodeURIComponent(token)}`;

/** A load shared with the carrier's team (G7); needs a session of that company. */
export const carrierSharedPath = (token: string) =>
  `${paths.carrierShared}/${encodeURIComponent(token)}`;

/** Carrier web (G10b): a won trip of the company (assignment, map, documents, chat). */
export const carrierTripPath = (tripId: string) => `/transportista/viajes/${tripId}`;

/** Carrier web (G10b): a unit (vehicle) of the fleet, with its documents and availability. */
export const carrierUnitPath = (vehicleId: string) => `/transportista/flota/unidades/${vehicleId}`;

/** Carrier web (G10b): an operator of the fleet, with its documents. */
export const carrierOperatorPath = (operatorId: string) =>
  `/transportista/flota/operadores/${operatorId}`;

/** Carrier web (G10b): redirect to a short-lived signed URL of a fleet document's file. */
export const carrierDocumentFilePath = (documentId: string) =>
  `/transportista/flota/documentos/${documentId}/archivo`;

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

/** Query parameter of /solo-app with the token of a team link (G7). */
export const MOBILE_ONLY_SHARE_PARAM = 'compartido';

/** Screens for signed-out visitors; a signed-in user is sent to their home. */
const GUEST_ONLY = [paths.signIn, paths.signUp, paths.forgotPassword, paths.checkEmail];

/**
 * Open to everyone: auth callbacks must work with or without a session, the
 * legal pages (B27) are linked from the stores and the mobile app, the
 * public share links (G7) are read by anyone who has the token, and an
 * invitation link (G2) is opened by a new person or by a signed-in
 * Coordinador who joins the company.
 */
const PUBLIC = ['/auth', paths.privacy, paths.terms, paths.shared, paths.invitation];

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
      // A Gerente without a company registers it with its fiscal data (G2);
      // a Coordinador joins a company through an invitation link (G1b), so
      // for them this is only a fallback that points to the link.
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
  // An operator who opens a team link (G7) on the web gets a way into the
  // app with the same token: /solo-app shows "Abrir en la app".
  if (viewer.role === 'operator' && pathname.startsWith(`${paths.carrierShared}/`)) {
    const token = pathname.slice(paths.carrierShared.length + 1);
    return `${paths.mobileOnly}?${MOBILE_ONLY_SHARE_PARAM}=${encodeURIComponent(token)}`;
  }
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
