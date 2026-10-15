import { z } from 'zod';

import { amountCentsField, optionalText, uuidField } from './common';

/** Form to make or counter an offer. The side and load come from the context, not the form. */
export const offerFormSchema = z.object({
  amountCents: amountCentsField,
  conditions: optionalText(1000),
  /** Carriers may propose the unit they would use. */
  vehicleId: uuidField.optional(),
});

export type OfferFormInput = z.input<typeof offerFormSchema>;
export type OfferFormValues = z.output<typeof offerFormSchema>;
