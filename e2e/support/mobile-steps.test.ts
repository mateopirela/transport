import { describe, expect, it } from 'vitest';

import { firstStepFor, selectSteps, type MobileStep } from './mobile-steps';

// The shape of scripts/e2e-mobile.mjs: a flow, a chain of set-up steps and
// flows (load -> offer -> accepted -> trip), and a pair (24 -> 25).
const STEPS: MobileStep[] = [
  { name: '01-carrier-offer' },
  { name: 'shipper-accepts', needs: '01-carrier-offer' },
  { name: '08-operator-invite' },
  { name: 'owner-operator-load' },
  { name: '13-owner-operator-offer', needs: 'owner-operator-load' },
  { name: 'owner-operator-accepted', needs: '13-owner-operator-offer' },
  { name: '14-owner-operator-trip', needs: 'owner-operator-accepted' },
  { name: '24-carrier-sign-up-steps' },
  { name: 'confirm-carrier-sign-up' },
  { name: '25-carrier-sign-up-confirm', needs: '24-carrier-sign-up-steps' },
];

const names = (steps: MobileStep[]) => steps.map((step) => step.name);

describe('selectSteps', () => {
  it('runs everything without --from or --only', () => {
    expect(names(selectSteps(STEPS, { reset: true }))).toEqual(names(STEPS));
  });

  it('runs a selected step after its whole chain of set-up on a fresh seed', () => {
    expect(names(selectSteps(STEPS, { only: ['14-owner-operator-trip'], reset: true }))).toEqual([
      'owner-operator-load',
      '13-owner-operator-offer',
      'owner-operator-accepted',
      '14-owner-operator-trip',
    ]);
  });

  it('keeps what lies between a step and what it needs', () => {
    expect(
      names(selectSteps(STEPS, { only: ['25-carrier-sign-up-confirm'], reset: true })),
    ).toEqual([
      '24-carrier-sign-up-steps',
      'confirm-carrier-sign-up',
      '25-carrier-sign-up-confirm',
    ]);
  });

  it('joins several selections in the order of the run, each step once', () => {
    expect(
      names(
        selectSteps(STEPS, {
          only: ['25-carrier-sign-up-confirm', '08-operator-invite', '24-carrier-sign-up-steps'],
          reset: true,
        }),
      ),
    ).toEqual([
      '08-operator-invite',
      '24-carrier-sign-up-steps',
      'confirm-carrier-sign-up',
      '25-carrier-sign-up-confirm',
    ]);
  });

  it('starts --from at the first step of the chain on a fresh seed', () => {
    expect(names(selectSteps(STEPS, { from: '14-owner-operator-trip', reset: true }))).toEqual([
      'owner-operator-load',
      '13-owner-operator-offer',
      'owner-operator-accepted',
      '14-owner-operator-trip',
      '24-carrier-sign-up-steps',
      'confirm-carrier-sign-up',
      '25-carrier-sign-up-confirm',
    ]);
  });

  it('with --no-reset, repeats only the step it needs: the earlier set-up is still there', () => {
    expect(names(selectSteps(STEPS, { from: '14-owner-operator-trip', reset: false }))).toEqual([
      'owner-operator-accepted',
      '14-owner-operator-trip',
      '24-carrier-sign-up-steps',
      'confirm-carrier-sign-up',
      '25-carrier-sign-up-confirm',
    ]);
    expect(names(selectSteps(STEPS, { only: ['14-owner-operator-trip'], reset: false }))).toEqual([
      'owner-operator-accepted',
      '14-owner-operator-trip',
    ]);
  });

  it('starts at a step that needs nothing', () => {
    expect(names(selectSteps(STEPS, { from: '24-carrier-sign-up-steps', reset: true }))).toEqual([
      '24-carrier-sign-up-steps',
      'confirm-carrier-sign-up',
      '25-carrier-sign-up-confirm',
    ]);
  });

  it('stops on an unknown step, an empty --only or both options', () => {
    expect(() => selectSteps(STEPS, { only: ['99-nope'], reset: true })).toThrow(
      /unknown step 99-nope/u,
    );
    expect(() => selectSteps(STEPS, { from: '99-nope', reset: true })).toThrow(/unknown step/u);
    expect(() => selectSteps(STEPS, { only: [], reset: true })).toThrow(/--only needs/u);
    expect(() =>
      selectSteps(STEPS, { from: '08-operator-invite', only: ['08-operator-invite'], reset: true }),
    ).toThrow(/not both/u);
  });
});

describe('firstStepFor', () => {
  it('stops on a step that needs a later one or itself (no loops)', () => {
    const backwards: MobileStep[] = [{ name: 'a', needs: 'b' }, { name: 'b' }];
    expect(() => firstStepFor(backwards, 0, true)).toThrow(/needs a later step: b/u);
    const itself: MobileStep[] = [{ name: 'a', needs: 'a' }];
    expect(() => firstStepFor(itself, 0, true)).toThrow(/needs a later step/u);
  });

  it('names an unknown step that is needed', () => {
    expect(() => firstStepFor([{ name: 'a', needs: 'ghost' }], 0, true)).toThrow(
      /unknown step ghost/u,
    );
  });
});
