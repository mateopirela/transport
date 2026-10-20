import { LOCATION_CONSENT_VERSION, locationConsentCopy as copy } from '@transport/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';

import type { IconName } from '../../components/icons';
import { PreciseLocationBanner } from '../../components/precise-location-banner';
import { TabBottomBar } from '../../components/tab-bottom-bar';
import {
  Button,
  Footnote,
  Group,
  groupInset,
  Loading,
  Notice,
  Screen,
  SectionHeader,
  TextCell,
} from '../../components/ui';
import { requestTrackingPermission } from '../../lib/background-location';
import { acceptLocationConsent, useLocationConsent } from '../../lib/location-consent';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../providers/session';
import { spacing, useTheme } from '../../theme';

/** One icon per point of the consent text, in its order: when, how, how often, who, until when. */
const POINT_ICONS: readonly IconName[] = ['time', 'locate', 'location', 'people', 'lock'];

/**
 * Consent to share the location during trips (B22, LFPDPPP), then the
 * operating system's "Always" permission. The system prompt is only shown
 * after the operator read and accepted what is shared, when and with whom
 * (App Store and Play policies on background location). Each step has one
 * primary action, in the bottom bar; the way out is a plain button.
 * `belowHeader` where it opens under a navigation header ("Mi viaje" of the
 * hombre-camión, in the carrier's stack).
 */
export default function LocationConsentScreen({ belowHeader = false }: { belowHeader?: boolean }) {
  const router = useRouter();
  const { session } = useSession();
  const { type } = useTheme();
  const userId = session?.user.id ?? null;
  const consent = useLocationConsent(supabase, userId);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<'accept' | 'permission' | null>(null);
  const [barHeight, setBarHeight] = useState(0);

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

  if (consent.status === 'loading') {
    return (
      <Screen title={copy.title} belowHeader={belowHeader}>
        <Loading label={copy.title} />
      </Screen>
    );
  }

  if (consent.status === 'given') {
    return (
      <>
        <Screen title={copy.permissionTitle} belowHeader={belowHeader} bottom={barHeight}>
          <Notice tone="info">
            {Platform.OS === 'ios' ? copy.permissionIos : copy.permissionAndroid}
          </Notice>
          <PreciseLocationBanner />
          {problem === 'permission' ? (
            <Notice tone="danger">
              <Text style={type.subhead}>{copy.permissionDenied}</Text>
              <View style={styles.action}>
                <Button
                  label={copy.openSettings}
                  variant="secondary"
                  size="small"
                  onPress={() => void Linking.openSettings()}
                />
              </View>
            </Notice>
          ) : null}
          <Button label={copy.done} variant="plain" onPress={close} disabled={busy} />
        </Screen>
        <TabBottomBar
          action={{ label: copy.permissionGrant, onPress: () => void grant(), loading: busy }}
          onHeight={setBarHeight}
        />
      </>
    );
  }

  return (
    <>
      <Screen title={copy.title} belowHeader={belowHeader} bottom={barHeight}>
        <Notice tone="info">{copy.intro}</Notice>
        <Group inset={groupInset.icon}>
          {copy.points.map((point, index) => (
            <TextCell key={point} icon={POINT_ICONS[index] ?? 'checkCircle'}>
              {point}
            </TextCell>
          ))}
        </Group>
        <View style={styles.section}>
          <SectionHeader title={copy.legalTitle} />
          <Group>
            <TextCell tone="dim">{copy.legal}</TextCell>
          </Group>
          <Footnote>{copy.version(LOCATION_CONSENT_VERSION)}</Footnote>
        </View>
        {problem === 'accept' ? <Notice tone="danger">{copy.acceptFailed}</Notice> : null}
        <Button label={copy.decline} variant="plain" onPress={close} disabled={busy} />
      </Screen>
      <TabBottomBar
        action={{ label: copy.accept, onPress: () => void accept(), loading: busy }}
        onHeight={setBarHeight}
      />
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm + spacing.xs },
  action: { marginTop: spacing.xs, alignItems: 'flex-start' },
});
