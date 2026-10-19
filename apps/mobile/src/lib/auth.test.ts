import { describe, expect, it, vi } from 'vitest';

import { createAuthActions, type AuthBackend, type PendingInvitationStore } from './auth';
import { toErrorKey } from './errors';

function setup(overrides: Partial<AuthBackend> = {}) {
  let stored: string | null = null;
  const pending: PendingInvitationStore = {
    get: vi.fn(async () => stored),
    set: vi.fn(async (token: string) => {
      stored = token;
    }),
    clear: vi.fn(async () => {
      stored = null;
    }),
  };
  const backend: AuthBackend = {
    signIn: vi.fn(async () => ({ error: null })),
    signUp: vi.fn(async () => ({ error: null, hasSession: false })),
    signOut: vi.fn(async () => ({ error: null })),
    exchangeCode: vi.fn(async () => ({ error: null })),
    acceptCoordinatorInvitation: vi.fn(async () => ({ error: null })),
    redeemInvitation: vi.fn(async () => ({ error: null, kind: 'operator' as const })),
    registerCompany: vi.fn(async () => ({ error: null })),
    updatePhone: vi.fn(async () => ({ error: null })),
    ...overrides,
  };
  const actions = createAuthActions(backend, pending, { redirectTo: 'transport://auth/callback' });
  return { actions, backend, pending, stored: () => stored };
}

const TOKEN = 'T'.repeat(42) + '_';

const coordinator = {
  token: TOKEN,
  email: 'coord@x.mx',
  password: 'camion2026',
  fullName: 'Andrea',
  phone: '+528112345678',
};

const carrier = {
  kind: 'carrier' as const,
  email: 'c@x.mx',
  password: 'camion2026',
  fullName: 'Ana',
  phone: '+528112345678',
};

describe('signIn', () => {
  it('maps Supabase errors to Spanish copy keys', async () => {
    const { actions } = setup({
      signIn: async () => ({
        error: { name: 'AuthApiError', code: 'invalid_credentials', status: 400 },
      }),
    });
    expect(await actions.signIn('a@b.mx', 'x')).toEqual({ ok: false, error: 'invalidCredentials' });
  });
});

describe('signUpCarrier', () => {
  it('signs up with the manager role, the kind and the confirmation deep link', async () => {
    const { actions, backend } = setup();
    const result = await actions.signUpCarrier({ ...carrier, kind: 'owner_operator' });
    expect(result).toEqual({ ok: true, value: 'check_email' });
    expect(backend.signUp).toHaveBeenCalledWith({
      email: 'c@x.mx',
      password: 'camion2026',
      redirectTo: 'transport://auth/callback',
      metadata: {
        role: 'manager',
        full_name: 'Ana',
        phone: '+528112345678',
        pending_company_kind: 'owner_operator',
      },
    });
  });

  it('drops a leftover invitation token from an unfinished sign-up', async () => {
    const { actions, pending, stored } = setup();
    await pending.set(TOKEN);
    await actions.signUpCarrier(carrier);
    expect(stored()).toBeNull();
  });
});

describe('signUpCoordinator (G1b)', () => {
  it('keeps the token until the e-mail is confirmed', async () => {
    const { actions, backend, stored } = setup();
    expect(await actions.signUpCoordinator(coordinator)).toEqual({
      ok: true,
      value: 'check_email',
    });
    expect(stored()).toBe(TOKEN);
    expect(backend.acceptCoordinatorInvitation).not.toHaveBeenCalled();
    expect(vi.mocked(backend.signUp).mock.calls[0]?.[0].metadata).toEqual({
      role: 'coordinator',
      full_name: 'Andrea',
      phone: '+528112345678',
    });
  });

  it('forgets the token when the sign-up fails', async () => {
    const { actions, stored } = setup({
      signUp: async () => ({ error: { code: 'weak_password' }, hasSession: false }),
    });
    expect(await actions.signUpCoordinator(coordinator)).toEqual({
      ok: false,
      error: 'weakPassword',
    });
    expect(stored()).toBeNull();
  });
});

describe('redeemOperatorInvitation (D15-E1)', () => {
  const input = {
    token: TOKEN,
    fullName: 'Iván',
    phone: '+528110000013',
    password: 'camion2026',
  };

  it('redeems through the Edge Function and signs in with the phone', async () => {
    const { actions, backend } = setup();
    expect(await actions.redeemOperatorInvitation(input)).toEqual({ ok: true, value: 'signed_in' });
    expect(backend.redeemInvitation).toHaveBeenCalledWith(input);
    expect(backend.signIn).toHaveBeenCalledWith('528110000013@tel.transport.invalid', 'camion2026');
  });

  it('reports a redeemed account whose first sign-in failed', async () => {
    const { actions } = setup({ signIn: async () => ({ error: { message: 'Network' } }) });
    expect(await actions.redeemOperatorInvitation(input)).toEqual({ ok: true, value: 'redeemed' });
  });

  it('maps the JSON errors of the Edge Function', async () => {
    const { actions, backend } = setup({
      redeemInvitation: async () => ({
        error: { name: 'EdgeFunctionError', status: 409, code: 'phone_taken' },
        kind: null,
      }),
    });
    expect(await actions.redeemOperatorInvitation(input)).toEqual({
      ok: false,
      error: 'phoneTaken',
    });
    expect(backend.signIn).not.toHaveBeenCalled();
  });
});

describe('redeemAccessReset', () => {
  it('only sends the token and the new password', async () => {
    const { actions, backend } = setup();
    expect(await actions.redeemAccessReset({ token: TOKEN, password: 'nueva2026' })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(backend.redeemInvitation).toHaveBeenCalledWith({ token: TOKEN, password: 'nueva2026' });
  });
});

describe('rememberInvitation', () => {
  it('keeps the token for an existing coordinator who signs in instead', async () => {
    const { actions, backend, stored } = setup();
    expect(await actions.rememberInvitation(TOKEN)).toEqual({ ok: true, value: undefined });
    expect(stored()).toBe(TOKEN);
    await actions.signIn('coord@x.mx', 'camion2026');
    const accepted = await actions.acceptPendingInvitation();
    expect(accepted?.result.ok).toBe(true);
    expect(backend.acceptCoordinatorInvitation).toHaveBeenCalledWith(TOKEN);
  });
});

describe('acceptPendingInvitation', () => {
  it('does nothing without a stored code', async () => {
    const { actions, backend } = setup();
    expect(await actions.acceptPendingInvitation()).toBeNull();
    expect(backend.acceptCoordinatorInvitation).not.toHaveBeenCalled();
  });

  it('accepts the stored code once and clears it', async () => {
    const { actions, backend, pending, stored } = setup();
    await pending.set(TOKEN);
    expect(await actions.acceptPendingInvitation()).toEqual({
      token: TOKEN,
      result: { ok: true, value: undefined },
    });
    expect(backend.acceptCoordinatorInvitation).toHaveBeenCalledWith(TOKEN);
    expect(stored()).toBeNull();
  });

  it('drops codes that can never succeed', async () => {
    for (const message of [
      'invalid or expired invitation',
      'only coordinator accounts can accept this invitation',
      'user already belongs to a company',
    ]) {
      const { actions, pending, stored } = setup({
        acceptCoordinatorInvitation: async () => ({ error: { code: '22023', message } }),
      });
      await pending.set(TOKEN);
      const result = await actions.acceptPendingInvitation();
      expect(result?.result.ok).toBe(false);
      expect(stored()).toBeNull();
    }
  });

  it('keeps the code after a network error so it can be retried', async () => {
    const { actions, pending, stored } = setup({
      acceptCoordinatorInvitation: async () => ({
        error: { name: 'TypeError', message: 'Network request failed' },
      }),
    });
    await pending.set(TOKEN);
    expect(await actions.acceptPendingInvitation()).toEqual({
      token: TOKEN,
      result: { ok: false, error: 'network' },
    });
    expect(stored()).toBe(TOKEN);
  });
});

describe('secure storage failures', () => {
  const broken = (store: Partial<PendingInvitationStore>) => {
    const { backend } = setup();
    const pending: PendingInvitationStore = {
      get: async () => null,
      set: async () => undefined,
      clear: async () => undefined,
      ...store,
    };
    return { actions: createAuthActions(backend, pending, { redirectTo: 'x' }), backend };
  };
  const boom = async (): Promise<never> => {
    throw new Error('Keychain unavailable');
  };

  it('returns a handled error instead of throwing', async () => {
    const { actions, backend } = broken({ set: boom });
    expect(await actions.signUpCoordinator(coordinator)).toEqual({ ok: false, error: 'unknown' });
    expect(backend.signUp).not.toHaveBeenCalled();
    expect(await broken({ clear: boom }).actions.signUpCarrier(carrier)).toEqual({
      ok: false,
      error: 'unknown',
    });
  });

  it('treats an unreadable stored code as no code', async () => {
    expect(await broken({ get: boom }).actions.acceptPendingInvitation()).toBeNull();
  });

  it('still accepts and signs out when the code cannot be cleared', async () => {
    const { actions, backend } = broken({ clear: boom });
    expect(await actions.acceptCoordinatorInvitation(TOKEN)).toEqual({
      ok: true,
      value: undefined,
    });
    await actions.signOut();
    expect(backend.signOut).toHaveBeenCalled();
  });

  it('turns a rejected backend call into a handled error', async () => {
    const { actions } = setup({ signIn: boom });
    expect(await actions.signIn('a@b.mx', 'x')).toEqual({ ok: false, error: 'unknown' });
  });
});

describe('completeEmailConfirmation', () => {
  it('exchanges the PKCE code', async () => {
    const { actions, backend } = setup();
    expect(await actions.completeEmailConfirmation('code-123456')).toEqual({
      ok: true,
      value: undefined,
    });
    expect(backend.exchangeCode).toHaveBeenCalledWith('code-123456');
  });

  it('reports a failed exchange', async () => {
    const { actions } = setup({
      exchangeCode: async () => ({ error: { message: 'invalid flow state' } }),
    });
    expect(await actions.completeEmailConfirmation('code-123456')).toEqual({
      ok: false,
      error: 'unknown',
    });
  });
});

describe('registerCompany (G2)', () => {
  const company = {
    kind: 'owner_operator' as const,
    personType: 'fisica' as const,
    legalName: 'José Sánchez Medina',
    rfc: 'SAMJ800101AB1',
    fiscalStreet: 'Av. Constitución',
    fiscalExteriorNumber: '100',
    fiscalNeighborhood: 'Centro',
    fiscalPostalCode: '64000',
    fiscalMunicipality: 'Monterrey',
    fiscalState: 'Nuevo León' as const,
    contactName: 'José',
    contactEmail: 'jose@x.mx',
    contactPhone: '+528112345678',
  };

  it('sends the register_company payload', async () => {
    const { actions, backend } = setup();
    expect(await actions.registerCompany(company)).toEqual({ ok: true, value: undefined });
    expect(backend.registerCompany).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'owner_operator',
        rfc: 'SAMJ800101AB1',
        fiscalState: 'Nuevo León',
        fiscalInteriorNumber: null,
        legalRepresentativeName: null,
      }),
    );
  });

  it('explains a duplicated RFC', async () => {
    const { actions } = setup({
      registerCompany: async () => ({
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "companies_rfc_key"',
        },
      }),
    });
    expect(await actions.registerCompany(company)).toEqual({ ok: false, error: 'rfcTaken' });
  });
});

describe('signOut', () => {
  it('forgets the pending code and signs out', async () => {
    const { actions, backend, pending, stored } = setup();
    await pending.set(TOKEN);
    await actions.signOut();
    expect(stored()).toBeNull();
    expect(backend.signOut).toHaveBeenCalled();
  });
});

describe('toErrorKey', () => {
  it('maps auth, rate-limit and network errors', () => {
    expect(toErrorKey({ code: 'email_not_confirmed' })).toBe('emailNotConfirmed');
    expect(toErrorKey({ code: 'user_already_exists' })).toBe('userAlreadyExists');
    expect(toErrorKey({ code: 'over_email_send_rate_limit' })).toBe('rateLimited');
    expect(toErrorKey({ status: 429 })).toBe('rateLimited');
    expect(toErrorKey({ code: 'PT429', message: 'rate limit exceeded' })).toBe('rateLimited');
    expect(toErrorKey({ name: 'AuthRetryableFetchError', status: 0 })).toBe('network');
    expect(toErrorKey({ message: 'TypeError: Failed to fetch' })).toBe('network');
  });

  it('never exposes unknown server messages', () => {
    expect(toErrorKey({ message: 'relation "x" does not exist' })).toBe('unknown');
    expect(toErrorKey('boom')).toBe('unknown');
    expect(toErrorKey(null)).toBe('unknown');
  });
});
