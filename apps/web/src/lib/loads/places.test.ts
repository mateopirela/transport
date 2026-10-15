import { cityPreset, loadsCopy } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { loadErrorMessage } from './errors';
import { placeFromGoogle, placeFromPreset } from './places';
import { parseStatusFilter, shipperLoadActions } from './status';

const component = (longText: string, ...types: string[]) => ({ longText, types });

describe('placeFromGoogle', () => {
  const base = {
    id: 'ChIJ123',
    formattedAddress: 'Av. Vallarta 500, Guadalajara, Jal., México',
    lat: 20.67,
    lng: -103.36,
  };

  it('keeps address, point, city and state', () => {
    expect(
      placeFromGoogle({
        ...base,
        addressComponents: [
          component('Guadalajara', 'locality', 'political'),
          component('Jalisco', 'administrative_area_level_1', 'political'),
        ],
      }),
    ).toEqual({
      address: base.formattedAddress,
      city: 'Guadalajara',
      state: 'Jalisco',
      lat: '20.67',
      lng: '-103.36',
      placeId: 'ChIJ123',
    });
  });

  it('falls back to the municipality, and to the state for Mexico City', () => {
    const municipality = placeFromGoogle({
      ...base,
      addressComponents: [
        component('El Salto', 'administrative_area_level_2'),
        component('Jalisco', 'administrative_area_level_1'),
      ],
    });
    expect(municipality?.city).toBe('El Salto');
    const cdmx = placeFromGoogle({
      ...base,
      addressComponents: [component('Ciudad de México', 'administrative_area_level_1')],
    });
    expect(cdmx?.city).toBe('Ciudad de México');
  });

  it('rejects places without city, state or point', () => {
    expect(placeFromGoogle({ ...base, addressComponents: [] })).toBeNull();
    expect(
      placeFromGoogle({
        ...base,
        lat: null,
        addressComponents: [
          component('Guadalajara', 'locality'),
          component('Jalisco', 'administrative_area_level_1'),
        ],
      }),
    ).toBeNull();
  });
});

describe('placeFromPreset', () => {
  const mty = cityPreset('mty');
  it('composes the address from the street and the city', () => {
    if (!mty) throw new Error('missing preset');
    expect(placeFromPreset(mty, ' Av. Colón 10 ')).toMatchObject({
      address: 'Av. Colón 10, Monterrey, Nuevo León',
      city: 'Monterrey',
      lat: String(mty.lat),
      placeId: '',
    });
    expect(placeFromPreset(mty, '').address).toBe('Monterrey, Nuevo León');
  });
});

describe('shipperLoadActions', () => {
  it('follows the load state machine', () => {
    expect(shipperLoadActions('draft')).toEqual({ edit: true, publish: true, cancel: true });
    expect(shipperLoadActions('negotiating')).toEqual({ edit: true, publish: false, cancel: true });
    expect(shipperLoadActions('contracted')).toEqual({
      edit: false,
      publish: false,
      cancel: false,
    });
    expect(shipperLoadActions('cancelled')).toEqual({ edit: false, publish: false, cancel: false });
  });

  it('parses the status filter', () => {
    expect(parseStatusFilter('published')).toBe('published');
    expect(parseStatusFilter(['draft', 'x'])).toBe('draft');
    expect(parseStatusFilter('bogus')).toBeNull();
    expect(parseStatusFilter(undefined)).toBeNull();
  });
});

describe('loadErrorMessage', () => {
  const e = loadsCopy.errors;
  it('maps known RPC errors and hides the rest', () => {
    expect(loadErrorMessage({ code: '42501', message: 'company is not approved' })).toBe(
      e.notApproved,
    );
    expect(loadErrorMessage({ code: '42501', message: 'load not found' })).toBe(e.notFound);
    expect(loadErrorMessage({ code: '55000', message: 'cannot edit a load in status x' })).toBe(
      e.invalidStatus,
    );
    expect(loadErrorMessage({ code: '22023', message: 'pickup window already ended' })).toBe(
      e.pickupEnded,
    );
    expect(loadErrorMessage({ code: '22023', message: 'invalid load: x violated' })).toBe(
      e.invalid,
    );
    expect(loadErrorMessage({ code: 'XX000', message: 'secret internals' })).toBe(e.generic);
    expect(loadErrorMessage(null)).toBe(e.generic);
  });
});
