import { describe, expect, it } from 'vitest';

import { onboardingStepsCopy } from './copy/onboarding-steps';
import {
  adjacentOnboardingSteps,
  currentOnboardingStep,
  documentNextAction,
  onboardingProfileOf,
  onboardingStepsOf,
  onboardingStepStates,
  parseOnboardingStep,
  signUpStepNumber,
  splitCompanyProgress,
  verificationSummary,
  type StepItem,
} from './onboarding';
import type { RequirementState } from './verification';

function item(code: string, state: RequirementState, required = true): StepItem {
  return { requirement: { code, is_required: required }, state };
}

describe('onboardingProfileOf', () => {
  it('names the five profiles of §0.2', () => {
    expect(onboardingProfileOf('shipper', false)).toBe('shipper');
    expect(onboardingProfileOf('manager', false)).toBe('manager');
    expect(onboardingProfileOf('manager', true)).toBe('owner_operator');
    expect(onboardingProfileOf('coordinator', false)).toBe('coordinator');
    expect(onboardingProfileOf('operator', false)).toBe('operator');
    expect(onboardingProfileOf('admin', false)).toBeNull();
  });
});

describe('onboardingStepsOf', () => {
  it('gives the companies the five steps and the invited profiles 1, 4 and 5 (D43)', () => {
    for (const profile of ['shipper', 'manager', 'owner_operator'] as const) {
      expect(onboardingStepsOf(profile)).toEqual([
        'account',
        'fiscal',
        'documents',
        'profile',
        'verification',
      ]);
    }
    for (const profile of ['coordinator', 'operator'] as const) {
      expect(onboardingStepsOf(profile)).toEqual(['account', 'profile', 'verification']);
    }
  });
});

describe('splitCompanyProgress', () => {
  it('puts the constancia, the INE and the power of attorney in step 3, the rest in step 4', () => {
    const { common, own } = splitCompanyProgress([
      item('tax_status_certificate', 'missing'),
      item('legal_representative_id', 'approved'),
      item('power_of_attorney', 'missing', false),
      item('cargo_insurance_policy', 'missing', false),
    ]);
    expect(common.map((i) => i.requirement.code)).toEqual([
      'tax_status_certificate',
      'legal_representative_id',
      'power_of_attorney',
    ]);
    expect(own.map((i) => i.requirement.code)).toEqual(['cargo_insurance_policy']);
  });
});

describe('currentOnboardingStep', () => {
  const sent = [
    item('tax_status_certificate', 'pending_review'),
    item('legal_representative_id', 'approved'),
  ];

  it('starts at step 3 while a required common document needs an upload', () => {
    expect(
      currentOnboardingStep('shipper', {
        documents: [item('tax_status_certificate', 'missing')],
        profile: [],
      }),
    ).toBe('documents');
    expect(
      currentOnboardingStep('manager', {
        documents: [item('legal_representative_id', 'rejected')],
        profile: [],
      }),
    ).toBe('documents');
    expect(
      currentOnboardingStep('owner_operator', {
        documents: [item('legal_representative_id', 'expired')],
        profile: [],
      }),
    ).toBe('documents');
  });

  it('ignores optional documents', () => {
    expect(
      currentOnboardingStep('shipper', {
        documents: [...sent, item('power_of_attorney', 'missing', false)],
        profile: [item('cargo_insurance_policy', 'missing', false)],
      }),
    ).toBe('verification');
  });

  it('goes to step 4 when the profile still misses something, documents or a truck', () => {
    expect(
      currentOnboardingStep('owner_operator', {
        documents: sent,
        profile: [item('operator_selfie', 'missing')],
      }),
    ).toBe('profile');
    expect(
      currentOnboardingStep('owner_operator', { documents: sent, profile: [], profileExtras: 1 }),
    ).toBe('profile');
  });

  it('starts invited profiles at step 4, whatever the company documents say', () => {
    expect(
      currentOnboardingStep('operator', {
        documents: [item('tax_status_certificate', 'missing')],
        profile: [item('operator_selfie', 'missing')],
      }),
    ).toBe('profile');
    expect(currentOnboardingStep('coordinator', { documents: [], profile: [] })).toBe(
      'verification',
    );
  });

  it('ends at "En verificación" once everything was sent', () => {
    expect(
      currentOnboardingStep('operator', {
        documents: [],
        profile: [item('operator_selfie', 'pending_review')],
      }),
    ).toBe('verification');
  });
});

describe('parseOnboardingStep', () => {
  it('reads steps 3 to 5 as the person sees them', () => {
    expect(parseOnboardingStep('3', 'shipper')).toBe('documents');
    expect(parseOnboardingStep('4', 'shipper')).toBe('profile');
    expect(parseOnboardingStep(['5'], 'manager')).toBe('verification');
  });

  it('refuses the form steps, other values and step 3 for invited profiles', () => {
    expect(parseOnboardingStep('1', 'shipper')).toBeNull();
    expect(parseOnboardingStep('2', 'shipper')).toBeNull();
    expect(parseOnboardingStep('6', 'shipper')).toBeNull();
    expect(parseOnboardingStep('documents', 'shipper')).toBeNull();
    expect(parseOnboardingStep(undefined, 'shipper')).toBeNull();
    expect(parseOnboardingStep('3', 'operator')).toBeNull();
    expect(parseOnboardingStep('4', 'operator')).toBe('profile');
  });

  it('round-trips with signUpStepNumber', () => {
    expect(signUpStepNumber('documents')).toBe(3);
    expect(parseOnboardingStep(String(signUpStepNumber('verification')), 'coordinator')).toBe(
      'verification',
    );
  });
});

describe('onboardingStepStates', () => {
  it('marks the form steps done, the viewed one current and 3–4 by what they ask', () => {
    const states = onboardingStepStates('shipper', 'verification', {
      documents: [item('tax_status_certificate', 'missing')],
      profile: [],
    });
    expect(states).toEqual([
      { step: 'account', state: 'done' },
      { step: 'fiscal', state: 'done' },
      { step: 'documents', state: 'upcoming' },
      { step: 'profile', state: 'done' },
      { step: 'verification', state: 'current' },
    ]);
  });

  it('shows three steps to an invited operator', () => {
    expect(
      onboardingStepStates('operator', 'profile', { documents: [], profile: [] }).map(
        (s) => s.state,
      ),
    ).toEqual(['done', 'current', 'upcoming']);
  });
});

describe('adjacentOnboardingSteps', () => {
  it('walks steps 3 to 5, or 4 to 5 for invited profiles', () => {
    expect(adjacentOnboardingSteps('shipper', 'documents')).toEqual({
      previous: null,
      next: 'profile',
    });
    expect(adjacentOnboardingSteps('shipper', 'verification')).toEqual({
      previous: 'profile',
      next: null,
    });
    expect(adjacentOnboardingSteps('operator', 'profile')).toEqual({
      previous: null,
      next: 'verification',
    });
  });
});

describe('documentNextAction and verificationSummary', () => {
  it('says what to do with each document', () => {
    expect(documentNextAction(item('x', 'rejected'))).toBe(onboardingStepsCopy.nextAction.rejected);
    expect(documentNextAction(item('x', 'missing', false))).toBe(
      onboardingStepsCopy.optionalMissing,
    );
    expect(documentNextAction(item('x', 'missing'))).toBe(onboardingStepsCopy.nextAction.missing);
  });

  it('counts only the required documents', () => {
    expect(
      verificationSummary([
        item('a', 'approved'),
        item('b', 'missing'),
        item('c', 'rejected'),
        item('d', 'missing', false),
      ]),
    ).toEqual({ approved: 1, total: 3, todo: 2, message: onboardingStepsCopy.summary.todo(2) });
    expect(verificationSummary([item('a', 'approved'), item('b', 'pending_review')]).message).toBe(
      onboardingStepsCopy.summary.inReview,
    );
    expect(verificationSummary([item('a', 'approved')]).message).toBe(
      onboardingStepsCopy.summary.done,
    );
  });
});
