// The sign-up in steps (D42, plan-registro.md R1): five steps, of which the
// form fills the first two (the account, then the fiscal data and the
// address); documents, the profile's own data and the verification come once
// the account exists (R3). Pure, so the web (R1) and the app (R2) share it.
import { authCopy } from './copy/auth';
import { REGISTRATION_ACCOUNT_FIELDS } from './schemas/auth';
import {
  companyRegistrationSchema,
  type CompanyRegistrationValues,
  type PersonType,
} from './schemas/company';

/** The five steps of D42, in order. */
export const SIGN_UP_STEPS = ['account', 'fiscal', 'documents', 'profile', 'verification'] as const;
export type SignUpStep = (typeof SIGN_UP_STEPS)[number];

/** The steps the sign-up form itself fills. */
export const SIGN_UP_FORM_STEPS = ['account', 'fiscal'] as const;
export type SignUpFormStep = (typeof SIGN_UP_FORM_STEPS)[number];

const ACCOUNT_FIELDS: ReadonlySet<string> = new Set(REGISTRATION_ACCOUNT_FIELDS);

/**
 * The form step a field belongs to: the kind and the account are step 1,
 * everything else (fiscal data, address, terms) step 2.
 */
export function signUpStepOfField(field: string): SignUpFormStep {
  return ACCOUNT_FIELDS.has(field) ? 'account' : 'fiscal';
}

/**
 * The first form step with an error, or null without any. A field the server
 * rejects in step 1 (a taken email, a weak password) sends the person back
 * there, with the error on the field.
 */
export function firstSignUpStepWithError(
  fieldErrors: Readonly<Record<string, string>> | undefined,
): SignUpFormStep | null {
  const fields = Object.keys(fieldErrors ?? {});
  if (fields.length === 0) return null;
  return fields.some((field) => signUpStepOfField(field) === 'account') ? 'account' : 'fiscal';
}

/** The state of each of the five steps while the form shows `current`. */
export function signUpStepStates(
  current: SignUpFormStep,
): { step: SignUpStep; state: 'done' | 'current' | 'upcoming' }[] {
  const index = SIGN_UP_STEPS.indexOf(current);
  return SIGN_UP_STEPS.map((step, i) => ({
    step,
    state: i < index ? 'done' : i === index ? 'current' : 'upcoming',
  }));
}

/**
 * How the fiscal fields read for a person type (D42): a persona física has a
 * "Nombre fiscal" and no "Representante legal" (they are their own).
 */
export function fiscalFieldsFor(personType: PersonType): {
  legalNameLabel: string;
  withLegalRepresentative: boolean;
} {
  return personType === 'fisica'
    ? { legalNameLabel: authCopy.fields.fiscalName, withLegalRepresentative: false }
    : { legalNameLabel: authCopy.fields.legalName, withLegalRepresentative: true };
}

/** The person type a stored RFC tells: 12 characters moral, 13 física. */
export function personTypeOfRfc(rfc: string): PersonType {
  return rfc.trim().length === 13 ? 'fisica' : 'moral';
}

/**
 * Key in the user metadata where a sign-up keeps the company registration
 * (kind, fiscal data and contact, G2) until the email is confirmed and there
 * is a session to call `register_company` with: the web (R1) and the app
 * (R2) both write and read it. Never a password.
 */
export const PENDING_COMPANY_KEY = 'pending_company';

/**
 * The company registration a sign-up left in the user metadata, or null when
 * there is none or it is not valid. The metadata is user-controlled, so it is
 * validated again here (and `register_company` validates it once more).
 */
export function pendingCompanyOf(metadata: unknown): CompanyRegistrationValues | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const parsed = companyRegistrationSchema.safeParse(
    (metadata as Record<string, unknown>)[PENDING_COMPANY_KEY],
  );
  return parsed.success ? parsed.data : null;
}
