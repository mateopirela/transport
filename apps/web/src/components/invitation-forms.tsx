'use client';

import {
  accessResetFormSchema,
  authCopy,
  operatorRedeemFormSchema,
  type RedeemableKind,
} from '@transport/shared';
import Link from 'next/link';
import { useState } from 'react';

import { Field } from '@/components/auth-forms';
import { Button, buttonVariants } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { formEntries, invalidForm, type FormState } from '@/lib/forms';
import { redeemInvitation, type RedeemOutcome } from '@/lib/auth/redeem';

const f = authCopy.fields;
const c = authCopy.invitation;

/** Deep link that opens the app once the account exists (apps/mobile, scheme `transport`). */
const OPEN_APP_LINK = 'transport://sign-in';

/**
 * Operator links are redeemed from the browser straight against the Edge
 * Function `redeem-invitation` (with the anon key, like the app does), so
 * the rate limit per address sees the person and not the web server. The
 * fields are validated with the shared schemas before the call.
 */
export function RedeemForm({ token, kind }: { token: string; kind: RedeemableKind }) {
  const [state, setState] = useState<FormState>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<RedeemOutcome | null>(null);
  const copy = kind === 'operator' ? c.operator : c.reset;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entries = formEntries(new FormData(event.currentTarget));
    const schema = kind === 'operator' ? operatorRedeemFormSchema : accessResetFormSchema;
    const parsed = schema.safeParse(entries);
    if (!parsed.success) {
      setState(invalidForm(parsed.error, entries));
      return;
    }
    setPending(true);
    setState({});
    const { passwordConfirmation: _confirmation, ...values } = parsed.data;
    const outcome = await redeemInvitation({ token, ...values });
    setPending(false);
    if (outcome.ok) setDone(outcome);
    else setState({ error: c.errors[outcome.error], values: entries });
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Notice tone="success">{copy.doneTitle}</Notice>
        <p className="px-1 text-callout text-text-dim">{copy.doneDescription}</p>
        <a href={OPEN_APP_LINK} className={buttonVariants({ className: 'w-full' })}>
          {c.operator.openApp}
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {kind === 'operator' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="fullName" autoComplete="name" label={f.fullName} state={state} />
          <Field name="phone" type="tel" autoComplete="tel" label={f.phone} state={state} />
          <Field
            name="email"
            type="email"
            autoComplete="email"
            label={f.optionalEmail}
            state={state}
            className="sm:col-span-2"
          />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="password"
          type="password"
          autoComplete="new-password"
          label={kind === 'operator' ? f.password : f.newPassword}
          hint={f.passwordHint}
          state={state}
        />
        <Field
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          label={f.passwordConfirmation}
          state={state}
        />
      </div>
      <Button type="submit" className="mt-2 w-full" disabled={pending} loading={pending}>
        {pending ? copy.pending : copy.submit}
      </Button>
      <p className="text-center text-subhead">
        <Link href="/login" className="font-semibold text-accent-text hover:underline">
          {authCopy.signUp.signInLink}
        </Link>
      </p>
    </form>
  );
}
