import { formatBasisPoints, formatMoney } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { bpsText, formAmount, formText } from './confirm-text';

function form(entries: Record<string, string | Blob>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

describe('formText', () => {
  it('reads a field trimmed', () => {
    expect(formText(form({ reason: '  sin CFDI  ' }), 'reason')).toBe('sin CFDI');
  });

  it('is empty for a missing field or a file', () => {
    expect(formText(form({}), 'reason')).toBe('');
    expect(formText(form({ file: new Blob(['x']) }), 'file')).toBe('');
  });
});

describe('formAmount', () => {
  it('writes a valid amount as money, without cents when whole', () => {
    expect(formAmount(form({ amount: '38000' }), 'amount')).toBe(formatMoney(3_800_000));
    expect(formAmount(form({ amount: '9,700.50' }), 'amount')).toBe(formatMoney(970_050));
  });

  it('is null for a missing, empty or invalid amount', () => {
    expect(formAmount(form({}), 'amount')).toBeNull();
    expect(formAmount(form({ amount: '' }), 'amount')).toBeNull();
    expect(formAmount(form({ amount: 'mil' }), 'amount')).toBeNull();
    expect(formAmount(form({ amount: '-5' }), 'amount')).toBeNull();
  });
});

describe('bpsText', () => {
  it('writes whole basis points as a percentage', () => {
    expect(bpsText('300')).toBe(formatBasisPoints(300));
    expect(bpsText('0')).toBe(formatBasisPoints(0));
  });

  it('keeps what was typed when it is not a whole number', () => {
    expect(bpsText('')).toBe('');
    expect(bpsText('3.5')).toBe('3.5');
    expect(bpsText('tres')).toBe('tres');
  });
});
