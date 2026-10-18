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
import { useEffect, useState } from 'react';

import { CheckEmail } from '../../components/check-email';
import { Body, Button, Field, Loading, Notice, Screen, Title } from '../../components/ui';
import { invitationTokenParam } from '../../lib/deep-links';
import { validateForm, type FieldErrors } from '../../lib/forms';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../providers/session';

type Preview = Database['public']['Functions']['invitation_preview']['Returns'][number];

/**
 * transport://invitacion/<token> (G1b, G2). The preview (invitation_preview,
 * public by design: the token is the credential) tells the kind:
 *   - coordinator: create the account (the token waits for the e-mail
 *     confirmation) or, signed in as a Coordinador without a company, join;
 *   - operator: name, phone, password and optional e-mail; the Edge Function
 *     creates the account and the app signs in with the phone;
 *   - operator_access_reset: a new password.
 * Unknown, used and expired links all look the same.
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
  if (preview === undefined) return <Loading label={copy.loading} />;
  if (!preview) return <InvalidInvitation />;

  return (
    <Screen>
      <Title subtitle={subtitleFor(preview)}>{copy.title}</Title>
      <InvitationDetails preview={preview} />
      {preview.kind === 'coordinator' ? (
        <CoordinatorInvitation token={token} preview={preview} />
      ) : (
        <OperatorInvitation token={token} kind={preview.kind} />
      )}
    </Screen>
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
    <Screen>
      <Title subtitle={copy.invalidBody}>{copy.invalidTitle}</Title>
      <Button
        label={copy.openLinkAction}
        variant="secondary"
        onPress={() => router.replace('/invitacion')}
      />
    </Screen>
  );
}

function InvitationDetails({ preview }: { preview: Preview }) {
  const units = preview.business_unit_names.join(', ');
  return (
    <Notice tone="info">
      <Body>
        {`${preview.kind === 'coordinator' ? copy.coordinatorUnits : copy.operatorUnit}: ${units}`}
      </Body>
      {preview.inviter_name ? <Body>{copy.invitedBy(preview.inviter_name)}</Body> : null}
      <Body>{copy.expires(formatDateTime(preview.expires_at))}</Body>
    </Notice>
  );
}

/** Signed in already: only a Coordinador without a company can use a coordinator link. */
function CoordinatorInvitation({ token, preview }: { token: string; preview: Preview }) {
  const { session, profile } = useSession();
  if (!session) return <CoordinatorSignUp token={token} inviteeName={preview.invitee_name} />;
  if (profile?.role === 'coordinator' && !profile.companyId) return <JoinCompany token={token} />;
  return <WrongAccount message={copy.coordinatorWrongAccount} />;
}

function WrongAccount({ message }: { message: string }) {
  const { actions } = useSession();
  return (
    <>
      <Notice tone="warning">{message}</Notice>
      <Button
        label={mobileAuthCopy.signOut}
        variant="secondary"
        onPress={() => void actions.signOut()}
      />
    </>
  );
}

function JoinCompany({ token }: { token: string }) {
  const { actions, refreshProfile } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function join() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await actions.acceptCoordinatorInvitation(token);
      if (result.ok) await refreshProfile();
      else setError(mobileErrorCopy[result.error]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button label={copy.coordinatorJoin} onPress={() => void join()} loading={submitting} />
    </>
  );
}

function CoordinatorSignUp({ token, inviteeName }: { token: string; inviteeName: string | null }) {
  const { actions } = useSession();
  const [values, setValues] = useState({
    fullName: inviteeName ?? '',
    email: '',
    phone: '',
    password: '',
    passwordConfirmation: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const set = (field: keyof typeof values) => (text: string) =>
    setValues((current) => ({ ...current, [field]: text }));

  async function submit() {
    if (submitting) return;
    setFormError(null);
    const parsed = validateForm(coordinatorSignUpSchema, values);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    setSubmitting(true);
    const result = await actions.signUpCoordinator({
      token,
      email: parsed.data.email,
      password: parsed.data.password,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
    });
    setSubmitting(false);
    if (!result.ok) setFormError(mobileErrorCopy[result.error]);
    else if (result.value === 'check_email') setSentTo(parsed.data.email);
  }

  if (sentTo) {
    return (
      <CheckEmail email={sentTo}>
        <Notice tone="info">{copy.pendingTokenNotice}</Notice>
      </CheckEmail>
    );
  }

  return (
    <>
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
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
        label={mobileAuthCopy.phoneLabel}
        value={values.phone}
        onChangeText={set('phone')}
        error={errors.phone}
        autoComplete="tel"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
      />
      <PasswordFields values={values} errors={errors} set={set} />
      <Button label={copy.createAccountAction} onPress={() => void submit()} loading={submitting} />
    </>
  );
}

function PasswordFields({
  values,
  errors,
  set,
}: {
  values: { password: string; passwordConfirmation: string };
  errors: FieldErrors;
  set: (field: 'password' | 'passwordConfirmation') => (text: string) => void;
}) {
  return (
    <>
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
    </>
  );
}

/** Operator links are only for a visitor: an account is never re-linked here. */
function OperatorInvitation({
  token,
  kind,
}: {
  token: string;
  kind: 'operator' | 'operator_access_reset';
}) {
  const { session } = useSession();
  if (session) return <WrongAccount message={copy.signOutHint} />;
  return kind === 'operator' ? <OperatorRedeem token={token} /> : <AccessReset token={token} />;
}

function OperatorRedeem({ token }: { token: string }) {
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

  const set = (field: keyof typeof values) => (text: string) =>
    setValues((current) => ({ ...current, [field]: text }));

  async function submit() {
    if (submitting) return;
    setFormError(null);
    const parsed = validateForm(operatorRedeemFormSchema, values);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    setSubmitting(true);
    const result = await actions.redeemOperatorInvitation({
      token,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      password: parsed.data.password,
      email: parsed.data.email,
    });
    setSubmitting(false);
    if (!result.ok) setFormError(mobileErrorCopy[result.error]);
    // Signed in: the session moves the user to the operator area by itself.
    else if (result.value === 'redeemed') setRedeemed(true);
  }

  if (redeemed) {
    return (
      <>
        <Notice tone="info">{copy.operatorDone}</Notice>
        <Button label={mobileAuthCopy.goToSignIn} onPress={() => router.replace('/sign-in')} />
      </>
    );
  }

  return (
    <>
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <Field
        label={mobileAuthCopy.fullNameLabel}
        value={values.fullName}
        onChangeText={set('fullName')}
        error={errors.fullName}
        autoComplete="name"
        textContentType="name"
      />
      <Field
        label={mobileAuthCopy.phoneLabel}
        value={values.phone}
        onChangeText={set('phone')}
        error={errors.phone}
        autoComplete="tel"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
      />
      <Field
        label={mobileAuthCopy.optionalEmailLabel}
        value={values.email}
        onChangeText={set('email')}
        error={errors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
      />
      <PasswordFields values={values} errors={errors} set={set} />
      <Button
        label={submitting ? copy.operatorSigningIn : copy.operatorSubmit}
        onPress={() => void submit()}
        loading={submitting}
      />
    </>
  );
}

function AccessReset({ token }: { token: string }) {
  const { actions } = useSession();
  const router = useRouter();
  const [values, setValues] = useState({ password: '', passwordConfirmation: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const set = (field: keyof typeof values) => (text: string) =>
    setValues((current) => ({ ...current, [field]: text }));

  async function submit() {
    if (submitting) return;
    setFormError(null);
    const parsed = validateForm(accessResetFormSchema, values);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    setSubmitting(true);
    const result = await actions.redeemAccessReset({ token, password: parsed.data.password });
    setSubmitting(false);
    if (result.ok) setDone(true);
    else setFormError(mobileErrorCopy[result.error]);
  }

  if (done) {
    return (
      <>
        <Notice tone="info">{copy.resetDone}</Notice>
        <Button label={mobileAuthCopy.goToSignIn} onPress={() => router.replace('/sign-in')} />
      </>
    );
  }

  return (
    <>
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <PasswordFields values={values} errors={errors} set={set} />
      <Button label={copy.resetSubmit} onPress={() => void submit()} loading={submitting} />
    </>
  );
}
