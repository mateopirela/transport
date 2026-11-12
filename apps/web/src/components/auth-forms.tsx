'use client';

import {
  authCopy,
  COMPANY_REGISTRATION_KINDS,
  firstSignUpStepWithError,
  fiscalFieldsFor,
  legalCopy,
  MX_STATES,
  registrationAccountStepSchema,
  signUpStepStates,
  type CompanyRegistrationKind,
  type PersonType,
  type SignUpFormStep,
} from '@transport/shared';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { ErrorText, Field as FieldFrame, fieldHelpId } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { Select } from '@/components/ui/select';
import { Steps } from '@/components/ui/steps';
import {
  acceptTerms,
  completeCompany,
  joinCompany,
  openInvitation,
  requestPasswordReset,
  signIn,
  signUp,
  signUpCoordinator,
  updatePassword,
} from '@/lib/auth/actions';
import { formEntries, invalidForm, type FormState } from '@/lib/forms';
import { paths } from '@/lib/routing';
import { cn } from '@/lib/utils';

const f = authCopy.fields;
const kinds = authCopy.registrationKinds;

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * A form bound to a server action, with its global error or notice. Its
 * button is the screen's primary unless `submitVariant` says otherwise (a
 * form that is not the main action of its page).
 */
export function ActionForm({
  action,
  initial = {},
  submit,
  pending: pendingLabel,
  submitVariant = 'primary',
  children,
}: {
  action: Action;
  initial?: FormState;
  submit: string;
  pending: string;
  submitVariant?: 'primary' | 'secondary';
  children: (state: FormState) => React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.message && <Notice tone="success">{state.message}</Notice>}
      {children(state)}
      <Button
        type="submit"
        variant={submitVariant}
        className="mt-2 w-full"
        disabled={pending}
        loading={pending}
      >
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
  const control = {
    id,
    name,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error || hint ? fieldHelpId(id) : undefined,
  } as const;
  return (
    <FieldFrame label={label} htmlFor={id} error={error} hint={hint} className={className}>
      {input.type === 'password' ? (
        // Passwords are never refilled: they live only in the field (D42).
        <PasswordInput {...control} {...input} />
      ) : (
        <Input {...control} defaultValue={state.values?.[name]} {...input} />
      )}
    </FieldFrame>
  );
}

/**
 * A password field with the button that shows or hides it (D42). The button
 * sits next to the input, outside its `<label>`, so the field keeps its name
 * ("Contraseña"); `aria-pressed` tells whether the password is visible. The
 * password is hidden again when its form is sent.
 */
function PasswordInput({ className, ...props }: React.ComponentProps<'input'>) {
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const hide = () => setShown(false);
    form.addEventListener('submit', hide);
    return () => form.removeEventListener('submit', hide);
  }, []);
  return (
    <div className="relative">
      <Input
        ref={ref}
        {...props}
        type={shown ? 'text' : 'password'}
        className={cn('pr-control', className)}
      />
      <button
        type="button"
        aria-label={f.showPassword}
        aria-pressed={shown}
        aria-controls={props.id}
        onClick={() => setShown((value) => !value)}
        className={buttonVariants({
          variant: 'plain',
          size: 'icon',
          className: 'absolute top-0 right-0 rounded-sm',
        })}
      >
        {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
      </button>
    </div>
  );
}

/** A choice drawn as a cell: the native radio stays (keyboard, forms, tests), the cell follows it. */
const choiceCell =
  'flex cursor-pointer items-start gap-3 rounded-sm border border-control bg-cell px-4 py-3 transition-colors duration-200 hover:bg-surface-high has-checked:border-text has-checked:bg-surface-high has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-text';

/** Radio group; the options are rendered as labelled cells. */
function RadioCards({
  name,
  label,
  options,
  state,
  defaultValue,
  onValueChange,
}: {
  name: string;
  label: string;
  options: { value: string; label: string; hint?: string }[];
  state: FormState;
  defaultValue: string;
  onValueChange?: (value: string) => void;
}) {
  const error = state.fieldErrors?.[name];
  const current = state.values?.[name] ?? defaultValue;
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-label text-text-dim">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <label key={option.value} className={choiceCell}>
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={current === option.value}
              onChange={(event) => onValueChange?.(event.currentTarget.value)}
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

const legalLink = 'font-semibold text-accent-text hover:underline';

/**
 * The terms checkbox of every sign-up (I1, D35-E1): required, with the links
 * to the terms and the privacy notice (they open in a new tab, so the form
 * keeps what was typed). Its value (`on`) is checked by termsAcceptedField.
 */
export function TermsCheckbox({ state }: { state: FormState }) {
  const error = state.fieldErrors?.acceptTerms;
  const t = legalCopy.acceptTerms;
  return (
    <div className="space-y-1.5">
      <label className={`${choiceCell} items-center`}>
        <input
          type="checkbox"
          name="acceptTerms"
          defaultChecked={state.values?.acceptTerms === 'on'}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'field-acceptTerms-help' : undefined}
          className="size-4 shrink-0 accent-accent"
        />
        <span className="text-callout text-text">
          {t.before}{' '}
          <Link href={paths.terms} target="_blank" className={legalLink}>
            {legalCopy.termsLink.toLowerCase()}
          </Link>{' '}
          {t.middle}{' '}
          <Link href={paths.privacy} target="_blank" className={legalLink}>
            {legalCopy.privacyLink.toLowerCase()}
          </Link>
          {t.after}
        </span>
      </label>
      {error && <ErrorText id="field-acceptTerms-help">{error}</ErrorText>}
    </div>
  );
}

function PersonTypeField({
  state,
  value: current,
  onChange,
}: {
  state: FormState;
  value: PersonType;
  onChange: (value: PersonType) => void;
}) {
  const error = state.fieldErrors?.personType;
  return (
    <fieldset className="space-y-1.5 sm:col-span-2">
      <legend className="mb-1.5 text-label text-text-dim">{f.personType}</legend>
      <div className="grid grid-cols-2 gap-2">
        {(['moral', 'fisica'] as const).map((value) => (
          <label key={value} className={`${choiceCell} items-center`}>
            <input
              type="radio"
              name="personType"
              value={value}
              defaultChecked={current === value}
              onChange={() => onChange(value)}
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

/**
 * The fiscal data of a company (D16): razón social, RFC, domicilio fiscal and
 * representante. A persona física reads "Nombre fiscal" and has no
 * representante (D42): the field is hidden and disabled, so its value is not
 * sent but comes back if the person switches to moral again.
 */
export function CompanyFiscalFields({
  state,
  withRfc = true,
  personType: fixedPersonType = 'moral',
}: {
  state: FormState;
  /** The RFC cannot change once the company exists (/cuenta-en-revision). */
  withRfc?: boolean;
  /** Without the RFC, the person type the stored RFC tells. */
  personType?: PersonType;
}) {
  const [chosen, setChosen] = useState<PersonType>(
    state.values?.personType === 'fisica' ? 'fisica' : 'moral',
  );
  const personType = withRfc ? chosen : fixedPersonType;
  const { legalNameLabel, withLegalRepresentative } = fiscalFieldsFor(personType);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {withRfc && <PersonTypeField state={state} value={chosen} onChange={setChosen} />}
      <Field
        name="legalName"
        autoComplete="organization"
        label={legalNameLabel}
        state={state}
        className="sm:col-span-2"
      />
      {withRfc && (
        <Field
          name="rfc"
          label={f.rfc}
          state={state}
          maxLength={20}
          className={withLegalRepresentative ? undefined : 'sm:col-span-2'}
        />
      )}
      <Field
        name="legalRepresentativeName"
        label={f.legalRepresentativeName}
        hint={f.legalRepresentativeHint}
        state={state}
        disabled={!withLegalRepresentative}
        className={cn(!withRfc && 'sm:col-span-2', !withLegalRepresentative && 'hidden')}
      />
      <h4 className="pt-3 text-headline text-text sm:col-span-2">{f.fiscalAddress}</h4>
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
  stepLabel,
  description,
  children,
}: {
  title: string;
  /** "Paso 1 de 5" over the title, in a form in steps (D42). */
  stepLabel?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 border-t pt-6">
      <div className="space-y-1">
        {/* Under 640 px the indicator only names the current step: this says which. */}
        {stepLabel && <p className="text-label text-text-dim sm:hidden">{stepLabel}</p>}
        {/* Focusable from code: the form moves the focus here when a step opens. */}
        <h3 tabIndex={-1} className="text-title3 text-text">
          {title}
        </h3>
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

/** Nothing to listen to: whether the page is hydrated never changes afterwards. */
const noSubscription = () => () => undefined;

/** False while the page is only server HTML, true once React runs it. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/**
 * "¿Tu empresa ya utiliza Transport? Únete con tu invitación" (D43): under
 * the kinds of the sign-up and under "¿Olvidaste tu contraseña?".
 */
export function InvitationEntry({ className }: { className?: string }) {
  const c = authCopy.invitationEntry;
  return (
    <p className={className}>
      {c.question}{' '}
      <Link href={paths.invitation} className="font-semibold text-accent-text hover:underline">
        {c.link}
      </Link>
    </p>
  );
}

/**
 * /registro (G2, D42): the sign-up in two steps of the five, (1) the kind and
 * the account, (2) the fiscal data, the address and the terms. Both steps are
 * one form and stay mounted (the hidden one too), so going back loses
 * nothing, the final send carries every field (the same payload as before)
 * and the browser sees the email and the new password together and offers
 * to save it. What is typed lives only in the fields: nothing goes to any
 * storage. Step 1 is checked here with the shared schema before step 2; an
 * error the server returns for a field of step 1 brings the person back there.
 */
export function SignUpForm() {
  const c = authCopy.signUp;
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<SignUpFormStep>('account');
  const [state, setState] = useState<FormState>({});
  const [kind, setKind] = useState('shipper');
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  // What gets the focus after the next render: the first field with an
  // error, or the title of the step just opened.
  const focusNext = useRef<'error' | 'step' | null>(null);

  useEffect(() => {
    const target = focusNext.current;
    focusNext.current = null;
    const section = formRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    if (!target || !section) return;
    const element =
      (target === 'error' ? section.querySelector<HTMLElement>('[aria-invalid="true"]') : null) ??
      section.querySelector<HTMLElement>('h3');
    element?.focus();
  }, [step, state]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formData = new FormData(event.currentTarget);
    if (step === 'account') {
      const entries = formEntries(formData);
      const parsed = registrationAccountStepSchema.safeParse(entries);
      focusNext.current = parsed.success ? 'step' : 'error';
      if (!parsed.success) {
        const { error, fieldErrors } = invalidForm(parsed.error, entries);
        setState({ error, fieldErrors });
        return;
      }
      setState({});
      setStep('fiscal');
      return;
    }
    startTransition(async () => {
      // On success the action redirects and nothing comes back.
      const result = await signUp({}, formData);
      if (!result) return;
      focusNext.current = 'error';
      setState(result);
      setStep(firstSignUpStepWithError(result.fieldErrors) ?? 'fiscal');
    });
  }

  function back() {
    focusNext.current = 'step';
    setStep('account');
  }

  return (
    // `post` and the buttons off until the page is interactive: a send before
    // that would be the browser's own, and a GET would put the password in the URL.
    <form ref={formRef} method="post" onSubmit={submit} className="space-y-5" noValidate>
      <Steps
        orientation="horizontal"
        label={c.stepsLabel}
        // On a phone the five names do not fit side by side: only the
        // current one shows, the others stay for screen readers.
        steps={signUpStepStates(step).map(({ step: name, state: stepState }) => ({
          label:
            stepState === 'current' ? (
              c.steps[name]
            ) : (
              <span className="sr-only sm:not-sr-only">{c.steps[name]}</span>
            ),
          state: stepState,
        }))}
      />
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <div data-step="account" hidden={step !== 'account'} className="space-y-5">
        <div className="space-y-2">
          <RadioCards
            name="kind"
            label={kinds.label}
            options={KIND_OPTIONS}
            state={state}
            defaultValue="shipper"
            onValueChange={setKind}
          />
          <p aria-live="polite" className="text-footnote text-text-dim empty:hidden">
            {kind === 'carrier' ? kinds.managerNote : ''}
          </p>
          <InvitationEntry className="text-subhead text-text-dim" />
        </div>
        <FormSection title={c.accountSection} stepLabel={c.stepOf(1, 5)}>
          <AccountFields state={state} />
        </FormSection>
      </div>
      <div data-step="fiscal" hidden={step !== 'fiscal'} className="space-y-5">
        <FormSection
          title={c.companySection}
          stepLabel={c.stepOf(2, 5)}
          description={c.companyHint}
        >
          <CompanyFiscalFields state={state} />
        </FormSection>
        <TermsCheckbox state={state} />
      </div>
      {/* The actions stay at the bottom of the window while the step scrolls,
          so the primary is always in view (plan-fulmis.md §0.4). */}
      <div className="sticky bottom-0 z-10 border-t bg-bg py-4">
        {step === 'account' ? (
          <Button type="submit" className="w-full" disabled={!hydrated}>
            {c.next}
          </Button>
        ) : (
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button type="button" variant="secondary" onClick={back} disabled={pending}>
              {c.back}
            </Button>
            <Button type="submit" className="sm:flex-1" disabled={!hydrated} loading={pending}>
              {pending ? c.pending : c.submit}
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}

/**
 * /invitacion (D43, R1): the person pastes the link they got and goes to its
 * page, /invitacion/[token]; a text that is not an invitation link is said
 * on the field.
 */
export function JoinInvitationForm() {
  const c = authCopy.joinInvitation;
  return (
    <ActionForm action={openInvitation} submit={c.submit} pending={c.pending}>
      {(state) => (
        <Field
          name="link"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          label={c.field}
          hint={c.hint}
          state={state}
        />
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
          <TermsCheckbox state={state} />
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

/** /aceptar-terminos (I1): the checkbox and the button, then `next` or home. */
export function AcceptTermsForm({ next }: { next: string | null }) {
  const c = legalCopy.reaccept;
  return (
    <ActionForm action={acceptTerms} submit={c.submit} pending={c.pending}>
      {(state) => (
        <>
          {next && <input type="hidden" name="next" value={next} />}
          <TermsCheckbox state={state} />
        </>
      )}
    </ActionForm>
  );
}
