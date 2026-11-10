import { describe, expect, it } from 'vitest';

import { quickPayCopy } from '../copy/quick-pay';
import {
  DEFAULT_QUICK_PAY_FEE_BPS,
  freightAdminErrorText,
  isQuickPayBlocker,
  isValidExposureLimitCents,
  isValidQuickPayFeeBps,
  projectedExposure,
  quickPayErrorText,
  quickPaySplit,
  quickPayState,
} from './index';

// Same cases as 59_quick_pay.test.sql.
describe('quickPaySplit', () => {
  it('pays $9,457.50 of a $9,700 net at the default 2.5 % (D38 acceptance)', () => {
    expect(quickPaySplit(970_000, DEFAULT_QUICK_PAY_FEE_BPS)).toEqual({
      netCents: 970_000,
      feeBps: 250,
      feeCents: 24_250,
      quickNetCents: 945_750,
    });
  });

  it.each([
    // net, bps, fee: half a cent rounds up, less rounds down.
    [3_880_000, 250, 97_000],
    [1_002, 250, 25], // 25.05 → 25
    [1_010, 250, 25], // 25.25 → 25
    [1_020, 250, 26], // 25.50 → 26 (half up)
    [999_999, 375, 37_500], // 37,499.9625 → 37,500
    [1, 9999, 1],
    [0, 250, 0],
  ])('the fee of %i cents at %i bps is %i cents, and the parts add up', (net, bps, fee) => {
    const split = quickPaySplit(net, bps);
    expect(split.feeCents).toBe(fee);
    expect(split.feeCents + split.quickNetCents).toBe(net);
  });

  it('refuses amounts that are not integer cents', () => {
    expect(() => quickPaySplit(10.5, 250)).toThrow(RangeError);
    expect(() => quickPaySplit(-1, 250)).toThrow(RangeError);
  });
});

describe('settings', () => {
  it.each([
    [250, true],
    [300, true],
    [9999, true],
    [249, false],
    [0, false],
    [10_000, false],
    [262.5, false],
    ['250', false],
    [null, false],
  ])('fee %j is valid: %s', (value, valid) => {
    expect(isValidQuickPayFeeBps(value)).toBe(valid);
  });

  it.each([
    [null, true],
    [1, true],
    [50_000_000, true],
    [999_999_999_999_999, true],
    [1_000_000_000_000_000, false],
    [0, false],
    [-100, false],
    [100.5, false],
    ['100', false],
  ])('exposure limit %j is valid: %s', (value, valid) => {
    expect(isValidExposureLimitCents(value)).toBe(valid);
  });
});

describe('projectedExposure', () => {
  it('adds the quick net minus what the client already paid, never below zero', () => {
    expect(projectedExposure(1_000_000, 945_750, 0, null)).toEqual({
      exposureCents: 1_945_750,
      overLimit: false,
    });
    expect(projectedExposure(0, 945_750, 400_000, 1_000_000)).toEqual({
      exposureCents: 545_750,
      overLimit: false,
    });
    expect(projectedExposure(500, 945_750, 1_000_000, 1_000).exposureCents).toBe(500);
  });

  it('is over the limit only above it', () => {
    expect(projectedExposure(54_250, 945_750, 0, 1_000_000).overLimit).toBe(false);
    expect(projectedExposure(54_251, 945_750, 0, 1_000_000).overLimit).toBe(true);
  });
});

describe('quickPayState', () => {
  const none = {
    quick_pay_requested_at: null,
    quick_pay_approved_at: null,
    quick_pay_rejected_at: null,
    quick_pay_rejection_reason: null,
  };

  it('reads the request, the approval and the rejection', () => {
    expect(quickPayState(none)).toEqual({ kind: 'none' });
    expect(quickPayState({ ...none, quick_pay_requested_at: '2026-11-10T10:00:00Z' })).toEqual({
      kind: 'requested',
      at: '2026-11-10T10:00:00Z',
    });
    expect(
      quickPayState({
        ...none,
        quick_pay_requested_at: '2026-11-10T10:00:00Z',
        quick_pay_approved_at: '2026-11-10T12:00:00Z',
      }),
    ).toEqual({ kind: 'approved', at: '2026-11-10T12:00:00Z' });
    expect(
      quickPayState({
        ...none,
        quick_pay_rejected_at: '2026-11-10T12:00:00Z',
        quick_pay_rejection_reason: 'Falta la carta porte.',
      }),
    ).toEqual({ kind: 'rejected', at: '2026-11-10T12:00:00Z', reason: 'Falta la carta porte.' });
  });
});

describe('errors', () => {
  const e = quickPayCopy.errors;

  it('maps the quick pay RPC errors by code and detail', () => {
    expect(quickPayErrorText({ code: '42501' })).toBe(e.notAllowed);
    expect(quickPayErrorText({ code: '55000', details: 'fee_changed' })).toBe(e.feeChanged);
    expect(quickPayErrorText({ code: '55000', details: 'over_limit' })).toBe(e.overLimit);
    expect(quickPayErrorText({ code: '55000', details: 'not_requested' })).toBe(e.notRequested);
    expect(quickPayErrorText({ code: '55000', details: 'invoice_missing' })).toBe(e.notOpen);
    expect(quickPayErrorText({ code: '22023' })).toBe(e.reason);
    expect(quickPayErrorText({ code: 'XX000' })).toBe(e.generic);
  });

  it('tells the admin to decide a pending request before paying the carrier', () => {
    expect(
      freightAdminErrorText({
        code: '55000',
        message: 'a quick pay request is pending: approve or reject it first',
      }),
    ).toBe(e.pendingRequest);
  });

  it('knows every blocker code', () => {
    expect(isQuickPayBlocker('invoice_missing')).toBe(true);
    expect(isQuickPayBlocker('fee_changed')).toBe(false);
    expect(isQuickPayBlocker(null)).toBe(false);
  });
});
