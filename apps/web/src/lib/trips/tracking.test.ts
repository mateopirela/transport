import { TRIP_STATUSES } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { tripFileHref } from '../routing';
import { tripErrorMessage } from './errors';
import {
  mapState,
  NO_SIGNAL_AFTER_MS,
  parseTripFile,
  parseTripsView,
  PENDING_TRIP_REFRESH_MS,
  signalTime,
  TRIP_REFRESH_MS,
  tripRefreshMs,
} from './tracking';

const TRIP = '00000000-0000-4000-8000-000000000001';
const FILE = '00000000-0000-4000-8000-000000000002';
const NOW = new Date('2026-10-15T18:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe('parseTripsView', () => {
  it('defaults to the active trips', () => {
    expect(parseTripsView(undefined)).toBe('active');
    expect(parseTripsView('otro')).toBe('active');
    expect(parseTripsView(['historial', 'x'])).toBe('history');
  });
});

describe('mapState', () => {
  const started = ago(60 * 60_000);

  it('has no live map before departure or after unloading', () => {
    expect(mapState({ status: 'assigned', started_at: null }, null, NOW)).toEqual({
      kind: 'notStarted',
    });
    expect(mapState({ status: 'pending_assignment', started_at: null }, null, NOW).kind).toBe(
      'notStarted',
    );
    for (const status of ['delivered', 'closed', 'cancelled'] as const) {
      expect(mapState({ status, started_at: started }, ago(1000), NOW)).toEqual({
        kind: 'finished',
      });
    }
  });

  it('shows the last point while the signal is fresh', () => {
    const lastAt = ago(NO_SIGNAL_AFTER_MS - 1000);
    expect(mapState({ status: 'in_transit', started_at: started }, lastAt, NOW)).toEqual({
      kind: 'live',
      lastAt,
    });
  });

  it('reports no signal since the last point once it is too old', () => {
    const lastAt = ago(NO_SIGNAL_AFTER_MS + 1000);
    expect(mapState({ status: 'loading', started_at: started }, lastAt, NOW)).toEqual({
      kind: 'noSignal',
      since: lastAt,
    });
  });

  it('uses the departure time when no point arrived yet', () => {
    const justLeft = ago(60_000);
    expect(mapState({ status: 'en_route_to_pickup', started_at: justLeft }, null, NOW)).toEqual({
      kind: 'waiting',
    });
    expect(mapState({ status: 'en_route_to_pickup', started_at: started }, null, NOW)).toEqual({
      kind: 'noSignal',
      since: started,
    });
  });

  it('covers every status', () => {
    for (const status of TRIP_STATUSES) {
      expect(mapState({ status, started_at: started }, ago(1000), NOW).kind).toBeTruthy();
    }
  });
});

describe('tripRefreshMs', () => {
  it('polls while active and before departure, never once finished', () => {
    expect(tripRefreshMs({ kind: 'live', lastAt: NOW.toISOString() })).toBe(TRIP_REFRESH_MS);
    expect(tripRefreshMs({ kind: 'noSignal', since: NOW.toISOString() })).toBe(TRIP_REFRESH_MS);
    expect(tripRefreshMs({ kind: 'waiting' })).toBe(TRIP_REFRESH_MS);
    expect(tripRefreshMs({ kind: 'notStarted' })).toBe(PENDING_TRIP_REFRESH_MS);
    expect(tripRefreshMs({ kind: 'finished' })).toBeNull();
  });
});

describe('signalTime', () => {
  it('shows only HH:MM for a signal from today in Mexico City', () => {
    expect(signalTime('2026-10-15T17:05:00Z', NOW)).toBe('11:05');
  });

  it('adds the date for an older signal', () => {
    expect(signalTime('2026-10-13T17:05:00Z', NOW)).toMatch(/13 oct.*11:05/u);
  });
});

describe('parseTripFile', () => {
  it('accepts evidence photos and trip documents of a trip folder', () => {
    expect(parseTripFile('evidencia', `${TRIP}/delivery/${FILE}.jpg`)).toEqual({
      bucket: 'evidence',
      path: `${TRIP}/delivery/${FILE}.jpg`,
    });
    expect(parseTripFile('documentos', `${TRIP}/${FILE}.pdf`)).toEqual({
      bucket: 'trip-documents',
      path: `${TRIP}/${FILE}.pdf`,
    });
  });

  it('rejects other buckets, shapes and traversal', () => {
    expect(parseTripFile('chat', `${TRIP}/${FILE}.pdf`)).toBeNull();
    expect(parseTripFile('documentos', null)).toBeNull();
    expect(parseTripFile('documentos', `${TRIP}/delivery/${FILE}.jpg`)).toBeNull();
    expect(parseTripFile('evidencia', `${TRIP}/${FILE}.jpg`)).toBeNull();
    expect(parseTripFile('documentos', `../${FILE}/${FILE}.pdf`)).toBeNull();
    expect(parseTripFile('documentos', `${'-'.repeat(36)}/${FILE}.pdf`)).toBeNull();
  });

  it('round-trips the link built by tripFileHref', () => {
    const url = new URL(tripFileHref('documentos', `${TRIP}/${FILE}.pdf`), 'http://x');
    expect(
      parseTripFile(url.searchParams.get('tipo'), url.searchParams.get('ruta')),
    ).not.toBeNull();
  });
});

describe('tripErrorMessage', () => {
  it('maps the known RPC errors to Spanish copy', () => {
    expect(tripErrorMessage({ code: '42501', message: 'trip not found' })).toBe(
      'No encontramos este viaje.',
    );
    expect(
      tripErrorMessage({
        code: '55000',
        message: 'cannot confirm delivery of a trip in status closed',
      }),
    ).toMatch(/todavía no está entregado/u);
    expect(tripErrorMessage({ code: '55000', message: 'trip is cancelled' })).toBe(
      'El viaje está cancelado.',
    );
  });

  it('never shows database text', () => {
    expect(tripErrorMessage({ code: 'XX000', message: 'boom' })).toMatch(/Inténtalo de nuevo/u);
    expect(tripErrorMessage(null)).toMatch(/Inténtalo de nuevo/u);
  });
});
