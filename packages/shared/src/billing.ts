// Subscription of the carrier (H3, D24-E1, D30). The rules live in Postgres
// (…_billing.sql: billing_settings, company_billing_state and
// assert_billing_allows); billingState is their pure mirror, for the screens
// and the tests, and the rest maps prices and errors to copy. The block's
// error ("subscription required") is mapped with the offer and fleet errors
// (carrierOfferErrorText, fleetErrorText).
import { billingCopy as c } from './copy/billing';
import { formatMxn } from './formatters';

export type SubscriptionStatus = 'pilot_free' | 'active' | 'past_due' | 'canceled' | 'none';
export type StoredSubscriptionStatus = Exclude<SubscriptionStatus, 'pilot_free'>;
export type BillingEnforcement = 'off' | 'notice' | 'block';
export type BillingNotice = 'none' | 'pilot' | 'pilot_ending' | 'inactive';

export const BILLING_SETTING_KEYS = {
  pilotMode: 'billing.pilot_mode',
  pilotEndsAt: 'billing.pilot_ends_at',
  enforcement: 'billing.enforcement',
} as const;

/** Days before the end of the pilot from which the companies are warned. */
export const PILOT_ENDING_NOTICE_DAYS = 14;

export interface BillingSettings {
  pilotMode: boolean;
  /** ISO timestamp, or null when the pilot has no end date. */
  pilotEndsAt: string | null;
  enforcement: BillingEnforcement;
}

const ENFORCEMENTS: readonly BillingEnforcement[] = ['off', 'notice', 'block'];

/**
 * The settings from the rows of platform_settings, with the same fallbacks as
 * billing_settings(): a missing or malformed value means the pilot (free,
 * nothing blocked).
 */
export function parseBillingSettings(
  rows: readonly { key: string; value: unknown }[],
): BillingSettings {
  const value = (key: string) => rows.find((row) => row.key === key)?.value;
  const pilot = value(BILLING_SETTING_KEYS.pilotMode);
  const ends = value(BILLING_SETTING_KEYS.pilotEndsAt);
  const enforcement = value(BILLING_SETTING_KEYS.enforcement);
  return {
    pilotMode: typeof pilot === 'boolean' ? pilot : true,
    pilotEndsAt: typeof ends === 'string' && !Number.isNaN(Date.parse(ends)) ? ends : null,
    enforcement: ENFORCEMENTS.includes(enforcement as BillingEnforcement)
      ? (enforcement as BillingEnforcement)
      : 'off',
  };
}

export interface BillingStateResult {
  effectiveStatus: SubscriptionStatus;
  notice: BillingNotice;
}

/** Mirror of company_billing_state(): the effective status and the notice. */
export function billingState(
  settings: BillingSettings,
  stored: StoredSubscriptionStatus | null | undefined,
  now: Date,
): BillingStateResult {
  const status = stored ?? 'none';
  if (settings.pilotMode) {
    const ends = settings.pilotEndsAt ? Date.parse(settings.pilotEndsAt) : null;
    const ending =
      ends !== null && ends <= now.getTime() + PILOT_ENDING_NOTICE_DAYS * 24 * 60 * 60 * 1000;
    return { effectiveStatus: 'pilot_free', notice: ending ? 'pilot_ending' : 'pilot' };
  }
  const notice: BillingNotice =
    status === 'active' || settings.enforcement === 'off' ? 'none' : 'inactive';
  return { effectiveStatus: status, notice };
}

/**
 * The pill tone of a status, in the web and the app: the free pilot in the
 * accent, active ok, overdue amber, canceled or none red.
 */
export function subscriptionStatusTone(
  status: SubscriptionStatus,
): 'accent' | 'ok' | 'amber' | 'red' {
  switch (status) {
    case 'pilot_free':
      return 'accent';
    case 'active':
      return 'ok';
    case 'past_due':
      return 'amber';
    case 'canceled':
    case 'none':
      return 'red';
  }
}

/** Whether the carrier sees a banner (only pilot_ending and inactive). */
export function showsBillingBanner(notice: string | null | undefined): boolean {
  return notice === 'pilot_ending' || notice === 'inactive';
}

/** "Por definir" without a price; otherwise "$999.00 al mes" (or al año). */
export function planPriceLabel(
  amountCents: number | string | null | undefined,
  interval: string | null | undefined = 'month',
): string {
  if (amountCents === null || amountCents === undefined) return c.priceToBeDefined;
  const amount = formatMxn(amountCents);
  return interval === 'year' ? c.perYear(amount) : c.perMonth(amount);
}

/** Whether a plan can be contracted: active, with a price and a Stripe price. */
export function isPlanOffered(plan: {
  active: boolean;
  amount_cents: number | null;
  stripe_price_id: string | null;
}): boolean {
  return plan.active && plan.amount_cents !== null && plan.stripe_price_id !== null;
}

/** Error codes the billing Edge Functions answer with. */
export type BillingFunctionError =
  | 'billing_disabled'
  | 'pilot_active'
  | 'forbidden'
  | 'plan_unavailable'
  | 'already_subscribed'
  | 'no_customer'
  | 'checkout_in_progress';

const FUNCTION_ERRORS: Record<BillingFunctionError, string> = {
  billing_disabled: c.errors.billingDisabled,
  pilot_active: c.errors.pilotActive,
  forbidden: c.errors.managerOnly,
  plan_unavailable: c.errors.planUnavailable,
  already_subscribed: c.errors.alreadySubscribed,
  no_customer: c.errors.noCustomer,
  checkout_in_progress: c.errors.checkoutInProgress,
};

/** Spanish text for a billing Edge Function answer; generic for anything else. */
export function billingFunctionErrorText(code: unknown): string {
  return typeof code === 'string' && code in FUNCTION_ERRORS
    ? FUNCTION_ERRORS[code as BillingFunctionError]
    : c.errors.generic;
}

/** The pilot end as the date the banner shows, or null. */
export function pilotEndingDate(pilotEndsAt: string | null | undefined): Date | null {
  if (!pilotEndsAt) return null;
  const date = new Date(pilotEndsAt);
  return Number.isNaN(date.getTime()) ? null : date;
}
