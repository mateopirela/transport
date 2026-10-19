import { describe, expect, it } from 'vitest';

import { homeFor, paths, resolveRoute, safeNextPath, type Viewer } from './routing';

type SignedIn = NonNullable<Viewer>;

const admin: SignedIn = { role: 'admin', company: null };
const approvedShipper: SignedIn = { role: 'shipper', company: { status: 'approved' } };
const pendingShipper: SignedIn = { role: 'shipper', company: { status: 'pending_review' } };
const newShipper: SignedIn = { role: 'shipper', company: null };
const manager: SignedIn = { role: 'manager', company: { status: 'approved' } };
const coordinator: SignedIn = { role: 'coordinator', company: { status: 'approved' } };
const operator: SignedIn = { role: 'operator', company: null };

describe('homeFor', () => {
  it.each([
    [admin, paths.admin],
    [approvedShipper, paths.shipper],
    [pendingShipper, paths.review],
    [{ role: 'shipper', company: { status: 'suspended' } } as SignedIn, paths.review],
    [newShipper, paths.completeCompany],
    [manager, paths.mobileOnly],
    [coordinator, paths.mobileOnly],
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

  it('sends signed-in users away from the guest screens', () => {
    expect(resolveRoute('/login', approvedShipper)).toBe(paths.shipper);
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
    expect(resolveRoute('/cliente', manager)).toBe(paths.mobileOnly);
    expect(resolveRoute('/cliente', coordinator)).toBe(paths.mobileOnly);
  });

  it('shows the review and completion screens only when they apply', () => {
    expect(resolveRoute('/cuenta-en-revision', pendingShipper)).toBeNull();
    expect(resolveRoute('/cuenta-en-revision', approvedShipper)).toBe(paths.shipper);
    expect(resolveRoute('/completar-registro', newShipper)).toBeNull();
    expect(resolveRoute('/completar-registro', pendingShipper)).toBe(paths.review);
    expect(resolveRoute('/solo-app', operator)).toBeNull();
    expect(resolveRoute('/solo-app', admin)).toBe(paths.admin);
  });

  it('routes the root to the home of each user', () => {
    expect(resolveRoute('/', admin)).toBe(paths.admin);
    expect(resolveRoute('/', pendingShipper)).toBe(paths.review);
  });

  it('lets any signed-in user set a new password', () => {
    expect(resolveRoute('/restablecer', operator)).toBeNull();
    expect(resolveRoute('/restablecer', pendingShipper)).toBeNull();
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
