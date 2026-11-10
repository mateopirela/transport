import { describe, expect, it } from 'vitest';

import {
  annualPolicyCoversTrip,
  cargoInsuranceReferenceInstant,
  cargoInsuranceState,
  coveringAnnualPolicy,
  type AnnualPolicyDocument,
  type InsuredTripDates,
} from './cargo-insurance';
import { TERMS_VERSION } from './copy/legal';

const NOW = new Date('2026-11-10T12:00:00Z');
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

const policy = (expiresInDays: number, extra: Partial<AnnualPolicyDocument> = {}) => ({
  status: 'approved' as const,
  expiresAt: day(expiresInDays),
  archivedAt: null,
  ...extra,
});

// A trip whose pickup opens in 3 days and has not left.
const upcoming: InsuredTripDates = { pickupWindowStart: day(3), startedAt: null };

describe('cargoInsuranceReferenceInstant', () => {
  it('is the opening of the pickup while it is ahead', () => {
    expect(cargoInsuranceReferenceInstant(upcoming, NOW).toISOString()).toBe(day(3));
  });

  it('is now once the pickup window opened and the trip has not left', () => {
    expect(
      cargoInsuranceReferenceInstant({ pickupWindowStart: day(-1), startedAt: null }, NOW),
    ).toEqual(NOW);
  });

  it('is the pickup for a trip that left early to it', () => {
    expect(
      cargoInsuranceReferenceInstant({ pickupWindowStart: day(1), startedAt: day(-1) }, NOW),
    ).toEqual(new Date(day(1)));
  });

  it('is the departure once the trip left', () => {
    expect(
      cargoInsuranceReferenceInstant({ pickupWindowStart: day(-5), startedAt: day(-4) }, NOW),
    ).toEqual(new Date(day(-4)));
  });
});

describe('annualPolicyCoversTrip (mirror of annual_cargo_policy)', () => {
  it('covers a trip whose pickup falls within the policy', () => {
    expect(annualPolicyCoversTrip(policy(30), upcoming, NOW)).toBe(true);
  });

  it('does not cover a pickup after the policy expires, though it is valid today', () => {
    expect(annualPolicyCoversTrip(policy(2), upcoming, NOW)).toBe(false);
  });

  it('does not cover with an expired policy', () => {
    expect(annualPolicyCoversTrip(policy(-1, { status: 'expired' }), upcoming, NOW)).toBe(false);
    // Approved but past its date (the daily job has not marked it yet).
    expect(
      annualPolicyCoversTrip(policy(-1), { pickupWindowStart: day(-2), startedAt: null }, NOW),
    ).toBe(false);
  });

  it('keeps covering a trip that left while the policy was valid', () => {
    const left = { pickupWindowStart: day(-10), startedAt: day(-9) };
    expect(annualPolicyCoversTrip(policy(-5, { status: 'expired' }), left, NOW)).toBe(true);
  });

  it('needs an approved, current document with an expiry date', () => {
    for (const status of ['pending_review', 'rejected', 'suspended'] as const) {
      expect(annualPolicyCoversTrip(policy(30, { status }), upcoming, NOW)).toBe(false);
    }
    expect(annualPolicyCoversTrip(policy(30, { archivedAt: day(-1) }), upcoming, NOW)).toBe(false);
    expect(annualPolicyCoversTrip(policy(30, { expiresAt: null }), upcoming, NOW)).toBe(false);
  });

  it('expires exactly at the reference instant: not covered', () => {
    expect(annualPolicyCoversTrip({ ...policy(0), expiresAt: day(3) }, upcoming, NOW)).toBe(false);
  });
});

describe('coveringAnnualPolicy', () => {
  it('picks the covering policy that expires last', () => {
    const policies = [policy(40), policy(2), policy(200), policy(400, { status: 'rejected' })];
    expect(coveringAnnualPolicy(policies, upcoming, NOW)).toBe(policies[2]);
  });

  it('is null without a covering policy', () => {
    expect(coveringAnnualPolicy([policy(1)], upcoming, NOW)).toBeNull();
    expect(coveringAnnualPolicy([], upcoming, NOW)).toBeNull();
  });
});

describe('cargoInsuranceState', () => {
  const row = {
    required: true,
    blocks_departure: true,
    trip_policy_at: null,
    annual_policy_expires_at: null,
    annual_policy_approved_at: null,
  };

  it('is missing, and says whether it blocks the departure', () => {
    expect(cargoInsuranceState(row)).toEqual({ kind: 'missing', blocksDeparture: true });
    expect(cargoInsuranceState({ ...row, blocks_departure: false })).toEqual({
      kind: 'missing',
      blocksDeparture: false,
    });
  });

  it('prefers the policy of the trip, then the annual one', () => {
    expect(
      cargoInsuranceState({ ...row, trip_policy_at: day(-1), annual_policy_expires_at: day(90) }),
    ).toEqual({ kind: 'trip_policy', uploadedAt: day(-1) });
    expect(cargoInsuranceState({ ...row, annual_policy_expires_at: day(90) })).toEqual({
      kind: 'annual_policy',
      expiresAt: day(90),
    });
  });

  it('is not required when the admin switches it off', () => {
    expect(cargoInsuranceState({ ...row, required: false, blocks_departure: false })).toEqual({
      kind: 'not_required',
    });
  });
});

describe('TERMS_VERSION', () => {
  it('is a date, the format terms_acceptances accepts', () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });
});
