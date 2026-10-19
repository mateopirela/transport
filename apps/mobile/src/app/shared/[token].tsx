import {
  cargoTypeLabels,
  carrierLoadsCopy,
  formatDateTime,
  formatMxn,
  loadStatusLabels,
  shareLinksCopy,
  specialRequirementLabels,
  unitTypeLabels,
} from '@transport/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Loaded } from '../../components/fleet-ui';
import { Button, Notice, Screen, Title } from '../../components/ui';
import { openTeamShareLink, shareTokenParam } from '../../lib/share-api';
import { supabase } from '../../lib/supabase';
import { useLoader } from '../../lib/use-loader';
import { useSession } from '../../providers/session';
import { colors } from '../../theme';

const copy = shareLinksCopy;
const detail = carrierLoadsCopy.detail;

/**
 * A load shared with the team (G7, D23), opened from the deep link
 * transport://compartido/<token> (app/compartido/[token].tsx redirects here)
 * with a session of the company that shared it. Read-only; the Gerente and
 * the Coordinador can jump to the load to offer while it is open.
 */
export default function SharedLoad() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = shareTokenParam(params.token);
  const { area } = useSession();
  const router = useRouter();

  const load = useCallback(
    () => (supabase ? openTeamShareLink(supabase, token) : Promise.resolve(null)),
    [token],
  );
  const { state, reload } = useLoader(load);

  return (
    <Screen>
      <Stack.Screen options={{ title: copy.app.sharedTitle, headerShown: true }} />
      <Loaded state={state} onRetry={() => void reload()}>
        {(shared) => {
          if (!shared) {
            return (
              <Notice tone="warning" title={copy.internal.unavailableTitle}>
                {copy.internal.unavailableBody}
              </Notice>
            );
          }
          const l = shared;
          return (
            <>
              <Title subtitle={copy.internal.description}>
                {`${l.origin.city} → ${l.destination.city}`}
              </Title>
              <Row
                label={detail.route}
                value={`${l.origin.city}, ${l.origin.state} → ${l.destination.city}, ${l.destination.state}`}
              />
              <Row label={copy.internal.labels.status} value={loadStatusLabels[l.status]} />
              <Row label={detail.proposedPrice} value={formatMxn(l.proposedPriceCents)} strong />
              <Row
                label={detail.pickupWindow}
                value={detail.window(
                  formatDateTime(l.pickupWindow.start),
                  formatDateTime(l.pickupWindow.end),
                )}
              />
              <Row
                label={detail.deliveryWindow}
                value={detail.window(
                  formatDateTime(l.deliveryWindow.start),
                  formatDateTime(l.deliveryWindow.end),
                )}
              />
              <Row
                label={detail.cargo}
                value={`${cargoTypeLabels[l.cargoType]} · ${l.description}`}
              />
              <Row label={detail.unitType} value={unitTypeLabels[l.unitType]} />
              {l.specialRequirements.length > 0 ? (
                <Row
                  label={detail.requirements}
                  value={l.specialRequirements.map((r) => specialRequirementLabels[r]).join(', ')}
                />
              ) : null}
              {l.notes ? <Row label={detail.notes} value={l.notes} /> : null}
              {l.canOffer && area === 'carrier' ? (
                <Button
                  label={copy.app.openLoad}
                  onPress={() => router.push(`/load/${l.loadId}`)}
                />
              ) : (
                <Notice tone="info">{copy.internal.readOnly}</Notice>
              )}
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, strong ? styles.strong : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 2 },
  label: { fontSize: 13, color: colors.textMuted },
  value: { fontSize: 15, color: colors.text, lineHeight: 21 },
  strong: { fontSize: 18, fontWeight: '700', color: colors.navy },
});
