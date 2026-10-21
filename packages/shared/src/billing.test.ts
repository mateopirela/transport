import { describe, expect, it } from 'vitest';

import {
  billingFunctionErrorText,
  billingState,
  isPlanOffered,
  parseBillingSettings,
  pilotEndingDate,
  planPriceLabel,
  showsBillingBanner,
  type BillingSettings,
} from './billing';
import { carrierOfferErrorText } from './carrier-loads';
import { adminBillingCopy, billingCopy, subscriptionStatusLabels } from './copy/billing';
import type { Database } from './db';
import { centsToPesosInput, parsePesosToCents } from './money';
import { fleetErrorText } from './fleet';

const now = new Date('2026-11-01T12:00:00Z');
const pilot: BillingSettings = { pilotMode: true, pilotEndsAt: null, enforcement: 'off' };
const after = (enforcement: BillingSettings['enforcement']): BillingSettings => ({
  pilotMode: false,
  pilotEndsAt: '2026-10-31T06:00:00Z',
  enforcement,
});

describe('parseBillingSettings', () => {
  it('reads the three settings', () => {
    expect(
      parseBillingSettings([
        { key: 'billing.pilot_mode', value: false },
        { key: 'billing.pilot_ends_at', value: '2026-12-01T06:00:00Z' },
        { key: 'billing.enforcement', value: 'block' },
      ]),
    ).toEqual({ pilotMode: false, pilotEndsAt: '2026-12-01T06:00:00Z', enforcement: 'block' });
  });

  it('falls back to the pilot when a setting is missing or malformed', () => {
    expect(parseBillingSettings([])).toEqual(pilot);
    expect(
      parseBillingSettings([
        { key: 'billing.pilot_mode', value: 'false' },
        { key: 'billing.pilot_ends_at', value: 'mañana' },
        { key: 'billing.enforcement', value: 'hard' },
      ]),
    ).toEqual(pilot);
  });
});

describe('billingState', () => {
  it('is "Piloto gratis" during the pilot, whatever is stored', () => {
    for (const stored of ['active', 'past_due', 'canceled', 'none', null] as const) {
      expect(billingState(pilot, stored, now)).toEqual({
        effectiveStatus: 'pilot_free',
        notice: 'pilot',
      });
    }
  });

  it('warns 14 days or less before the end of the pilot', () => {
    const ending = (days: number) => ({
      ...pilot,
      pilotEndsAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
    });
    expect(billingState(ending(14), 'none', now).notice).toBe('pilot_ending');
    expect(billingState(ending(1), 'none', now).notice).toBe('pilot_ending');
    expect(billingState(ending(-1), 'none', now).notice).toBe('pilot_ending');
    expect(billingState(ending(15), 'none', now).notice).toBe('pilot');
  });

  it('after the pilot, uses the stored status', () => {
    expect(billingState(after('off'), 'active', now)).toEqual({
      effectiveStatus: 'active',
      notice: 'none',
    });
    expect(billingState(after('off'), null, now).effectiveStatus).toBe('none');
    expect(billingState(after('off'), 'past_due', now).effectiveStatus).toBe('past_due');
  });

  it('shows the inactive notice only with enforcement notice or block', () => {
    expect(billingState(after('off'), 'canceled', now).notice).toBe('none');
    expect(billingState(after('notice'), 'canceled', now).notice).toBe('inactive');
    expect(billingState(after('block'), 'none', now).notice).toBe('inactive');
    expect(billingState(after('block'), 'active', now).notice).toBe('none');
  });
});

describe('showsBillingBanner', () => {
  it('only for pilot_ending and inactive', () => {
    expect(showsBillingBanner('pilot_ending')).toBe(true);
    expect(showsBillingBanner('inactive')).toBe(true);
    expect(showsBillingBanner('pilot')).toBe(false);
    expect(showsBillingBanner('none')).toBe(false);
    expect(showsBillingBanner(null)).toBe(false);
  });
});

describe('planPriceLabel', () => {
  it('is "Por definir" without a price', () => {
    expect(planPriceLabel(null)).toBe('Por definir');
    expect(planPriceLabel(undefined)).toBe('Por definir');
  });

  it('formats the price in MXN per month or year', () => {
    expect(planPriceLabel(99900, 'month')).toBe('$999.00 al mes');
    expect(planPriceLabel('1200000', 'year')).toBe('$12,000.00 al año');
  });
});

describe('centsToPesosInput', () => {
  it('writes cents as the text of a price field, without floats', () => {
    expect(centsToPesosInput(99900)).toBe('999.00');
    expect(centsToPesosInput(5)).toBe('0.05');
    expect(centsToPesosInput('1234567')).toBe('12345.67');
    expect(parsePesosToCents(centsToPesosInput(1999))).toBe(1999);
  });
});

describe('isPlanOffered', () => {
  it('needs active, a price and a Stripe price', () => {
    const plan = { active: true, amount_cents: 99900, stripe_price_id: 'price_1' };
    expect(isPlanOffered(plan)).toBe(true);
    expect(isPlanOffered({ ...plan, active: false })).toBe(false);
    expect(isPlanOffered({ ...plan, amount_cents: null })).toBe(false);
    expect(isPlanOffered({ ...plan, stripe_price_id: null })).toBe(false);
  });
});

describe('errors', () => {
  it('maps the Edge Function codes to Spanish', () => {
    expect(billingFunctionErrorText('billing_disabled')).toBe(billingCopy.errors.billingDisabled);
    expect(billingFunctionErrorText('forbidden')).toBe(billingCopy.errors.managerOnly);
    expect(billingFunctionErrorText('checkout_in_progress')).toBe(
      billingCopy.errors.checkoutInProgress,
    );
    expect(billingFunctionErrorText('whatever')).toBe(billingCopy.errors.generic);
    expect(billingFunctionErrorText(undefined)).toBe(billingCopy.errors.generic);
  });

  it('maps the block of assert_billing_allows in the offer and fleet errors', () => {
    expect(carrierOfferErrorText('subscription required')).toBe(
      billingCopy.errors.subscriptionRequired,
    );
    expect(fleetErrorText('subscription required')).toBe(billingCopy.errors.subscriptionRequired);
  });

  it('reads the pilot end date', () => {
    expect(pilotEndingDate('2026-12-01T06:00:00Z')?.toISOString()).toBe('2026-12-01T06:00:00.000Z');
    expect(pilotEndingDate(null)).toBeNull();
    expect(pilotEndingDate('x')).toBeNull();
  });
});

describe('copy', () => {
  it('labels every subscription status of the database', () => {
    const statuses: Database['public']['Enums']['subscription_status'][] = [
      'pilot_free',
      'active',
      'past_due',
      'canceled',
      'none',
    ];
    for (const status of statuses) expect(subscriptionStatusLabels[status].trim()).not.toBe('');
    expect(subscriptionStatusLabels.pilot_free).toBe('Piloto gratis');
  });

  it('labels both audiences', () => {
    const audiences: Database['public']['Enums']['subscription_audience'][] = [
      'fleet',
      'owner_operator',
    ];
    for (const audience of audiences) expect(adminBillingCopy.audience[audience]).toBeTruthy();
  });

  it('the app text sends to the web without a link or a price', () => {
    expect(billingCopy.appManagedOnWeb).toBe(
      'La suscripción se administra desde la web de Transport.',
    );
    expect(billingCopy.appManagedOnWeb).not.toMatch(/https?:|\$/u);
  });

  it('builds the banners', () => {
    expect(billingCopy.banner.pilotEnding('1 dic 2026')).toContain('1 dic 2026');
    expect(billingCopy.cancelsAtPeriodEnd('1 dic 2026')).toBe('Se cancela el 1 dic 2026');
  });
});
