import { legalCopy, legalUrl } from '@transport/shared';
import { Linking, StyleSheet, View } from 'react-native';

import { spacing } from '../theme';
import { Button, Cell, Checkbox, ErrorText, Group, groupInset } from './ui';

// Public web URL (B27); the legal pages live there. Static access so Expo
// inlines it in the bundle. Without it the links are hidden (local dev).
const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL;

const open = (url: string) => () => void Linking.openURL(url);

/**
 * Links to the privacy notice and the terms (the stores require them inside
 * the app): a group of rows that open the web, in the account.
 */
export function LegalLinks() {
  const privacy = legalUrl(SITE_URL, 'privacy');
  const terms = legalUrl(SITE_URL, 'terms');
  if (!privacy || !terms) return null;
  return (
    <Group inset={groupInset.icon}>
      <Cell icon="legal" role="link" title={legalCopy.termsLink} onPress={open(terms)} />
      <Cell icon="legal" role="link" title={legalCopy.privacyLink} onPress={open(privacy)} />
    </Group>
  );
}

/**
 * The terms checkbox of every form that creates an account, and of the
 * screen that asks for a new version (I1, D35-E1): required. The links open
 * the web pages (hidden without the site URL, as in local development).
 */
export function TermsCheckbox({
  checked,
  onChange,
  error,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  error?: string | undefined;
}) {
  const privacy = legalUrl(SITE_URL, 'privacy');
  const terms = legalUrl(SITE_URL, 'terms');
  return (
    <View style={styles.terms}>
      <Checkbox checked={checked} onChange={onChange} invalid={Boolean(error)}>
        {legalCopy.acceptTerms.label}
      </Checkbox>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {privacy && terms ? (
        <View style={styles.links}>
          <Button label={legalCopy.termsLink} variant="plain" size="small" onPress={open(terms)} />
          <Button
            label={legalCopy.privacyLink}
            variant="plain"
            size="small"
            onPress={open(privacy)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  terms: { gap: spacing.xs },
  links: { flexDirection: 'row', flexWrap: 'wrap' },
});
