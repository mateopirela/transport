import type { OnboardingStep } from '@transport/shared';
import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { useOnboardingStep } from './use-onboarding-step';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// react-test-renderer warns that it is deprecated on every render; nothing else is silenced.
const consoleError = console.error;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('react-test-renderer is deprecated')) return;
    consoleError(...args);
  });
});
afterAll(() => vi.restoreAllMocks());

let shown: OnboardingStep | undefined;
let move: ((step: OnboardingStep) => void) | undefined;

function report(step: OnboardingStep, setStep: (step: OnboardingStep) => void): void {
  shown = step;
  move = setStep;
}

function Probe({ initial }: { initial: OnboardingStep | null }) {
  const [step, setStep] = useOnboardingStep(initial, 'documents');
  report(step, setStep);
  return null;
}

function mount(initial: OnboardingStep | null): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(<Probe initial={initial} />);
  });
  if (!renderer) throw new Error('not rendered');
  return renderer;
}

describe('useOnboardingStep (R3)', () => {
  it('shows the fallback until the data loads, then the step in course', () => {
    const renderer = mount(null);
    expect(shown).toBe('documents');
    act(() => renderer.update(<Probe initial="profile" />));
    expect(shown).toBe('profile');
  });

  it('keeps the step when an upload changes the step in course', () => {
    const renderer = mount('documents');
    expect(shown).toBe('documents');
    // The last required company document was sent: the data now says 5.
    act(() => renderer.update(<Probe initial="verification" />));
    expect(shown).toBe('documents');
  });

  it('moves only when the person does', () => {
    const renderer = mount('documents');
    act(() => move?.('profile'));
    expect(shown).toBe('profile');
    act(() => renderer.update(<Probe initial="verification" />));
    expect(shown).toBe('profile');
  });
});
