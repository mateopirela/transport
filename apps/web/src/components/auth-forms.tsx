'use client';

import {
  authCopy,
  COMPANY_REGISTRATION_KINDS,
  MX_STATES,
  type CompanyRegistrationKind,
} from '@transport/shared';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { ErrorText, Field as FieldFrame, fieldHelpId } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
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
      <Button type="submit" className="mt-2 w-full" disabled={pending} loading={pending}>
        {pending ? pendingLabel : submit}
      </Button>
    </form>
  );
}

/** The kit's notice, by the name the screens import it with. */
export { Notice };

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
    <FieldFrame label={label} htmlFor={id} error={error} hint={hint} className={className}>
      <Input
        id={id}
        name={name}
        defaultValue={input.type === 'password' ? undefined : state.values?.[name]}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? fieldHelpId(id) : undefined}
        {...input}
      />
    </FieldFrame>
  );
}

/** A choice drawn as a cell: the native radio stays (keyboard, forms, tests), the cell follows it. */
const choiceCell =
  'flex cursor-pointer items-start gap-3 rounded-2xl border bg-cell px-4 py-3 transition-colors duration-200 hover:bg-surface-high/50 has-checked:border-accent has-checked:bg-accent-soft has-focus-visible:ring-[3px] has-focus-visible:ring-ring/40';

/** Radio group; the options are rendered as labelled cells. */
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
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 px-1 text-label text-text-dim">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <label key={option.value} className={choiceCell}>
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={current === option.value}
              className="mt-1 size-4 shrink-0 accent-accent"
            />
            <span>
              <span className="block text-callout font-semibold text-text">{option.label}</span>
              {option.hint && (
                <span className="mt-0.5 block text-footnote text-text-dim">{option.hint}</span>
              )}
            </span>
          </label>
        ))}
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </fieldset>
  );
}

function PersonTypeField({ state }: { state: FormState }) {
  const error = state.fieldErrors?.personType;
  const current = state.values?.personType ?? 'moral';
  return (
    <fieldset className="space-y-1.5 sm:col-span-2">
      <legend className="mb-1.5 px-1 text-label text-text-dim">{f.personType}</legend>
      <div className="grid grid-cols-2 gap-2">
        {(['moral', 'fisica'] as const).map((value) => (
          <label key={value} className={`${choiceCell} items-center`}>
            <input
              type="radio"
              name="personType"
              value={value}
              defaultChecked={current === value}
              className="size-4 shrink-0 accent-accent"
            />
            <span className="text-callout text-text">
              {value === 'moral' ? f.personTypeMoral : f.personTypeFisica}
            </span>
          </label>
        ))}
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </fieldset>
  );
}

function StateField({ state }: { state: FormState }) {
  const error = state.fieldErrors?.fiscalState;
  const id = 'field-fiscalState';
  return (
    <FieldFrame label={f.fiscalState} htmlFor={id} error={error}>
      <Select
        id={id}
        name="fiscalState"
        defaultValue={state.values?.fiscalState ?? ''}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? fieldHelpId(id) : undefined}
      >
        <option value="">{f.fiscalStatePlaceholder}</option>
        {MX_STATES.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </Select>
    </FieldFrame>
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
      <h4 className="px-1 pt-3 text-headline text-text sm:col-span-2">{f.fiscalAddress}</h4>
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

/** A step of a long form: its title and a line under it, then its fields (§1.7). */
function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t pt-6">
      <div className="space-y-1 px-1">
        <h3 className="text-title3 text-text">{title}</h3>
        {description && <p className="text-subhead text-text-dim">{description}</p>}
      </div>
      {children}
    </section>
  );
}

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
          <FormSection title={c.accountSection}>
            <AccountFields state={state} />
          </FormSection>
          <FormSection title={c.companySection} description={c.companyHint}>
            <CompanyFiscalFields state={state} />
          </FormSection>
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
