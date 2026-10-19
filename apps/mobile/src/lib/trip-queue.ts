import {
  evidenceStageForEvent,
  INCIDENT_KINDS,
  MAX_RECEIVER_NAME_LENGTH,
  OPERATOR_TRIP_STEPS,
  type EvidenceStage,
  statusAfterEvents,
  type OperatorTripEvent,
  type TripEventType,
  type TripStatus,
} from '@transport/shared';
import { z } from 'zod';

// Offline queue of the operator's trip actions (B21). Pure logic, no React
// Native: what goes in, how the trip looks with it applied, and how it is sent.
//
// Every action keeps the moment it happened on the road (`occurredAt`) and a
// client id that the RPCs use as idempotency key (trip_events.client_event_id),
// so a retry after a lost response never records the event twice.
//
// Incidents (F7) go through the same queue: report_incident is idempotent on
// the same key, and their photos name the incident by it (see
// QueuedPhoto.incidentKey), so they can be taken before the report is sent.

const statusAction = z.object({
  kind: z.literal('status'),
  id: z.uuid(),
  tripId: z.uuid(),
  event: z.enum(OPERATOR_TRIP_STEPS as [OperatorTripEvent, ...OperatorTripEvent[]]),
  occurredAt: z.iso.datetime({ offset: true }),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(100_000).nullable(),
  estimatedUnloadEndAt: z.iso.datetime({ offset: true }).nullable(),
  /** Who received the cargo (unloading_finished only, B23). Absent in older queues. */
  receivedBy: z.string().trim().min(1).max(MAX_RECEIVER_NAME_LENGTH).nullable().optional(),
});

const estimateAction = z.object({
  kind: z.literal('estimate'),
  id: z.uuid(),
  tripId: z.uuid(),
  occurredAt: z.iso.datetime({ offset: true }),
  estimatedUnloadEndAt: z.iso.datetime({ offset: true }),
});

/** Same limit as report_incident and incidentFormSchema. */
const MAX_INCIDENT_DESCRIPTION_LENGTH = 2000;

const incidentAction = z.object({
  kind: z.literal('incident'),
  /** Also the key its photos use to name it until it has an id. */
  id: z.uuid(),
  tripId: z.uuid(),
  occurredAt: z.iso.datetime({ offset: true }),
  incidentKind: z.enum(INCIDENT_KINDS),
  description: z.string().trim().min(1).max(MAX_INCIDENT_DESCRIPTION_LENGTH),
  /** Optional for an incident: the report never waits for a GPS fix. */
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
});

const queuedAction = z.discriminatedUnion('kind', [statusAction, estimateAction, incidentAction]);

export type QueuedStatusAction = z.output<typeof statusAction>;
export type QueuedEstimateAction = z.output<typeof estimateAction>;
export type QueuedIncidentAction = z.output<typeof incidentAction>;
export type QueuedAction = z.output<typeof queuedAction>;

/**
 * What the phone keeps: actions still to send, and actions the server already
 * accepted but that the last loaded trip does not show yet (so a reload that
 * fails right after sending never shows a step as undone).
 */
export interface StoredQueue {
  pending: QueuedAction[];
  sent: QueuedAction[];
}

export const EMPTY_STORED_QUEUE: StoredQueue = { pending: [], sent: [] };

function parseActions(value: unknown): QueuedAction[] {
  if (!Array.isArray(value)) return [];
  // A corrupt entry is dropped instead of blocking the ones after it.
  return value.flatMap((entry) => {
    const parsed = queuedAction.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Reads a stored queue; anything unreadable counts as empty. */
export function parseStoredQueue(raw: string | null): StoredQueue {
  if (!raw) return EMPTY_STORED_QUEUE;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return EMPTY_STORED_QUEUE;
    const { pending, sent } = value as Record<string, unknown>;
    return { pending: parseActions(pending), sent: parseActions(sent) };
  } catch {
    return EMPTY_STORED_QUEUE;
  }
}

/**
 * Actions a loaded trip does not reflect yet, in order: the sent ones missing
 * from its timeline (matched by client_event_id), then the pending ones.
 */
export function unconfirmedActions(
  stored: StoredQueue,
  recordedIds: ReadonlySet<string>,
): QueuedAction[] {
  return [...stored.sent.filter((a) => !recordedIds.has(a.id)), ...stored.pending];
}

/**
 * Sent actions still worth keeping after loading `trip` from the server: only
 * the ones of that trip that its timeline does not show yet.
 */
export function pruneSent(
  sent: readonly QueuedAction[],
  trip: { id: string; recordedIds: ReadonlySet<string> } | null,
): QueuedAction[] {
  return sent.filter((a) => trip !== null && a.tripId === trip.id && !trip.recordedIds.has(a.id));
}

const forTrip = (queue: readonly QueuedAction[], tripId: string) =>
  queue.filter((action) => action.tripId === tripId);

/** The trip event an action records (labels of the timeline and of refusals). */
export function actionEventType(action: QueuedAction): TripEventType {
  switch (action.kind) {
    case 'status':
      return action.event;
    case 'estimate':
      return 'unload_estimate_updated';
    case 'incident':
      return 'incident_reported';
  }
}

/** Incidents of a trip the loaded trip does not show yet, newest first. */
export function queuedIncidents(
  queue: readonly QueuedAction[],
  tripId: string,
): QueuedIncidentAction[] {
  return forTrip(queue, tripId)
    .flatMap((a) => (a.kind === 'incident' ? [a] : []))
    .reverse();
}

/** Status events of a trip still waiting in the queue, in order. */
export function pendingEvents(queue: readonly QueuedAction[], tripId: string): OperatorTripEvent[] {
  return forTrip(queue, tripId).flatMap((a) => (a.kind === 'status' ? [a.event] : []));
}

/**
 * Status the operator sees: the server status with the queued events applied.
 * If they no longer follow from it (the trip changed elsewhere), the server
 * status wins; sending the queue will reject them.
 */
export function effectiveStatus(
  serverStatus: TripStatus,
  queue: readonly QueuedAction[],
  tripId: string,
): TripStatus {
  return statusAfterEvents(serverStatus, pendingEvents(queue, tripId)) ?? serverStatus;
}

/** Latest estimated end of unloading of a trip, counting the queued ones. */
export function effectiveUnloadEstimate(
  serverEstimate: string | null,
  queue: readonly QueuedAction[],
  tripId: string,
): string | null {
  let estimate = serverEstimate;
  for (const action of forTrip(queue, tripId)) {
    if (action.kind !== 'incident' && action.estimatedUnloadEndAt) {
      estimate = action.estimatedUnloadEndAt;
    }
  }
  return estimate;
}

/**
 * Moment to record a new action: now, but never before the last one of the
 * trip (queued or on the server). The server rejects events out of order, and
 * the device clock may have been adjusted between two taps.
 */
export function nextOccurredAt(
  queue: readonly QueuedAction[],
  tripId: string,
  lastServerEventAt: string | null,
  now: Date,
): string {
  let latest = now.getTime();
  const times = forTrip(queue, tripId).map((a) => a.occurredAt);
  if (lastServerEventAt) times.push(lastServerEventAt);
  for (const time of times) latest = Math.max(latest, Date.parse(time));
  return new Date(latest).toISOString();
}

/**
 * Whether a photo of `stage` must wait for queued actions of its trip (B23):
 * the server only accepts photos once the trip is where the phone shows it,
 * so every action queued before the first step that needs these photos goes
 * first. That step itself waits for the photos, so it never blocks them.
 *
 * Incidents (F7) do not move the trip, so pickup and delivery photos never
 * wait for them. Incident photos wait for every queued action of the trip,
 * their own report included: the server resolves their incident by its key.
 */
export function photoMustWait(
  queue: readonly QueuedAction[],
  tripId: string,
  stage: EvidenceStage,
): boolean {
  const actions = forTrip(queue, tripId);
  if (stage === 'incident') return actions.length > 0;
  const [first] = actions.filter((a) => a.kind !== 'incident');
  if (!first) return false;
  return !(first.kind === 'status' && evidenceStageForEvent(first.event) === stage);
}

/** SQLSTATE of the RPC rate limits (enforce_rate_limit, F12); HTTP 429. */
export const RATE_LIMITED_CODE = 'PT429';

/** The fields we read from PostgREST and fetch errors. */
interface ErrorFields {
  code?: unknown;
  status?: unknown;
}

/**
 * Whether sending failed for a reason that may go away (no connection, an
 * expired session, a server hiccup) rather than a refusal of the action.
 */
export function isRetryableError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return true;
  const { code, status } = error as ErrorFields;
  if (typeof status === 'number' && (status === 401 || status === 408 || status >= 500)) {
    return true;
  }
  if (typeof code !== 'string' || code === '') return true;
  // PostgREST auth errors (expired JWT): the session refreshes and we retry.
  if (code.startsWith('PGRST3')) return true;
  // Rate limit of the RPCs (F12): the action is fine, it goes in a later run.
  if (code === RATE_LIMITED_CODE) return true;
  // SQLSTATE classes: connection, serialization/deadlock, resources, shutdown.
  return /^(08|40|53|57)/u.test(code);
}

export interface FlushResult {
  /** Ids of the actions the server accepted (or had already recorded). */
  sent: string[];
  /** Actions the server refused, and the later steps of the same trip. */
  rejected: QueuedAction[];
  /** The server's message for each refused action, by id (the dropped later steps have none). */
  reasons: Record<string, string>;
  /** Whether it stopped early to retry later (no connection, etc.). */
  stopped: boolean;
}

/** The message of a refusal, if the error carries one. */
function refusalMessage(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('message' in error)) return null;
  const { message } = error as { message: unknown };
  return typeof message === 'string' && message !== '' ? message : null;
}

/**
 * Sends the queue in order, one action at a time. Stops at the first
 * retryable failure so nothing is sent out of order. When the server refuses
 * a step, the later steps of that trip are dropped with it: they depend on it
 * and would be refused too. Incidents depend on no step and no step on them
 * (F7): a refused incident drops nothing else, and an incident after a
 * refused step is still sent.
 */
export async function flushQueue(
  queue: readonly QueuedAction[],
  send: (action: QueuedAction) => Promise<void>,
): Promise<FlushResult> {
  const result: FlushResult = { sent: [], rejected: [], reasons: {}, stopped: false };
  const refusedTrips = new Set<string>();
  for (const action of queue) {
    const isIncident = action.kind === 'incident';
    if (!isIncident && refusedTrips.has(action.tripId)) {
      result.rejected.push(action);
      continue;
    }
    try {
      await send(action);
      result.sent.push(action.id);
    } catch (error) {
      if (isRetryableError(error)) {
        result.stopped = true;
        return result;
      }
      if (!isIncident) refusedTrips.add(action.tripId);
      result.rejected.push(action);
      const reason = refusalMessage(error);
      if (reason) result.reasons[action.id] = reason;
    }
  }
  return result;
}
