'use client';

import {
  authCopy,
  COMPANY_REGISTRATION_KINDS,
  MX_STATES,
  type CompanyRegistrationKind,
} from '@transport/shared';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  completeCompany,
  joinCompany,
  requestPasswordReset,
  signIn,
  signUp,
  signUpCoordinator,
  updatePassword,
} from '@/lib/auth/actions';
import type { FormState } from '@/lib/forms';
import { cn } from '@/lib/utils';

const f = authCopy.fields;
const kinds = authCopy.registrationKinds;

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

/** Radio group; the options are rendered as labelled cards. */
function RadioCards({
  name,
  label,
  options,
  state,
  defaultValue,
}: {
  name: string;
  label: string;
  options: { value: string; label: string; hint?: string }[];
  state: FormState;
  defaultValue: string;
}) {
  const error = state.fieldErrors?.[name];
  const current = state.values?.[name] ?? defaultValue;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm has-checked:border-accent has-checked:bg-accent/5"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={current === option.value}
              className="mt-0.5 accent-accent"
            />
            <span>
              <span className="block font-medium">{option.label}</span>
              {option.hint && (
                <span className="block text-xs text-muted-foreground">{option.hint}</span>
              )}
            </span>
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </fieldset>
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

const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 aria-invalid:border-destructive';

function StateField({ state }: { state: FormState }) {
  const error = state.fieldErrors?.fiscalState;
  return (
    <div className="space-y-2">
      <Label htmlFor="field-fiscalState">{f.fiscalState}</Label>
      <select
        id="field-fiscalState"
        name="fiscalState"
        defaultValue={state.values?.fiscalState ?? ''}
        aria-invalid={error ? true : undefined}
        className={selectClass}
      >
        <option value="">{f.fiscalStatePlaceholder}</option>
        {MX_STATES.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** The fiscal data of a company (D16): razón social, RFC, domicilio fiscal and representante. */
export function CompanyFiscalFields({
  state,
  withRfc = true,
}: {
  state: FormState;
  /** The RFC cannot change once the company exists (/cuenta-en-revision). */
  withRfc?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {withRfc && <PersonTypeField state={state} />}
      <Field
        name="legalName"
        autoComplete="organization"
        label={f.legalName}
        state={state}
        className="sm:col-span-2"
      />
      {withRfc && <Field name="rfc" label={f.rfc} state={state} maxLength={20} />}
      <Field
        name="legalRepresentativeName"
        label={f.legalRepresentativeName}
        hint={f.legalRepresentativeHint}
        state={state}
        className={withRfc ? undefined : 'sm:col-span-2'}
      />
      <h4 className="pt-2 text-base font-medium sm:col-span-2">{f.fiscalAddress}</h4>
      <Field
        name="fiscalStreet"
        autoComplete="address-line1"
        label={f.fiscalStreet}
        state={state}
        className="sm:col-span-2"
      />
      <Field name="fiscalExteriorNumber" label={f.fiscalExteriorNumber} state={state} />
      <Field name="fiscalInteriorNumber" label={f.fiscalInteriorNumber} state={state} />
      <Field name="fiscalNeighborhood" label={f.fiscalNeighborhood} state={state} />
      <Field
        name="fiscalPostalCode"
        inputMode="numeric"
        autoComplete="postal-code"
        label={f.fiscalPostalCode}
        state={state}
        maxLength={5}
      />
      <Field name="fiscalMunicipality" label={f.fiscalMunicipality} state={state} />
      <StateField state={state} />
    </div>
  );
}

export function SignInForm({ next }: { next?: string }) {
  const c = authCopy.signIn;
  return (
    <ActionForm action={signIn} submit={c.submit} pending={c.pending}>
      {(state) => (
        <>
          {next && <input type="hidden" name="next" value={next} />}
          <Field
            name="identifier"
            type="text"
            autoComplete="username"
            label={f.identifier}
            state={state}
          />
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

const KIND_OPTIONS: { value: CompanyRegistrationKind; label: string; hint: string }[] = [
  { value: 'shipper', label: kinds.shipper, hint: kinds.shipperHint },
  { value: 'carrier', label: kinds.carrier, hint: kinds.carrierHint },
  { value: 'owner_operator', label: kinds.owner_operator, hint: kinds.ownerOperatorHint },
];

/** Account fields of a sign-up: name, phone, email and password. */
function AccountFields({ state }: { state: FormState }) {
  return (
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
  );
}

/** /registro (G2): the kind, the person and the company's fiscal data. */
export function SignUpForm() {
  const c = authCopy.signUp;
  return (
    <ActionForm action={signUp} submit={c.submit} pending={c.pending}>
      {(state) => (
        <>
          <RadioCards
            name="kind"
            label={kinds.label}
            options={KIND_OPTIONS}
            state={state}
            defaultValue="shipper"
          />
          <h3 className="text-lg">{c.accountSection}</h3>
          <AccountFields state={state} />
          <h3 className="pt-2 text-lg">{c.companySection}</h3>
          <p className="-mt-3 text-sm text-muted-foreground">{c.companyHint}</p>
          <CompanyFiscalFields state={state} />
        </>
      )}
    </ActionForm>
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

/**
 * /completar-registro: a shipper registers a shipper company; a Gerente
 * chooses between a carrier company and hombre-camión.
 */
export function CompleteCompanyForm({
  initial,
  kinds: allowed,
}: {
  initial: FormState;
  kinds: readonly CompanyRegistrationKind[];
}) {
  const c = authCopy.completeCompany;
  const options = KIND_OPTIONS.filter((option) => allowed.includes(option.value));
  const defaultKind = initial.values?.kind ?? allowed[0] ?? COMPANY_REGISTRATION_KINDS[0];
  return (
    <ActionForm action={completeCompany} initial={initial} submit={c.submit} pending={c.pending}>
      {(state) => (
        <>
          {options.length > 1 ? (
            <RadioCards
              name="kind"
              label={kinds.label}
              options={options}
              state={state}
              defaultValue={defaultKind}
            />
          ) : (
            <input type="hidden" name="kind" value={defaultKind} />
          )}
          <CompanyFiscalFields state={state} />
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

/** /invitacion/[token]: a new Coordinador creates their account (G1b, G2). */
export function CoordinatorSignUpForm({ token, name }: { token: string; name?: string | null }) {
  const c = authCopy.invitation.coordinator;
  return (
    <ActionForm
      action={signUpCoordinator}
      initial={name ? { values: { fullName: name } } : {}}
      submit={c.submit}
      pending={c.pending}
    >
      {(state) => (
        <>
          <input type="hidden" name="token" value={token} />
          <AccountFields state={state} />
        </>
      )}
    </ActionForm>
  );
}

/** /invitacion/[token]: a signed-in Coordinador without a company joins. */
export function JoinCompanyForm({ token }: { token: string }) {
  const c = authCopy.invitation.coordinator;
  return (
    <ActionForm action={joinCompany} submit={c.join} pending={c.joinPending}>
      {() => <input type="hidden" name="token" value={token} />}
    </ActionForm>
  );
}
