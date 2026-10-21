import {
  carrierTripsCopy,
  internalChatCopy as copy,
  mobileNavCopy,
  tripStatusLabels,
} from '@transport/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChatPanel } from '../../../components/chat-panel';
import { tripStatusTone } from '../../../components/trip-position';
import { Button, LoadError, Loading, Notice, Pill, Screen } from '../../../components/ui';
import { loadOperatorChat, type OperatorChat } from '../../../lib/internal-chat-api';
import { supabase } from '../../../lib/supabase';
import { useLoader, type LoaderState } from '../../../lib/use-loader';
import { spacing, useTheme } from '../../../theme';

/** The chat of one trip, or why there is none. */
interface Loaded {
  tripId: string | null;
  chat: OperatorChat | null;
  failed: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * "Reportar al coordinador" (H1, D28): the operator's internal chat of a
 * trip, with the quick reports, "Enviar foto" and "Enviar mi ubicación". It
 * loads the conversation by the trip's id (RLS decides), not the trip in
 * progress, so a notification of a cancelled or closed trip opens it too:
 * then it shows the trip's header without its actions (D20-E1).
 */
export default function OperatorChatScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const valid = typeof tripId === 'string' && UUID.test(tripId);
  const key = valid ? tripId.toLowerCase() : null;
  // Each result names its trip and a failure is a result too: the screen is
  // reused for another trip (a tab with href null), and useLoader keeps the
  // previous trip's chat when a refresh fails.
  const load = useCallback(async (): Promise<Loaded> => {
    if (!supabase || !key) return { tripId: key, chat: null, failed: false };
    try {
      return { tripId: key, chat: await loadOperatorChat(supabase, key), failed: false };
    } catch {
      return { tripId: key, chat: null, failed: true };
    }
  }, [key]);
  const { state: loaded, reload } = useLoader(load);
  // Until this trip's result arrives, the previous trip's chat is not shown.
  const state: LoaderState<Loaded> =
    loaded.status === 'ready' && loaded.data.tripId !== key ? { status: 'loading' } : loaded;
  const back = (
    <Button
      label={mobileNavCopy.assignedTrip}
      variant="plain"
      size="small"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/trip'))}
    />
  );

  if (state.status === 'loading') {
    return (
      <Screen title={copy.title} right={back}>
        <Loading label={copy.title} />
      </Screen>
    );
  }
  if (state.status === 'error' || (state.status === 'ready' && state.data.failed)) {
    return (
      <Screen title={copy.title} right={back}>
        <LoadError onRetry={() => void reload()} />
      </Screen>
    );
  }
  const chat = state.data.chat;
  if (!chat || !supabase) {
    return (
      <Screen title={copy.title} right={back}>
        <Notice tone="warning">{copy.notFound}</Notice>
      </Screen>
    );
  }
  return (
    <Screen title={copy.title} right={back}>
      {chat.trip ? <TripHeader trip={chat.trip} /> : null}
      {/* One panel per conversation: another trip's chat never inherits its messages or draft. */}
      <ChatPanel
        key={chat.conversationId}
        client={supabase}
        conversationId={chat.conversationId}
        internal
        reportTools
        description={copy.description}
      />
    </Screen>
  );
}

function TripHeader({ trip }: { trip: NonNullable<OperatorChat['trip']> }) {
  const { type } = useTheme();
  return (
    <>
      <View style={styles.head}>
        <Text style={type.headline}>
          {carrierTripsCopy.list.route(trip.originCity, trip.destinationCity)}
        </Text>
        <Pill label={tripStatusLabels[trip.status]} tone={tripStatusTone(trip.status)} />
      </View>
      {trip.status === 'cancelled' ? <Notice tone="info">{copy.cancelledTrip}</Notice> : null}
      {trip.status === 'closed' || trip.status === 'delivered' ? (
        <Notice tone="info">{copy.closedTrip}</Notice>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({ head: { gap: spacing.sm, alignItems: 'flex-start' } });
