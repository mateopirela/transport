import {
  captureStageForStatus,
  evidenceStageForEvent,
  missingPhotos,
  mobileErrorCopy,
  operatorEvidenceCopy as evidenceCopy,
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
  type EvidenceStage,
  type GatedEvidenceStage,
  type IncidentFormValues,
  type OperatorTripEvent,
  type TripEventType,
} from '@transport/shared';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';

import {
  EvidenceSection,
  ReceiverForm,
  type EvidenceItem,
} from '../../components/evidence-section';
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
import { TrackingBanner } from '../../components/tracking-banner';
import { Body, Button, Loading, Notice, Screen, Title } from '../../components/ui';
import { toErrorKey } from '../../lib/errors';
import { capturePhoto, photoUri } from '../../lib/evidence-api';
import { photoCounts, photoStoragePath, type StoredPhotos } from '../../lib/evidence-queue';
import {
  dismissRejectedPhotos,
  enqueuePhoto,
  flushEvidenceQueue,
  useEvidenceQueue,
} from '../../lib/evidence-sync';
import { currentPosition } from '../../lib/location';
import { supabase } from '../../lib/supabase';
import {
  incidentAttempt,
  loadOperatorTrip,
  reportIncident,
  type IncidentAttempt,
  type OperatorTrip,
} from '../../lib/trip-api';
import {
  effectiveStatus,
  effectiveUnloadEstimate,
  isRetryableError,
  nextOccurredAt,
  unconfirmedActions,
  type QueuedAction,
  type StoredQueue,
} from '../../lib/trip-queue';
import {
  dismissRejected,
  enqueueTripAction,
  flushTripQueue,
  keepLoadedTrip,
  readTripSnapshot,
  startTripLoad,
  useTripQueue,
} from '../../lib/trip-sync';
import { useLoader } from '../../lib/use-loader';
import { useTripTracking, type TripTracking } from '../../lib/use-trip-tracking';
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
  const photos = useEvidenceQueue(supabase, userId);

  // Falls back to the last trip saved on the phone when there is no connection.
  const load = useCallback(async () => {
    if (!supabase || !userId) return new Promise<never>(() => undefined);
    const loadNumber = startTripLoad();
    let trip: OperatorTrip | null;
    try {
      trip = await loadOperatorTrip(supabase);
    } catch (error) {
      const saved = isRetryableError(error) ? await readTripSnapshot(userId) : undefined;
      if (saved === undefined) throw error;
      return saved;
    }
    // A newer load already replaced this one: keep what is on screen.
    if (!(await keepLoadedTrip(userId, trip, loadNumber))) throw new Error('superseded load');
    return trip;
  }, [userId]);
  const { state, reload } = useLoader(load);

  // Background GPS (B22) follows the status the operator sees, queued steps
  // included: departing offline starts it, delivering stops it.
  const loaded = state.status === 'ready' && queue.ready ? state.data : undefined;
  const trackedTrip = useMemo(() => {
    if (loaded === undefined) return undefined;
    if (loaded === null) return null;
    const recorded = new Set(loaded.events.flatMap((e) => e.client_event_id ?? []));
    const actions = unconfirmedActions(queue, recorded);
    return { id: loaded.id, status: effectiveStatus(loaded.status, actions, loaded.id) };
  }, [loaded, queue]);
  const tracking = useTripTracking(userId, trackedTrip);

  // Reload once queued actions reach the server.
  useEffect(() => {
    if (queue.syncCount > 0) void reload();
  }, [queue.syncCount, reload]);
  // And once photos reach the server (B23).
  useEffect(() => {
    if (photos.syncCount > 0) void reload();
  }, [photos.syncCount, reload]);

  if (state.status === 'loading' || !queue.ready || !photos.ready) {
    return <Loading label={copy.refresh} />;
  }

  // Refused actions of any trip: the trip itself may no longer be shown.
  const rejectedNotice =
    queue.rejected.length > 0 ? (
      <Notice tone="danger" title={copy.rejectedTitle}>
        <Body>
          {copy.rejectedBody(
            queue.rejected
              .map(
                (a) =>
                  tripEventTypeLabels[a.kind === 'status' ? a.event : 'unload_estimate_updated'],
              )
              .join(', '),
          )}
        </Body>
        <Button label={copy.dismiss} variant="secondary" onPress={dismissRejected} />
      </Notice>
    ) : null;
  const rejectedPhotosNotice =
    photos.rejected.length > 0 ? (
      <Notice tone="danger" title={evidenceCopy.rejectedTitle}>
        <Body>{evidenceCopy.rejectedBody(photos.rejected.length)}</Body>
        <Button label={copy.dismiss} variant="secondary" onPress={dismissRejectedPhotos} />
      </Notice>
    ) : null;
  const notices = (
    <>
      {rejectedNotice}
      {rejectedPhotosNotice}
    </>
  );

  if (state.status === 'error') {
    return (
      <Screen>
        <Title>{mobileNavCopy.assignedTrip}</Title>
        {notices}
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
        {notices}
        <Button label={copy.refresh} variant="secondary" onPress={() => void reload()} />
      </Screen>
    );
  }
  return (
    <TripView
      key={trip.id}
      trip={trip}
      stored={queue}
      photos={photos}
      notice={notices}
      tracking={tracking}
      onReload={reload}
    />
  );
}

function TripView({
  trip,
  stored,
  photos,
  notice,
  tracking,
  onReload,
}: {
  trip: OperatorTrip;
  stored: StoredQueue;
  photos: StoredPhotos;
  notice: ReactNode;
  tracking: TripTracking;
  onReload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<'step' | 'estimate' | 'incident' | 'photo' | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [incidentMessage, setIncidentMessage] = useState<Message | null>(null);
  // The incident report not confirmed yet: retrying it unchanged keeps its
  // idempotency key; an edited report gets a new one (see incidentAttempt).
  const lastIncident = useRef<IncidentAttempt | null>(null);

  // Actions this copy of the trip does not show yet: sent ones still missing
  // from its timeline, then the ones waiting on the phone.
  const recordedIds = useMemo(
    () => new Set(trip.events.flatMap((e) => e.client_event_id ?? [])),
    [trip.events],
  );
  const queue = unconfirmedActions(stored, recordedIds);
  const pendingIds = new Set(stored.pending.map((a) => a.id));
  const pendingCount = stored.pending.filter((a) => a.tripId === trip.id).length;
  const status = effectiveStatus(trip.status, queue, trip.id);
  const estimate = effectiveUnloadEstimate(trip.estimatedUnloadEndAt, queue, trip.id);
  const next = nextOperatorEvent(status);

  // Photos (B23): the server's plus the ones still on the phone, per stage.
  const counts = photoCounts(trip.evidence, photos, trip.id);
  const gate = next ? evidenceStageForEvent(next) : null;
  const missing = gate ? missingPhotos(trip.evidenceMinimums[gate], counts[gate]) : 0;
  const captureStage = captureStageForStatus(status);
  const pendingPhotoCount = photos.pending.filter((p) => p.tripId === trip.id).length;
  const receivedBy = trip.events.find(
    (e) => e.event_type === 'unloading_finished',
  )?.received_by_name;
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
    ...queue
      .filter((a) => a.tripId === trip.id)
      .map((a) => ({
        key: a.id,
        type: a.kind === 'status' ? a.event : ('unload_estimate_updated' as const),
        occurredAt: a.occurredAt,
        pending: pendingIds.has(a.id),
      })),
  ];

  /** Saves the action on the phone and tries to send it right away. */
  async function enqueue(action: QueuedAction) {
    const saved = await enqueueTripAction(action);
    if (!saved) setMessage({ tone: 'warning', text: copy.saveFailed });
    if (supabase) void flushTripQueue(supabase);
  }

  /** Photos of a stage: the server's first, then the ones not shown by it yet. */
  function evidenceItems(stage: GatedEvidenceStage): EvidenceItem[] {
    const serverPaths = new Set(trip.evidence.map((e) => e.storage_path));
    const pendingIds = new Set(photos.pending.map((p) => p.id));
    return [
      ...trip.evidence
        .filter((e) => e.stage === stage)
        .map((e) => ({ key: e.id, capturedAt: e.captured_at, uri: null, pending: false })),
      ...[...photos.sent, ...photos.pending]
        .filter(
          (p) => p.tripId === trip.id && p.stage === stage && !serverPaths.has(photoStoragePath(p)),
        )
        .map((p) => ({
          key: p.id,
          capturedAt: p.capturedAt,
          uri: photoUri(p),
          pending: pendingIds.has(p.id),
        })),
    ];
  }

  function incidentPhotoCount(incidentId: string): number {
    const local = [...photos.sent, ...photos.pending].filter((p) => p.incidentId === incidentId);
    const paths = new Set([
      ...trip.evidence.filter((e) => e.incident_id === incidentId).map((e) => e.storage_path),
      ...local.map(photoStoragePath),
    ]);
    return paths.size;
  }

  /** Camera only; the photo is queued on the phone and uploaded when possible. */
  async function takePhoto(stage: EvidenceStage, incidentId: string | null) {
    const show = incidentId ? setIncidentMessage : setMessage;
    setBusy('photo');
    show(null);
    try {
      const outcome = await capturePhoto({ tripId: trip.id, stage, incidentId });
      if (outcome.status === 'cancelled') return;
      if (outcome.status === 'denied') {
        show({ tone: 'danger', text: evidenceCopy.cameraDenied, settings: true });
        return;
      }
      if (outcome.status === 'failed') {
        show({ tone: 'danger', text: evidenceCopy.captureFailed });
        return;
      }
      const saved = await enqueuePhoto(outcome.photo);
      show(
        saved
          ? { tone: 'info', text: evidenceCopy.saved }
          : { tone: 'warning', text: copy.saveFailed },
      );
      if (supabase) void flushEvidenceQueue(supabase, { force: true });
    } finally {
      setBusy(null);
    }
  }

  async function recordStep(
    event: OperatorTripEvent,
    estimatedUnloadEndAt: string | null,
    receivedByName: string | null = null,
  ) {
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
        receivedBy: receivedByName,
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
      const attempt = incidentAttempt(lastIncident.current, trip.id, values, randomUUID);
      lastIncident.current = attempt;
      await reportIncident(
        supabase,
        trip.id,
        values,
        located.ok ? located.position : null,
        attempt.key,
      );
      lastIncident.current = null;
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

  return (
    <Screen>
      <Title>{mobileNavCopy.assignedTrip}</Title>
      <Badge label={tripStatusLabels[status]} tone={status === 'delivered' ? 'success' : 'info'} />

      {notice}

      <TrackingBanner tracking={tracking} />

      {pendingCount > 0 ? (
        <Notice tone="warning" title={copy.pendingTitle}>
          <Body>{copy.pendingBody(pendingCount)}</Body>
          <Button
            label={copy.syncNow}
            variant="secondary"
            onPress={() => {
              if (supabase) void flushTripQueue(supabase);
            }}
          />
        </Notice>
      ) : null}

      {pendingPhotoCount > 0 ? (
        <Notice tone="warning" title={copy.pendingTitle}>
          <Body>{evidenceCopy.pendingUploads(pendingPhotoCount)}</Body>
          <Button
            label={evidenceCopy.uploadNow}
            variant="secondary"
            onPress={() => {
              if (supabase) void flushEvidenceQueue(supabase, { force: true });
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

      {captureStage ? (
        <EvidenceSection
          stage={captureStage}
          minimum={trip.evidenceMinimums[captureStage]}
          items={evidenceItems(captureStage)}
          busy={busy === 'photo'}
          disabled={busy !== null}
          onCapture={() => void takePhoto(captureStage, null)}
        />
      ) : null}

      {gate && missing > 0 ? (
        <Notice tone="warning">{evidenceCopy.missing(gate, missing)}</Notice>
      ) : null}

      {next === 'unloading_finished' ? (
        <ReceiverForm
          submitLabel={operatorStepActionLabels.unloading_finished}
          busy={busy === 'step'}
          disabled={busy !== null || missing > 0}
          onSubmit={(name) => void recordStep('unloading_finished', null, name)}
        />
      ) : next === 'unloading_started' ? (
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
          disabled={busy !== null || missing > 0}
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

      {status === 'delivered' ? (
        <Notice tone="info">
          <Body>{copy.delivered}</Body>
          {receivedBy ? <Body>{evidenceCopy.receivedBy(receivedBy)}</Body> : null}
        </Notice>
      ) : null}

      <InstructionsSection trip={trip} />

      <View style={styles.section}>
        <SectionTitle>{copy.incidents}</SectionTitle>
        <IncidentList
          incidents={trip.incidents}
          photoCount={incidentPhotoCount}
          onAddPhoto={(incidentId) => void takePhoto('incident', incidentId)}
          busy={busy !== null}
        />
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
