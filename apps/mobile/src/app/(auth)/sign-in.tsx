import { mobileAuthCopy as copy, mobileErrorCopy, signInSchema } from '@transport/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Button, Field, Notice, Screen, Title } from '../../components/ui';
import { validateForm, type FieldErrors } from '../../lib/forms';
import { useSession } from '../../providers/session';

export default function SignIn() {
  const { actions } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setFormError(null);
    const parsed = validateForm(signInSchema, { email, password });
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    setSubmitting(true);
    const result = await actions.signIn(parsed.data.email, parsed.data.password);
    setSubmitting(false);
    // On success the session changes and the root layout redirects.
    if (!result.ok) setFormError(mobileErrorCopy[result.error]);
  }

  return (
    <Screen>
      <Title subtitle={copy.tagline}>{copy.appName}</Title>
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <Field
        label={copy.emailLabel}
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
      />
      <Field
        label={copy.passwordLabel}
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
      />
      <Button label={copy.signInAction} onPress={submit} loading={submitting} />
      <Button label={copy.goToSignUp} variant="secondary" onPress={() => router.push('/sign-up')} />
      <Button label={copy.goToInvite} variant="link" onPress={() => router.push('/invite')} />
    </Screen>
  );
}
