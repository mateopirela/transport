import { adminOpsCopy } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { adminOpsErrorMessage } from './errors';

const e = adminOpsCopy.errors;

describe('adminOpsErrorMessage', () => {
  it.each([
    ['42501', 'only admins can offer on behalf of a carrier', e.notAdmin],
    ['55000', 'company is not approved', e.notApproved],
    ['55000', 'both companies must be approved to contract', e.bothApproved],
    ['55000', 'negotiation already has a pending offer', e.pendingExists],
    ['55000', 'cannot offer on a load in status contracted', e.loadClosed],
    ['55000', 'load is no longer open (status cancelled)', e.loadClosed],
    ['55000', 'pickup window already ended', e.pickupEnded],
    ['55000', 'offer is no longer pending (status accepted)', e.notPending],
    ['55000', 'incident is already resolved', e.incidentResolved],
    ['22023', 'carrier not found', e.carrierNotFound],
    ['22023', 'invalid offer: amount out of range', e.invalidAmount],
  ])('maps %s "%s"', (code, message, expected) => {
    expect(adminOpsErrorMessage({ code, message })).toBe(expected);
  });

  it('never shows unknown database text', () => {
    expect(adminOpsErrorMessage({ code: '23505', message: 'duplicate key value' })).toBe(e.generic);
    expect(adminOpsErrorMessage({ code: '55000', message: 'something else' })).toBe(e.generic);
    expect(adminOpsErrorMessage(null)).toBe(e.generic);
  });
});
