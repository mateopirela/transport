import { LOCATION_CONSENT_VERSION, locationConsentCopy as copy } from '@transport/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { SectionTitle } from '../../components/fleet-ui';
import { PreciseLocationBanner } from '../../components/precise-location-banner';
import { Body, Button, Loading, Notice, Screen, Title } from '../../components/ui';
import { requestTrackingPermission } from '../../lib/background-location';
import { acceptLocationConsent, useLocationConsent } from '../../lib/location-consent';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../providers/session';
import { colors, spacing } from '../../theme';

/**
 * Consent to share the location during trips (B22, LFPDPPP), then the
 * operating system's "Always" permission. The system prompt is only shown
 * after the operator read and accepted what is shared, when and with whom
 * (App Store and Play policies on background location).
 */
export default function LocationConsentScreen() {
  const router = useRouter();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const consent = useLocationConsent(supabase, userId);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'accept' | 'permission' | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/trip'));

  async function accept() {
    if (!supabase || !userId) return;
    setBusy(true);
    setProblem(null);
    try {
      await acceptLocationConsent(supabase, userId);
    } catch {
      setProblem('accept');
    } finally {
      setBusy(false);
    }
  }

  async function grant() {
    setBusy(true);
    setProblem(null);
    try {
      if (await requestTrackingPermission()) close();
      else setProblem('permission');
    } catch {
      setProblem('permission');
    } finally {
      setBusy(false);
    }
  }

  if (consent.status === 'loading') return <Loading label={copy.title} />;

  if (consent.status === 'given') {
    return (
      <Screen>
        <Title>{copy.permissionTitle}</Title>
        <Body>{Platform.OS === 'ios' ? copy.permissionIos : copy.permissionAndroid}</Body>
        <PreciseLocationBanner />
        {problem === 'permission' ? (
          <Notice tone="danger">
            <Body>{copy.permissionDenied}</Body>
            <Button
              label={copy.openSettings}
              variant="secondary"
              onPress={() => void Linking.openSettings()}
            />
          </Notice>
        ) : null}
        <Button label={copy.permissionGrant} onPress={() => void grant()} loading={busy} />
        <Button label={copy.done} variant="secondary" onPress={close} disabled={busy} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{copy.title}</Title>
      <Body>{copy.intro}</Body>
      <View style={styles.points}>
        {copy.points.map((point) => (
          <View key={point} style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>{point}</Text>
          </View>
        ))}
      </View>
      <SectionTitle>{copy.legalTitle}</SectionTitle>
      <Text style={styles.legal}>{copy.legal}</Text>
      <Text style={styles.version}>{copy.version(LOCATION_CONSENT_VERSION)}</Text>
      {problem === 'accept' ? <Notice tone="danger">{copy.acceptFailed}</Notice> : null}
      <Button label={copy.accept} onPress={() => void accept()} loading={busy} />
      <Button label={copy.decline} variant="secondary" onPress={close} disabled={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  points: { gap: spacing.sm },
  point: { flexDirection: 'row', gap: spacing.sm },
  bullet: { fontSize: 16, color: colors.accent },
  pointText: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.text },
  legal: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
  version: { fontSize: 12, color: colors.textMuted },
});
