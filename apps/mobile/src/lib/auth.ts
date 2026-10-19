import type {
  CarrierSignUpKind,
  CompanyRegistrationValues,
  MobileErrorKey,
  RedeemableKind,
} from '@transport/shared';
import { phoneAuthEmail, registerCompanyPayload } from '@transport/shared';

import { isFinalInvitationError, toErrorKey } from './errors';

// Authentication flows of the app, written against a narrow backend so they
// can be tested without React Native. The wiring to Supabase lives in
// ./auth-backend.ts.

interface Outcome {
  error: unknown;
}

export interface AuthBackend {
  /** Supabase signInWithPassword; `email` may be the synthetic one of a phone (G2). */
  signIn(email: string, password: string): PromiseLike<Outcome>;
  /** Supabase signUp; `hasSession` is false while the e-mail awaits confirmation. */
  signUp(input: {
    email: string;
    password: string;
    redirectTo: string;
    metadata: {
      role: 'manager' | 'coordinator';
      full_name: string;
      phone: string;
      /** What a Gerente registers next (company or hombre-camión); only a hint for the form. */
      pending_company_kind?: CarrierSignUpKind;
    };
  }): PromiseLike<Outcome & { hasSession: boolean }>;
  signOut(): PromiseLike<Outcome>;
  exchangeCode(code: string): PromiseLike<Outcome>;
  /** accept_coordinator_invitation (G1b). */
  acceptCoordinatorInvitation(token: string): PromiseLike<Outcome>;
  /** The Edge Function redeem-invitation (G2); `error` carries its JSON answer. */
  redeemInvitation(body: {
    token: string;
    password: string;
    fullName?: string;
    phone?: string;
    email?: string;
  }): PromiseLike<Outcome & { kind: RedeemableKind | null }>;
  /** register_company (G2). */
  registerCompany(payload: ReturnType<typeof registerCompanyPayload>): PromiseLike<Outcome>;
  /** profiles.phone of the signed-in user (G2, "Completa tu teléfono"). */
  updatePhone(userId: string, phone: string): PromiseLike<Outcome>;
}

export interface PendingInvitationStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
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

/** Outcome of accepting the stored invitation; `token` lets the UI offer a retry. */
export interface PendingAcceptance {
  token: string;
  result: Result;
}

export function createAuthActions(
  backend: AuthBackend,
  pending: PendingInvitationStore,
  { redirectTo }: { redirectTo: string },
) {
  /** Forgets the stored token; a storage failure must not block the caller. */
  const forgetPending = () => pending.clear().catch(() => undefined);

  function acceptCoordinatorInvitation(token: string): Promise<Result> {
    return guarded(async () => {
      const { error } = await backend.acceptCoordinatorInvitation(token);
      if (!error) {
        await forgetPending();
        return ok(undefined);
      }
      const key = toErrorKey(error);
      // Links that can never succeed are dropped so they are not retried forever.
      if (isFinalInvitationError(key)) await forgetPending();
      return { ok: false, error: key };
    });
  }

  return {
    /** "Correo o teléfono": `email` is already the Auth email (signInSchema resolves it). */
    signIn(email: string, password: string): Promise<Result> {
      return guarded(async () => {
        const { error } = await backend.signIn(email, password);
        return error ? fail(error) : ok(undefined);
      });
    },

    /** A carrier company or a hombre-camión (D13); the company comes next (company.tsx). */
    signUpCarrier(input: {
      kind: CarrierSignUpKind;
      email: string;
      password: string;
      fullName: string;
      phone: string;
    }): Promise<Result<SignUpOutcome>> {
      return guarded(async () => {
        // A previous, unfinished sign-up by link must not leak into this account.
        await pending.clear();
        const { error, hasSession } = await backend.signUp({
          email: input.email,
          password: input.password,
          redirectTo,
          metadata: {
            role: 'manager',
            full_name: input.fullName,
            phone: input.phone,
            pending_company_kind: input.kind,
          },
        });
        if (error) return fail(error);
        return ok(hasSession ? 'signed_in' : 'check_email');
      });
    },

    /**
     * Coordinator sign-up from an invitation link (G1b). The token is stored
     * before the account is created so it survives the e-mail confirmation;
     * it is accepted as soon as there is a session (acceptPendingInvitation).
     */
    signUpCoordinator(input: {
      token: string;
      email: string;
      password: string;
      fullName: string;
      phone: string;
    }): Promise<Result<SignUpOutcome>> {
      return guarded(async () => {
        await pending.set(input.token);
        const { error, hasSession } = await backend.signUp({
          email: input.email,
          password: input.password,
          redirectTo,
          metadata: { role: 'coordinator', full_name: input.fullName, phone: input.phone },
        });
        if (error) {
          await forgetPending();
          return fail(error);
        }
        return ok(hasSession ? 'signed_in' : 'check_email');
      });
    },

    acceptCoordinatorInvitation,

    /**
     * Keeps an invitation token for a coordinator who already has an account:
     * it is accepted on the invitation screen right after signing in.
     */
    rememberInvitation(token: string): Promise<Result> {
      return guarded(async () => {
        await pending.set(token);
        return ok(undefined);
      });
    },

    /** The stored invitation token, if any (without accepting it). */
    pendingInvitation(): Promise<string | null> {
      return pending.get().catch(() => null);
    },

    /**
     * Accepts the stored invitation, if any. Null when there is none (or it
     * cannot be read). The token is returned so the screen can offer a retry
     * after a transient failure, such as no connection.
     */
    async acceptPendingInvitation(): Promise<PendingAcceptance | null> {
      const token = await pending.get().catch(() => null);
      return token ? { token, result: await acceptCoordinatorInvitation(token) } : null;
    },

    /**
     * Operator by phone (D15-E1): the Edge Function creates the account and
     * links it; then the operator signs in with the synthetic email of the
     * phone. A failed sign-in after a successful redemption is reported as
     * such (the account exists; the sign-in screen works with the phone).
     */
    redeemOperatorInvitation(input: {
      token: string;
      fullName: string;
      phone: string;
      password: string;
      email?: string | undefined;
    }): Promise<Result<'signed_in' | 'redeemed'>> {
      return guarded(async () => {
        await forgetPending();
        const { error } = await backend.redeemInvitation({
          token: input.token,
          fullName: input.fullName,
          phone: input.phone,
          password: input.password,
          ...(input.email ? { email: input.email } : {}),
        });
        if (error) return fail(error);
        const signedIn = await backend.signIn(phoneAuthEmail(input.phone), input.password);
        return ok(signedIn.error ? 'redeemed' : 'signed_in');
      });
    },

    /** Access reset (D15-E1): the new password of the operator the link names. */
    redeemAccessReset(input: { token: string; password: string }): Promise<Result> {
      return guarded(async () => {
        const { error } = await backend.redeemInvitation(input);
        return error ? fail(error) : ok(undefined);
      });
    },

    completeEmailConfirmation(code: string): Promise<Result> {
      return guarded(async () => {
        const { error } = await backend.exchangeCode(code);
        return error ? fail(error) : ok(undefined);
      });
    },

    /** register_company (G2): shipper, carrier or owner_operator with the fiscal data. */
    registerCompany(values: CompanyRegistrationValues): Promise<Result> {
      return guarded(async () => {
        const { error } = await backend.registerCompany(registerCompanyPayload(values));
        return error ? fail(error) : ok(undefined);
      });
    },

    /** "Completa tu teléfono" (G2): accounts from before the phone was required. */
    savePhone(userId: string, phone: string): Promise<Result> {
      return guarded(async () => {
        const { error } = await backend.updatePhone(userId, phone);
        return error ? fail(error) : ok(undefined);
      });
    },

    /**
     * Forgets any pending token and signs out. The sign-out always runs, even if
     * clearing the token fails; the backend drops the local session even when
     * the server call fails.
     */
    async signOut(): Promise<void> {
      await forgetPending();
      await Promise.resolve(backend.signOut()).catch(() => undefined);
    },
  };
}

export type AuthActions = ReturnType<typeof createAuthActions>;
