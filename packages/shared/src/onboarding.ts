// Steps 3, 4 and 5 of the sign-up (D42, plan-registro.md R3): which steps a
// profile goes through, which documents belong to each, the step in course
// and what is still missing. Pure, so the web and the app decide the same;
// Postgres enforces the documents themselves (submit_document, the trip gate).
import { onboardingStepsCopy } from './copy/onboarding-steps';
import type { UserRole } from './enums';
import { SIGN_UP_STEPS, type SignUpStep } from './sign-up-steps';
import type { RequirementState } from './verification';

/** The five profiles of §0.2: the hombre-camión is a Gerente who drives (D13). */
export const ONBOARDING_PROFILES = [
  'shipper',
  'manager',
  'owner_operator',
  'coordinator',
  'operator',
] as const;
export type OnboardingProfile = (typeof ONBOARDING_PROFILES)[number];

/** The profile of an account in the steps, or null for an admin (no sign-up). */
export function onboardingProfileOf(
  role: UserRole,
  isOwnerOperator: boolean,
): OnboardingProfile | null {
  switch (role) {
    case 'shipper':
    case 'coordinator':
    case 'operator':
      return role;
    case 'manager':
      return isOwnerOperator ? 'owner_operator' : 'manager';
    case 'admin':
      return null;
  }
}

/** Steps 3 to 5, the ones that come once the account exists. */
export const ONBOARDING_STEPS = ['documents', 'profile', 'verification'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/**
 * Whether the profile joined an existing company by invitation (D43): the
 * Coordinador and the Operador only give their personal data and go on to
 * step 4, without the fiscal data (2) or the common documents (3).
 */
export function joinsByInvitation(profile: OnboardingProfile): boolean {
  return profile === 'coordinator' || profile === 'operator';
}

/** The steps of D42 a profile goes through, in order. */
export function onboardingStepsOf(profile: OnboardingProfile): readonly SignUpStep[] {
  return joinsByInvitation(profile)
    ? SIGN_UP_STEPS.filter((step) => step !== 'fiscal' && step !== 'documents')
    : SIGN_UP_STEPS;
}

/**
 * The company documents of step 3 (D16-E3): the constancia, the INE of the
 * holder or legal representative and the power of attorney. Any other company
 * requirement of the catalog (the shipper's cargo insurance, D35-E1, or a new
 * one) belongs to the profile's own step 4.
 */
export const COMMON_COMPANY_DOCUMENTS: readonly string[] = [
  'tax_status_certificate',
  'legal_representative_id',
  'power_of_attorney',
];

/** The operator's own selfie (D44): taken with the front camera in the app. */
export const SELFIE_REQUIREMENT = 'operator_selfie';

/** The operator's official id, asked again in step 4 next to the INE of step 3. */
export const OPERATOR_ID_REQUIREMENT = 'operator_official_id';

/** A requirement as far as the steps are concerned. */
interface StepRequirement {
  code: string;
  is_required: boolean;
}

/** A requirement with its state (requirementProgress, applicableRequirements). */
export interface StepItem {
  requirement: StepRequirement;
  state: RequirementState;
}

/** Splits a company's documents into step 3 (common) and the profile's step 4. */
export function splitCompanyProgress<T extends StepItem>(
  progress: readonly T[],
): { common: T[]; own: T[] } {
  const common: T[] = [];
  const own: T[] = [];
  for (const item of progress) {
    (COMMON_COMPANY_DOCUMENTS.includes(item.requirement.code) ? common : own).push(item);
  }
  return { common, own };
}

/** A required document that must be (re)sent: missing, rejected or expired. */
export function needsUpload(item: StepItem): boolean {
  return item.requirement.is_required && !['approved', 'pending_review'].includes(item.state);
}

/** What step 3 and step 4 still ask of the person. */
export interface StepWork {
  /** Documents of step 3 (empty for invited profiles). */
  documents: readonly StepItem[];
  /** Documents of step 4: the profile's own, its units' and its operator's. */
  profile: readonly StepItem[];
  /**
   * Things of step 4 that are not a document: the hombre-camión without a
   * registered truck or without his operator row. Counted as missing.
   */
  profileExtras?: number;
}

/** Whether a step has nothing left for the person (verification never does). */
export function isStepComplete(step: OnboardingStep, work: StepWork): boolean {
  switch (step) {
    case 'documents':
      return !work.documents.some(needsUpload);
    case 'profile':
      return (work.profileExtras ?? 0) === 0 && !work.profile.some(needsUpload);
    case 'verification':
      return false;
  }
}

/**
 * The step in course: the first of 3 and 4 that still asks for something,
 * else "En verificación". Invited profiles start at 4.
 */
export function currentOnboardingStep(profile: OnboardingProfile, work: StepWork): OnboardingStep {
  const steps = ONBOARDING_STEPS.filter((step) => onboardingStepsOf(profile).includes(step));
  return (
    steps.find((step) => step !== 'verification' && !isStepComplete(step, work)) ?? 'verification'
  );
}

/**
 * The step a `?paso=` parameter asks for ("3", "4" or "5", as the person sees
 * it), or null when it is not one of the profile's steps 3–5.
 */
export function parseOnboardingStep(
  value: unknown,
  profile: OnboardingProfile,
): OnboardingStep | null {
  const raw = Array.isArray(value) ? (value as unknown[])[0] : value;
  if (typeof raw !== 'string' || !/^[1-5]$/u.test(raw)) return null;
  const step = SIGN_UP_STEPS[Number(raw) - 1];
  return step &&
    (ONBOARDING_STEPS as readonly string[]).includes(step) &&
    onboardingStepsOf(profile).includes(step)
    ? (step as OnboardingStep)
    : null;
}

/** The number of a step among the five of D42 (1–5), as `?paso=` writes it. */
export function signUpStepNumber(step: SignUpStep): number {
  return SIGN_UP_STEPS.indexOf(step) + 1;
}

/**
 * The state of each of the profile's steps while `viewed` is shown: account
 * and fiscal data are done (the account exists), 3 and 4 are done when they
 * ask for nothing more, the viewed one is current.
 */
export function onboardingStepStates(
  profile: OnboardingProfile,
  viewed: OnboardingStep,
  work: StepWork,
): { step: SignUpStep; state: 'done' | 'current' | 'upcoming' }[] {
  return onboardingStepsOf(profile).map((step) => {
    if (step === viewed) return { step, state: 'current' };
    if (step === 'account' || step === 'fiscal') return { step, state: 'done' };
    return {
      step,
      state: isStepComplete(step as OnboardingStep, work) ? 'done' : 'upcoming',
    };
  });
}

/** The previous and the next of the profile's steps 3–5, for "Regresar" and "Siguiente". */
export function adjacentOnboardingSteps(
  profile: OnboardingProfile,
  step: OnboardingStep,
): { previous: OnboardingStep | null; next: OnboardingStep | null } {
  const steps = ONBOARDING_STEPS.filter((s) => onboardingStepsOf(profile).includes(s));
  const index = steps.indexOf(step);
  return { previous: steps[index - 1] ?? null, next: steps[index + 1] ?? null };
}

/** What to do with a document, next to its state (step 5). */
export function documentNextAction(item: StepItem): string {
  if (item.state === 'missing' && !item.requirement.is_required) {
    return onboardingStepsCopy.optionalMissing;
  }
  return onboardingStepsCopy.nextAction[item.state];
}

/** The verification at a glance: how many required documents are approved and what is left. */
export function verificationSummary(items: readonly StepItem[]): {
  approved: number;
  total: number;
  todo: number;
  message: string;
} {
  const required = items.filter((item) => item.requirement.is_required);
  const approved = required.filter((item) => item.state === 'approved').length;
  const todo = required.filter(needsUpload).length;
  const c = onboardingStepsCopy.summary;
  const message = todo > 0 ? c.todo(todo) : approved === required.length ? c.done : c.inReview;
  return { approved, total: required.length, todo, message };
}
