import type { MobileErrorKey } from '@transport/shared';

import { isFinalInvitationError, toErrorKey } from './errors';

// Authentication flows of the app, written against a narrow backend so they
// can be tested without React Native. The wiring to Supabase lives in
// ./auth-backend.ts.

interface Outcome {
  error: unknown;
}

export interface AuthBackend {
  signIn(email: string, password: string): PromiseLike<Outcome>;
  /** Supabase signUp; `hasSession` is false while the e-mail awaits confirmation. */
  signUp(input: {
    email: string;
    password: string;
    redirectTo: string;
    metadata: { role: 'carrier' | 'operator'; full_name: string; phone?: string };
  }): PromiseLike<Outcome & { hasSession: boolean }>;
  signOut(): PromiseLike<Outcome>;
  exchangeCode(code: string): PromiseLike<Outcome>;
  acceptInvitation(code: string): PromiseLike<Outcome>;
  createCompany(input: {
    p_legal_name: string;
    p_rfc: string;
    p_contact_name: string;
    p_contact_email: string;
    p_contact_phone: string;
  }): PromiseLike<Outcome>;
}

export interface PendingInvitationStore {
  get(): Promise<string | null>;
  set(code: string): Promise<void>;
  clear(): Promise<void>;
}

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: MobileErrorKey };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: unknown): Result<never> => ({ ok: false, error: toErrorKey(error) });

export type SignUpOutcome = 'signed_in' | 'check_email';

export function createAuthActions(
  backend: AuthBackend,
  pending: PendingInvitationStore,
  { redirectTo }: { redirectTo: string },
) {
  async function acceptInvitation(code: string): Promise<Result> {
    const { error } = await backend.acceptInvitation(code);
    if (!error) {
      await pending.clear();
      return ok(undefined);
    }
    const key = toErrorKey(error);
    // Codes that can never succeed are dropped so they are not retried forever.
    if (isFinalInvitationError(key)) await pending.clear();
    return { ok: false, error: key };
  }

  return {
    async signIn(email: string, password: string): Promise<Result> {
      const { error } = await backend.signIn(email, password);
      return error ? fail(error) : ok(undefined);
    },

    async signUpCarrier(input: {
      email: string;
      password: string;
      fullName: string;
      phone: string;
    }): Promise<Result<SignUpOutcome>> {
      // A previous, unfinished operator sign-up must not leak into this account.
      await pending.clear();
      const { error, hasSession } = await backend.signUp({
        email: input.email,
        password: input.password,
        redirectTo,
        metadata: { role: 'carrier', full_name: input.fullName, phone: input.phone },
      });
      if (error) return fail(error);
      return ok(hasSession ? 'signed_in' : 'check_email');
    },

    /**
     * Operator sign-up with an invitation (D15). The code is stored before the
     * account is created so it survives the e-mail confirmation; it is
     * accepted as soon as there is a session.
     */
    async signUpOperator(input: {
      email: string;
      password: string;
      fullName: string;
      invitationCode: string;
    }): Promise<Result<SignUpOutcome>> {
      await pending.set(input.invitationCode);
      const { error, hasSession } = await backend.signUp({
        email: input.email,
        password: input.password,
        redirectTo,
        metadata: { role: 'operator', full_name: input.fullName },
      });
      if (error) {
        await pending.clear();
        return fail(error);
      }
      // With a session the profile reloads and the join screen accepts the
      // stored code (acceptPendingInvitation): a single path, so the code is
      // never submitted twice concurrently.
      return ok(hasSession ? 'signed_in' : 'check_email');
    },

    acceptInvitation,

    /** Accepts the stored invitation, if any. Null when there is none. */
    async acceptPendingInvitation(): Promise<Result | null> {
      const code = await pending.get();
      return code ? acceptInvitation(code) : null;
    },

    async completeEmailConfirmation(code: string): Promise<Result> {
      const { error } = await backend.exchangeCode(code);
      return error ? fail(error) : ok(undefined);
    },

    async createCompany(input: {
      legalName: string;
      rfc: string;
      contactName: string;
      contactEmail: string;
      contactPhone: string;
    }): Promise<Result> {
      const { error } = await backend.createCompany({
        p_legal_name: input.legalName,
        p_rfc: input.rfc,
        p_contact_name: input.contactName,
        p_contact_email: input.contactEmail,
        p_contact_phone: input.contactPhone,
      });
      return error ? fail(error) : ok(undefined);
    },

    /** Signs out locally even if the server call fails, and forgets any pending code. */
    async signOut(): Promise<void> {
      await pending.clear();
      await backend.signOut();
    },
  };
}

export type AuthActions = ReturnType<typeof createAuthActions>;
