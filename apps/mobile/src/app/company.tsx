import {
  companyFormSchema,
  mobileAuthCopy,
  mobileCompanyCopy as copy,
  mobileErrorCopy,
  PERSON_TYPES,
} from '@transport/shared';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Field, Notice, Screen, Title } from '../components/ui';
import { validateForm, type FieldErrors } from '../lib/forms';
import { useSession } from '../providers/session';
import { colors, spacing } from '../theme';

type PersonType = (typeof PERSON_TYPES)[number];

const PERSON_LABELS: Record<PersonType, string> = {
  moral: copy.personTypeMoral,
  fisica: copy.personTypeFisica,
};

/**
 * Carrier company registration after sign-up (create_company RPC). The company
 * starts "en revisión"; documents and fleet come in B18.
 */
export default function CompanySetup() {
  const { session, profile, actions, refreshProfile } = useSession();
  const [values, setValues] = useState({
    personType: 'moral' as PersonType,
    legalName: '',
    rfc: '',
    contactName: profile?.fullName ?? '',
    contactEmail: session?.user.email ?? '',
    contactPhone: profile?.phone ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: Exclude<keyof typeof values, 'personType'>) => (text: string) =>
    setValues((current) => ({ ...current, [field]: text }));

  async function submit() {
    setFormError(null);
    const parsed = validateForm(companyFormSchema, { ...values, type: 'carrier' });
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    setSubmitting(true);
    const result = await actions.createCompany(parsed.data);
    if (result.ok) await refreshProfile();
    else setFormError(mobileErrorCopy[result.error]);
    setSubmitting(false);
  }

  return (
    <Screen>
      <Title subtitle={copy.subtitle}>{copy.title}</Title>
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <View style={styles.group}>
        <Text style={styles.label}>{copy.personTypeLabel}</Text>
        <View style={styles.row}>
          {PERSON_TYPES.map((type) => (
            <View key={type} style={styles.flex}>
              <Button
                label={PERSON_LABELS[type]}
                variant={values.personType === type ? 'primary' : 'secondary'}
                onPress={() => setValues((current) => ({ ...current, personType: type }))}
              />
            </View>
          ))}
        </View>
      </View>
      <Field
        label={copy.legalNameLabel}
        value={values.legalName}
        onChangeText={set('legalName')}
        error={errors.legalName}
        autoComplete="organization"
      />
      <Field
        label={copy.rfcLabel}
        value={values.rfc}
        onChangeText={set('rfc')}
        error={errors.rfc}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Field
        label={mobileAuthCopy.fullNameLabel}
        value={values.contactName}
        onChangeText={set('contactName')}
        error={errors.contactName}
        autoComplete="name"
      />
      <Field
        label={mobileAuthCopy.emailLabel}
        value={values.contactEmail}
        onChangeText={set('contactEmail')}
        error={errors.contactEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Field
        label={mobileAuthCopy.phoneLabel}
        value={values.contactPhone}
        onChangeText={set('contactPhone')}
        error={errors.contactPhone}
        keyboardType="phone-pad"
      />
      <Button label={copy.saveAction} onPress={submit} loading={submitting} />
      <Button
        label={mobileAuthCopy.signOut}
        variant="link"
        onPress={() => void actions.signOut()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
});
