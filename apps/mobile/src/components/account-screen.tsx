import {
  formatPhone,
  isPhoneAuthEmail,
  mobileAuthCopy,
  mobileErrorCopy,
  mobileNavCopy as nav,
  mobilePhoneCopy,
  normalizeMxPhone,
  userRoleLabels,
} from '@transport/shared';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '../providers/session';
import { colors, spacing } from '../theme';
import { AppearancePicker } from './appearance-picker';
import { LegalLinks } from './legal-links';
import { Body, Button, Field, Notice, Screen, Title } from './ui';

/** "Más" tab: who is signed in, and sign-out. `children` go above the account card. */
export function AccountScreen({ children }: { children?: ReactNode }) {
  const { session, profile, actions } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  const email = session?.user.email;
  const rows: [string, string | null | undefined][] = [
    [mobileAuthCopy.fullNameLabel, profile?.fullName],
    // A phone-only operator (D15-E1) has a synthetic Auth email: never shown.
    [mobileAuthCopy.emailLabel, isPhoneAuthEmail(email) ? null : email],
    [mobileAuthCopy.phoneLabel, profile?.phone ? formatPhone(profile.phone) : null],
    [nav.role, profile ? userRoleLabels[profile.role] : null],
  ];

  async function signOut() {
    setSigningOut(true);
    await actions.signOut();
  }

  return (
    <Screen>
      {children}
      {profile && !profile.phone && session ? <CompletePhone userId={session.user.id} /> : null}
      <Title>{nav.account}</Title>
      {profile?.companyName ? <Text style={styles.company}>{profile.companyName}</Text> : null}
      <View style={styles.card}>
        {rows.map(([label, value]) =>
          value ? (
            <View key={label} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          ) : null,
        )}
      </View>
      <AppearancePicker />
      <Button
        label={mobileAuthCopy.signOut}
        variant="secondary"
        onPress={signOut}
        loading={signingOut}
      />
      <LegalLinks />
    </Screen>
  );
}

/** "Completa tu teléfono" (G2): accounts from before the phone was required. */
function CompletePhone({ userId }: { userId: string }) {
  const { actions, refreshProfile } = useSession();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  async function save() {
    const normalized = normalizeMxPhone(phone);
    if (!normalized) {
      setError(mobileErrorCopy.phoneInvalid);
      return;
    }
    setError(undefined);
    setSaving(true);
    const result = await actions.savePhone(userId, normalized);
    setSaving(false);
    if (result.ok) await refreshProfile();
    else setError(mobileErrorCopy[result.error]);
  }

  return (
    <Notice tone="warning" title={mobilePhoneCopy.title}>
      <Body>{mobilePhoneCopy.body}</Body>
      <Field
        label={mobilePhoneCopy.label}
        value={phone}
        onChangeText={setPhone}
        error={error}
        autoComplete="tel"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
      />
      <Button label={mobilePhoneCopy.save} onPress={() => void save()} loading={saving} />
    </Notice>
  );
}

const styles = StyleSheet.create({
  company: { fontSize: 16, fontWeight: '600', color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  row: { gap: 2 },
  label: { fontSize: 13, color: colors.textMuted },
  value: { fontSize: 16, color: colors.text },
});
