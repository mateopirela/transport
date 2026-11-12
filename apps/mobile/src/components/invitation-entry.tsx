import { mobileAuthCopy as copy } from '@transport/shared';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { spacing } from '../theme';
import { Button, Footnote } from './ui';

/**
 * "¿Tu empresa ya utiliza Transport? Únete con tu invitación" (D43): under
 * the sign-in fields and under the kinds of the sign-up. Opens the screen
 * where an invitation link is pasted (invitacion/index.tsx), whose logic
 * does not change.
 */
export function InvitationEntry() {
  const router = useRouter();
  return (
    <View style={styles.entry}>
      <Footnote>{copy.invitationQuestion}</Footnote>
      <Button
        label={copy.invitationLink}
        variant="plain"
        onPress={() => router.push('/invitacion')}
      />
    </View>
  );
}

// The question sits right over its link.
const styles = StyleSheet.create({ entry: { gap: spacing.xs } });
