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
import { useLoader } from '../../../lib/use-loader';
import { spacing, useTheme } from '../../../theme';

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
  const load = useCallback(
    (): Promise<OperatorChat | null> =>
      supabase && valid ? loadOperatorChat(supabase, tripId.toLowerCase()) : Promise.resolve(null),
    [tripId, valid],
  );
  const { state, reload } = useLoader(load);
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
  if (state.status === 'error') {
    return (
      <Screen title={copy.title} right={back}>
        <LoadError onRetry={() => void reload()} />
      </Screen>
    );
  }
  const chat = state.data;
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
      <ChatPanel
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
