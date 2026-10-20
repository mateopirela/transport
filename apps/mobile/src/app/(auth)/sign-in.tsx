import { mobileAuthCopy as copy, mobileErrorCopy, signInSchema } from '@transport/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, FieldCell, Group, Notice, Screen } from '../../components/ui';
import { validateForm, type FieldErrors } from '../../lib/forms';
import { useSession } from '../../providers/session';
import { spacing } from '../../theme';

/**
 * Sign-in with "Correo o teléfono" (G2): a phone-only operator types their
 * phone. The two fields in one group and "Entrar" as the only primary; the
 * ways to sign up or to open an invitation as text.
 */
export default function SignIn() {
  const { actions } = useSession();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    <Screen title={copy.appName} subtitle={copy.tagline}>
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
      <Button label={copy.signInAction} onPress={submit} loading={submitting} />
      <View style={styles.links}>
        <Button label={copy.goToSignUp} variant="plain" onPress={() => router.push('/sign-up')} />
        <Button
          label={copy.goToInvite}
          variant="plain"
          onPress={() => router.push('/invitacion')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ links: { marginTop: spacing.sm } });
