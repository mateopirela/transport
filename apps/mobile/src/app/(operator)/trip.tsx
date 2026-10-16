import {
  mobileErrorCopy,
  mobileNavCopy,
  nextOperatorEvent,
  OPERATOR_TRIP_STEPS,
  operatorStepActionLabels,
  operatorStepConfirmLabels,
  operatorTripCopy as copy,
  formatDateTime,
  tripEventTypeLabels,
  tripStatusLabels,
  unloadEstimateProblem,
  type IncidentFormValues,
  type OperatorTripEvent,
  type TripEventType,
} from '@transport/shared';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';

import { Badge, SectionTitle } from '../../components/fleet-ui';
import { IncidentForm, UnloadEstimateForm } from '../../components/trip-forms';
import {
  IncidentList,
  InstructionsSection,
  ProgressSection,
  RouteSection,
  TimelineSection,
  type TimelineEntry,
} from '../../components/trip-sections';
import { Body, Button, Loading, Notice, Screen, Title } from '../../components/ui';
import { toErrorKey } from '../../lib/errors';
import { currentPosition } from '../../lib/location';
import { supabase } from '../../lib/supabase';
import { loadOperatorTrip, reportIncident, type OperatorTrip } from '../../lib/trip-api';
import {
  effectiveStatus,
  effectiveUnloadEstimate,
  isRetryableError,
  nextOccurredAt,
  type QueuedAction,
} from '../../lib/trip-queue';
import {
  dismissRejected,
  enqueueTripAction,
  flushTripQueue,
  readTripSnapshot,
  saveTripSnapshot,
  useTripQueue,
} from '../../lib/trip-sync';
import { useLoader } from '../../lib/use-loader';
import { useSession } from '../../providers/session';
import { spacing } from '../../theme';

const STATUS_EVENTS = new Set<TripEventType>(OPERATOR_TRIP_STEPS);

interface Message {
  tone: 'info' | 'warning' | 'danger';
  text: string;
  settings?: boolean;
}

function confirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(copy.confirmTitle, message, [
      { text: copy.cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: copy.confirm, onPress: () => resolve(true) },
    ]);
  });
}

/** "Viaje asignado" (mockup): the trip, its status controls and incidents (B21). */
export default function AssignedTripTab() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const queue = useTripQueue(supabase, userId);

  // Falls back to the last trip saved on the phone when there is no connection.
  const load = useCallback(async () => {
    if (!supabase || !userId) return new Promise<never>(() => undefined);
    try {
      const trip = await loadOperatorTrip(supabase);
      void saveTripSnapshot(userId, trip);
      return trip;
    } catch (error) {
      const saved = isRetryableError(error) ? await readTripSnapshot(userId) : undefined;
      if (saved === undefined) throw error;
      return saved;
    }
  }, [userId]);
  const { state, reload } = useLoader(load);

  // Reload once queued actions reach the server.
  useEffect(() => {
    if (queue.syncCount > 0) void reload();
  }, [queue.syncCount, reload]);

  if (state.status === 'loading' || !queue.ready) return <Loading label={copy.refresh} />;
  if (state.status === 'error') {
    return (
      <Screen>
        <Title>{mobileNavCopy.assignedTrip}</Title>
        <Notice tone="danger">{copy.loadFailed}</Notice>
        <Button label={copy.refresh} variant="secondary" onPress={() => void reload()} />
      </Screen>
    );
  }
  const trip = state.data;
  if (!trip) {
    return (
      <Screen>
        <Title subtitle={copy.noTrip}>{mobileNavCopy.assignedTrip}</Title>
        <Button label={copy.refresh} variant="secondary" onPress={() => void reload()} />
      </Screen>
    );
  }
  return (
    <TripView
      key={trip.id}
      trip={trip}
      queue={queue.queue}
      rejected={queue.rejected}
      onReload={reload}
    />
  );
}

function TripView({
  trip,
  queue,
  rejected,
  onReload,
}: {
  trip: OperatorTrip;
  queue: readonly QueuedAction[];
  rejected: readonly QueuedAction[];
  onReload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<'step' | 'estimate' | 'incident' | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [incidentMessage, setIncidentMessage] = useState<Message | null>(null);

  const pending = queue.filter((a) => a.tripId === trip.id);
  const status = effectiveStatus(trip.status, queue, trip.id);
  const estimate = effectiveUnloadEstimate(trip.estimatedUnloadEndAt, queue, trip.id);
  const next = nextOperatorEvent(status);
  const lastServerEventAt = useMemo(
    () =>
      trip.events.reduce<string | null>(
        (last, e) =>
          STATUS_EVENTS.has(e.event_type) && (!last || e.occurred_at > last) ? e.occurred_at : last,
        null,
      ),
    [trip.events],
  );

  const timeline: TimelineEntry[] = [
    ...trip.events.map((e) => ({
      key: e.id,
      type: e.event_type,
      occurredAt: e.occurred_at,
      pending: false,
    })),
    ...pending.map((a) => ({
      key: a.id,
      type: a.kind === 'status' ? a.event : ('unload_estimate_updated' as const),
      occurredAt: a.occurredAt,
      pending: true,
    })),
  ];

  /** Saves the action on the phone and tries to send it right away. */
  async function enqueue(action: QueuedAction) {
    const stored = await enqueueTripAction(action);
    if (!stored) setMessage({ tone: 'warning', text: copy.saveFailed });
    if (supabase) void flushTripQueue(supabase);
  }

  async function recordStep(event: OperatorTripEvent, estimatedUnloadEndAt: string | null) {
    if (!(await confirm(operatorStepConfirmLabels[event]))) return;
    // The moment of the confirmation, not of the GPS fix that follows.
    const confirmedAt = new Date();
    setBusy('step');
    setMessage(null);
    try {
      const located = await currentPosition();
      if (!located.ok) {
        setMessage(
          located.reason === 'denied'
            ? { tone: 'danger', text: copy.locationDenied, settings: true }
            : { tone: 'danger', text: copy.locationUnavailable },
        );
        return;
      }
      const occurredAt = nextOccurredAt(queue, trip.id, lastServerEventAt, confirmedAt);
      if (estimatedUnloadEndAt) {
        const problem = unloadEstimateProblem(new Date(estimatedUnloadEndAt), new Date(occurredAt));
        if (problem) {
          setMessage({
            tone: 'danger',
            text:
              problem === 'beforeNow' ? copy.unloadEstimateBeforeNow : copy.unloadEstimateTooFar,
          });
          return;
        }
      }
      await enqueue({
        kind: 'status',
        id: randomUUID(),
        tripId: trip.id,
        event,
        occurredAt,
        lat: located.position.lat,
        lng: located.position.lng,
        accuracyM: located.position.accuracyM,
        estimatedUnloadEndAt,
      });
    } finally {
      setBusy(null);
    }
  }

  async function updateEstimate(estimatedUnloadEndAt: string) {
    setBusy('estimate');
    setMessage(null);
    try {
      const occurredAt = nextOccurredAt(queue, trip.id, lastServerEventAt, new Date());
      const problem = unloadEstimateProblem(new Date(estimatedUnloadEndAt), new Date(occurredAt));
      if (problem) {
        setMessage({
          tone: 'danger',
          text: problem === 'beforeNow' ? copy.unloadEstimateBeforeNow : copy.unloadEstimateTooFar,
        });
        return;
      }
      await enqueue({
        kind: 'estimate',
        id: randomUUID(),
        tripId: trip.id,
        occurredAt,
        estimatedUnloadEndAt,
      });
    } finally {
      setBusy(null);
    }
  }

  async function submitIncident(values: IncidentFormValues): Promise<boolean> {
    if (!supabase) return false;
    setBusy('incident');
    setIncidentMessage(null);
    try {
      // Optional: never prompts for permission just for an incident.
      const located = await currentPosition({ ask: false });
      await reportIncident(supabase, trip.id, values, located.ok ? located.position : null);
      setIncidentMessage({ tone: 'info', text: copy.incidentSent });
      await onReload();
      return true;
    } catch (error) {
      const key = toErrorKey(error);
      setIncidentMessage({
        tone: 'danger',
        text: key === 'network' ? mobileErrorCopy.network : copy.incidentFailed,
      });
      return false;
    } finally {
      setBusy(null);
    }
  }

  const rejectedLabels = rejected
    .filter((a) => a.tripId === trip.id)
    .map((a) => tripEventTypeLabels[a.kind === 'status' ? a.event : 'unload_estimate_updated']);

  return (
    <Screen>
      <Title>{mobileNavCopy.assignedTrip}</Title>
      <Badge label={tripStatusLabels[status]} tone={status === 'delivered' ? 'success' : 'info'} />

      {rejectedLabels.length > 0 ? (
        <Notice tone="danger" title={copy.rejectedTitle}>
          <Body>{copy.rejectedBody(rejectedLabels.join(', '))}</Body>
          <Button label={copy.dismiss} variant="secondary" onPress={dismissRejected} />
        </Notice>
      ) : null}

      {pending.length > 0 ? (
        <Notice tone="warning" title={copy.pendingTitle}>
          <Body>{copy.pendingBody(pending.length)}</Body>
          <Button
            label={copy.syncNow}
            variant="secondary"
            onPress={() => {
              if (supabase) void flushTripQueue(supabase);
            }}
          />
        </Notice>
      ) : null}

      <RouteSection load={trip.load} status={status} />

      <ProgressSection status={status} />

      {message ? (
        <Notice tone={message.tone}>
          <Body>{message.text}</Body>
          {message.settings ? (
            <Button
              label={copy.openSettings}
              variant="secondary"
              onPress={() => void Linking.openSettings()}
            />
          ) : null}
        </Notice>
      ) : null}

      {next === 'unloading_started' ? (
        <View style={styles.section}>
          <SectionTitle>{copy.unloadEstimateTitle}</SectionTitle>
          <Body>{copy.unloadEstimateHelp}</Body>
          <UnloadEstimateForm
            initial={null}
            submitLabel={operatorStepActionLabels.unloading_started}
            busy={busy === 'step'}
            onSubmit={(at) => void recordStep('unloading_started', at)}
          />
        </View>
      ) : next ? (
        <Button
          label={operatorStepActionLabels[next]}
          onPress={() => void recordStep(next, null)}
          loading={busy === 'step'}
          disabled={busy !== null}
        />
      ) : null}

      {status === 'unloading' ? (
        <View style={styles.section}>
          <SectionTitle>{copy.unloadEstimateTitle}</SectionTitle>
          {estimate ? <Body>{copy.unloadEstimateCurrent(formatDateTime(estimate))}</Body> : null}
          <UnloadEstimateForm
            key={estimate ?? 'none'}
            initial={estimate}
            submitLabel={copy.unloadEstimateSave}
            busy={busy === 'estimate'}
            onSubmit={(at) => void updateEstimate(at)}
          />
        </View>
      ) : null}

      {status === 'delivered' ? <Notice tone="info">{copy.delivered}</Notice> : null}

      <InstructionsSection trip={trip} />

      <View style={styles.section}>
        <SectionTitle>{copy.incidents}</SectionTitle>
        <IncidentList incidents={trip.incidents} />
        {incidentMessage ? (
          <Notice tone={incidentMessage.tone}>{incidentMessage.text}</Notice>
        ) : null}
        <SectionTitle>{copy.reportIncident}</SectionTitle>
        <IncidentForm busy={busy === 'incident'} onSubmit={submitIncident} />
      </View>

      <TimelineSection entries={timeline} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
});
