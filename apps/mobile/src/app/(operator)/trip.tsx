import {
  captureStageForStatus,
  evidenceStageForEvent,
  missingPhotos,
  operatorEvidenceCopy as evidenceCopy,
  mobileNavCopy,
  suggestedHandlingMinutes,
  OPERATOR_TRIP_STEPS,
  operatorStepConfirmLabels,
  operatorTripCopy as copy,
  carrierTripsCopy,
  dwellCopy,
  formatDateTime,
  internalChatCopy,
  missingTripDocumentsFromError,
  supportCopy,
  tripDocumentKindLabels,
  tripEventTypeLabels,
  tripFolio,
  tripLinkCopy,
  tripStatusLabels,
  tripStatusTone,
  unloadEstimateProblem,
  type EvidenceStage,
  type GatedEvidenceStage,
  type IncidentFormValues,
  type OperatorTripEvent,
  type TripEventType,
} from '@transport/shared';
import { randomUUID } from 'expo-crypto';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Linking, StyleSheet, Text, View, type ScrollView } from 'react-native';

import {
  EvidenceSection,
  ReceiverFields,
  type EvidenceItem,
} from '../../components/evidence-section';
import { HelpCell } from '../../components/help-cell';
import { OperatorDocumentsSection } from '../../components/operator-documents-section';
import {
  IncidentSheet,
  LoadSection,
  NextStepBlock,
  TripHeading,
  TripSteps,
  type IncidentSheetHandle,
} from '../../components/operator-trip';
import { ConfirmSheet, type ConfirmSheetHandle } from '../../components/sheet';
import {
  UnloadEstimateFields,
  UnloadEstimateForm,
  type FormHandle,
} from '../../components/trip-forms';
import {
  IncidentList,
  type IncidentPhotoTarget,
  TimelineSection,
  type TimelineEntry,
} from '../../components/trip-sections';
import { PreciseLocationBanner } from '../../components/precise-location-banner';
import { TrackingBanner } from '../../components/tracking-banner';
import {
  Button,
  Cell,
  Empty,
  Footnote,
  Group,
  Loading,
  LoadError,
  Notice,
  Screen,
  SectionHeader,
} from '../../components/ui';
import { nextStep, stepDetails } from '../../lib/next-step';
import { capturePhoto, photoUri } from '../../lib/evidence-api';
import {
  incidentPhotoCount,
  photoCounts,
  photoStoragePath,
  type StoredPhotos,
} from '../../lib/evidence-queue';
import {
  dismissRejectedPhotos,
  enqueuePhoto,
  flushEvidenceQueue,
  useEvidenceQueue,
} from '../../lib/evidence-sync';
import { internalUnread, UNREAD_REFRESH_MS } from '../../lib/internal-chat-api';
import { currentPosition } from '../../lib/location';
import { supabase } from '../../lib/supabase';
import { loadOperatorTrip, type OperatorTrip } from '../../lib/trip-api';
import { loadLinkedTrip } from '../../lib/trip-link-api';
import {
  actionEventType,
  effectiveStatus,
  effectiveUnloadEstimate,
  isRetryableError,
  nextOccurredAt,
  queuedIncidents,
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
import { spacing, useTheme } from '../../theme';

const STATUS_EVENTS = new Set<TripEventType>(OPERATOR_TRIP_STEPS);

interface Message {
  tone: 'info' | 'warning' | 'danger';
  text: string;
  settings?: boolean;
}

/** A paragraph inside a notice. */
function NoticeText({ children }: { children: string }) {
  const { type } = useTheme();
  return <Text style={type.subhead}>{children}</Text>;
}

/** The small secondary action at the foot of a notice. */
function NoticeAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View style={styles.noticeAction}>
      <Button label={label} variant="secondary" size="small" onPress={onPress} />
    </View>
  );
}

/** What became of an action, in its tone; "Abrir configuración" when a permission is missing. */
function MessageNotice({ message }: { message: Message }) {
  return (
    <Notice tone={message.tone}>
      <NoticeText>{message.text}</NoticeText>
      {message.settings ? (
        <NoticeAction label={copy.openSettings} onPress={() => void Linking.openSettings()} />
      ) : null}
    </Notice>
  );
}

/**
 * "Reportar al coordinador" (H1, D28): the operator's channel to their
 * coordinator, with the unread messages. Only in the operator's area: the
 * hombre-camión ("Mi viaje") has no coordinator to report to (D13-E1).
 */
function ReportToCoordinator({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const refresh = () => {
        if (!supabase) return;
        internalUnread(supabase, tripId)
          .then((count) => active && setUnread(count))
          .catch(() => undefined);
      };
      refresh();
      // While in focus, so a reply shows up without leaving the screen.
      const timer = setInterval(refresh, UNREAD_REFRESH_MS);
      return () => {
        active = false;
        clearInterval(timer);
      };
    }, [tripId]),
  );
  return (
    <Group>
      <Cell
        icon="chat"
        title={internalChatCopy.report}
        subtitle={unread > 0 ? internalChatCopy.reportUnread(unread) : internalChatCopy.description}
        pill={
          unread > 0
            ? { label: internalChatCopy.unreadBadge(unread), tone: 'attention' }
            : undefined
        }
        role="link"
        strong
        onPress={() => router.push({ pathname: '/chat/[tripId]', params: { tripId } })}
      />
    </Group>
  );
}

/**
 * "Siguiente viaje" (H2): a trip link opened for a trip that is not the one in
 * course. Read-only until it is its turn: the route and the pickup window,
 * and the operator can still report to the coordinator about it.
 */
function NextTrip({ tripId }: { tripId: string }) {
  const load = useCallback(
    () => (supabase ? loadLinkedTrip(supabase, tripId) : Promise.resolve(null)),
    [tripId],
  );
  const { state, reload } = useLoader(load);
  const header = <SectionHeader title={tripLinkCopy.app.nextTrip} />;
  if (state.status === 'loading') {
    return (
      <>
        {header}
        <Loading label={tripLinkCopy.app.opening} />
      </>
    );
  }
  if (state.status === 'error') {
    return (
      <>
        {header}
        <LoadError onRetry={() => void reload()} />
      </>
    );
  }
  const next = state.data;
  // No longer theirs (reassigned, cancelled): the trip link screen said so already.
  if (!next) return null;
  return (
    <>
      {header}
      <Group>
        <Cell
          icon="route"
          title={`${next.origin} → ${next.destination}`}
          subtitle={tripLinkCopy.app.pickup(
            formatDateTime(next.pickupStart),
            formatDateTime(next.pickupEnd),
          )}
          pill={{ label: tripStatusLabels[next.status], tone: tripStatusTone(next.status) }}
        />
      </Group>
      <Footnote>{tripLinkCopy.app.nextTripHelp}</Footnote>
    </>
  );
}

/** "Viaje asignado" (mockup): the trip, its status controls and incidents (B21). */
export default function AssignedTripTab() {
  // H2: the trip of a link the operator opened (lib/trip-link-api.ts).
  const { viaje } = useLocalSearchParams<{ viaje?: string }>();
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
    return (
      <Screen title={mobileNavCopy.assignedTrip}>
        <Loading label={copy.refresh} />
      </Screen>
    );
  }

  // Refused actions of any trip: the trip itself may no longer be shown. A
  // departure refused for missing documents (D22, blocks_departure) names
  // them: the coordinator uploads them and the operator departs again. Any
  // other refusal (an incident, a step after a changed trip) is listed too, so
  // the operator knows what to submit again.
  const missingDocuments = queue.rejected.flatMap(
    (a) => missingTripDocumentsFromError(queue.rejectedReasons[a.id] ?? '') ?? [],
  );
  const otherRefused = queue.rejected.filter(
    (a) => missingTripDocumentsFromError(queue.rejectedReasons[a.id] ?? '') === null,
  );
  const rejectedNotice =
    queue.rejected.length > 0 ? (
      <Notice tone="danger" title={copy.rejectedTitle}>
        {missingDocuments.length > 0 ? (
          <NoticeText>
            {copy.rejectedMissingDocuments(
              missingDocuments.map((kind) => tripDocumentKindLabels[kind]).join(', '),
            )}
          </NoticeText>
        ) : null}
        {otherRefused.length > 0 ? (
          <NoticeText>
            {copy.rejectedBody(
              otherRefused.map((a) => tripEventTypeLabels[actionEventType(a)]).join(', '),
            )}
          </NoticeText>
        ) : null}
        <NoticeAction label={copy.dismiss} onPress={dismissRejected} />
      </Notice>
    ) : null;
  const rejectedPhotosNotice =
    photos.rejected.length > 0 ? (
      <Notice tone="danger" title={evidenceCopy.rejectedTitle}>
        <NoticeText>{evidenceCopy.rejectedBody(photos.rejected.length)}</NoticeText>
        <NoticeAction label={copy.dismiss} onPress={dismissRejectedPhotos} />
      </Notice>
    ) : null;
  const current = state.status === 'ready' ? state.data : null;
  const linked =
    typeof viaje === 'string' && viaje !== current?.id ? <NextTrip tripId={viaje} /> : null;
  const notices = (
    <>
      {rejectedNotice}
      {rejectedPhotosNotice}
      {linked}
    </>
  );

  if (state.status === 'error') {
    return (
      <Screen title={mobileNavCopy.assignedTrip}>
        {notices}
        <LoadError message={copy.loadFailed} onRetry={() => void reload()} />
      </Screen>
    );
  }
  const trip = state.data;
  if (!trip) {
    return (
      <Screen title={mobileNavCopy.assignedTrip} onRefresh={() => void reload()}>
        {notices}
        <Empty
          title={copy.noTripTitle}
          body={copy.noTrip}
          action={
            <Button
              label={copy.refresh}
              variant="secondary"
              size="small"
              onPress={() => void reload()}
            />
          }
        />
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
      onReload={() => void reload()}
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
  onReload: () => void;
}) {
  const [busy, setBusy] = useState<'step' | 'estimate' | 'incident' | 'photo' | null>(null);
  const operatorArea = useSession().area === 'operator';
  const [message, setMessage] = useState<Message | null>(null);
  const [incidentMessage, setIncidentMessage] = useState<Message | null>(null);
  const [photoMessage, setPhotoMessage] = useState<Message | null>(null);
  const { type } = useTheme();
  const confirmSheet = useRef<ConfirmSheetHandle>(null);
  const incidentSheet = useRef<IncidentSheetHandle>(null);
  // The fields the step's button asks for (the estimate or who receives).
  const stepFields = useRef<FormHandle<string>>(null);
  // Where those fields and the incidents start in the page, to scroll to them.
  const scrollRef = useRef<ScrollView>(null);
  const stepFieldsY = useRef(0);
  const incidentsY = useRef(0);

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
  const step = nextStep(status);
  const next = step.event;
  const unloadMinutes = suggestedHandlingMinutes(trip.unloadDwell);

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
        type: actionEventType(a),
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

  // Incidents reported on the phone and not shown by this copy yet (F7).
  const incidentsOnPhone = queuedIncidents(queue, trip.id).map((a) => ({
    key: a.id,
    kind: a.incidentKind,
    description: a.description,
    occurredAt: a.occurredAt,
    pending: pendingIds.has(a.id),
  }));
  // Key of the report of each incident, for its photos taken before it was sent.
  const keyByIncident = new Map(
    trip.events.flatMap((e) =>
      e.event_type === 'incident_reported' && e.incident_id && e.client_event_id
        ? [[e.incident_id, e.client_event_id] as const]
        : [],
    ),
  );

  function photosOfIncident(target: IncidentPhotoTarget): number {
    return incidentPhotoCount(trip.evidence, photos, {
      incidentId: target.incidentId,
      incidentKey:
        target.incidentId === null
          ? target.incidentKey
          : (keyByIncident.get(target.incidentId) ?? null),
    });
  }

  /** Camera only; the photo is queued on the phone and uploaded when possible. */
  async function takePhoto(stage: EvidenceStage, incident: IncidentPhotoTarget | null) {
    const show = incident ? setIncidentMessage : setPhotoMessage;
    setBusy('photo');
    show(null);
    try {
      const outcome = await capturePhoto({
        tripId: trip.id,
        stage,
        incidentId: incident?.incidentId ?? null,
        incidentKey: incident?.incidentKey ?? null,
      });
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

  /** Asks in a sheet before a status step; the step runs once the operator confirms. */
  function askStep(
    event: OperatorTripEvent,
    estimatedUnloadEndAt: string | null,
    receivedByName: string | null = null,
  ) {
    confirmSheet.current?.ask({
      title: copy.confirmTitle,
      body: operatorStepConfirmLabels[event],
      confirmLabel: copy.confirm,
      cancelLabel: copy.cancel,
      // The sheet closes at once: the step shows its progress on the block's button.
      onConfirm: () => {
        void recordStep(event, estimatedUnloadEndAt, receivedByName);
      },
    });
  }

  /** The block's button: the step, with what its fields ask for (the estimate, who receives). */
  function onStep(event: OperatorTripEvent) {
    if (event === 'unloading_started' || event === 'unloading_finished') {
      const value = stepFields.current?.submit();
      if (!value) {
        // The errors sit by the fields: bring them into view.
        scrollRef.current?.scrollTo({ y: Math.max(stepFieldsY.current - spacing.md, 0) });
        return;
      }
      if (event === 'unloading_started') askStep(event, value);
      else askStep(event, null, value);
    } else {
      askStep(event, null);
    }
  }

  async function recordStep(
    event: OperatorTripEvent,
    estimatedUnloadEndAt: string | null,
    receivedByName: string | null,
  ) {
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

  /**
   * Saves the report on the phone and tries to send it right away (F7): it
   * goes through the trip queue, so it survives no connection and app
   * restarts, and a retry never duplicates it (its id is the RPC's key).
   */
  async function submitIncident(values: IncidentFormValues): Promise<boolean> {
    setBusy('incident');
    setIncidentMessage(null);
    try {
      // Optional: never prompts for permission just for an incident.
      const located = await currentPosition({ ask: false });
      const saved = await enqueueTripAction({
        kind: 'incident',
        id: randomUUID(),
        tripId: trip.id,
        occurredAt: new Date().toISOString(),
        incidentKind: values.kind,
        description: values.description,
        lat: located.ok ? located.position.lat : null,
        lng: located.ok ? located.position.lng : null,
      });
      setIncidentMessage(
        saved
          ? { tone: 'info', text: copy.incidentQueued }
          : { tone: 'warning', text: copy.saveFailed },
      );
      if (supabase) void flushTripQueue(supabase);
      // Queued either way: it is sent while the app is open.
      return true;
    } finally {
      setBusy(null);
    }
  }

  const folio = tripFolio(trip.id);
  const pendingNotice =
    pendingCount > 0 || pendingPhotoCount > 0 ? (
      <Notice tone="warning" title={copy.pendingTitle}>
        {pendingCount > 0 ? <NoticeText>{copy.pendingBody(pendingCount)}</NoticeText> : null}
        {pendingPhotoCount > 0 ? (
          <NoticeText>{evidenceCopy.pendingUploads(pendingPhotoCount)}</NoticeText>
        ) : null}
        <View style={styles.noticeActions}>
          {pendingCount > 0 ? (
            <Button
              label={copy.syncNow}
              variant="secondary"
              size="small"
              onPress={() => {
                if (supabase) void flushTripQueue(supabase);
              }}
            />
          ) : null}
          {pendingPhotoCount > 0 ? (
            <Button
              label={evidenceCopy.uploadNow}
              variant="secondary"
              size="small"
              onPress={() => {
                if (supabase) void flushEvidenceQueue(supabase, { force: true });
              }}
            />
          ) : null}
        </View>
      </Notice>
    ) : null;

  return (
    <>
      <Screen scrollRef={scrollRef}>
        <TripHeading
          eyebrow={folio ? supportCopy.folio(folio) : mobileNavCopy.assignedTrip}
          title={carrierTripsCopy.list.route(trip.load.origin_city, trip.load.destination_city)}
          pill={{ label: tripStatusLabels[status], tone: tripStatusTone(status) }}
        />

        {/* "Tu siguiente paso": the screen's one primary, on its first screen. */}
        <NextStepBlock
          load={trip.load}
          step={step}
          busy={busy === 'step'}
          disabled={busy !== null || missing > 0}
          note={gate && missing > 0 ? evidenceCopy.missing(gate, missing) : undefined}
          body={status === 'delivered' ? copy.delivered : undefined}
          lines={receivedBy ? [evidenceCopy.receivedBy(receivedBy)] : []}
          onStep={() => {
            if (next) onStep(next);
          }}
          fallback={{ label: copy.refresh, onPress: onReload }}
          onReport={() => incidentSheet.current?.open()}
        />

        {message ? <MessageNotice message={message} /> : null}

        {notice}
        {pendingNotice}

        <TrackingBanner tracking={tracking} />
        {/* D17; the tracking banner already asks for the consent or "Always". */}
        <PreciseLocationBanner
          hidden={tracking.decision === 'needs_consent' || tracking.decision === 'needs_permission'}
        />

        {operatorArea ? <ReportToCoordinator tripId={trip.id} /> : null}

        <TripSteps progress={step.progress} details={stepDetails(step.progress, timeline)} />

        {/* What the step asks for before its button: the photos, the estimate, who receives. */}
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
        {/* What became of the last photo, under the camera button that took it. */}
        {captureStage && photoMessage ? <MessageNotice message={photoMessage} /> : null}

        {status === 'unloading' ? (
          <View style={styles.section}>
            <SectionHeader title={copy.unloadEstimateTitle} />
            {estimate ? (
              <Text style={[type.subhead, type.num]}>
                {copy.unloadEstimateCurrent(formatDateTime(estimate))}
              </Text>
            ) : null}
            <UnloadEstimateForm
              key={estimate ?? 'none'}
              initial={estimate}
              submitLabel={copy.unloadEstimateSave}
              busy={busy === 'estimate'}
              onSubmit={(at) => void updateEstimate(at)}
            />
          </View>
        ) : null}

        {next === 'unloading_finished' || next === 'unloading_started' ? (
          <View onLayout={(e) => (stepFieldsY.current = e.nativeEvent.layout.y)}>
            {next === 'unloading_finished' ? (
              <ReceiverFields ref={stepFields} />
            ) : (
              <View style={styles.section}>
                <SectionHeader title={copy.unloadEstimateTitle} />
                {/* H5: the suggested end comes from the typical unloading at the site. */}
                <UnloadEstimateFields
                  ref={stepFields}
                  initial={null}
                  defaultMinutes={unloadMinutes}
                />
                {trip.unloadDwell ? (
                  <Footnote>{dwellCopy.unloadSuggestion(trip.unloadDwell)}</Footnote>
                ) : null}
                <Footnote>{copy.unloadEstimateHelp}</Footnote>
              </View>
            )}
          </View>
        ) : null}

        <View
          style={styles.section}
          onLayout={(e) => (incidentsY.current = e.nativeEvent.layout.y)}
        >
          <SectionHeader title={copy.incidents} />
          {incidentMessage ? (
            <Notice tone={incidentMessage.tone}>{incidentMessage.text}</Notice>
          ) : null}
          <IncidentList
            incidents={trip.incidents}
            queued={incidentsOnPhone}
            photoCount={photosOfIncident}
            onAddPhoto={(target) => void takePhoto('incident', target)}
            busy={busy !== null}
          />
        </View>

        <LoadSection trip={trip} />

        <OperatorDocumentsSection documents={trip.documents} />

        <TimelineSection entries={timeline} />

        {/* "Ayuda" with this trip's folio (I2). */}
        <HelpCell tripId={trip.id} />
      </Screen>

      <IncidentSheet
        ref={incidentSheet}
        busy={busy === 'incident'}
        onSubmit={submitIncident}
        onSent={() =>
          // The report is listed with the photos it can take: show it there.
          scrollRef.current?.scrollTo({ y: Math.max(incidentsY.current - spacing.md, 0) })
        }
      />
      <ConfirmSheet ref={confirmSheet} />
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm + spacing.xs },
  noticeAction: { marginTop: spacing.xs, alignItems: 'flex-start' },
  noticeActions: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
