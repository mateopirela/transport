import { carrierTripsCopy, mobileErrorCopy } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { carrierTripErrorMessage } from './carrier-trip-errors';

const e = carrierTripsCopy.errors;

describe('carrierTripErrorMessage', () => {
  it('maps the assign_trip and trip document errors to Spanish', () => {
    const cases: [string, string][] = [
      ['trip not found', e.notFound],
      ['cannot assign a trip in status en_route_to_pickup', e.notAssignable],
      ['company is not approved', e.notApproved],
      ['operator not found or without account', e.operatorUnavailable],
      ['vehicle not found', e.unitUnavailable],
      ['vehicle has expired documents', e.unitExpired],
      ['trip is cancelled', e.tripCancelled],
      ['invalid storage path', e.invalidFile],
      ['file was not uploaded', e.invalidFile],
      ['mime type application/zip is not supported', e.invalidFile],
    ];
    for (const [message, text] of cases) expect(carrierTripErrorMessage({ message })).toBe(text);
  });

  it('never shows raw server text', () => {
    expect(carrierTripErrorMessage({ message: 'relation "x" does not exist' })).toBe(e.generic);
    expect(carrierTripErrorMessage(null)).toBe(e.generic);
  });

  it('keeps the generic network message', () => {
    expect(carrierTripErrorMessage({ message: 'Network request failed' })).toBe(
      mobileErrorCopy.network,
    );
  });
});
