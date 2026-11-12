import type { OnboardingStep } from '@transport/shared';
import { useState } from 'react';

/**
 * The step shown on an onboarding screen (R3): the step in course when the
 * data first loads (`initial`), then kept until the person moves with
 * "Regresar" or "Siguiente". Uploads reload the data, and a step that
 * followed the data would jump ahead (skipping step 4, or the optional power
 * of attorney) as soon as the last required document of a step is sent.
 * Before the data loads it shows `fallback`.
 */
export function useOnboardingStep(
  initial: OnboardingStep | null,
  fallback: OnboardingStep,
): [OnboardingStep, (step: OnboardingStep) => void] {
  const [chosen, setChosen] = useState<OnboardingStep | null>(null);
  // Settled once, during render (not in an effect), so no frame shows another step.
  if (chosen === null && initial !== null) setChosen(initial);
  return [chosen ?? initial ?? fallback, setChosen];
}
