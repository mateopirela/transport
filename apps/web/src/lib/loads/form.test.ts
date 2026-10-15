import { loadFormSchema, type Tables } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import {
  centsToPesosText,
  fieldForPath,
  loadToFormValues,
  parseLoadForm,
  placeFromValues,
  toLoadInput,
  toLocalInput,
} from './form';

const valid: Record<string, string> = {
  'origin.address': 'Av. Constitución 100, Monterrey, Nuevo León',
  'origin.city': 'Monterrey',
  'origin.state': 'Nuevo León',
  'origin.lat': '25.6866',
  'origin.lng': '-100.3161',
  'origin.placeId': 'ChIJ-origin',
  'destination.address': 'Av. Vallarta 500, Guadalajara, Jalisco',
  'destination.city': 'Guadalajara',
  'destination.state': 'Jalisco',
  'destination.lat': '20.6597',
  'destination.lng': '-103.3496',
  pickupStart: '2099-03-10T08:00',
  pickupEnd: '2099-03-10T14:00',
  deliveryStart: '2099-03-11T08:00',
  deliveryEnd: '2099-03-11T18:00',
  cargoType: 'palletized',
  description: 'Tarimas de refrescos',
  weightKg: '18,000',
  unitType: 'dry_van',
  price: '$32,500.50',
};

describe('parseLoadForm', () => {
  it('turns the form into the schema payload, in Mexico City time and cents', () => {
    const result = parseLoadForm(valid, ['tarp', 'liftgate']);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      origin: { city: 'Monterrey', state: 'Nuevo León', lat: 25.6866, placeId: 'ChIJ-origin' },
      destination: { city: 'Guadalajara', lat: 20.6597, lng: -103.3496 },
      pickupWindow: { start: '2099-03-10T08:00:00-06:00', end: '2099-03-10T14:00:00-06:00' },
      weightKg: 18000,
      proposedPriceCents: 3250050,
      specialRequirements: ['tarp', 'liftgate'],
    });
    expect(result.data.destination.placeId).toBeUndefined();
    expect(result.data.volumeM3).toBeUndefined();
  });

  it('reports errors on the fields the form shows', () => {
    const entries = { ...valid, price: '12.345', pickupEnd: '2099-03-10T07:00', weightKg: 'x' };
    delete (entries as Record<string, string | undefined>)['destination.address'];
    delete (entries as Record<string, string | undefined>)['destination.lat'];
    const result = parseLoadForm(entries, ['tarp']);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(Object.keys(result.state.fieldErrors ?? {}).sort()).toEqual(
      ['destination', 'pickupEnd', 'price', 'weightKg'].sort(),
    );
    // The form is refilled, including the checked requirements.
    expect(result.state.values?.specialRequirements).toBe('tarp');
    expect(result.state.values?.price).toBe('12.345');
  });

  it('rejects the same place as origin and destination', () => {
    const result = parseLoadForm(
      {
        ...valid,
        'destination.lat': valid['origin.lat'] ?? '',
        'destination.lng': valid['origin.lng'] ?? '',
      },
      [],
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.state.fieldErrors?.destination).toBeDefined();
  });

  it('leaves invalid date-times for the schema to reject', () => {
    const input = toLoadInput({ ...valid, pickupStart: '2099-02-30T08:00' }, []);
    expect(input.pickupWindow).toEqual({ start: undefined, end: '2099-03-10T14:00:00-06:00' });
  });
});

describe('fieldForPath', () => {
  it('maps schema paths to form fields', () => {
    expect(fieldForPath(['origin', 'lat'])).toBe('origin');
    expect(fieldForPath(['pickupWindow', 'start'])).toBe('pickupStart');
    expect(fieldForPath(['deliveryWindow', 'end'])).toBe('deliveryEnd');
    expect(fieldForPath(['deliveryWindow'])).toBe('deliveryStart');
    expect(fieldForPath(['proposedPriceCents'])).toBe('price');
    expect(fieldForPath(['specialRequirements', 1])).toBe('specialRequirements');
    expect(fieldForPath([])).toBe('');
  });
});

describe('edit values', () => {
  const row = {
    origin_address: 'Monterrey, Nuevo León',
    origin_city: 'Monterrey',
    origin_state: 'Nuevo León',
    origin_lat: 25.6866,
    origin_lng: -100.3161,
    origin_place_id: null,
    destination_address: 'Guadalajara, Jalisco',
    destination_city: 'Guadalajara',
    destination_state: 'Jalisco',
    destination_lat: 20.6597,
    destination_lng: -103.3496,
    destination_place_id: 'ChIJ-dest',
    pickup_window_start: '2099-03-10T14:00:00+00:00',
    pickup_window_end: '2099-03-10T20:00:00+00:00',
    delivery_window_start: '2099-03-11T14:00:00+00:00',
    delivery_window_end: '2099-03-12T00:30:00+00:00',
    cargo_type: 'general',
    description: 'Cajas',
    weight_kg: 1200.5,
    volume_m3: null,
    unit_type: 'torton',
    special_requirements: ['tarp'],
    proposed_price_cents: 1500000,
    notes: null,
  } as unknown as Tables<'loads'>;

  it('round-trips a stored load through the form', () => {
    const values = loadToFormValues(row);
    expect(values.pickupStart).toBe('2099-03-10T08:00');
    expect(values.deliveryEnd).toBe('2099-03-11T18:30');
    expect(values.price).toBe('15000');
    expect(values['destination.placeId']).toBe('ChIJ-dest');
    const result = parseLoadForm(values, (values.specialRequirements ?? '').split(','));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(loadFormSchema.parse(result.data).pickupWindow.start).toBe(
        '2099-03-10T08:00:00-06:00',
      );
      expect(result.data.proposedPriceCents).toBe(1500000);
    }
  });

  it('reads the places back for the map', () => {
    const values = loadToFormValues(row);
    expect(placeFromValues(values, 'origin')).toMatchObject({ city: 'Monterrey', lat: '25.6866' });
    expect(placeFromValues({}, 'destination')).toBeNull();
  });

  it('formats cents and local times for inputs', () => {
    expect(centsToPesosText(1250050)).toBe('12500.50');
    expect(centsToPesosText('99')).toBe('0.99');
    expect(toLocalInput('2026-10-15T05:59:00Z')).toBe('2026-10-14T23:59');
  });
});
