import { describe, expect, it } from 'vitest';

import { fold, matchesQuery } from './fold';

describe('fold', () => {
  it('drops accents and case', () => {
    expect(fold('Querétaro')).toBe('queretaro');
    expect(fold('MÉXICO')).toBe('mexico');
  });

  it('reads the ñ as an n', () => {
    expect(fold('Peñón')).toBe('penon');
  });
});

describe('matchesQuery', () => {
  it('finds a name typed without accents', () => {
    expect(matchesQuery('San Luis Potosí', 'potosi')).toBe(true);
    expect(matchesQuery('Nuevo León', ' LEON ')).toBe(true);
  });

  it('matches everything on an empty query', () => {
    expect(matchesQuery('Jalisco', '  ')).toBe(true);
  });

  it('does not match what is not there', () => {
    expect(matchesQuery('Jalisco', 'sonora')).toBe(false);
  });
});
