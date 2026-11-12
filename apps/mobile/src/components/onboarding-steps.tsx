import {
  authCopy,
  documentNextAction,
  needsUpload,
  onboardingStepsCopy as copy,
  onboardingStepsOf,
  requirementStateLabels,
  requirementStateTone,
  verificationSummary,
  type OnboardingProfile,
  type OnboardingStep,
} from '@transport/shared';

import type { StatusGroup } from '../lib/onboarding';
import { StatusRow } from './status-row';
import { Group, Notice, SectionHeader, Steps } from './ui';

/**
 * The steps of D42 the profile goes through (five, or three for an invited
 * one) with `viewed` in course. The names stay out of sight on a phone, as in
 * the sign-up (R2): the bar and "Paso n de m" with the title say where it is.
 */
export function OnboardingStepsBar({
  profile,
  viewed,
}: {
  profile: OnboardingProfile;
  viewed: OnboardingStep;
}) {
  const steps = onboardingStepsOf(profile);
  return (
    <Steps
      steps={steps.map((step) => ({ label: authCopy.signUp.steps[step] }))}
      current={steps.indexOf(viewed)}
      title={copy.titles[viewed]}
      labels={false}
    />
  );
}

/**
 * Step 5, "En verificación": the summary, then every document with its state
 * in words (never only a color), the reason of a rejection and what to do.
 * Tapping one that needs an upload goes to the step where it is sent.
 */
export function OnboardingStatus({
  groups,
  onOpenStep,
}: {
  groups: readonly StatusGroup[];
  onOpenStep: (step: OnboardingStep) => void;
}) {
  const summary = verificationSummary(groups.flatMap((group) => group.progress));
  return (
    <>
      <Notice tone={summary.todo > 0 ? 'warning' : 'info'}>{summary.message}</Notice>
      {groups.map((group) => (
        <StatusGroupSection key={group.key} group={group} onOpenStep={onOpenStep} />
      ))}
    </>
  );
}

function StatusGroupSection({
  group,
  onOpenStep,
}: {
  group: StatusGroup;
  onOpenStep: (step: OnboardingStep) => void;
}) {
  return (
    <>
      <SectionHeader title={group.title} />
      <Group>
        {group.progress.map((item) => (
          <StatusRow
            key={item.requirement.id}
            title={item.requirement.name}
            lines={[
              item.state === 'rejected' ? item.document?.review_notes : null,
              documentNextAction(item),
            ]}
            pill={{
              label: requirementStateLabels[item.state],
              tone: requirementStateTone(item.state),
            }}
            onPress={needsUpload(item) ? () => onOpenStep(group.step) : undefined}
          />
        ))}
      </Group>
    </>
  );
}
