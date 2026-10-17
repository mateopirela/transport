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
    metadata: { role: 'manager' | 'operator'; full_name: string; phone?: string };
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

/** Runs an action so that a thrown error (e.g. SecureStore) becomes a handled result. */
async function guarded<T>(action: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await action();
  } catch (error) {
    return fail(error);
  }
}

export type SignUpOutcome = 'signed_in' | 'check_email';

/** Outcome of accepting the stored invitation; `code` lets the UI offer a retry. */
export interface PendingAcceptance {
  code: string;
  result: Result;
}

export function createAuthActions(
  backend: AuthBackend,
  pending: PendingInvitationStore,
  { redirectTo }: { redirectTo: string },
) {
  /** Forgets the stored code; a storage failure must not block the caller. */
  const forgetPending = () => pending.clear().catch(() => undefined);

  function acceptInvitation(code: string): Promise<Result> {
    return guarded(async () => {
      const { error } = await backend.acceptInvitation(code);
      if (!error) {
        await forgetPending();
        return ok(undefined);
      }
      const key = toErrorKey(error);
      // Codes that can never succeed are dropped so they are not retried forever.
      if (isFinalInvitationError(key)) await forgetPending();
      return { ok: false, error: key };
    });
  }

  return {
    signIn(email: string, password: string): Promise<Result> {
      return guarded(async () => {
        const { error } = await backend.signIn(email, password);
        return error ? fail(error) : ok(undefined);
      });
    },

    signUpCarrier(input: {
      email: string;
      password: string;
      fullName: string;
      phone: string;
    }): Promise<Result<SignUpOutcome>> {
      return guarded(async () => {
        // A previous, unfinished operator sign-up must not leak into this account.
        await pending.clear();
        const { error, hasSession } = await backend.signUp({
          email: input.email,
          password: input.password,
          redirectTo,
          metadata: { role: 'manager', full_name: input.fullName, phone: input.phone },
        });
        if (error) return fail(error);
        return ok(hasSession ? 'signed_in' : 'check_email');
      });
    },

    /**
     * Operator sign-up with an invitation (D15). The code is stored before the
     * account is created so it survives the e-mail confirmation; it is
     * accepted as soon as there is a session.
     */
    signUpOperator(input: {
      email: string;
      password: string;
      fullName: string;
      invitationCode: string;
    }): Promise<Result<SignUpOutcome>> {
      return guarded(async () => {
        await pending.set(input.invitationCode);
        const { error, hasSession } = await backend.signUp({
          email: input.email,
          password: input.password,
          redirectTo,
          metadata: { role: 'operator', full_name: input.fullName },
        });
        if (error) {
          await forgetPending();
          return fail(error);
        }
        // With a session the profile reloads and the join screen accepts the
        // stored code (acceptPendingInvitation): a single path, so the code is
        // never submitted twice concurrently.
        return ok(hasSession ? 'signed_in' : 'check_email');
      });
    },

    acceptInvitation,

    /**
     * Keeps an invitation code for an operator who already has an account: it
     * is accepted on the join screen right after signing in.
     */
    rememberInvitation(code: string): Promise<Result> {
      return guarded(async () => {
        await pending.set(code);
        return ok(undefined);
      });
    },

    /**
     * Accepts the stored invitation, if any. Null when there is none (or it
     * cannot be read). The code is returned so the screen can offer a retry
     * after a transient failure, such as no connection.
     */
    async acceptPendingInvitation(): Promise<PendingAcceptance | null> {
      const code = await pending.get().catch(() => null);
      return code ? { code, result: await acceptInvitation(code) } : null;
    },

    completeEmailConfirmation(code: string): Promise<Result> {
      return guarded(async () => {
        const { error } = await backend.exchangeCode(code);
        return error ? fail(error) : ok(undefined);
      });
    },

    createCompany(input: {
      legalName: string;
      rfc: string;
      contactName: string;
      contactEmail: string;
      contactPhone: string;
    }): Promise<Result> {
      return guarded(async () => {
        const { error } = await backend.createCompany({
          p_legal_name: input.legalName,
          p_rfc: input.rfc,
          p_contact_name: input.contactName,
          p_contact_email: input.contactEmail,
          p_contact_phone: input.contactPhone,
        });
        return error ? fail(error) : ok(undefined);
      });
    },

    /**
     * Forgets any pending code and signs out. The sign-out always runs, even if
     * clearing the code fails; the backend drops the local session even when
     * the server call fails.
     */
    async signOut(): Promise<void> {
      await forgetPending();
      await Promise.resolve(backend.signOut()).catch(() => undefined);
    },
  };
}

export type AuthActions = ReturnType<typeof createAuthActions>;
