import {
  accessResetFormSchema,
  coordinatorSignUpSchema,
  formatDateTime,
  mobileAuthCopy,
  mobileErrorCopy,
  mobileInviteCopy as copy,
  operatorRedeemFormSchema,
  type Database,
} from '@transport/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { View, type ScrollView } from 'react-native';

import { CheckEmail } from '../../components/check-email';
import { useFieldScroll } from '../../components/field-scroll';
import { KeyboardBottomBar } from '../../components/keyboard-bar';
import { TermsCheckbox } from '../../components/legal-links';
import {
  Button,
  FieldCell,
  Group,
  groupInset,
  Loading,
  Notice,
  Screen,
  TextCell,
} from '../../components/ui';
import { invitationTokenParam } from '../../lib/deep-links';
import { validateForm, type FieldErrors } from '../../lib/forms';
import { firstFieldWithError } from '../../lib/sign-up';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../providers/session';

type Preview = Database['public']['Functions']['invitation_preview']['Returns'][number];

/** The order the fields of each form are laid out in, to scroll to the first error. */
const COORDINATOR_FIELDS = [
  'fullName',
  'email',
  'phone',
  'password',
  'passwordConfirmation',
  'acceptTerms',
] as const;
const OPERATOR_FIELDS = [
  'fullName',
  'phone',
  'email',
  'password',
  'passwordConfirmation',
  'acceptTerms',
] as const;
const RESET_FIELDS = ['password', 'passwordConfirmation'] as const;

/**
 * transport://invitacion/<token> (G1b, G2). The preview (invitation_preview,
 * public by design: the token is the credential) tells the kind:
 *   - coordinator: create the account (the token waits for the e-mail
 *     confirmation) or, signed in as a Coordinador without a company, join;
 *   - operator: name, phone, password and optional e-mail; the Edge Function
 *     creates the account and the app signs in with the phone;
 *   - operator_access_reset: a new password.
 * Unknown, used and expired links all look the same. Each form keeps its one
 * primary fixed at the bottom, over the keyboard, and goes to the field with
 * the first error (R6: on a small phone the end of the form is out of sight).
 */
export default function InvitationScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = invitationTokenParam(params.token);
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);

  useEffect(() => {
    if (!token || !supabase) return;
    let cancelled = false;
    void Promise.resolve(supabase.rpc('invitation_preview', { p_token: token })).then(
      ({ data }) => {
        if (!cancelled) setPreview(data?.[0] ?? null);
      },
      () => {
        if (!cancelled) setPreview(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token || !supabase) return <InvalidInvitation />;
  if (preview === undefined) {
    return (
      <Screen>
        <Loading label={copy.loading} />
      </Screen>
    );
  }
  if (!preview) return <InvalidInvitation />;

  return preview.kind === 'coordinator' ? (
    <CoordinatorInvitation token={token} preview={preview} />
  ) : (
    <OperatorInvitation token={token} preview={preview} />
  );
}

function subtitleFor(preview: Preview): string {
  switch (preview.kind) {
    case 'coordinator':
      return copy.coordinatorSubtitle(preview.company_legal_name);
    case 'operator':
      return copy.operatorSubtitle(preview.company_legal_name);
    case 'operator_access_reset':
      return copy.resetSubtitle(preview.company_legal_name);
  }
}

function InvalidInvitation() {
  const router = useRouter();
  return (
    <Screen title={copy.invalidTitle} subtitle={copy.invalidBody}>
      <Button
        label={copy.openLinkAction}
        variant="secondary"
        onPress={() => router.replace('/invitacion')}
      />
    </Screen>
  );
}

/** The one primary of a step of the invitation, fixed at the bottom. */
type BarAction = { label: string; onPress: () => void; loading?: boolean };

/**
 * A valid invitation: its title, who invites and to what over `children`,
 * and `action` (the step's one primary) in the bar fixed at the bottom,
 * which rides on the keyboard.
 */
function InvitationLayout({
  preview,
  action,
  scrollRef,
  children,
}: {
  preview: Preview;
  action?: BarAction | undefined;
  scrollRef?: RefObject<ScrollView | null>;
  children: ReactNode;
}) {
  const [barHeight, setBarHeight] = useState(0);
  return (
    <>
      <Screen
        title={copy.title}
        subtitle={subtitleFor(preview)}
        bottom={action ? barHeight : 0}
        barOverKeyboard
        scrollRef={scrollRef}
      >
        <InvitationDetails preview={preview} />
        {children}
      </Screen>
      {action ? (
        <KeyboardBottomBar action={{ ...action, size: 'large' }} onHeight={setBarHeight} />
      ) : null}
    </>
  );
}

function InvitationDetails({ preview }: { preview: Preview }) {
  const units = preview.business_unit_names.join(', ');
  return (
    <Group inset={groupInset.icon}>
      <TextCell icon="people">
        {`${preview.kind === 'coordinator' ? copy.coordinatorUnits : copy.operatorUnit}: ${units}`}
      </TextCell>
      {preview.inviter_name ? (
        <TextCell icon="person">{copy.invitedBy(preview.inviter_name)}</TextCell>
      ) : null}
      <TextCell icon="time" tone="dim">
        {copy.expires(formatDateTime(preview.expires_at))}
      </TextCell>
    </Group>
  );
}

/** Signed in already: only a Coordinador without a company can use a coordinator link. */
function CoordinatorInvitation({ token, preview }: { token: string; preview: Preview }) {
  const { session, profile } = useSession();
  if (!session) return <CoordinatorSignUp token={token} preview={preview} />;
  if (profile?.role === 'coordinator' && !profile.companyId) {
    return <JoinCompany token={token} preview={preview} />;
  }
  return <WrongAccount preview={preview} message={copy.coordinatorWrongAccount} />;
}

function WrongAccount({ preview, message }: { preview: Preview; message: string }) {
  const { actions } = useSession();
  return (
    <InvitationLayout preview={preview}>
      <Notice tone="warning">{message}</Notice>
      <Button
        label={mobileAuthCopy.signOut}
        variant="secondary"
        onPress={() => void actions.signOut()}
      />
    </InvitationLayout>
  );
}

function JoinCompany({ token, preview }: { token: string; preview: Preview }) {
  const { actions, refreshProfile } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function join() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await actions.acceptCoordinatorInvitation(token);
      if (result.ok) {
        await refreshProfile();
        // Invitation routes are open to any session (lib/routing.ts), so the
        // guard does not move the new Coordinador: go to their step 4 (R3,
        // D43), the units of their business units with their documents.
        router.replace('/units');
      } else setError(mobileErrorCopy[result.error]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <InvitationLayout
      preview={preview}
      action={{ label: copy.coordinatorJoin, onPress: () => void join(), loading: submitting }}
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </InvitationLayout>
  );
}

function CoordinatorSignUp({ token, preview }: { token: string; preview: Preview }) {
  const { actions } = useSession();
  const [values, setValues] = useState({
    fullName: preview.invitee_name ?? '',
    email: '',
    phone: '',
    password: '',
    passwordConfirmation: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // I1: the terms checkbox, required.
  const [acceptTerms, setAcceptTerms] = useState(false);
  const { scrollRef, register, scrollTo } = useFieldScroll();

  const set = (field: keyof typeof values) => (text: string) =>
    setValues((current) => ({ ...current, [field]: text }));

  async function submit() {
    if (submitting) return;
    setFormError(null);
    const parsed = validateForm(coordinatorSignUpSchema, { ...values, acceptTerms });
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) {
      scrollTo(firstFieldWithError(parsed.errors, COORDINATOR_FIELDS));
      return;
    }
    setSubmitting(true);
    const result = await actions.signUpCoordinator({
      token,
      email: parsed.data.email,
      password: parsed.data.password,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
    });
    setSubmitting(false);
    if (!result.ok) {
      setFormError(mobileErrorCopy[result.error]);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } else if (result.value === 'check_email') setSentTo(parsed.data.email);
  }

  if (sentTo) {
    return (
      <InvitationLayout preview={preview}>
        <CheckEmail email={sentTo} inline>
          <Notice tone="info">{copy.pendingTokenNotice}</Notice>
        </CheckEmail>
      </InvitationLayout>
    );
  }

  return (
    <InvitationLayout
      preview={preview}
      scrollRef={scrollRef}
      action={{
        label: copy.createAccountAction,
        onPress: () => void submit(),
        loading: submitting,
      }}
    >
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <Group>
        <FieldCell
          label={mobileAuthCopy.fullNameLabel}
          value={values.fullName}
          onChangeText={set('fullName')}
          error={errors.fullName}
          inputRef={register('fullName')}
          autoComplete="name"
          textContentType="name"
        />
        <FieldCell
          label={mobileAuthCopy.emailLabel}
          value={values.email}
          onChangeText={set('email')}
          error={errors.email}
          inputRef={register('email')}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
        />
        <FieldCell
          label={mobileAuthCopy.phoneLabel}
          value={values.phone}
          onChangeText={set('phone')}
          error={errors.phone}
          inputRef={register('phone')}
          autoComplete="tel"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
        />
      </Group>
      <PasswordFields values={values} errors={errors} set={set} register={register} />
      <View ref={register('acceptTerms')}>
        <TermsCheckbox checked={acceptTerms} onChange={setAcceptTerms} error={errors.acceptTerms} />
      </View>
    </InvitationLayout>
  );
}

function PasswordFields({
  values,
  errors,
  set,
  register,
}: {
  values: { password: string; passwordConfirmation: string };
  errors: FieldErrors;
  set: (field: 'password' | 'passwordConfirmation') => (text: string) => void;
  register: ReturnType<typeof useFieldScroll>['register'];
}) {
  return (
    <Group>
      <FieldCell
        label={mobileAuthCopy.passwordLabel}
        value={values.password}
        onChangeText={set('password')}
        error={errors.password}
        inputRef={register('password')}
        secureTextEntry
        revealable
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <FieldCell
        label={mobileAuthCopy.passwordConfirmLabel}
        value={values.passwordConfirmation}
        onChangeText={set('passwordConfirmation')}
        error={errors.passwordConfirmation}
        inputRef={register('passwordConfirmation')}
        secureTextEntry
        revealable
        autoComplete="new-password"
        textContentType="newPassword"
      />
    </Group>
  );
}

/** Operator links are only for a visitor: an account is never re-linked here. */
function OperatorInvitation({ token, preview }: { token: string; preview: Preview }) {
  const { session } = useSession();
  if (session) return <WrongAccount preview={preview} message={copy.signOutHint} />;
  return preview.kind === 'operator' ? (
    <OperatorRedeem token={token} preview={preview} />
  ) : (
    <AccessReset token={token} preview={preview} />
  );
}

/** After an operator link: what happened, and the way to the sign-in as the primary. */
function DoneWithInvitation({ preview, message }: { preview: Preview; message: string }) {
  const router = useRouter();
  return (
    <InvitationLayout
      preview={preview}
      action={{ label: mobileAuthCopy.goToSignIn, onPress: () => router.replace('/sign-in') }}
    >
      <Notice tone="info">{message}</Notice>
    </InvitationLayout>
  );
}

function OperatorRedeem({ token, preview }: { token: string; preview: Preview }) {
  const { actions } = useSession();
  const router = useRouter();
  const [values, setValues] = useState({
    fullName: '',
    phone: '',
    email: '',
    password: '',
    passwordConfirmation: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redeemed, setRedeemed] = useState(false);
  // I1: the terms checkbox, required.
  const [acceptTerms, setAcceptTerms] = useState(false);
  const { scrollRef, register, scrollTo } = useFieldScroll();

  const set = (field: keyof typeof values) => (text: string) =>
    setValues((current) => ({ ...current, [field]: text }));

  async function submit() {
    if (submitting) return;
    setFormError(null);
    const parsed = validateForm(operatorRedeemFormSchema, { ...values, acceptTerms });
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) {
      scrollTo(firstFieldWithError(parsed.errors, OPERATOR_FIELDS));
      return;
    }
    setSubmitting(true);
    const result = await actions.redeemOperatorInvitation({
      token,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      password: parsed.data.password,
      email: parsed.data.email,
    });
    setSubmitting(false);
    if (!result.ok) {
      setFormError(mobileErrorCopy[result.error]);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } else if (result.value === 'redeemed') setRedeemed(true);
    // Signed in: invitation routes are open to any session (lib/routing.ts),
    // so go to the operator's area explicitly, on their step 4 (R3, D43):
    // their INE, license and selfie.
    else router.replace('/documents');
  }

  if (redeemed) return <DoneWithInvitation preview={preview} message={copy.operatorDone} />;

  return (
    <InvitationLayout
      preview={preview}
      scrollRef={scrollRef}
      action={{
        label: submitting ? copy.operatorSigningIn : copy.operatorSubmit,
        onPress: () => void submit(),
        loading: submitting,
      }}
    >
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <Group>
        <FieldCell
          label={mobileAuthCopy.fullNameLabel}
          value={values.fullName}
          onChangeText={set('fullName')}
          error={errors.fullName}
          inputRef={register('fullName')}
          autoComplete="name"
          textContentType="name"
        />
        <FieldCell
          label={mobileAuthCopy.phoneLabel}
          value={values.phone}
          onChangeText={set('phone')}
          error={errors.phone}
          inputRef={register('phone')}
          autoComplete="tel"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
        />
        <FieldCell
          label={mobileAuthCopy.optionalEmailLabel}
          value={values.email}
          onChangeText={set('email')}
          error={errors.email}
          inputRef={register('email')}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
      </Group>
      <PasswordFields values={values} errors={errors} set={set} register={register} />
      <View ref={register('acceptTerms')}>
        <TermsCheckbox checked={acceptTerms} onChange={setAcceptTerms} error={errors.acceptTerms} />
      </View>
    </InvitationLayout>
  );
}

function AccessReset({ token, preview }: { token: string; preview: Preview }) {
  const { actions } = useSession();
  const [values, setValues] = useState({ password: '', passwordConfirmation: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const { scrollRef, register, scrollTo } = useFieldScroll();

  const set = (field: keyof typeof values) => (text: string) =>
    setValues((current) => ({ ...current, [field]: text }));

  async function submit() {
    if (submitting) return;
    setFormError(null);
    const parsed = validateForm(accessResetFormSchema, values);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) {
      scrollTo(firstFieldWithError(parsed.errors, RESET_FIELDS));
      return;
    }
    setSubmitting(true);
    const result = await actions.redeemAccessReset({ token, password: parsed.data.password });
    setSubmitting(false);
    if (result.ok) setDone(true);
    else {
      setFormError(mobileErrorCopy[result.error]);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }

  if (done) return <DoneWithInvitation preview={preview} message={copy.resetDone} />;

  return (
    <InvitationLayout
      preview={preview}
      scrollRef={scrollRef}
      action={{ label: copy.resetSubmit, onPress: () => void submit(), loading: submitting }}
    >
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <PasswordFields values={values} errors={errors} set={set} register={register} />
    </InvitationLayout>
  );
}
