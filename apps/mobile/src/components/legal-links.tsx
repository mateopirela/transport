import { legalCopy, legalUrl } from '@transport/shared';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { spacing, useTheme } from '../theme';
import { Button, Cell, Group, groupInset } from './ui';

// Public web URL (B27); the legal pages live there. Static access so Expo
// inlines it in the bundle. Without it the links are hidden (local dev).
const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL;

/**
 * Links to the privacy notice and the terms (the stores require them inside
 * the app). In the account, a group of rows that open the web; with
 * `consent`, under a form: the sign-up acceptance sentence and the two links
 * as text.
 */
export function LegalLinks({ consent = false }: { consent?: boolean }) {
  const { type } = useTheme();
  const privacy = legalUrl(SITE_URL, 'privacy');
  const terms = legalUrl(SITE_URL, 'terms');
  if (!privacy || !terms) return null;
  const open = (url: string) => () => void Linking.openURL(url);

  if (!consent) {
    return (
      <Group inset={groupInset.icon}>
        <Cell icon="legal" role="link" title={legalCopy.termsLink} onPress={open(terms)} />
        <Cell icon="legal" role="link" title={legalCopy.privacyLink} onPress={open(privacy)} />
      </Group>
    );
  }

  const c = legalCopy.signUpConsent;
  return (
    <View style={styles.consent}>
      <Text style={[type.footnote, styles.center]}>
        {`${c.before} ${legalCopy.termsLink} ${c.middle} ${legalCopy.privacyLink}${c.after}`}
      </Text>
      <View style={styles.links}>
        <Button label={legalCopy.termsLink} variant="plain" size="small" onPress={open(terms)} />
        <Button
          label={legalCopy.privacyLink}
          variant="plain"
          size="small"
          onPress={open(privacy)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  consent: { gap: spacing.xs, paddingHorizontal: spacing.md },
  center: { textAlign: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
});
