import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_STEPS,
  accountBlock,
  accountChecklist,
  accountStepsOf,
  accountUploadsLeft,
  APPROVAL_GATED_ACTIONS,
  companyContactFromAccount,
  isCompanyNotApprovedError,
  type AccountProgress,
} from './account-checklist';
import { accountBlockCopy, accountChecklistCopy } from './copy/access';
import { VERIFICATION_STATUSES } from './enums';
import { ONBOARDING_PROFILES, type StepItem, type StepWork } from './onboarding';
import type { RequirementState } from './verification';

function item(code: string, state: RequirementState, required = true): StepItem {
  return { requirement: { code, is_required: required }, state };
}

const nothingSent: StepWork = {
  documents: [
    item('tax_status_certificate', 'missing'),
    item('legal_representative_id', 'missing'),
  ],
  profile: [item('cargo_insurance_policy', 'missing', false)],
};
const allSent: StepWork = {
  documents: [
    item('tax_status_certificate', 'pending_review'),
    item('legal_representative_id', 'approved'),
  ],
  profile: [],
};

function states(progress: AccountProgress) {
  return accountChecklist(progress).items.map(({ step, state }) => `${step}:${state}`);
}

describe('accountStepsOf', () => {
  it('gives the four steps of D42 after the account to whoever registers a company', () => {
    expect(ACCOUNT_STEPS).toEqual(['fiscal', 'documents', 'profile', 'verification']);
    for (const profile of ['shipper', 'manager', 'owner_operator'] as const) {
      expect(accountStepsOf(profile)).toEqual(ACCOUNT_STEPS);
    }
  });

  it('gives an invited profile only its own step and the verification (D43)', () => {
    expect(accountStepsOf('coordinator')).toEqual(['profile', 'verification']);
    expect(accountStepsOf('operator')).toEqual(['profile', 'verification']);
  });
});

describe('accountChecklist', () => {
  it('starts with the fiscal data while the account has no company', () => {
    const list = accountChecklist({ profile: 'shipper', companyStatus: null });
    expect(states({ profile: 'shipper', companyStatus: null })).toEqual([
      'fiscal:current',
      'documents:upcoming',
      'profile:upcoming',
      'verification:upcoming',
    ]);
    expect(list.current).toBe('fiscal');
    expect(list).toMatchObject({ done: 0, total: 4, status: 'incomplete', pending: true });
    expect(list.next).toBe(accountChecklistCopy.next.fiscal);
    expect(list.items.map((i) => i.number)).toEqual([1, 2, 3, 4]);
    expect(list.items.map((i) => i.label)).toEqual([
      accountChecklistCopy.steps.fiscal,
      accountChecklistCopy.steps.documents,
      accountChecklistCopy.steps.profile,
      accountChecklistCopy.steps.verification,
    ]);
  });

  it('does not count documents as done before there is a company to upload to', () => {
    // Without a company the work is empty, which must not read as "nothing left".
    expect(
      states({ profile: 'manager', companyStatus: null, work: { documents: [], profile: [] } }),
    ).toEqual([
      'fiscal:current',
      'documents:upcoming',
      'profile:upcoming',
      'verification:upcoming',
    ]);
  });

  it('moves to the documents once the fiscal data are in', () => {
    const progress: AccountProgress = {
      profile: 'shipper',
      companyStatus: 'pending_review',
      work: nothingSent,
    };
    expect(states(progress)).toEqual([
      'fiscal:done',
      'documents:current',
      'profile:done',
      'verification:upcoming',
    ]);
    expect(accountChecklist(progress)).toMatchObject({
      current: 'documents',
      done: 2,
      status: 'incomplete',
      pending: true,
    });
  });

  it('goes to the profile step when only that is missing (the hombre-camión without a truck)', () => {
    const progress: AccountProgress = {
      profile: 'owner_operator',
      companyStatus: 'pending_review',
      work: { ...allSent, profileExtras: 1 },
    };
    expect(accountChecklist(progress).current).toBe('profile');
    expect(states(progress)).toEqual([
      'fiscal:done',
      'documents:done',
      'profile:current',
      'verification:upcoming',
    ]);
  });

  it('is "en revisión" when nothing is left to send and the company waits for the admin', () => {
    const list = accountChecklist({
      profile: 'shipper',
      companyStatus: 'pending_review',
      work: allSent,
    });
    expect(list).toMatchObject({
      current: 'verification',
      status: 'in_review',
      done: 3,
      total: 4,
      pending: true,
    });
    expect(list.items.at(-1)).toMatchObject({ step: 'verification', state: 'current' });
  });

  it('is done, and leaves the panel, only when the company is approved', () => {
    const list = accountChecklist({ profile: 'shipper', companyStatus: 'approved', work: allSent });
    expect(list).toMatchObject({ status: 'approved', done: 4, total: 4, pending: false });
    expect(list.items.every((i) => i.state === 'done')).toBe(true);
  });

  it('comes back for an approved company that must send something again', () => {
    const list = accountChecklist({
      profile: 'manager',
      companyStatus: 'approved',
      work: { documents: [item('legal_representative_id', 'expired')], profile: [] },
    });
    expect(list).toMatchObject({ current: 'documents', status: 'incomplete', pending: true });
  });

  it('says rejected, expired or suspended before anything else', () => {
    for (const status of ['rejected', 'expired', 'suspended'] as const) {
      expect(
        accountChecklist({ profile: 'manager', companyStatus: status, work: nothingSent }).status,
      ).toBe(status);
      const list = accountChecklist({ profile: 'manager', companyStatus: status, work: allSent });
      expect(list).toMatchObject({ status, current: 'verification', pending: true });
    }
  });

  it('gives an invited profile two steps, numbered from 1', () => {
    const list = accountChecklist({
      profile: 'operator',
      companyStatus: 'approved',
      work: { documents: [], profile: [item('operator_selfie', 'missing')] },
    });
    expect(list.items.map((i) => `${i.number}:${i.step}:${i.state}`)).toEqual([
      '1:profile:current',
      '2:verification:done',
    ]);
    expect(list).toMatchObject({ total: 2, done: 1, status: 'incomplete', pending: true });
  });

  it('has a status line, a step label and a next action for every case', () => {
    for (const profile of ONBOARDING_PROFILES) {
      for (const companyStatus of [null, ...VERIFICATION_STATUSES]) {
        const list = accountChecklist({ profile, companyStatus, work: nothingSent });
        expect(accountChecklistCopy.status[list.status]).toBeTruthy();
        expect(list.next).toBeTruthy();
        expect(list.items.filter((i) => i.state === 'current').length).toBeLessThanOrEqual(1);
        expect(list.done).toBe(list.items.filter((i) => i.state === 'done').length);
        expect(list.pending).toBe(list.done < list.total);
      }
    }
  });
});

describe('accountUploadsLeft', () => {
  it('counts the required documents to (re)send and what is not a document', () => {
    expect(accountUploadsLeft(undefined)).toBe(0);
    expect(accountUploadsLeft(nothingSent)).toBe(2);
    expect(accountUploadsLeft(allSent)).toBe(0);
    expect(
      accountUploadsLeft({
        documents: [item('a', 'rejected'), item('b', 'expired'), item('c', 'approved')],
        profile: [item('d', 'missing'), item('e', 'missing', false)],
        profileExtras: 2,
      }),
    ).toBe(5);
  });
});

describe('accountBlock (D48)', () => {
  it('blocks nothing for an approved company', () => {
    for (const action of APPROVAL_GATED_ACTIONS) {
      expect(accountBlock(action, { profile: 'shipper', companyStatus: 'approved' })).toBeNull();
    }
  });

  it('blocks every gated action for every other state, with a reason', () => {
    for (const action of APPROVAL_GATED_ACTIONS) {
      for (const companyStatus of [null, ...VERIFICATION_STATUSES]) {
        if (companyStatus === 'approved') continue;
        const block = accountBlock(action, { profile: 'manager', companyStatus, work: allSent });
        expect(block, `${action} / ${companyStatus}`).not.toBeNull();
        expect(block?.reason).toContain(accountBlockCopy.actions[action]);
      }
    }
  });

  it('sends an account without a company to its fiscal data', () => {
    expect(accountBlock('publish_load', { profile: 'shipper', companyStatus: null })).toEqual({
      reason: accountBlockCopy.reason.no_company(accountBlockCopy.actions.publish_load),
      step: 'fiscal',
    });
  });

  it('says what is missing while in review', () => {
    expect(
      accountBlock('make_offer', {
        profile: 'manager',
        companyStatus: 'pending_review',
        work: nothingSent,
      }),
    ).toEqual({
      reason: accountBlockCopy.reason.incomplete(accountBlockCopy.actions.make_offer),
      step: 'documents',
    });
    expect(
      accountBlock('assign_trip', {
        profile: 'manager',
        companyStatus: 'pending_review',
        work: allSent,
      }),
    ).toEqual({
      reason: accountBlockCopy.reason.in_review(accountBlockCopy.actions.assign_trip),
      step: 'verification',
    });
  });

  it('names a rejection, an expiry and a suspension', () => {
    for (const status of ['rejected', 'expired', 'suspended'] as const) {
      expect(
        accountBlock('recommendations', {
          profile: 'manager',
          companyStatus: status,
          work: allSent,
        })?.reason,
      ).toBe(accountBlockCopy.reason[status](accountBlockCopy.actions.recommendations));
    }
  });
});

describe('isCompanyNotApprovedError', () => {
  it('recognizes what the RPCs raise for a company that is not approved', () => {
    expect(isCompanyNotApprovedError({ message: 'company is not approved' })).toBe(true);
    expect(isCompanyNotApprovedError({ message: 'Company is not approved' })).toBe(true);
    expect(
      isCompanyNotApprovedError({ message: 'both companies must be approved to contract' }),
    ).toBe(true);
  });

  it('is false for anything else', () => {
    expect(isCompanyNotApprovedError({ message: 'load not found' })).toBe(false);
    expect(isCompanyNotApprovedError({ message: null })).toBe(false);
    expect(isCompanyNotApprovedError({})).toBe(false);
    expect(isCompanyNotApprovedError(null)).toBe(false);
    expect(isCompanyNotApprovedError(undefined)).toBe(false);
  });
});

describe('companyContactFromAccount (D50-1)', () => {
  it('uses the name, phone and email of the account', () => {
    expect(
      companyContactFromAccount({
        fullName: ' Ana Pérez ',
        phone: '+528112345678',
        email: ' Ana@Empresa.MX ',
      }),
    ).toEqual({
      contactName: 'Ana Pérez',
      contactPhone: '+528112345678',
      contactEmail: 'ana@empresa.mx',
    });
  });

  it('leaves empty what the account does not have, and never the synthetic email of a phone', () => {
    expect(companyContactFromAccount({})).toEqual({
      contactName: '',
      contactPhone: '',
      contactEmail: '',
    });
    expect(
      companyContactFromAccount({ fullName: null, email: '528112345678@tel.transport.invalid' })
        .contactEmail,
    ).toBe('');
  });
});
