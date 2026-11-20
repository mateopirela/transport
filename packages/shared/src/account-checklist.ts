// "Completa tu cuenta" (D42-E1, plan-acceso.md §0.2): steps 2 to 5 of D42,
// which used to come before entering, as a list inside the panel. It builds
// on ./onboarding (which steps a profile has and what each still asks for)
// and adds the fiscal data as the first pending step while the account has
// no company, and what a company that is not approved cannot do yet (D48).
// Pure, so the web (S2) and the app (S3) show the same; Postgres decides
// what is allowed (lock_company_approved, is_company_approved).
import { accountBlockCopy, accountChecklistCopy } from './copy/access';
import type { VerificationStatus } from './enums';
import { isPhoneAuthEmail } from './phone';
import {
  isStepComplete,
  joinsByInvitation,
  needsUpload,
  type OnboardingProfile,
  type StepWork,
} from './onboarding';

/** The steps inside the panel, in the order of D42 (the account is step 1, done). */
export const ACCOUNT_STEPS = ['fiscal', 'documents', 'profile', 'verification'] as const;
export type AccountStep = (typeof ACCOUNT_STEPS)[number];

/**
 * The steps of a profile: a Coordinador and an Operador joined a company
 * that exists (D43), so they have neither the fiscal data nor the common
 * documents.
 */
export function accountStepsOf(profile: OnboardingProfile): readonly AccountStep[] {
  return joinsByInvitation(profile)
    ? ACCOUNT_STEPS.filter((step) => step !== 'fiscal' && step !== 'documents')
    : ACCOUNT_STEPS;
}

/** What the list is computed from. */
export interface AccountProgress {
  profile: OnboardingProfile;
  /**
   * The status of the account's company, or null while it has none: the
   * fiscal data are not captured yet (or the invitation was not accepted).
   */
  companyStatus: VerificationStatus | null;
  /** What steps 3 and 4 still ask for (./onboarding); empty without a company. */
  work?: StepWork;
}

/** How the account stands, for the line under "Completa tu cuenta". */
export type AccountStatus =
  'incomplete' | 'in_review' | 'rejected' | 'expired' | 'suspended' | 'approved';

export interface AccountChecklistItem {
  step: AccountStep;
  /** The number the person sees (1–4, or 1–2 for an invited profile). */
  number: number;
  label: string;
  state: 'done' | 'current' | 'upcoming';
}

export interface AccountChecklist {
  items: AccountChecklistItem[];
  /** The step in course: the first one that still asks for something. */
  current: AccountStep;
  done: number;
  total: number;
  status: AccountStatus;
  /** What to do next, in words. */
  next: string;
  /** False once every step is done: the notice leaves the panel. */
  pending: boolean;
}

const EMPTY_WORK: StepWork = { documents: [], profile: [] };

function stepDone(step: AccountStep, progress: AccountProgress): boolean {
  const { companyStatus } = progress;
  const work = progress.work ?? EMPTY_WORK;
  switch (step) {
    case 'fiscal':
      return companyStatus !== null;
    // Without a company there is nowhere to upload to yet.
    case 'documents':
      return companyStatus !== null && isStepComplete('documents', work);
    case 'profile':
      return companyStatus !== null && isStepComplete('profile', work);
    case 'verification':
      return companyStatus === 'approved';
  }
}

function statusOf(progress: AccountProgress, todo: boolean): AccountStatus {
  switch (progress.companyStatus) {
    case 'rejected':
    case 'expired':
    case 'suspended':
      return progress.companyStatus;
    case 'approved':
      return todo ? 'incomplete' : 'approved';
    case 'pending_review':
      return todo ? 'incomplete' : 'in_review';
    case null:
      return 'incomplete';
  }
}

/**
 * The list "Completa tu cuenta" of an account: its steps with their state,
 * the progress, how the account stands and what comes next. The fiscal data
 * are the first pending step while there is no company; "Verificación" is
 * done only when the company is approved.
 */
export function accountChecklist(progress: AccountProgress): AccountChecklist {
  const steps = accountStepsOf(progress.profile);
  const done = steps.map((step) => stepDone(step, progress));
  const firstPending = done.findIndex(
    (isDone, index) => !isDone && steps[index] !== 'verification',
  );
  const current = firstPending === -1 ? 'verification' : (steps[firstPending] as AccountStep);
  const status = statusOf(progress, firstPending !== -1);
  const doneCount = done.filter(Boolean).length;
  return {
    items: steps.map((step, index) => ({
      step,
      number: index + 1,
      label: accountChecklistCopy.steps[step],
      state: done[index] ? 'done' : step === current ? 'current' : 'upcoming',
    })),
    current,
    done: doneCount,
    total: steps.length,
    status,
    next: accountChecklistCopy.next[current],
    pending: doneCount < steps.length,
  };
}

/** How many required documents of steps 3 and 4 must be (re)sent. */
export function accountUploadsLeft(work: StepWork | undefined): number {
  if (!work) return 0;
  return (
    work.documents.filter(needsUpload).length +
    work.profile.filter(needsUpload).length +
    (work.profileExtras ?? 0)
  );
}

/** What needs an approved company (D48); everything else can be prepared before. */
export const APPROVAL_GATED_ACTIONS = [
  'publish_load',
  'make_offer',
  'recommendations',
  'assign_trip',
] as const;
export type ApprovalGatedAction = (typeof APPROVAL_GATED_ACTIONS)[number];

export interface AccountBlock {
  /** Why the action is not available, naming what is missing. */
  reason: string;
  /** The step of "Completa tu cuenta" that unblocks it. */
  step: AccountStep;
}

/**
 * Why `action` is blocked for the account, or null when its company is
 * approved (Postgres still decides: D45 for units and operators, the state
 * of the load…). The action is shown disabled with this reason and a link to
 * the step.
 */
export function accountBlock(
  action: ApprovalGatedAction,
  progress: AccountProgress,
): AccountBlock | null {
  if (progress.companyStatus === 'approved') return null;
  const what = accountBlockCopy.actions[action];
  const { current } = accountChecklist(progress);
  if (progress.companyStatus === null) {
    const step = accountStepsOf(progress.profile)[0] as AccountStep;
    return { reason: accountBlockCopy.reason.no_company(what), step };
  }
  switch (progress.companyStatus) {
    case 'rejected':
    case 'expired':
    case 'suspended':
      return { reason: accountBlockCopy.reason[progress.companyStatus](what), step: current };
    case 'pending_review':
      return current === 'verification'
        ? { reason: accountBlockCopy.reason.in_review(what), step: current }
        : { reason: accountBlockCopy.reason.incomplete(what), step: current };
  }
}

/**
 * Whether an error of an RPC is "the company is not approved" (publish_load,
 * make_offer, assign_trip, match_candidates… raise 42501 with this message;
 * accepting an offer, 55000 when either company is not). The screens
 * translate it into the same reason as the disabled action (D48), however
 * the call was reached.
 */
export function isCompanyNotApprovedError(
  error: { message?: string | null } | null | undefined,
): boolean {
  const message = error?.message?.toLowerCase() ?? '';
  return (
    message.includes('company is not approved') ||
    message.includes('both companies must be approved')
  );
}

/**
 * The contact of the company, taken from the account that registers it
 * (D50-1): name, phone and email are not asked twice. The synthetic email of
 * a phone-only account is never a contact.
 */
export function companyContactFromAccount(account: {
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
}): { contactName: string; contactPhone: string; contactEmail: string } {
  const email = account.email?.trim().toLowerCase() ?? '';
  return {
    contactName: account.fullName?.trim() ?? '',
    contactPhone: account.phone?.trim() ?? '',
    contactEmail: isPhoneAuthEmail(email) ? '' : email,
  };
}
