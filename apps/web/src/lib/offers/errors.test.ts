import { offersCopy } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { offerErrorMessage } from './errors';
import { parseCounterForm } from './form';

const e = offersCopy.errors;

describe('offerErrorMessage', () => {
  it('maps the known RPC errors to Spanish', () => {
    expect(offerErrorMessage({ code: '42501', message: 'company is not approved' })).toBe(
      e.notApproved,
    );
    expect(offerErrorMessage({ code: '42501', message: 'offer not found' })).toBe(e.notFound);
    expect(
      offerErrorMessage({ code: '55000', message: 'offer is no longer pending (status rejected)' }),
    ).toBe(e.notPending);
    expect(
      offerErrorMessage({ code: '55000', message: 'load is no longer open (status contracted)' }),
    ).toBe(e.loadClosed);
    expect(offerErrorMessage({ code: '55000', message: 'pickup window already ended' })).toBe(
      e.pickupEnded,
    );
    expect(
      offerErrorMessage({ code: '55000', message: 'both companies must be approved to contract' }),
    ).toBe(e.bothApproved);
    expect(
      offerErrorMessage({ code: '22023', message: 'invalid offer: amount out of range' }),
    ).toBe(e.invalidAmount);
  });

  it('never shows database text', () => {
    expect(offerErrorMessage({ code: 'XX000', message: 'boom' })).toBe(e.generic);
    expect(
      offerErrorMessage({ code: '42501', message: 'offer cannot be answered by this side' }),
    ).toBe(e.generic);
    expect(offerErrorMessage(null)).toBe(e.generic);
  });
});

describe('parseCounterForm', () => {
  it('turns the typed pesos into cents', () => {
    expect(parseCounterForm({ amount: '$33,500.50', conditions: '  Pago a 15 días ' })).toEqual({
      success: true,
      data: { amountCents: 3_350_050, conditions: 'Pago a 15 días' },
    });
  });

  it('reports the amount on the field the form shows', () => {
    const result = parseCounterForm({ amount: 'mucho' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.state.fieldErrors?.amount).toBeTruthy();
      expect(result.state.fieldErrors?.amountCents).toBeUndefined();
      expect(result.state.values?.amount).toBe('mucho');
    }
  });

  it('requires an amount', () => {
    const result = parseCounterForm({});
    expect(result.success).toBe(false);
    if (!result.success) expect(result.state.fieldErrors?.amount).toBeTruthy();
  });
});
