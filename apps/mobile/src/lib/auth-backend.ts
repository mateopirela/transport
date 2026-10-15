import type { AuthBackend } from './auth';
import type { Supabase } from './supabase';

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

    acceptInvitation: (code) => client.rpc('accept_operator_invitation', { p_code: code }),

    createCompany: (input) => client.rpc('create_company', input),
  };
}
