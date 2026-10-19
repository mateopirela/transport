// Offer and counteroffer form of the carrier web (G10a) <-> offerFormSchema
// (packages/shared). Pure, so it is unit-tested; make_offer and counter_offer
// validate the amount, the conditions, the unit and the business unit again.
import {
  offerFormSchema,
  parsePesosToCents,
  uuidField,
  validationMessages,
  type OfferFormValues,
} from '@transport/shared';

import { invalidForm, type FormState } from '../forms';

export interface CarrierOfferValues extends OfferFormValues {
  /**
   * Business unit of a first offer made without a unit (the Gerente of a
   * company with several). With a unit, make_offer takes the unit's.
   */
  businessUnitId?: string;
}

/**
 * Parses the offer fields: `amount` in pesos as typed, optional `conditions`,
 * optional `vehicleId` and optional `businessUnitId` (empty selects count as
 * missing). Errors are keyed by the form's field names.
 */
export function parseCarrierOfferForm(
  entries: Record<string, string>,
): { success: true; data: CarrierOfferValues } | { success: false; state: FormState } {
  // An amount that does not parse is NaN, so the schema reports "monto no válido".
  const amountCents = entries.amount
    ? (parsePesosToCents(entries.amount) ?? Number.NaN)
    : undefined;
  const parsed = offerFormSchema.safeParse({
    amountCents,
    conditions: entries.conditions,
    vehicleId: entries.vehicleId || undefined,
  });
  const businessUnit = entries.businessUnitId ? uuidField.safeParse(entries.businessUnitId) : null;
  if (parsed.success && (!businessUnit || businessUnit.success)) {
    return {
      success: true,
      data: businessUnit?.success
        ? { ...parsed.data, businessUnitId: businessUnit.data }
        : parsed.data,
    };
  }
  const state: FormState = parsed.success
    ? { fieldErrors: {}, values: entries }
    : invalidForm(parsed.error, entries);
  state.fieldErrors ??= {};
  // The input is called `amount`, the schema field `amountCents`.
  const amountError = state.fieldErrors.amountCents;
  if (amountError) {
    delete state.fieldErrors.amountCents;
    state.fieldErrors.amount = amountError;
  }
  if (businessUnit && !businessUnit.success) {
    state.fieldErrors.businessUnitId = validationMessages.invalidOption;
  }
  return { success: false, state };
}
