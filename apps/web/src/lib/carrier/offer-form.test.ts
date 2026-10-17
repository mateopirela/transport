import { validationMessages } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { parseCarrierOfferForm } from './offer-form';

const UNIT = '00000000-0000-4000-8000-000000000001';
const BUSINESS_UNIT = '00000000-0000-4000-8000-000000000002';

describe('parseCarrierOfferForm', () => {
  it('parses pesos as typed, with the optional unit and business unit', () => {
    const parsed = parseCarrierOfferForm({
      amount: '38,500.50',
      conditions: '  Caja a 4 °C  ',
      vehicleId: UNIT,
      businessUnitId: BUSINESS_UNIT,
    });
    expect(parsed).toEqual({
      success: true,
      data: {
        amountCents: 3_850_050,
        conditions: 'Caja a 4 °C',
        vehicleId: UNIT,
        businessUnitId: BUSINESS_UNIT,
      },
    });
  });

  it('treats empty selects as missing', () => {
    const parsed = parseCarrierOfferForm({ amount: '40000', vehicleId: '', businessUnitId: '' });
    expect(parsed.success && parsed.data).toEqual({ amountCents: 4_000_000 });
  });

  it('reports the amount under the input name and keeps the typed values', () => {
    const missing = parseCarrierOfferForm({ conditions: 'x' });
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.state.fieldErrors?.amount).toBeDefined();
      expect(missing.state.fieldErrors?.amountCents).toBeUndefined();
      expect(missing.state.values).toEqual({ conditions: 'x' });
    }
    const invalid = parseCarrierOfferForm({ amount: 'mil pesos' });
    expect(!invalid.success && invalid.state.fieldErrors?.amount).toBe(validationMessages.amount);
  });

  it('rejects a malformed unit or business unit id', () => {
    const unit = parseCarrierOfferForm({ amount: '40000', vehicleId: '../x' });
    expect(!unit.success && unit.state.fieldErrors?.vehicleId).toBeDefined();
    const businessUnit = parseCarrierOfferForm({ amount: '40000', businessUnitId: 'all' });
    expect(!businessUnit.success && businessUnit.state.fieldErrors?.businessUnitId).toBe(
      validationMessages.invalidOption,
    );
  });
});
