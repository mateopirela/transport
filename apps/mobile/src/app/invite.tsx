import {
  invitationCodeField,
  mobileAuthCopy,
  mobileErrorCopy,
  mobileInviteCopy as copy,
  operatorSignUpSchema,
} from '@transport/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { CheckEmail } from '../components/check-email';
import { Button, Field, Loading, Notice, Screen, Title } from '../components/ui';
import { invitationCodeParam } from '../lib/deep-links';
import { isFinalInvitationError } from '../lib/errors';
import { validateForm, type FieldErrors } from '../lib/forms';
import { useSession } from '../providers/session';

/**
 * "Unirme con invitación" (D15). Opened from the carrier's link
 * (transport://invite?code=…) or from the sign-in screen.
 *   - Signed out: create the operator account; the code is accepted once the
 *     e-mail is confirmed.
 *   - Signed in as an operator without a carrier: accept the stored code
 *     automatically, or type one.
 */
export default function Invite() {
  const { area } = useSession();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const initialCode = invitationCodeParam(params.code);
  return area === 'join' ? (
    <AcceptInvitation initialCode={initialCode} />
  ) : (
    <OperatorSignUp initialCode={initialCode} />
  );
}

function OperatorSignUp({ initialCode }: { initialCode: string }) {
  const { actions } = useSession();
  const router = useRouter();
  const [values, setValues] = useState({
    invitationCode: initialCode,
    fullName: '',
    email: '',
    password: '',
    passwordConfirmation: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Saving the code before switching to sign-in.
  const [leaving, setLeaving] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const set = (field: keyof typeof values) => (text: string) =>
    setValues((current) => ({ ...current, [field]: text }));

  async function submit() {
    if (submitting || leaving) return;
    setFormError(null);
    const parsed = validateForm(operatorSignUpSchema, values);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    setSubmitting(true);
    const result = await actions.signUpOperator(parsed.data);
    setSubmitting(false);
    if (!result.ok) setFormError(mobileErrorCopy[result.error]);
    else if (result.value === 'check_email') setSentTo(parsed.data.email);
  }

  /** Operators who already have an account sign in; the code waits for them. */
  async function signInInstead() {
    if (submitting || leaving) return;
    setFormError(null);
    const parsed = invitationCodeField.safeParse(values.invitationCode);
    if (parsed.success) {
      setLeaving(true);
      const saved = await actions.rememberInvitation(parsed.data);
      setLeaving(false);
      // Without the saved code the operator would have to find it again.
      if (!saved.ok) {
        setFormError(mobileErrorCopy[saved.error]);
        return;
      }
    }
    router.replace('/sign-in');
  }

  if (sentTo) {
    return (
      <CheckEmail email={sentTo}>
        <Notice tone="info">{copy.pendingCodeNotice}</Notice>
      </CheckEmail>
    );
  }

  return (
    <Screen>
      <Title subtitle={copy.subtitle}>{copy.title}</Title>
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <Field
        label={copy.codeLabel}
        value={values.invitationCode}
        onChangeText={set('invitationCode')}
        error={errors.invitationCode}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Field
        label={mobileAuthCopy.fullNameLabel}
        value={values.fullName}
        onChangeText={set('fullName')}
        error={errors.fullName}
        autoComplete="name"
        textContentType="name"
      />
      <Field
        label={mobileAuthCopy.emailLabel}
        value={values.email}
        onChangeText={set('email')}
        error={errors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
      />
      <Field
        label={mobileAuthCopy.passwordLabel}
        value={values.password}
        onChangeText={set('password')}
        error={errors.password}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Field
        label={mobileAuthCopy.passwordConfirmLabel}
        value={values.passwordConfirmation}
        onChangeText={set('passwordConfirmation')}
        error={errors.passwordConfirmation}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Button
        label={copy.createAccountAction}
        onPress={submit}
        loading={submitting}
        disabled={leaving}
      />
      <Button
        label={copy.haveAccountAction}
        variant="link"
        onPress={signInInstead}
        loading={leaving}
        disabled={submitting}
      />
    </Screen>
  );
}

function AcceptInvitation({ initialCode }: { initialCode: string }) {
  const { actions, refreshProfile } = useSession();
  const [code, setCode] = useState(initialCode);
  const [codeError, setCodeError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [checkingPending, setCheckingPending] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const triedPending = useRef(false);

  // First try the code saved at sign-up (it survives the e-mail confirmation).
  useEffect(() => {
    if (triedPending.current) return;
    triedPending.current = true;
    void (async () => {
      try {
        const pending = await actions.acceptPendingInvitation();
        if (!pending) return;
        if (pending.result.ok) {
          await refreshProfile();
          return;
        }
        setFormError(mobileErrorCopy[pending.result.error]);
        // A transient failure (e.g. no connection) keeps the code: prefill it
        // so the operator can retry with one tap.
        if (!isFinalInvitationError(pending.result.error)) setCode(pending.code);
      } finally {
        setCheckingPending(false);
      }
    })();
  }, [actions, refreshProfile]);

  async function submit() {
    setFormError(null);
    const parsed = invitationCodeField.safeParse(code);
    setCodeError(parsed.success ? undefined : parsed.error.issues[0]?.message);
    if (!parsed.success) return;
    setSubmitting(true);
    try {
      const result = await actions.acceptInvitation(parsed.data);
      if (result.ok) await refreshProfile();
      else setFormError(mobileErrorCopy[result.error]);
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingPending) return <Loading label={copy.accepting} />;

  return (
    <Screen>
      <Title subtitle={copy.subtitle}>{copy.title}</Title>
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <Field
        label={copy.codeLabel}
        value={code}
        onChangeText={setCode}
        error={codeError}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Button label={copy.acceptAction} onPress={submit} loading={submitting} />
      <Button
        label={mobileAuthCopy.signOut}
        variant="link"
        onPress={() => void actions.signOut()}
      />
    </Screen>
  );
}
