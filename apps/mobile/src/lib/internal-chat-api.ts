import type { TripStatus } from '@transport/shared';

import type { Supabase } from './supabase';

// The carrier's internal chat of a trip (H1, D28), over the B07 chat: RLS
// decides who reads it (the operator assigned now, the coordinators of the
// trip's business unit, the managers), so these queries only ask for it.

/** The conversation of a trip of a kind, or null when the caller cannot see it. */
export async function tripConversationId(
  client: Supabase,
  tripId: string,
  kind: 'trip' | 'trip_internal',
): Promise<string | null> {
  const { data, error } = await client
    .from('conversations')
    .select('id')
    .eq('trip_id', tripId)
    .eq('kind', kind)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export interface OperatorChat {
  /** The trip asked for (the screen checks it is still the one shown). */
  tripId: string;
  conversationId: string;
  /** The trip's header; null when RLS no longer shows the trip. */
  trip: {
    id: string;
    status: TripStatus;
    originCity: string;
    destinationCity: string;
  } | null;
}

/**
 * The operator's chat with their coordinator for a trip, by its id: it does
 * not go through loadOperatorTrip (which only returns the trip in progress),
 * so a notification of a cancelled or closed trip still opens it (D20-E1).
 * Null when the caller does not take part (another operator, reassigned).
 */
export async function loadOperatorChat(
  client: Supabase,
  tripId: string,
): Promise<OperatorChat | null> {
  const [conversationId, trip] = await Promise.all([
    tripConversationId(client, tripId, 'trip_internal'),
    client.from('trips').select('id, status, load_id').eq('id', tripId).maybeSingle(),
  ]);
  if (!conversationId) return null;
  if (trip.error) throw trip.error;
  if (!trip.data) return { tripId, conversationId, trip: null };
  const load = await client
    .from('loads')
    .select('origin_city, destination_city')
    .eq('id', trip.data.load_id)
    .maybeSingle();
  if (load.error) throw load.error;
  return {
    tripId,
    conversationId,
    trip: {
      id: trip.data.id,
      status: trip.data.status,
      originCity: load.data?.origin_city ?? '',
      destinationCity: load.data?.destination_city ?? '',
    },
  };
}

/**
 * How often an unread count on screen refreshes while in focus: the replies
 * show up even without push notifications.
 */
export const UNREAD_REFRESH_MS = 30_000;

export interface InternalInboxRow {
  tripId: string;
  conversationId: string;
  status: TripStatus | null;
  originCity: string | null;
  destinationCity: string | null;
  operatorName: string | null;
  lastMessageAt: string;
  lastMessageBody: string | null;
  lastMessageAttachments: number;
  unread: number;
}

/**
 * The internal conversations the caller sees, unread first, at most 100
 * (internal_chat_inbox); with `tripIds`, only those trips' and all of them.
 */
export async function loadInternalInbox(
  client: Supabase,
  tripIds?: readonly string[],
): Promise<InternalInboxRow[]> {
  const { data, error } = await client.rpc(
    'internal_chat_inbox',
    tripIds ? { p_trip_ids: [...tripIds] } : {},
  );
  if (error) throw error;
  return data.map((row) => ({
    tripId: row.trip_id,
    conversationId: row.conversation_id,
    // Left joins under RLS: the trip, its load or its operator may be hidden.
    status: row.trip_status ?? null,
    originCity: row.origin_city ?? null,
    destinationCity: row.destination_city ?? null,
    operatorName: row.operator_name ?? null,
    lastMessageAt: row.last_message_at,
    lastMessageBody: row.last_message_body ?? null,
    lastMessageAttachments: row.last_message_attachments ?? 0,
    unread: row.unread_count ?? 0,
  }));
}

/** The caller's unread internal messages of one trip (0 when none or not visible). */
export async function internalUnread(client: Supabase, tripId: string): Promise<number> {
  const rows = await loadInternalInbox(client, [tripId]);
  return rows.find((row) => row.tripId === tripId)?.unread ?? 0;
}
