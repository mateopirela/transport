import { legalCopy, legalUrl } from '@transport/shared';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';
import { Button } from './ui';

// Public web URL (B27); the legal pages live there. Static access so Expo
// inlines it in the bundle. Without it the links are hidden (local dev).
const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL;

/**
 * Links to the privacy notice and the terms (the stores require them inside
 * the app). With `consent`, prefixed by the sign-up acceptance sentence.
 */
export function LegalLinks({ consent = false }: { consent?: boolean }) {
  const privacy = legalUrl(SITE_URL, 'privacy');
  const terms = legalUrl(SITE_URL, 'terms');
  if (!privacy || !terms) return null;
  const c = legalCopy.signUpConsent;
  return (
    <View>
      {consent ? (
        <Text style={styles.consent}>
          {`${c.before} ${legalCopy.termsLink} ${c.middle} ${legalCopy.privacyLink}${c.after}`}
        </Text>
      ) : null}
      <Button
        label={legalCopy.termsLink}
        variant="link"
        onPress={() => void Linking.openURL(terms)}
      />
      <Button
        label={legalCopy.privacyLink}
        variant="link"
        onPress={() => void Linking.openURL(privacy)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  consent: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
