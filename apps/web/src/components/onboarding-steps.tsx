import {
  adjacentOnboardingSteps,
  authCopy,
  documentNextAction,
  needsUpload,
  onboardingStepsCopy,
  onboardingStepStates,
  signUpStepNumber,
  type OnboardingProfile,
  type OnboardingStep,
  type StepWork,
} from '@transport/shared';
import Link from 'next/link';

import { StatusBadge } from '@/components/verification';
import { Steps } from '@/components/ui/steps';
import { buttonVariants, groupRow } from '@/components/ui/variants';
import { cn } from '@/lib/utils';
import type { Progress } from '@/lib/verification/queries';

const c = onboardingStepsCopy;

/** The page of one of steps 3–5 (`?paso=3`), on the onboarding screen at `base`. */
export function onboardingStepHref(base: string, step: OnboardingStep): string {
  return `${base}?paso=${signUpStepNumber(step)}`;
}

/**
 * The five steps of D42 across the top (the invited profiles see three):
 * account and fiscal data are done, 3 and 4 are done once they ask for
 * nothing more, the viewed one is current. Steps 3–5 are links, so the person
 * can go back to any of them; on a phone only the current name shows.
 */
export function OnboardingProgress({
  base,
  profile,
  viewed,
  work,
}: {
  base: string;
  profile: OnboardingProfile;
  viewed: OnboardingStep;
  work: StepWork;
}) {
  return (
    <Steps
      orientation="horizontal"
      label={c.label}
      steps={onboardingStepStates(profile, viewed, work).map(({ step, state }) => {
        const name = authCopy.signUp.steps[step];
        const text =
          state === 'current' ? name : <span className="sr-only sm:not-sr-only">{name}</span>;
        return {
          label:
            step === 'account' || step === 'fiscal' || state === 'current' ? (
              text
            ) : (
              <Link
                href={onboardingStepHref(base, step as OnboardingStep)}
                className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
              >
                {text}
              </Link>
            ),
          state,
        };
      })}
    />
  );
}

/**
 * "Regresar" and "Siguiente" under a step: links to the previous and the next
 * of the profile's steps. "Siguiente" is the screen's primary unless the step
 * has a form of its own that is (`nextPrimary = false`).
 */
export function OnboardingStepNav({
  base,
  profile,
  step,
  nextPrimary = true,
}: {
  base: string;
  profile: OnboardingProfile;
  step: OnboardingStep;
  nextPrimary?: boolean;
}) {
  const { previous, next } = adjacentOnboardingSteps(profile, step);
  if (!previous && !next) return null;
  return (
    <nav aria-label={c.label} className="flex flex-wrap items-center justify-between gap-3 pt-2">
      {previous ? (
        <Link
          href={onboardingStepHref(base, previous)}
          className={buttonVariants({ variant: 'secondary' })}
        >
          {c.back}
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link
          href={onboardingStepHref(base, next)}
          className={buttonVariants({ variant: nextPrimary ? 'primary' : 'secondary' })}
        >
          {c.next}
        </Link>
      )}
    </nav>
  );
}

/** A group of documents in "En verificación": who they belong to and the step where they are sent. */
export interface StatusGroup {
  key: string;
  title: string;
  step: OnboardingStep;
  progress: Progress;
}

/**
 * Step 5, "En verificación": every document with its state, the reason of a
 * rejection and what to do, with a link to the step where it is (re)sent.
 * The state is a pill with words, never only a color.
 */
export function DocumentStatusList({
  base,
  groups,
  readOnly = false,
}: {
  base: string;
  groups: readonly StatusGroup[];
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key} className="space-y-2" aria-label={group.title}>
          <h3 className="text-headline text-text">{group.title}</h3>
          <ul className="overflow-hidden border bg-cell">
            {group.progress.map((item) => (
              <li
                key={item.requirement.id}
                className={cn(
                  groupRow,
                  'flex flex-wrap items-start justify-between gap-3 px-4 py-3',
                )}
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-body text-text">{item.requirement.name}</p>
                  {item.state === 'rejected' && item.document?.review_notes && (
                    <p className="text-subhead text-red-text">{item.document.review_notes}</p>
                  )}
                  <p className="text-subhead text-text-dim">
                    {documentNextAction(item)}{' '}
                    {!readOnly && needsUpload(item) && (
                      <Link
                        href={onboardingStepHref(base, group.step)}
                        className="text-accent-text underline-offset-4 hover:underline"
                      >
                        {c.stepLink(signUpStepNumber(group.step))}
                      </Link>
                    )}
                  </p>
                </div>
                <StatusBadge state={item.state} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * Step 4 of a Coordinador who just joined by invitation (D43): the steps
 * (account, their profile, verification), what the step asks and the way to
 * their operators. Shown over the units of their business units, whose
 * readiness column is the state of each unit's documents.
 */
export function CoordinatorWelcome({ operatorsHref }: { operatorsHref: string }) {
  return (
    <section aria-label={c.label} className="mb-8 space-y-4 border bg-cell p-5">
      <Steps
        orientation="horizontal"
        label={c.label}
        steps={onboardingStepStates('coordinator', 'profile', { documents: [], profile: [] }).map(
          ({ step, state }) => ({
            label:
              state === 'current' ? (
                authCopy.signUp.steps[step]
              ) : (
                <span className="sr-only sm:not-sr-only">{authCopy.signUp.steps[step]}</span>
              ),
            // Verification is what comes next, never "done" from here.
            state: step === 'verification' ? 'upcoming' : state,
          }),
        )}
      />
      <div className="space-y-1">
        <h2 className="text-title3 text-text">{c.titles.profile}</h2>
        <p className="text-subhead text-text-dim">{c.descriptions.profile.coordinator}</p>
      </div>
      <Link href={operatorsHref} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
        {c.coordinator.operators}
      </Link>
    </section>
  );
}
