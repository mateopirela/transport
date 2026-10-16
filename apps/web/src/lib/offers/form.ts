// Counteroffer form <-> offerFormSchema (packages/shared). Pure, so it is
// unit-tested; the RPC validates the amount and conditions again.
import { offerFormSchema, parsePesosToCents, type OfferFormValues } from '@transport/shared';

import { invalidForm, type FormState } from '../forms';

/** Parses the counteroffer fields: `amount` in pesos as typed, optional `conditions`. */
export function parseCounterForm(
  entries: Record<string, string>,
): { success: true; data: OfferFormValues } | { success: false; state: FormState } {
  // An amount that does not parse is NaN, so the schema reports "monto no válido".
  const amountCents = entries.amount
    ? (parsePesosToCents(entries.amount) ?? Number.NaN)
    : undefined;
  const parsed = offerFormSchema.safeParse({ amountCents, conditions: entries.conditions });
  if (parsed.success) return { success: true, data: parsed.data };
  const state = invalidForm(parsed.error, entries);
  // The input is called `amount`, the schema field `amountCents`.
  const amountError = state.fieldErrors?.amountCents;
  if (amountError && state.fieldErrors) {
    delete state.fieldErrors.amountCents;
    state.fieldErrors.amount = amountError;
  }
  return { success: false, state };
}
