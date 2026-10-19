import type { RedeemableKind } from '@transport/shared';

import type { AuthBackend } from './auth';
import type { Supabase } from './supabase';

/** The JSON answer of the Edge Function, attached to the error for the mapping (errors.ts). */
export interface EdgeFunctionError {
  name: 'EdgeFunctionError';
  status: number | null;
  code: string | null;
}

async function edgeFunctionError(error: unknown): Promise<EdgeFunctionError> {
  const context = (error as { context?: unknown } | null)?.context;
  let status: number | null = null;
  let code: string | null = null;
  if (context instanceof Response) {
    status = context.status;
    const body = (await context.json().catch(() => ({}))) as { error?: unknown };
    if (typeof body.error === 'string') code = body.error;
  }
  return { name: 'EdgeFunctionError', status, code };
}

export function createSupabaseAuthBackend(client: Supabase): AuthBackend {
  return {
    signIn: (email, password) => client.auth.signInWithPassword({ email, password }),

    async signUp({ email, password, redirectTo, metadata }) {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo, data: metadata },
      });
      return { error, hasSession: Boolean(data.session) };
    },

    async signOut() {
      // Revoke the refresh token server-side; if that fails (e.g. offline),
      // still drop the local session so the device is signed out.
      const { error } = await client.auth.signOut();
      if (!error) return { error: null };
      return client.auth.signOut({ scope: 'local' });
    },

    exchangeCode: (code) => client.auth.exchangeCodeForSession(code),

    acceptCoordinatorInvitation: (token) =>
      client.rpc('accept_coordinator_invitation', { p_token: token }),

    // No session yet: the anon key reaches the function (verify_jwt is off)
    // and Postgres validates the token.
    async redeemInvitation(body) {
      const { data, error } = await client.functions.invoke<{ kind: RedeemableKind }>(
        'redeem-invitation',
        { body },
      );
      if (error) return { error: await edgeFunctionError(error), kind: null };
      return { error: null, kind: data?.kind ?? null };
    },

    registerCompany: (payload) => client.rpc('register_company', { p_payload: payload }),

    updatePhone: (userId, phone) => client.from('profiles').update({ phone }).eq('id', userId),
  };
}
