import { describe, expect, it } from 'vitest';

import {
  carrierLoadPath,
  carrierNegotiationPath,
  carrierSharedPath,
  chatAttachmentHref,
  homeFor,
  paths,
  resolveRoute,
  safeNextPath,
  sharedPath,
  type Viewer,
} from './routing';

type SignedIn = NonNullable<Viewer>;

const admin: SignedIn = { role: 'admin', company: null };
const approvedShipper: SignedIn = { role: 'shipper', company: { status: 'approved' } };
const pendingShipper: SignedIn = { role: 'shipper', company: { status: 'pending_review' } };
const newShipper: SignedIn = { role: 'shipper', company: null };
const manager: SignedIn = { role: 'manager', company: { status: 'approved' } };
const coordinator: SignedIn = { role: 'coordinator', company: { status: 'approved' } };
const pendingManager: SignedIn = { role: 'manager', company: { status: 'pending_review' } };
const suspendedCoordinator: SignedIn = { role: 'coordinator', company: { status: 'suspended' } };
const newManager: SignedIn = { role: 'manager', company: null };
const operator: SignedIn = { role: 'operator', company: null };

describe('homeFor', () => {
  it.each([
    [admin, paths.admin],
    [approvedShipper, paths.shipper],
    [pendingShipper, paths.review],
    [{ role: 'shipper', company: { status: 'suspended' } } as SignedIn, paths.review],
    [newShipper, paths.completeCompany],
    [manager, paths.carrier],
    [coordinator, paths.carrier],
    [pendingManager, paths.review],
    [suspendedCoordinator, paths.review],
    [newManager, paths.completeCompany],
    [operator, paths.mobileOnly],
  ])('%o lands on %s', (viewer, home) => {
    expect(homeFor(viewer)).toBe(home);
  });
});

describe('resolveRoute', () => {
  it('sends visitors to the login, remembering where they were going', () => {
    expect(resolveRoute('/', null)).toBe('/login');
    expect(resolveRoute('/admin/empresas', null)).toBe('/login?next=%2Fadmin%2Fempresas');
    expect(resolveRoute('/cliente', null)).toBe('/login?next=%2Fcliente');
    expect(resolveRoute('/transportista/cargas', null)).toBe(
      '/login?next=%2Ftransportista%2Fcargas',
    );
    expect(resolveRoute('/restablecer', null)).toBe('/login?next=%2Frestablecer');
  });

  it('lets visitors open the auth screens and callbacks', () => {
    for (const path of [
      '/login',
      '/registro',
      '/recuperar',
      '/verificar-correo',
      '/auth/confirm',
    ]) {
      expect(resolveRoute(path, null)).toBeNull();
    }
  });

  it('opens the legal pages to everyone, signed in or not (B27)', () => {
    for (const viewer of [
      null,
      admin,
      approvedShipper,
      pendingShipper,
      manager,
      coordinator,
      operator,
    ]) {
      expect(resolveRoute('/aviso-de-privacidad', viewer)).toBeNull();
      expect(resolveRoute('/terminos', viewer)).toBeNull();
    }
    expect(resolveRoute('/terminos-falsos', null)).toBe('/login?next=%2Fterminos-falsos');
  });

  it('opens the public share links to everyone, signed in or not (G7)', () => {
    const token = 'Qm9vay1vZi1zaGFyZS10b2tlbnMtMzItYnl0ZXMtMDA';
    for (const viewer of [null, admin, approvedShipper, pendingShipper, manager, operator]) {
      expect(resolveRoute(`/compartido/${token}`, viewer)).toBeNull();
    }
    expect(resolveRoute('/compartido', null)).toBeNull();
    expect(resolveRoute('/compartidos', null)).toBe('/login?next=%2Fcompartidos');
  });

  it('opens the internal share links only to the carrier staff, remembering the link (G7)', () => {
    const path = '/transportista/compartido/Qm9vay1vZi1zaGFyZS10b2tlbnMtMzItYnl0ZXMtMDA';
    expect(resolveRoute(path, null)).toBe(`/login?next=${encodeURIComponent(path)}`);
    expect(resolveRoute(path, manager)).toBeNull();
    expect(resolveRoute(path, coordinator)).toBeNull();
    expect(resolveRoute(path, approvedShipper)).toBe(paths.shipper);
  });

  it('hands an operator who opens a team link on the web over to the app (G7)', () => {
    const token = 'Qm9vay1vZi1zaGFyZS10b2tlbnMtMzItYnl0ZXMtMDA';
    expect(resolveRoute(`/transportista/compartido/${token}`, operator)).toBe(
      `${paths.mobileOnly}?compartido=${token}`,
    );
    // The handoff page itself is the operator's home: no loop.
    expect(resolveRoute(paths.mobileOnly, operator)).toBeNull();
    expect(resolveRoute('/transportista/cargas', operator)).toBe(paths.mobileOnly);
  });

  it('sends signed-in users away from the guest screens', () => {
    expect(resolveRoute('/login', approvedShipper)).toBe(paths.shipper);
    expect(resolveRoute('/login', coordinator)).toBe(paths.carrier);
    expect(resolveRoute('/registro', admin)).toBe(paths.admin);
    expect(resolveRoute('/auth/confirm', admin)).toBeNull();
  });

  it('keeps everyone but admins out of /admin', () => {
    expect(resolveRoute('/admin', admin)).toBeNull();
    expect(resolveRoute('/admin/usuarios', admin)).toBeNull();
    for (const viewer of [
      approvedShipper,
      pendingShipper,
      newShipper,
      manager,
      coordinator,
      operator,
    ]) {
      expect(resolveRoute('/admin', viewer)).toBe(homeFor(viewer));
      expect(resolveRoute('/admin/usuarios', viewer)).not.toBeNull();
    }
  });

  it('does not treat look-alike paths as the admin area', () => {
    expect(resolveRoute('/administracion', approvedShipper)).toBeNull();
  });

  it('opens the shipper area only to approved shippers', () => {
    expect(resolveRoute('/cliente', approvedShipper)).toBeNull();
    expect(resolveRoute('/cliente/cargas', approvedShipper)).toBeNull();
    expect(resolveRoute('/cliente', pendingShipper)).toBe(paths.review);
    expect(resolveRoute('/cliente', newShipper)).toBe(paths.completeCompany);
    expect(resolveRoute('/cliente', admin)).toBe(paths.admin);
    expect(resolveRoute('/cliente', manager)).toBe(paths.carrier);
    expect(resolveRoute('/cliente', coordinator)).toBe(paths.carrier);
    expect(resolveRoute('/cliente/adjuntos?ruta=x', operator)).toBe(paths.mobileOnly);
  });

  it('opens the carrier area only to the staff of an approved carrier (G10a)', () => {
    for (const path of [
      '/transportista',
      '/transportista/cargas',
      '/transportista/negociaciones/abc',
      '/transportista/notificaciones',
    ]) {
      expect(resolveRoute(path, manager)).toBeNull();
      expect(resolveRoute(path, coordinator)).toBeNull();
    }
    expect(resolveRoute('/transportista', pendingManager)).toBe(paths.review);
    expect(resolveRoute('/transportista', suspendedCoordinator)).toBe(paths.review);
    expect(resolveRoute('/transportista', newManager)).toBe(paths.completeCompany);
    expect(resolveRoute('/transportista', approvedShipper)).toBe(paths.shipper);
    expect(resolveRoute('/transportista', admin)).toBe(paths.admin);
    expect(resolveRoute('/transportista/cargas', operator)).toBe(paths.mobileOnly);
    expect(resolveRoute('/transportistas', approvedShipper)).toBeNull();
  });

  it('shows the review and completion screens only when they apply', () => {
    expect(resolveRoute('/cuenta-en-revision', pendingShipper)).toBeNull();
    expect(resolveRoute('/cuenta-en-revision', pendingManager)).toBeNull();
    expect(resolveRoute('/cuenta-en-revision', approvedShipper)).toBe(paths.shipper);
    expect(resolveRoute('/cuenta-en-revision', manager)).toBe(paths.carrier);
    expect(resolveRoute('/completar-registro', newShipper)).toBeNull();
    expect(resolveRoute('/completar-registro', newManager)).toBeNull();
    expect(resolveRoute('/completar-registro', pendingShipper)).toBe(paths.review);
    expect(resolveRoute('/solo-app', operator)).toBeNull();
    expect(resolveRoute('/solo-app', admin)).toBe(paths.admin);
    // Carrier staff no longer live on the mobile-only screen (D06-E1).
    expect(resolveRoute('/solo-app', manager)).toBe(paths.carrier);
    expect(resolveRoute('/solo-app', coordinator)).toBe(paths.carrier);
  });

  it('routes the root to the home of each user', () => {
    expect(resolveRoute('/', admin)).toBe(paths.admin);
    expect(resolveRoute('/', pendingShipper)).toBe(paths.review);
    expect(resolveRoute('/', manager)).toBe(paths.carrier);
  });

  it('lets any signed-in user set a new password', () => {
    expect(resolveRoute('/restablecer', operator)).toBeNull();
    expect(resolveRoute('/restablecer', pendingShipper)).toBeNull();
  });
});

describe('path helpers', () => {
  it('builds the carrier web paths (G10a)', () => {
    expect(carrierLoadPath('abc')).toBe('/transportista/cargas/abc');
    expect(carrierNegotiationPath('abc')).toBe('/transportista/negociaciones/abc');
  });

  it('builds the share link paths (G7)', () => {
    expect(sharedPath('abc')).toBe('/compartido/abc');
    expect(carrierSharedPath('abc')).toBe('/transportista/compartido/abc');
    expect(sharedPath('a/b')).toBe('/compartido/a%2Fb');
  });

  it('points chat attachments at the viewer area', () => {
    expect(chatAttachmentHref('c/f.png')).toBe('/cliente/adjuntos?ruta=c%2Ff.png');
    expect(chatAttachmentHref('c/f.png', 'transportista')).toBe(
      '/transportista/adjuntos?ruta=c%2Ff.png',
    );
  });
});

describe('safeNextPath', () => {
  it('keeps same-origin paths with their query', () => {
    expect(safeNextPath('/cliente/cargas?estado=publicada')).toBe(
      '/cliente/cargas?estado=publicada',
    );
    expect(safeNextPath('/restablecer')).toBe('/restablecer');
  });

  it.each([
    null,
    undefined,
    '',
    'cliente',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/a/..//evil.example',
    '/cliente/..//evil.example?x=1',
    'javascript:alert(1)',
  ])('rejects %s', (next) => {
    expect(safeNextPath(next)).toBeNull();
  });
});
