import {
  SIGN_UP_STEPS,
  type CarrierSignUpKind,
  type CompanyRegistrationValues,
  type MobileErrorKey,
  type MxState,
  type PersonType,
  type SignUpFormStep,
} from '@transport/shared';

import type { FieldErrors } from './forms';

// The app's sign-up in steps (D42, plan-registro.md R2), without React
// Native: the step logic itself (which step a field is on, the first step
// with an error) is shared with the web in @transport/shared (sign-up-steps).

/** What the sign-up form holds while it is filled: in memory only, never stored. */
export interface SignUpFormValues {
  kind: CarrierSignUpKind;
  fullName: string;
  phone: string;
  email: string;
  password: string;
  passwordConfirmation: string;
  personType: PersonType;
  legalName: string;
  rfc: string;
  legalRepresentativeName: string;
  fiscalStreet: string;
  fiscalExteriorNumber: string;
  fiscalInteriorNumber: string;
  fiscalNeighborhood: string;
  fiscalPostalCode: string;
  fiscalMunicipality: string;
  fiscalState: MxState | '';
  acceptTerms: boolean;
}

/** A hombre-camión is usually a persona física; a carrier company, a moral one. */
export function personTypeForKind(kind: CarrierSignUpKind): PersonType {
  return kind === 'owner_operator' ? 'fisica' : 'moral';
}

export const EMPTY_SIGN_UP: SignUpFormValues = {
  kind: 'carrier',
  fullName: '',
  phone: '',
  email: '',
  password: '',
  passwordConfirmation: '',
  personType: personTypeForKind('carrier'),
  legalName: '',
  rfc: '',
  legalRepresentativeName: '',
  fiscalStreet: '',
  fiscalExteriorNumber: '',
  fiscalInteriorNumber: '',
  fiscalNeighborhood: '',
  fiscalPostalCode: '',
  fiscalMunicipality: '',
  fiscalState: '',
  acceptTerms: false,
};

/**
 * What is validated and sent: a persona física has no legal representative
 * (D42; she is her own), so whatever was typed there before switching is not
 * sent. Everything else as typed.
 */
export function signUpInput(values: SignUpFormValues): SignUpFormValues {
  return values.personType === 'fisica' ? { ...values, legalRepresentativeName: '' } : values;
}

/** The fields of the sign-up in the order they are on the screen, step by step. */
export const SIGN_UP_FIELD_ORDER: readonly (keyof SignUpFormValues)[] = [
  'kind',
  'fullName',
  'phone',
  'email',
  'password',
  'passwordConfirmation',
  'personType',
  'legalName',
  'rfc',
  'legalRepresentativeName',
  'fiscalStreet',
  'fiscalExteriorNumber',
  'fiscalInteriorNumber',
  'fiscalNeighborhood',
  'fiscalPostalCode',
  'fiscalMunicipality',
  'fiscalState',
  'acceptTerms',
];

/** The first field of `order` with an error, to scroll the form to it; null without errors. */
export function firstFieldWithError(
  errors: FieldErrors,
  order: readonly string[] = SIGN_UP_FIELD_ORDER,
): string | null {
  return order.find((field) => errors[field] !== undefined) ?? null;
}

/** The position of a form step among the five of D42, for the kit's `Steps`. */
export function signUpStepIndex(step: SignUpFormStep): number {
  return SIGN_UP_STEPS.indexOf(step);
}

/**
 * The field a server error of the sign-up is about (D42: the error goes on
 * the field that failed), or null when it is about the whole form.
 */
const SIGN_UP_ERROR_FIELDS: Partial<Record<MobileErrorKey, keyof SignUpFormValues>> = {
  userAlreadyExists: 'email',
  weakPassword: 'password',
  phoneInvalid: 'phone',
};

export function signUpErrorField(key: MobileErrorKey): keyof SignUpFormValues | null {
  return SIGN_UP_ERROR_FIELDS[key] ?? null;
}

/** Likewise for `register_company`: a taken RFC goes on the RFC. */
const COMPANY_ERROR_FIELDS: Partial<Record<MobileErrorKey, string>> = { rfcTaken: 'rfc' };

export function companyErrorField(key: MobileErrorKey): string | null {
  return COMPANY_ERROR_FIELDS[key] ?? null;
}

/** The carrier kinds the app registers (D06-E1: the shipper only on the web). */
export function isCarrierKind(kind: string): kind is CarrierSignUpKind {
  return kind === 'carrier' || kind === 'owner_operator';
}

/** The fields of the company form (company.tsx), as text, from a saved registration. */
export interface CompanyFormValues {
  kind: CarrierSignUpKind;
  personType: PersonType;
  legalName: string;
  rfc: string;
  fiscalStreet: string;
  fiscalExteriorNumber: string;
  fiscalInteriorNumber: string;
  fiscalNeighborhood: string;
  fiscalPostalCode: string;
  fiscalMunicipality: string;
  fiscalState: MxState | '';
  legalRepresentativeName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}

export function companyFormValues(company: CompanyRegistrationValues): CompanyFormValues {
  return {
    kind: isCarrierKind(company.kind) ? company.kind : 'carrier',
    personType: company.personType,
    legalName: company.legalName,
    rfc: company.rfc,
    fiscalStreet: company.fiscalStreet,
    fiscalExteriorNumber: company.fiscalExteriorNumber,
    fiscalInteriorNumber: company.fiscalInteriorNumber ?? '',
    fiscalNeighborhood: company.fiscalNeighborhood,
    fiscalPostalCode: company.fiscalPostalCode,
    fiscalMunicipality: company.fiscalMunicipality,
    fiscalState: company.fiscalState,
    legalRepresentativeName: company.legalRepresentativeName ?? '',
    contactName: company.contactName,
    contactEmail: company.contactEmail,
    contactPhone: company.contactPhone,
  };
}
