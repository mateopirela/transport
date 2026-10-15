import { describe, expect, it } from 'vitest';

import { MAX_PAGE, parsePage, withParams } from './pagination';

describe('parsePage', () => {
  it.each([
    [undefined, 1],
    ['', 1],
    ['abc', 1],
    ['0', 1],
    ['-3', 1],
    ['2', 2],
    [['3', '4'], 3],
    ['999999', MAX_PAGE],
  ] as const)('%o -> %i', (value, expected) => {
    expect(parsePage(value as string | string[] | undefined)).toBe(expected);
  });
});

describe('withParams', () => {
  it('replaces and drops parameters', () => {
    expect(withParams('/admin/verificacion', { pe: '2', pd: '3' }, { pd: 4 })).toBe(
      '/admin/verificacion?pe=2&pd=4',
    );
    expect(withParams('/admin/usuarios', { q: 'acme' }, { q: '', pagina: 1 })).toBe(
      '/admin/usuarios?pagina=1',
    );
    expect(withParams('/x', {}, {})).toBe('/x');
  });
});
