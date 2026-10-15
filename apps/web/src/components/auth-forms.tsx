'use client';

import { authCopy } from '@transport/shared';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  completeCompany,
  requestPasswordReset,
  signIn,
  signUpShipper,
  updatePassword,
} from '@/lib/auth/actions';
import type { FormState } from '@/lib/forms';
import { cn } from '@/lib/utils';

const f = authCopy.fields;

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/** A form bound to a server action, with its global error or notice. */
export function ActionForm({
  action,
  initial = {},
  submit,
  pending: pendingLabel,
  children,
}: {
  action: Action;
  initial?: FormState;
  submit: string;
  pending: string;
  children: (state: FormState) => React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
      {children(state)}
      <Button type="submit" variant="accent" size="lg" className="w-full" disabled={pending}>
        {pending ? pendingLabel : submit}
      </Button>
    </form>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: 'error' | 'success' | 'info';
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-md border px-4 py-3 text-sm',
        tone === 'error' && 'border-destructive/30 bg-destructive/5 text-destructive',
        tone === 'success' && 'border-success/30 bg-success/5 text-success',
        tone === 'info' && 'border-accent/30 bg-accent/5',
      )}
    >
      {children}
    </p>
  );
}

export function Field({
  name,
  label,
  state,
  hint,
  className,
  ...input
}: React.ComponentProps<'input'> & {
  name: string;
  label: string;
  state: FormState;
  hint?: string;
}) {
  const error = state.fieldErrors?.[name];
  const id = `field-${name}`;
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        defaultValue={input.type === 'password' ? undefined : state.values?.[name]}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-help` : undefined}
        {...input}
      />
      {(error ?? hint) && (
        <p
          id={`${id}-help`}
          className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

function PersonTypeField({ state }: { state: FormState }) {
  const error = state.fieldErrors?.personType;
  const current = state.values?.personType ?? 'moral';
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{f.personType}</legend>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {(['moral', 'fisica'] as const).map((value) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="personType"
              value={value}
              defaultChecked={current === value}
              className="accent-accent"
            />
            {value === 'moral' ? f.personTypeMoral : f.personTypeFisica}
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </fieldset>
  );
}

export function SignInForm({ next }: { next?: string }) {
  const c = authCopy.signIn;
  return (
    <ActionForm action={signIn} submit={c.submit} pending={c.pending}>
      {(state) => (
        <>
          {next && <input type="hidden" name="next" value={next} />}
          <Field name="email" type="email" autoComplete="email" label={f.email} state={state} />
          <Field
            name="password"
            type="password"
            autoComplete="current-password"
            label={f.password}
            state={state}
          />
        </>
      )}
    </ActionForm>
  );
}

export function SignUpForm() {
  const c = authCopy.signUp;
  return (
    <ActionForm action={signUpShipper} submit={c.submit} pending={c.pending}>
      {(state) => (
        <>
          <h3 className="text-lg">{c.accountSection}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="fullName" autoComplete="name" label={f.fullName} state={state} />
            <Field name="phone" type="tel" autoComplete="tel" label={f.phone} state={state} />
            <Field
              name="email"
              type="email"
              autoComplete="email"
              label={f.email}
              state={state}
              className="sm:col-span-2"
            />
            <Field
              name="password"
              type="password"
              autoComplete="new-password"
              label={f.password}
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
          <h3 className="pt-2 text-lg">{c.companySection}</h3>
          <CompanyFields state={state} />
        </>
      )}
    </ActionForm>
  );
}

function CompanyFields({ state }: { state: FormState }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <PersonTypeField state={state} />
      <Field
        name="legalName"
        autoComplete="organization"
        label={f.legalName}
        state={state}
        className="sm:col-span-2"
      />
      <Field name="rfc" label={f.rfc} state={state} maxLength={20} />
    </div>
  );
}

export function ForgotPasswordForm() {
  const c = authCopy.forgotPassword;
  return (
    <ActionForm action={requestPasswordReset} submit={c.submit} pending={c.pending}>
      {(state) => (
        <Field name="email" type="email" autoComplete="email" label={f.email} state={state} />
      )}
    </ActionForm>
  );
}

export function ResetPasswordForm() {
  const c = authCopy.resetPassword;
  return (
    <ActionForm action={updatePassword} submit={c.submit} pending={c.pending}>
      {(state) => (
        <>
          <Field
            name="password"
            type="password"
            autoComplete="new-password"
            label={f.newPassword}
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
        </>
      )}
    </ActionForm>
  );
}

export function CompleteCompanyForm({ initial }: { initial: FormState }) {
  const c = authCopy.completeCompany;
  return (
    <ActionForm action={completeCompany} initial={initial} submit={c.submit} pending={c.pending}>
      {(state) => (
        <>
          <CompanyFields state={state} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="contactName" label={f.fullName} state={state} />
            <Field name="contactPhone" type="tel" label={f.phone} state={state} />
            <Field
              name="contactEmail"
              type="email"
              label={f.email}
              state={state}
              className="sm:col-span-2"
            />
          </div>
        </>
      )}
    </ActionForm>
  );
}
