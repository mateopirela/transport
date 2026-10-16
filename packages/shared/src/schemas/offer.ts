import { z } from 'zod';

import { validationMessages as m } from '../copy/validation';
import { amountCentsField, formError, optionalText, uuidField } from './common';

/** Form to make or counter an offer. The side and load come from the context, not the form. */
export const offerFormSchema = z.object(
  {
    amountCents: amountCentsField,
    conditions: optionalText(1000),
    /** Carriers may propose the unit they would use. */
    vehicleId: uuidField.optional(),
  },
  formError,
);

export type OfferFormInput = z.input<typeof offerFormSchema>;
export type OfferFormValues = z.output<typeof offerFormSchema>;

/**
 * Admin manual contract (input of admin_create_offer): an offer in the name
 * of a carrier, optionally accepted at once in the name of the shipper.
 */
export const adminContractSchema = z.object(
  {
    carrierCompanyId: uuidField,
    amountCents: amountCentsField,
    conditions: optionalText(1000),
    accept: z.boolean({ error: m.required }),
  },
  formError,
);

export type AdminContractValues = z.output<typeof adminContractSchema>;
