import { describe, expect, it } from 'vitest';

import { tripIdFromPath } from './trip-path';

const ID = '3f2a1b9c-0000-4000-8000-000000000001';

describe('tripIdFromPath', () => {
  it('reads the trip of a shipper or carrier trip page', () => {
    expect(tripIdFromPath(`/cliente/viajes/${ID}`)).toBe(ID);
    expect(tripIdFromPath(`/transportista/viajes/${ID}`)).toBe(ID);
    expect(tripIdFromPath(`/transportista/viajes/${ID}/chat`)).toBe(ID);
  });

  it('is null anywhere else', () => {
    expect(tripIdFromPath('/cliente/viajes')).toBeNull();
    expect(tripIdFromPath('/cliente/viajes/archivo')).toBeNull();
    expect(tripIdFromPath(`/admin/viajes/${ID}`)).toBeNull();
    expect(tripIdFromPath(`/cliente/cargas/${ID}`)).toBeNull();
    expect(tripIdFromPath(`/cliente/viajes/${ID}x`)).toBeNull();
    expect(tripIdFromPath(null)).toBeNull();
  });
});
