import { describe, expect, it } from 'vitest';

import { carrierOfferErrorText } from './carrier-loads';
import { carrierTripErrorText } from './carrier-trips';
import { fleetErrorCopy } from './copy/fleet';
import { notificationEmail, notificationWebPath } from './copy/notification-email';
import { notificationContent } from './copy/notifications';
import { validationMessages as m } from './copy/validation';
import { tripCancellationReasonLabels, vehicleReleaseCopy } from './copy/vehicle-release';
import { TRIP_CANCELLATION_REASONS } from './enums';
import { fleetErrorText } from './fleet';
import {
  cancellationText,
  cancelLeavesUnitPending,
  nearestCityPreset,
  releaseErrorText,
  releaseFormSchema,
} from './vehicle-release';

const TASK = '11111111-1111-4111-8111-111111111111';
const VEHICLE = '22222222-2222-4222-8222-222222222222';
const TRIP = '33333333-3333-4333-8333-333333333333';

describe('cancellation reasons (G5)', () => {
  it('has a label for every reason of the database', () => {
    for (const reason of TRIP_CANCELLATION_REASONS) {
      expect(tripCancellationReasonLabels[reason]).toMatch(/\S/u);
    }
  });

  it('reads the reason with its notes, the notes alone for "other"', () => {
    expect(cancellationText('mechanical_failure', null)).toBe('Falla mecánica');
    expect(cancellationText('accident', ' Choque leve ')).toBe('Accidente. Choque leve');
    expect(cancellationText('other', 'Se pospuso')).toBe('Se pospuso');
    // Trips cancelled before G5 have only notes.
    expect(cancellationText(null, 'Texto libre')).toBe('Texto libre');
    expect(cancellationText(null, null)).toBeNull();
  });

  it('knows when cancelling leaves the unit pending release', () => {
    expect(cancelLeavesUnitPending('assigned', true)).toBe(false);
    expect(cancelLeavesUnitPending('pending_assignment', false)).toBe(false);
    expect(cancelLeavesUnitPending('en_route_to_pickup', true)).toBe(true);
    expect(cancelLeavesUnitPending('at_pickup', true)).toBe(true);
    expect(cancelLeavesUnitPending('at_pickup', false)).toBe(false);
  });
});

describe('nearestCityPreset', () => {
  it('names a point by the nearest preset city', () => {
    expect(nearestCityPreset({ lat: 25.79, lng: -100.18 }).city).toBe('Apodaca');
    expect(nearestCityPreset({ lat: 20.66, lng: -103.35 }).city).toBe('Guadalajara');
  });
});

describe('releaseFormSchema', () => {
  const when = { date: '2026-10-18', time: '09:30' };

  it('releases at the last known point, named by the nearest city', () => {
    expect(
      releaseFormSchema.parse({
        place: 'last',
        latitude: '25.7817',
        longitude: '-100.1886',
        ...when,
      }),
    ).toEqual({
      availableFrom: '2026-10-18T09:30:00-06:00',
      latitude: 25.7817,
      longitude: -100.1886,
      city: 'Apodaca',
      state: 'Nuevo León',
      notes: null,
    });
  });

  it('releases in a preset city, with its coordinates and the notes', () => {
    expect(
      releaseFormSchema.parse({ place: 'city', cityId: 'gdl', notes: ' En el patio ', ...when }),
    ).toMatchObject({
      city: 'Guadalajara',
      state: 'Jalisco',
      latitude: 20.6597,
      notes: 'En el patio',
    });
  });

  it('accepts numbers from the app and a point picked on the map', () => {
    expect(
      releaseFormSchema.parse({ place: 'map', latitude: 25.43, longitude: -100.97, ...when }),
    ).toMatchObject({ city: 'Saltillo', latitude: 25.43, longitude: -100.97 });
  });

  it('refuses a missing place, an unknown city or a bad moment', () => {
    expect(
      releaseFormSchema.safeParse({ place: 'last', latitude: '', ...when }).error?.issues[0],
    ).toMatchObject({
      message: vehicleReleaseCopy.errors.invalidPlace,
      path: ['place'],
    });
    expect(
      releaseFormSchema.safeParse({ place: 'map', latitude: 125, longitude: -100, ...when })
        .success,
    ).toBe(false);
    expect(
      releaseFormSchema.safeParse({ place: 'city', cityId: 'paris', ...when }).error?.issues[0],
    ).toMatchObject({
      message: m.invalidOption,
      path: ['cityId'],
    });
    expect(
      releaseFormSchema.safeParse({
        place: 'city',
        cityId: 'mty',
        date: '2026-02-30',
        time: '10:00',
      }).error?.issues[0]?.message,
    ).toBe(m.dateTime);
    expect(
      releaseFormSchema.safeParse({
        place: 'city',
        cityId: 'mty',
        ...when,
        notes: 'x'.repeat(1001),
      }).success,
    ).toBe(false);
  });
});

describe('errors of a unit pending release', () => {
  it('maps the release RPC errors, and only those', () => {
    expect(releaseErrorText('release task not found')).toBe(vehicleReleaseCopy.errors.notFound);
    expect(releaseErrorText('release task is not pending')).toBe(
      vehicleReleaseCopy.errors.alreadyReleased,
    );
    expect(releaseErrorText('vehicle has expired documents: vehicle_permit')).toBe(
      fleetErrorCopy.expiredDocuments,
    );
    expect(releaseErrorText('city and state are required')).toBe(
      vehicleReleaseCopy.errors.invalidPlace,
    );
    expect(releaseErrorText('something else')).toBeNull();
  });

  it('says "release it first" for availability, assignment and offers', () => {
    const text = vehicleReleaseCopy.errors.pendingRelease;
    expect(fleetErrorText('vehicle is pending release')).toBe(text);
    expect(carrierTripErrorText('vehicle is pending release')).toBe(text);
    expect(carrierOfferErrorText('vehicle is pending release')).toBe(text);
  });
});

describe('release notifications', () => {
  const data = {
    taskId: TASK,
    vehicleId: VEHICLE,
    tripId: TRIP,
    vehicleLabel: 'RB-01',
    originCity: 'Apodaca',
    destinationCity: 'Guadalajara',
    city: 'Apodaca',
  };

  it('asks the staff to release the unit, and says where it was released', () => {
    expect(notificationContent('vehicle_release_pending', data)).toEqual({
      title: 'Unidad pendiente de liberar',
      body: 'Se canceló el viaje Apodaca → Guadalajara después de salir. Confirma dónde está RB-01 para liberarla.',
    });
    expect(notificationContent('vehicle_released', data).body).toBe(
      'RB-01 ya está disponible en Apodaca y vuelve a recibir recomendaciones.',
    );
    expect(notificationContent('vehicle_released', {}).body).toBe(
      'La unidad ya está disponible y vuelve a recibir recomendaciones.',
    );
  });

  it('links the carrier staff to the unit, not to the trip', () => {
    expect(notificationWebPath('coordinator', data)).toBe(
      `/transportista/flota/unidades/${VEHICLE}`,
    );
    expect(notificationWebPath('manager', data)).toBe(`/transportista/flota/unidades/${VEHICLE}`);
    expect(
      notificationEmail('vehicle_release_pending', data, { role: 'manager' }).subject,
    ).toContain('Unidad pendiente de liberar');
  });
});
