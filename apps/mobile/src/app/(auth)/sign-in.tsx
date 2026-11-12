import { mobileAuthCopy as copy, mobileErrorCopy, signInSchema } from '@transport/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { KeyboardBottomBar } from '../../components/keyboard-bar';
import { BrandBlock, Button, FieldCell, Group, Notice, Screen } from '../../components/ui';
import { validateForm, type FieldErrors } from '../../lib/forms';
import { useSession } from '../../providers/session';

/**
 * Sign-in with "Correo o teléfono" (G2): a phone-only operator types their
 * phone. The brand opens it on its Night block; the two fields in one group
 * and "Entrar" as the only primary, fixed at the bottom over the keyboard;
 * the ways to sign up or to open an invitation stay quiet under the fields.
 */
export default function SignIn() {
  const { actions } = useSession();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [barHeight, setBarHeight] = useState(0);

  async function submit() {
    setFormError(null);
    const parsed = validateForm(signInSchema, { identifier, password });
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    setSubmitting(true);
    const result = await actions.signIn(parsed.data.email, parsed.data.password);
    setSubmitting(false);
    // On success the session changes and the root layout redirects.
    if (!result.ok) setFormError(mobileErrorCopy[result.error]);
  }

  return (
    <>
      <Screen bottom={barHeight}>
        <BrandBlock mark label={copy.signInTitle} title={copy.tagline} />
        {formError ? <Notice tone="danger">{formError}</Notice> : null}
        <Group>
          <FieldCell
            label={copy.identifierLabel}
            value={identifier}
            onChangeText={setIdentifier}
            error={errors.identifier}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            keyboardType="email-address"
            textContentType="username"
          />
          <FieldCell
            label={copy.passwordLabel}
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={submit}
          />
        </Group>
        <Button
          label={copy.goToSignUp}
          variant="secondary"
          onPress={() => router.push('/sign-up')}
        />
        <Button
          label={copy.goToInvite}
          variant="plain"
          onPress={() => router.push('/invitacion')}
        />
      </Screen>
      <KeyboardBottomBar
        action={{
          label: copy.signInAction,
          onPress: () => void submit(),
          loading: submitting,
          size: 'large',
        }}
        onHeight={setBarHeight}
      />
    </>
  );
}
