'use client';

import { secondFactorCopy } from '@transport/shared';
import { useActionState } from 'react';

import { ActionForm, Field } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import {
  confirmTotpEnrollment,
  startTotpEnrollment,
  verifyTotp,
  type EnrollmentState,
} from '@/lib/auth/second-factor';
import type { FormState } from '@/lib/forms';

const c = secondFactorCopy;

/** The 6 digits: the phone keyboard, and iOS/Android offer the code to paste. */
function CodeField({ state }: { state: FormState }) {
  return (
    <Field
      name="code"
      label={c.codeLabel}
      hint={c.codeHint}
      state={state}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={7}
      required
      autoFocus
    />
  );
}

/** Where to go after the second factor (a path from /segundo-factor?next=). */
function NextField({ next }: { next: string | null }) {
  return next ? <input type="hidden" name="next" value={next} /> : null;
}

/** An admin with a verified factor types its code on every new session. */
export function TotpChallengeForm({ next }: { next: string | null }) {
  return (
    <ActionForm action={verifyTotp} submit={c.challenge.submit} pending={c.pending}>
      {(state) => (
        <>
          <NextField next={next} />
          <CodeField state={state} />
        </>
      )}
    </ActionForm>
  );
}

/**
 * The first sign-in of an admin: "Configurar app autenticadora" creates the
 * factor and shows its QR and key (kept only in this component's memory);
 * the first code verifies it and the session.
 */
export function TotpEnrollmentForm({ next }: { next: string | null }) {
  const [state, start, starting] = useActionState<EnrollmentState, FormData>(
    startTotpEnrollment,
    {},
  );
  const { enrollment } = state;

  if (!enrollment) {
    return (
      <form action={start} className="space-y-5">
        {state.error && <Notice tone="error">{state.error}</Notice>}
        <Button type="submit" className="w-full" loading={starting}>
          {starting ? c.enroll.starting : c.enroll.start}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-callout text-text">{c.enroll.stepScan}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URI made by Supabase Auth */}
      <img
        src={enrollment.qrCode}
        alt={c.enroll.qrAlt}
        width={192}
        height={192}
        className="size-48 rounded-sm border border-separator"
      />
      <div className="space-y-1">
        <p id="totp-secret-label" className="text-footnote text-text-dim">
          {c.enroll.secretLabel}
        </p>
        <p
          aria-labelledby="totp-secret-label"
          className="font-mono text-callout break-all text-text select-all"
        >
          {enrollment.secret}
        </p>
      </div>
      <ActionForm action={confirmTotpEnrollment} submit={c.enroll.submit} pending={c.pending}>
        {(formState) => (
          <>
            <input type="hidden" name="factorId" value={enrollment.factorId} />
            <NextField next={next} />
            <CodeField state={formState} />
          </>
        )}
      </ActionForm>
      <p className="text-footnote text-text-dim">{c.enroll.backupHint}</p>
    </div>
  );
}
