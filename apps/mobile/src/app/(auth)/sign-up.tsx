import { carrierSignUpSchema, mobileAuthCopy as copy, mobileErrorCopy } from '@transport/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { CheckEmail } from '../../components/check-email';
import { Button, Field, Notice, Screen, Title } from '../../components/ui';
import { validateForm, type FieldErrors } from '../../lib/forms';
import { useSession } from '../../providers/session';

/** Carrier self sign-up. The company is registered next (app/company.tsx). */
export default function SignUp() {
  const { actions } = useSession();
  const router = useRouter();
  const [values, setValues] = useState({
    fullName: '',
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
    setFormError(null);
    const parsed = validateForm(carrierSignUpSchema, values);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    setSubmitting(true);
    const result = await actions.signUpCarrier(parsed.data);
    setSubmitting(false);
    if (!result.ok) setFormError(mobileErrorCopy[result.error]);
    else if (result.value === 'check_email') setSentTo(parsed.data.email);
  }

  if (sentTo) return <CheckEmail email={sentTo} />;

  return (
    <Screen>
      <Title subtitle={copy.signUpSubtitle}>{copy.signUpTitle}</Title>
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <Field
        label={copy.fullNameLabel}
        value={values.fullName}
        onChangeText={set('fullName')}
        error={errors.fullName}
        autoComplete="name"
        textContentType="name"
      />
      <Field
        label={copy.emailLabel}
        value={values.email}
        onChangeText={set('email')}
        error={errors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
      />
      <Field
        label={copy.phoneLabel}
        value={values.phone}
        onChangeText={set('phone')}
        error={errors.phone}
        autoComplete="tel"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
      />
      <Field
        label={copy.passwordLabel}
        value={values.password}
        onChangeText={set('password')}
        error={errors.password}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Field
        label={copy.passwordConfirmLabel}
        value={values.passwordConfirmation}
        onChangeText={set('passwordConfirmation')}
        error={errors.passwordConfirmation}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Button label={copy.signUpAction} onPress={submit} loading={submitting} />
      <Button label={copy.goToSignIn} variant="link" onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}
