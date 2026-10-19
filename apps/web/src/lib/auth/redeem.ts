import type { authCopy, RedeemableKind } from '@transport/shared';

import { createBrowserSupabase } from '../supabase/browser';

// Client-side call of the Edge Function `redeem-invitation` (G2): the
// person has no account yet, so the browser calls it with the anon key (the
// function has verify_jwt off and validates the token in Postgres).

export type RedeemErrorKey = keyof typeof authCopy.invitation.errors;

export type RedeemOutcome =
  { ok: true; kind: RedeemableKind; email?: string } | { ok: false; error: RedeemErrorKey };

/** Codes of the function's JSON answers (handler.ts) mapped to copy keys. */
const ERRORS: Record<string, RedeemErrorKey> = {
  invalid_invitation: 'invalid',
  phone_taken: 'phoneTaken',
  rate_limited: 'rateLimited',
  password_not_saved: 'passwordNotSaved',
  sessions_not_revoked: 'sessionsNotRevoked',
};

async function errorKey(error: unknown): Promise<RedeemErrorKey> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    const body = (await context.json().catch(() => ({}))) as { error?: unknown };
    if (typeof body.error === 'string' && Object.hasOwn(ERRORS, body.error)) {
      return ERRORS[body.error] ?? 'generic';
    }
  }
  return 'generic';
}

export async function redeemInvitation(body: {
  token: string;
  password: string;
  fullName?: string;
  phone?: string;
  email?: string;
}): Promise<RedeemOutcome> {
  const supabase = createBrowserSupabase();
  if (!supabase) return { ok: false, error: 'generic' };
  const { data, error } = await supabase.functions.invoke<{ kind: RedeemableKind; email?: string }>(
    'redeem-invitation',
    { body },
  );
  if (error || !data) return { ok: false, error: await errorKey(error) };
  return { ok: true, kind: data.kind, ...(data.email ? { email: data.email } : {}) };
}
