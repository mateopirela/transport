import { z } from 'zod';

import { validationMessages as m } from '../copy/validation';
import { parseRfc } from '../rfc';
import {
  emailField,
  enumField,
  formError,
  mxPhoneField,
  mxStateField,
  onlyWhenValid,
  optionalText,
  postalCodeField,
  requiredText,
} from './common';

export const PERSON_TYPES = ['moral', 'fisica'] as const;
export type PersonType = (typeof PERSON_TYPES)[number];

/**
 * What a company registers as (G2, D13, D16): a shipper, a carrier company,
 * or a hombre-camión (a carrier whose manager drives their own truck). Mirror
 * of the `kind` that register_company accepts.
 */
export const COMPANY_REGISTRATION_KINDS = ['shipper', 'carrier', 'owner_operator'] as const;
export type CompanyRegistrationKind = (typeof COMPANY_REGISTRATION_KINDS)[number];

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
  { personType, rfc }: { personType: PersonType; rfc: string },
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

/** A persona moral names its legal representative; a persona física is their own. */
export function checkLegalRepresentative(
  {
    personType,
    legalRepresentativeName,
  }: { personType: PersonType; legalRepresentativeName?: string },
  ctx: z.RefinementCtx,
): void {
  if (personType === 'moral' && !legalRepresentativeName) {
    ctx.addIssue({ code: 'custom', message: m.required, path: ['legalRepresentativeName'] });
  }
}

/**
 * Fiscal data of a company (D16): razón social, RFC, domicilio fiscal and
 * representante legal. Shared by every registration form (web and app) and
 * by the "complete your company" screens.
 */
export const companyFiscalFields = {
  /** Persona moral (company) or física (individual, e.g. an owner-operator, D13). */
  personType: enumField(PERSON_TYPES),
  legalName: requiredText(300),
  rfc: rfcField,
  fiscalStreet: requiredText(200),
  fiscalExteriorNumber: requiredText(20),
  fiscalInteriorNumber: optionalText(20),
  fiscalNeighborhood: requiredText(120),
  fiscalPostalCode: postalCodeField,
  fiscalMunicipality: requiredText(120),
  fiscalState: mxStateField,
  legalRepresentativeName: optionalText(200),
} as const;

/** The fiscal data alone (the account already exists; e.g. /cuenta-en-revision). */
export const companyFiscalSchema = z
  .object(companyFiscalFields, formError)
  .superRefine((values, ctx) => {
    checkRfcMatchesPersonType(values, ctx);
    checkLegalRepresentative(values, ctx);
  }, onlyWhenValid);
export type CompanyFiscalValues = z.output<typeof companyFiscalSchema>;

/**
 * Company registration (input of register_company): the kind, the fiscal
 * data and the contact. The web keeps it in the user metadata until the
 * email is confirmed, so it is validated again when it is read back.
 */
export const companyRegistrationSchema = z
  .object(
    {
      kind: enumField(COMPANY_REGISTRATION_KINDS),
      ...companyFiscalFields,
      contactName: requiredText(120),
      contactEmail: emailField,
      contactPhone: mxPhoneField,
    },
    formError,
  )
  .superRefine((values, ctx) => {
    checkRfcMatchesPersonType(values, ctx);
    checkLegalRepresentative(values, ctx);
  }, onlyWhenValid);
export type CompanyRegistrationInput = z.input<typeof companyRegistrationSchema>;
export type CompanyRegistrationValues = z.output<typeof companyRegistrationSchema>;

/** The JSON payload of register_company (its keys are read in SQL). */
export function registerCompanyPayload(values: CompanyRegistrationValues) {
  return {
    kind: values.kind,
    legalName: values.legalName,
    rfc: values.rfc,
    fiscalStreet: values.fiscalStreet,
    fiscalExteriorNumber: values.fiscalExteriorNumber,
    fiscalInteriorNumber: values.fiscalInteriorNumber ?? null,
    fiscalNeighborhood: values.fiscalNeighborhood,
    fiscalPostalCode: values.fiscalPostalCode,
    fiscalMunicipality: values.fiscalMunicipality,
    fiscalState: values.fiscalState,
    legalRepresentativeName: values.legalRepresentativeName ?? null,
    contactName: values.contactName,
    contactEmail: values.contactEmail,
    contactPhone: values.contactPhone,
  };
}
export type RegisterCompanyPayload = ReturnType<typeof registerCompanyPayload>;

/** Columns of `companies` that hold the fiscal data (G2). */
export const COMPANY_FISCAL_COLUMNS = [
  'fiscal_street',
  'fiscal_exterior_number',
  'fiscal_neighborhood',
  'fiscal_postal_code',
  'fiscal_municipality',
  'fiscal_state',
  'legal_representative_name',
] as const;
export type CompanyFiscalColumn = (typeof COMPANY_FISCAL_COLUMNS)[number];
