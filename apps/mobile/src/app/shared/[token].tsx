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
import { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { DetailRow } from '../../components/detail-row';
import {
  BottomBar,
  Group,
  LoadError,
  Notice,
  Screen,
  Skeleton,
  ValueRow,
} from '../../components/ui';
import { openTeamShareLink, shareTokenParam } from '../../lib/share-api';
import { supabase } from '../../lib/supabase';
import { useLoader } from '../../lib/use-loader';
import { useSession } from '../../providers/session';
import { useTheme } from '../../theme';

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
  const { type } = useTheme();
  const [barHeight, setBarHeight] = useState(0);

  const load = useCallback(
    () => (supabase ? openTeamShareLink(supabase, token) : Promise.resolve(null)),
    [token],
  );
  const { state, reload } = useLoader(load);

  const header = <Stack.Screen options={{ title: copy.app.sharedTitle, headerShown: true }} />;
  if (state.status !== 'ready' || !state.data) {
    return (
      <Screen belowHeader>
        {header}
        {state.status === 'error' ? (
          <LoadError onRetry={() => void reload()} />
        ) : state.status === 'ready' ? (
          <Notice tone="warning" title={copy.internal.unavailableTitle}>
            {copy.internal.unavailableBody}
          </Notice>
        ) : (
          <Skeleton />
        )}
      </Screen>
    );
  }

  const l = state.data;
  const canOffer = l.canOffer && area === 'carrier';
  return (
    <>
      {header}
      <Screen belowHeader bottom={canOffer ? barHeight : 0}>
        <Text accessibilityRole="header" style={type.title2}>
          {`${l.origin.city} → ${l.destination.city}`}
        </Text>
        <Text style={type.footnote}>{copy.internal.description}</Text>
        <Group>
          <DetailRow
            label={detail.route}
            value={`${l.origin.city}, ${l.origin.state} → ${l.destination.city}, ${l.destination.state}`}
          />
          <ValueRow label={copy.internal.labels.status} value={loadStatusLabels[l.status]} />
          <ValueRow label={detail.proposedPrice} value={formatMxn(l.proposedPriceCents)} strong />
          <DetailRow
            label={detail.pickupWindow}
            value={detail.window(
              formatDateTime(l.pickupWindow.start),
              formatDateTime(l.pickupWindow.end),
            )}
          />
          <DetailRow
            label={detail.deliveryWindow}
            value={detail.window(
              formatDateTime(l.deliveryWindow.start),
              formatDateTime(l.deliveryWindow.end),
            )}
          />
          <DetailRow
            label={detail.cargo}
            value={`${cargoTypeLabels[l.cargoType]} · ${l.description}`}
          />
          <ValueRow label={detail.unitType} value={unitTypeLabels[l.unitType]} />
          {l.specialRequirements.length > 0 ? (
            <DetailRow
              label={detail.requirements}
              value={l.specialRequirements.map((r) => specialRequirementLabels[r]).join(', ')}
            />
          ) : null}
          {l.notes ? <DetailRow label={detail.notes} value={l.notes} /> : null}
        </Group>
        {canOffer ? null : <Notice tone="info">{copy.internal.readOnly}</Notice>}
      </Screen>
      {canOffer ? (
        <BottomBar
          action={{ label: copy.app.openLoad, onPress: () => router.push(`/load/${l.loadId}`) }}
          onHeight={setBarHeight}
        />
      ) : null}
    </>
  );
}
