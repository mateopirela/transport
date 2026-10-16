import { offerFormSchema, parsePesosToCents, type OfferFormValues } from '@transport/shared';

import { validateForm, type FieldErrors } from './forms';

export interface OfferDraft {
  /** Pesos as typed, e.g. "38,500". */
  amount: string;
  conditions: string;
  vehicleId: string | undefined;
}

/**
 * Validates an offer or counteroffer form with offerFormSchema; the RPC
 * validates the amount, conditions and unit again. Errors are keyed by the
 * draft's field names.
 */
export function parseOfferDraft(
  draft: OfferDraft,
): { ok: true; data: OfferFormValues } | { ok: false; errors: FieldErrors } {
  // An amount that does not parse is NaN, so the schema reports "monto no válido".
  const amountCents = draft.amount.trim()
    ? (parsePesosToCents(draft.amount) ?? Number.NaN)
    : undefined;
  const parsed = validateForm(offerFormSchema, {
    amountCents,
    conditions: draft.conditions,
    vehicleId: draft.vehicleId,
  });
  if (parsed.ok) return parsed;
  const { amountCents: amount, ...rest } = parsed.errors;
  return { ok: false, errors: amount ? { ...rest, amount } : rest };
}

/** Pesos for the amount field, e.g. 3_850_000 cents → "38500". */
export function centsToPesosInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}
