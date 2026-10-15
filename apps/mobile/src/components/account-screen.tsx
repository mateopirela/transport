import { mobileAuthCopy, mobileNavCopy as nav, userRoleLabels } from '@transport/shared';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '../providers/session';
import { colors, spacing } from '../theme';
import { Button, Screen, Title } from './ui';

/** "Más" tab: who is signed in, and sign-out. `children` go above the account card. */
export function AccountScreen({ children }: { children?: ReactNode }) {
  const { session, profile, actions } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  const rows: [string, string | null | undefined][] = [
    [mobileAuthCopy.fullNameLabel, profile?.fullName],
    [mobileAuthCopy.emailLabel, session?.user.email],
    [nav.role, profile ? userRoleLabels[profile.role] : null],
  ];

  async function signOut() {
    setSigningOut(true);
    await actions.signOut();
  }

  return (
    <Screen>
      {children}
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
      <Button
        label={mobileAuthCopy.signOut}
        variant="secondary"
        onPress={signOut}
        loading={signingOut}
      />
    </Screen>
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
