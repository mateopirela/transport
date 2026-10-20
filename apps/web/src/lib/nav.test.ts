import { describe, expect, it } from 'vitest';

import { activeNavHref, initialsOf, type NavItem } from './nav';

describe('initialsOf', () => {
  it('takes the first letters of the first two words', () => {
    expect(initialsOf('ana maría López')).toBe('AM');
    expect(initialsOf('  Óscar  ')).toBe('Ó');
    expect(initialsOf('Transportes del Norte SA')).toBe('TD');
  });

  it('is empty without a name', () => {
    expect(initialsOf(null)).toBe('');
    expect(initialsOf('   ')).toBe('');
  });
});

const shipper: NavItem[] = [
  { href: '/cliente' },
  { href: '/cliente/cargas' },
  { href: '/cliente/cargas/nueva' },
  { href: '/cliente/viajes' },
  { href: '/cliente/notificaciones' },
];

const carrier: NavItem[] = [
  { href: '/transportista' },
  { href: '/transportista/cargas' },
  { href: '/transportista/flota/unidades', match: '/transportista/flota' },
];

describe('activeNavHref', () => {
  it('chooses the home only on its own page', () => {
    expect(activeNavHref('/cliente', shipper)).toBe('/cliente');
    expect(activeNavHref('/transportista/rutas', carrier)).toBeNull();
  });

  it('chooses the section a detail page lives under', () => {
    expect(activeNavHref('/cliente/cargas/123', shipper)).toBe('/cliente/cargas');
    expect(activeNavHref('/cliente/viajes/9', shipper)).toBe('/cliente/viajes');
  });

  it('prefers the longest section', () => {
    expect(activeNavHref('/cliente/cargas/nueva', shipper)).toBe('/cliente/cargas/nueva');
  });

  it('uses `match` for a section wider than its link', () => {
    expect(activeNavHref('/transportista/flota/operadores/1', carrier)).toBe(
      '/transportista/flota/unidades',
    );
  });

  it('does not confuse a prefix of a word with a section', () => {
    expect(activeNavHref('/cliente/cargasx', shipper)).toBeNull();
  });

  it('chooses a lone section anywhere under it', () => {
    expect(activeNavHref('/admin/x', [{ href: '/admin' }])).toBe('/admin');
  });
});
