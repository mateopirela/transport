import {
  carrierSignUpSchema,
  mobileAuthCopy as copy,
  mobileErrorCopy,
  type CarrierSignUpKind,
} from '@transport/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { CheckEmail } from '../../components/check-email';
import { LegalLinks } from '../../components/legal-links';
import { OptionGroup } from '../../components/option-group';
import { Button, FieldCell, Group, Notice, Screen } from '../../components/ui';
import { validateForm, type FieldErrors } from '../../lib/forms';
import { useSession } from '../../providers/session';

const KINDS: { value: CarrierSignUpKind; label: string }[] = [
  { value: 'carrier', label: copy.signUpKindCarrier },
  { value: 'owner_operator', label: copy.signUpKindOwnerOperator },
];

/**
 * Carrier self sign-up: a company or a hombre-camión (D13). The company and
 * its fiscal data are registered next (app/company.tsx). One group per step:
 * what is registered, who the person is, the password.
 */
export default function SignUp() {
  const { actions } = useSession();
  const router = useRouter();
  const [values, setValues] = useState({
    kind: 'carrier' as CarrierSignUpKind,
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

  const set = (field: Exclude<keyof typeof values, 'kind'>) => (text: string) =>
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
    <Screen title={copy.signUpTitle} subtitle={copy.signUpSubtitle}>
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <OptionGroup
        label={copy.signUpKindLabel}
        options={KINDS}
        value={values.kind}
        onChange={(kind) => setValues((current) => ({ ...current, kind }))}
        hint={values.kind === 'owner_operator' ? copy.signUpKindOwnerOperatorHint : undefined}
        error={errors.kind}
      />
      <Group>
        <FieldCell
          label={copy.fullNameLabel}
          value={values.fullName}
          onChangeText={set('fullName')}
          error={errors.fullName}
          autoComplete="name"
          textContentType="name"
        />
        <FieldCell
          label={copy.emailLabel}
          value={values.email}
          onChangeText={set('email')}
          error={errors.email}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
        />
        <FieldCell
          label={copy.phoneLabel}
          value={values.phone}
          onChangeText={set('phone')}
          error={errors.phone}
          autoComplete="tel"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
        />
      </Group>
      <Group>
        <FieldCell
          label={copy.passwordLabel}
          value={values.password}
          onChangeText={set('password')}
          error={errors.password}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <FieldCell
          label={copy.passwordConfirmLabel}
          value={values.passwordConfirmation}
          onChangeText={set('passwordConfirmation')}
          error={errors.passwordConfirmation}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
      </Group>
      <Button label={copy.signUpAction} onPress={submit} loading={submitting} />
      <LegalLinks consent />
      <Button label={copy.goToSignIn} variant="plain" onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}
