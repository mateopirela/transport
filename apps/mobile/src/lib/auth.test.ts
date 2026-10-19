import { describe, expect, it, vi } from 'vitest';

import { createAuthActions, type AuthBackend, type PendingInvitationStore } from './auth';
import { toErrorKey } from './errors';

function setup(overrides: Partial<AuthBackend> = {}) {
  let stored: string | null = null;
  const pending: PendingInvitationStore = {
    get: vi.fn(async () => stored),
    set: vi.fn(async (code: string) => {
      stored = code;
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
    acceptInvitation: vi.fn(async () => ({ error: null })),
    createCompany: vi.fn(async () => ({ error: null })),
    ...overrides,
  };
  const actions = createAuthActions(backend, pending, { redirectTo: 'transport://auth/callback' });
  return { actions, backend, pending, stored: () => stored };
}

const operator = {
  email: 'op@x.mx',
  password: 'camion2026',
  fullName: 'Luis',
  invitationCode: 'ABCDEFGH23456789',
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
  it('signs up with the carrier role and the confirmation deep link', async () => {
    const { actions, backend } = setup();
    const result = await actions.signUpCarrier({
      email: 'c@x.mx',
      password: 'camion2026',
      fullName: 'Ana',
      phone: '8112345678',
    });
    expect(result).toEqual({ ok: true, value: 'check_email' });
    expect(backend.signUp).toHaveBeenCalledWith({
      email: 'c@x.mx',
      password: 'camion2026',
      redirectTo: 'transport://auth/callback',
      metadata: { role: 'manager', full_name: 'Ana', phone: '8112345678' },
    });
  });

  it('drops a leftover invitation code from an unfinished operator sign-up', async () => {
    const { actions, pending, stored } = setup();
    await pending.set('OLDCODE123');
    await actions.signUpCarrier({
      email: 'c@x.mx',
      password: 'p4ssword',
      fullName: 'Ana',
      phone: '1',
    });
    expect(stored()).toBeNull();
  });
});

describe('signUpOperator (D15)', () => {
  it('keeps the code until the e-mail is confirmed', async () => {
    const { actions, backend, stored } = setup();
    expect(await actions.signUpOperator(operator)).toEqual({ ok: true, value: 'check_email' });
    expect(stored()).toBe('ABCDEFGH23456789');
    expect(backend.acceptInvitation).not.toHaveBeenCalled();
    expect(vi.mocked(backend.signUp).mock.calls[0]?.[0].metadata).toEqual({
      role: 'operator',
      full_name: 'Luis',
    });
  });

  it('leaves acceptance to the join screen when there is already a session', async () => {
    const { actions, backend, stored } = setup({
      signUp: async () => ({ error: null, hasSession: true }),
    });
    expect(await actions.signUpOperator(operator)).toEqual({ ok: true, value: 'signed_in' });
    expect(backend.acceptInvitation).not.toHaveBeenCalled();
    expect(stored()).toBe('ABCDEFGH23456789');
  });

  it('forgets the code when the sign-up fails', async () => {
    const { actions, stored } = setup({
      signUp: async () => ({ error: { code: 'weak_password' }, hasSession: false }),
    });
    expect(await actions.signUpOperator(operator)).toEqual({ ok: false, error: 'weakPassword' });
    expect(stored()).toBeNull();
  });
});

describe('rememberInvitation', () => {
  it('keeps the code for an existing operator who signs in instead', async () => {
    const { actions, backend, stored } = setup();
    expect(await actions.rememberInvitation('ABCDEFGH23456789')).toEqual({
      ok: true,
      value: undefined,
    });
    expect(stored()).toBe('ABCDEFGH23456789');
    await actions.signIn('op@x.mx', 'camion2026');
    const accepted = await actions.acceptPendingInvitation();
    expect(accepted?.result.ok).toBe(true);
    expect(backend.acceptInvitation).toHaveBeenCalledWith('ABCDEFGH23456789');
  });
});

describe('acceptPendingInvitation', () => {
  it('does nothing without a stored code', async () => {
    const { actions, backend } = setup();
    expect(await actions.acceptPendingInvitation()).toBeNull();
    expect(backend.acceptInvitation).not.toHaveBeenCalled();
  });

  it('accepts the stored code once and clears it', async () => {
    const { actions, backend, pending, stored } = setup();
    await pending.set('ABCDEFGH23456789');
    expect(await actions.acceptPendingInvitation()).toEqual({
      code: 'ABCDEFGH23456789',
      result: { ok: true, value: undefined },
    });
    expect(backend.acceptInvitation).toHaveBeenCalledWith('ABCDEFGH23456789');
    expect(stored()).toBeNull();
  });

  it('drops codes that can never succeed', async () => {
    for (const message of [
      'invalid or expired invitation',
      'invitation was sent to another email',
      'only operator accounts can accept invitations',
      'user already belongs to a company',
    ]) {
      const { actions, pending, stored } = setup({
        acceptInvitation: async () => ({ error: { code: '22023', message } }),
      });
      await pending.set('ABCDEFGH23456789');
      const result = await actions.acceptPendingInvitation();
      expect(result?.result.ok).toBe(false);
      expect(stored()).toBeNull();
    }
  });

  it('keeps the code after a network error so it can be retried', async () => {
    const { actions, pending, stored } = setup({
      acceptInvitation: async () => ({
        error: { name: 'TypeError', message: 'Network request failed' },
      }),
    });
    await pending.set('ABCDEFGH23456789');
    expect(await actions.acceptPendingInvitation()).toEqual({
      code: 'ABCDEFGH23456789',
      result: { ok: false, error: 'network' },
    });
    expect(stored()).toBe('ABCDEFGH23456789');
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
    expect(await actions.signUpOperator(operator)).toEqual({ ok: false, error: 'unknown' });
    expect(backend.signUp).not.toHaveBeenCalled();
    expect(
      await broken({ clear: boom }).actions.signUpCarrier({
        email: 'c@x.mx',
        password: 'camion2026',
        fullName: 'Ana',
        phone: '8112345678',
      }),
    ).toEqual({ ok: false, error: 'unknown' });
  });

  it('treats an unreadable stored code as no code', async () => {
    expect(await broken({ get: boom }).actions.acceptPendingInvitation()).toBeNull();
  });

  it('still accepts and signs out when the code cannot be cleared', async () => {
    const { actions, backend } = broken({ clear: boom });
    expect(await actions.acceptInvitation('ABCDEFGH23456789')).toEqual({
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

describe('createCompany', () => {
  const company = {
    legalName: 'Fletes Ana',
    rfc: 'FAN010101AB1',
    contactName: 'Ana',
    contactEmail: 'ana@x.mx',
    contactPhone: '8112345678',
  };

  it('calls the create_company RPC with its parameter names', async () => {
    const { actions, backend } = setup();
    expect(await actions.createCompany(company)).toEqual({ ok: true, value: undefined });
    expect(backend.createCompany).toHaveBeenCalledWith({
      p_legal_name: 'Fletes Ana',
      p_rfc: 'FAN010101AB1',
      p_contact_name: 'Ana',
      p_contact_email: 'ana@x.mx',
      p_contact_phone: '8112345678',
    });
  });

  it('explains a duplicated RFC', async () => {
    const { actions } = setup({
      createCompany: async () => ({
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "companies_rfc_key"',
        },
      }),
    });
    expect(await actions.createCompany(company)).toEqual({ ok: false, error: 'rfcTaken' });
  });
});

describe('signOut', () => {
  it('forgets the pending code and signs out', async () => {
    const { actions, backend, pending, stored } = setup();
    await pending.set('ABCDEFGH23456789');
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
