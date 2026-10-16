import { formatDate, trackingCopy as copy } from '@transport/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AccountScreen } from '../../components/account-screen';
import { SectionTitle } from '../../components/fleet-ui';
import { Body, Button, Notice } from '../../components/ui';
import { revokeLocationConsent, useLocationConsent } from '../../lib/location-consent';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../providers/session';
import { spacing } from '../../theme';

export default function OperatorAccountTab() {
  return (
    <AccountScreen>
      <LocationConsentSection />
    </AccountScreen>
  );
}

function confirmRevoke(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(copy.revoke, copy.revokeConfirm, [
      { text: copy.cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: copy.confirm, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

/** Consent to share the location during trips, and withdrawing it (B22). */
function LocationConsentSection() {
  const router = useRouter();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const consent = useLocationConsent(supabase, userId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);

  async function revoke() {
    if (!supabase || !userId || !(await confirmRevoke())) return;
    setBusy(true);
    setMessage(null);
    try {
      await revokeLocationConsent(supabase, userId);
      setMessage({ tone: 'info', text: copy.revoked });
    } catch {
      setMessage({ tone: 'danger', text: copy.revokeFailed });
    } finally {
      setBusy(false);
    }
  }

  if (consent.status === 'loading') return null;
  return (
    <View style={styles.section}>
      <SectionTitle>{copy.accountTitle}</SectionTitle>
      <Body>
        {consent.status === 'given' && consent.acceptedAt
          ? copy.accountGiven(formatDate(consent.acceptedAt))
          : copy.accountMissing}
      </Body>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {consent.status === 'given' ? (
        <Button
          label={copy.revoke}
          variant="secondary"
          onPress={() => void revoke()}
          loading={busy}
        />
      ) : (
        <Button
          label={copy.accountReview}
          variant="secondary"
          onPress={() => router.push('/location-consent')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
});
