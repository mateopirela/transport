import { describe, expect, it } from 'vitest';

import { redirectFor, resolveArea, resolveRedirect, type ProfileSnapshot } from './routing';

const profile = (overrides: Partial<ProfileSnapshot>): ProfileSnapshot => ({
  role: 'manager',
  companyId: null,
  companyStatus: null,
  ...overrides,
});

const signedIn = (p: ProfileSnapshot | null, profileError = false) =>
  ({ status: 'signed_in', profile: p, profileError }) as const;

describe('resolveArea', () => {
  it('waits for the stored session and the profile', () => {
    expect(resolveArea({ status: 'loading' })).toBe('loading');
    expect(resolveArea(signedIn(null))).toBe('loading');
  });

  it('sends signed-out users to authentication', () => {
    expect(resolveArea({ status: 'signed_out' })).toBe('auth');
  });

  it('reports a profile that could not be loaded', () => {
    expect(resolveArea(signedIn(null, true))).toBe('problem');
  });

  it('asks a manager without a company to register it', () => {
    expect(resolveArea(signedIn(profile({ role: 'manager' })))).toBe('company_setup');
    expect(
      resolveArea(
        signedIn(profile({ role: 'manager', companyId: 'c1', companyStatus: 'pending_review' })),
      ),
    ).toBe('carrier');
  });

  it('opens the carrier area to a coordinator of a company, and the join screen otherwise', () => {
    expect(resolveArea(signedIn(profile({ role: 'coordinator' })))).toBe('join');
    expect(
      resolveArea(
        signedIn(profile({ role: 'coordinator', companyId: 'c1', companyStatus: 'approved' })),
      ),
    ).toBe('carrier');
  });

  it('asks an operator without a carrier to join with an invitation (D15)', () => {
    expect(resolveArea(signedIn(profile({ role: 'operator' })))).toBe('join');
    expect(resolveArea(signedIn(profile({ role: 'operator', companyId: 'c1' })))).toBe('operator');
  });

  it('keeps shippers and admins out of the mobile app (D06)', () => {
    expect(resolveArea(signedIn(profile({ role: 'shipper', companyId: 'c2' })))).toBe(
      'unsupported',
    );
    expect(resolveArea(signedIn(profile({ role: 'admin' })))).toBe('unsupported');
  });
});

describe('redirectFor', () => {
  it('never redirects while loading', () => {
    expect(redirectFor('loading', ['(carrier)', 'home'])).toBeNull();
  });

  it('lets signed-out users use sign-in, sign-up and the invitation screen', () => {
    expect(redirectFor('auth', ['(auth)', 'sign-in'])).toBeNull();
    expect(redirectFor('auth', ['(auth)', 'sign-up'])).toBeNull();
    expect(redirectFor('auth', ['invitacion'])).toBeNull();
    expect(redirectFor('auth', [])).toBe('/sign-in');
  });

  it('keeps signed-out users away from protected areas', () => {
    expect(redirectFor('auth', ['(carrier)', 'home'])).toBe('/sign-in');
    expect(redirectFor('auth', ['(operator)', 'trip'])).toBe('/sign-in');
    expect(redirectFor('auth', ['company'])).toBe('/sign-in');
  });

  it('keeps each role inside its own area', () => {
    expect(redirectFor('carrier', ['(operator)', 'trip'])).toBe('/home');
    expect(redirectFor('carrier', ['(auth)', 'sign-in'])).toBe('/home');
    expect(redirectFor('carrier', ['(carrier)', 'units'])).toBeNull();
    expect(redirectFor('operator', ['(carrier)', 'home'])).toBe('/trip');
    expect(redirectFor('operator', ['(operator)', 'account'])).toBeNull();
    expect(redirectFor('unsupported', ['(carrier)', 'home'])).toBe('/unsupported');
    expect(redirectFor('problem', [])).toBe('/problem');
  });

  it('sends users that must finish onboarding to the right step', () => {
    expect(redirectFor('company_setup', ['(carrier)', 'home'])).toBe('/company');
    expect(redirectFor('company_setup', ['company'])).toBeNull();
    expect(redirectFor('join', ['(operator)', 'trip'])).toBe('/invitacion');
    expect(redirectFor('join', ['invitacion'])).toBeNull();
  });

  it('always allows the e-mail confirmation callback', () => {
    expect(redirectFor('auth', ['auth', 'callback'])).toBeNull();
    expect(redirectFor('carrier', ['auth', 'callback'])).toBeNull();
  });

  it('leaves the kit sample screen alone (it only renders in development)', () => {
    expect(redirectFor('auth', ['dev', 'kit'])).toBeNull();
    expect(redirectFor('operator', ['dev', 'kit'])).toBeNull();
  });
});

describe('redirectFor: shared loads (G7)', () => {
  it('lets the carrier staff and the operators open a load shared with the team', () => {
    for (const area of ['carrier', 'operator'] as const) {
      expect(redirectFor(area, ['shared', 'abc'])).toBeNull();
      expect(redirectFor(area, ['compartido', 'abc'])).toBeNull();
    }
  });

  it('asks everyone else to sign in or finish joining first', () => {
    expect(redirectFor('auth', ['shared', 'abc'])).toBe('/sign-in');
    expect(redirectFor('join', ['compartido', 'abc'])).toBe('/invitacion');
    expect(redirectFor('company_setup', ['shared', 'abc'])).toBe('/company');
    expect(redirectFor('unsupported', ['shared', 'abc'])).toBe('/unsupported');
  });
});

describe('resolveRedirect: a shared load survives sign-in (G7)', () => {
  const token = 'Qm9vay1vZi1zaGFyZS10b2tlbnMtMzItYnl0ZXMtMDA';
  const shared = `/shared/${token}`;

  it('remembers the shared load while signed out and goes back to it after sign-in', () => {
    const opened = resolveRedirect('auth', ['shared', '[token]'], shared, null);
    expect(opened).toEqual({ target: '/sign-in', pending: shared });
    // On the sign-in screen it stays remembered.
    expect(resolveRedirect('auth', ['(auth)', 'sign-in'], '/sign-in', shared)).toEqual({
      target: null,
      pending: shared,
    });
    // Still loading the profile: wait.
    expect(resolveRedirect('loading', ['(auth)', 'sign-in'], '/sign-in', shared)).toEqual({
      target: null,
      pending: shared,
    });
    // Signed in as carrier staff or operator: back to the shared load.
    for (const area of ['carrier', 'operator'] as const) {
      expect(resolveRedirect(area, ['(auth)', 'sign-in'], '/sign-in', shared)).toEqual({
        target: shared,
        pending: shared,
      });
    }
    // Arrived: forgotten.
    expect(resolveRedirect('carrier', ['shared', '[token]'], shared, shared)).toEqual({
      target: null,
      pending: null,
    });
  });

  it('keeps the deep link form too', () => {
    const deep = `/compartido/${token}`;
    expect(resolveRedirect('auth', ['compartido', '[token]'], deep, null).pending).toBe(deep);
  });

  it('waits while the user cannot open it yet and ignores malformed paths', () => {
    expect(resolveRedirect('join', ['(auth)', 'sign-in'], '/sign-in', shared)).toEqual({
      target: '/invitacion',
      pending: shared,
    });
    expect(resolveRedirect('auth', ['shared', '[token]'], '/shared/nope', null)).toEqual({
      target: '/sign-in',
      pending: null,
    });
    expect(resolveRedirect('carrier', ['(carrier)', 'home'], '/home', null)).toEqual({
      target: null,
      pending: null,
    });
  });
});
