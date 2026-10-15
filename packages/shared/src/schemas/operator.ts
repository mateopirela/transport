import { z } from 'zod';

import { APP_TIME_ZONE } from '../constants';
import { validationMessages as m } from '../copy/validation';
import { LICENSE_TYPES } from '../enums';
import { emailField, enumField, phoneField, requiredText } from './common';

/** Today's date (YYYY-MM-DD) in Mexico City. */
export function todayInMexicoCity(now: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE }).format(now);
}

/** Operator profile and federal license (carrier invites, operator completes). */
export const operatorFormSchema = z.object({
  fullName: requiredText(160),
  email: emailField,
  phone: phoneField,
  licenseNumber: z
    .string({ error: m.required })
    .transform((value) => value.toUpperCase().replace(/\s/gu, ''))
    .pipe(requiredText(30)),
  licenseType: enumField(LICENSE_TYPES),
  // ISO dates compare correctly as strings.
  licenseExpiresOn: z.iso
    .date({ error: m.date })
    .refine((date) => date >= todayInMexicoCity(), { error: m.licenseExpired }),
});

export type OperatorFormInput = z.input<typeof operatorFormSchema>;
export type OperatorFormValues = z.output<typeof operatorFormSchema>;
