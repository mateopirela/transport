import { z } from 'zod';

import { validationMessages as m } from '../copy/validation';
import { COMPANY_TYPES } from '../enums';
import { parseRfc } from '../rfc';
import {
  emailField,
  enumField,
  formError,
  onlyWhenValid,
  phoneField,
  requiredText,
} from './common';

export const PERSON_TYPES = ['moral', 'fisica'] as const;

/** Normalized RFC (uppercase, no spaces); structure and date validated. */
export const rfcField = z.string({ error: m.rfcFormat }).transform((value, ctx) => {
  const result = parseRfc(value);
  if (result.ok) return result.rfc;
  const message = { format: m.rfcFormat, date: m.rfcDate, generic: m.rfcGeneric }[result.issue];
  ctx.addIssue({ code: 'custom', message });
  return z.NEVER;
});

/** The RFC length must match the person type: 12 for moral, 13 for física. */
export function checkRfcMatchesPersonType(
  { personType, rfc }: { personType: (typeof PERSON_TYPES)[number]; rfc: string },
  ctx: z.RefinementCtx,
): void {
  const expected = personType === 'moral' ? 12 : 13;
  if (rfc.length !== expected) {
    ctx.addIssue({
      code: 'custom',
      message: personType === 'moral' ? m.rfcMoral : m.rfcFisica,
      path: ['rfc'],
    });
  }
}

/** Company registration (shipper web, carrier app). */
export const companyFormSchema = z
  .object(
    {
      type: enumField(COMPANY_TYPES),
      /** Persona moral (company) or física (individual, e.g. an owner-operator, D13). */
      personType: enumField(PERSON_TYPES),
      legalName: requiredText(200),
      tradeName: requiredText(200).optional(),
      rfc: rfcField,
      contactName: requiredText(120),
      contactEmail: emailField,
      contactPhone: phoneField,
    },
    formError,
  )
  .superRefine(checkRfcMatchesPersonType, onlyWhenValid);

export type CompanyFormInput = z.input<typeof companyFormSchema>;
export type CompanyFormValues = z.output<typeof companyFormSchema>;
