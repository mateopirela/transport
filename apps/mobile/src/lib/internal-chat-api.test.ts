import { describe, expect, it } from 'vitest';

import { internalUnread, loadOperatorChat } from './internal-chat-api';
import type { Supabase } from './supabase';

const TRIP = '5eed0008-0000-4000-8000-000000000005';
const LOAD = '5eed0005-0000-4000-8000-000000000012';
const CONVERSATION = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';

type Row = Record<string, unknown>;

/**
 * A client over in-memory tables: `from(t).select().eq(k, v)….maybeSingle()`
 * returns the one row matching every filter (as RLS left it), and records
 * the filters of each query.
 */
function fakeClient(tables: Record<string, Row[]>, inbox: Row[] = []) {
  const queries: { table: string; filters: Record<string, unknown> }[] = [];
  const client = {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      queries.push({ table, filters });
      const builder = {
        select: () => builder,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return builder;
        },
        maybeSingle: () => {
          const rows = (tables[table] ?? []).filter((row) =>
            Object.entries(filters).every(([k, v]) => row[k] === v),
          );
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
      };
      return builder;
    },
    rpc: (fn: string) =>
      Promise.resolve(
        fn === 'internal_chat_inbox' ? { data: inbox, error: null } : { data: null, error: null },
      ),
  } as unknown as Supabase;
  return { client, queries };
}

describe('loadOperatorChat (H1)', () => {
  it('finds the internal conversation of a cancelled trip by its id, not through loadOperatorTrip', async () => {
    const { client, queries } = fakeClient({
      conversations: [
        { id: 'shipper-chat', trip_id: TRIP, kind: 'trip' },
        { id: CONVERSATION, trip_id: TRIP, kind: 'trip_internal' },
      ],
      trips: [{ id: TRIP, status: 'cancelled', load_id: LOAD }],
      loads: [{ id: LOAD, origin_city: 'Guadalajara', destination_city: 'Monterrey' }],
    });
    await expect(loadOperatorChat(client, TRIP)).resolves.toEqual({
      conversationId: CONVERSATION,
      trip: {
        id: TRIP,
        status: 'cancelled',
        originCity: 'Guadalajara',
        destinationCity: 'Monterrey',
      },
    });
    expect(queries[0]).toEqual({
      table: 'conversations',
      filters: { trip_id: TRIP, kind: 'trip_internal' },
    });
    // Never the operator's current trip: no status filter on trips.
    expect(queries.find((q) => q.table === 'trips')?.filters).toEqual({ id: TRIP });
  });

  it('is null when the operator does not take part (reassigned, another operator)', async () => {
    const { client } = fakeClient({
      conversations: [{ id: 'shipper-chat', trip_id: TRIP, kind: 'trip' }],
      trips: [{ id: TRIP, status: 'assigned', load_id: LOAD }],
    });
    await expect(loadOperatorChat(client, TRIP)).resolves.toBeNull();
  });

  it('keeps the chat when RLS no longer shows the trip', async () => {
    const { client } = fakeClient({
      conversations: [{ id: CONVERSATION, trip_id: TRIP, kind: 'trip_internal' }],
    });
    await expect(loadOperatorChat(client, TRIP)).resolves.toEqual({
      conversationId: CONVERSATION,
      trip: null,
    });
  });
});

describe('internalUnread', () => {
  it('counts the unread messages of the trip from the inbox', async () => {
    const row = {
      trip_id: TRIP,
      conversation_id: CONVERSATION,
      trip_status: 'assigned',
      origin_city: 'Guadalajara',
      destination_city: 'Monterrey',
      operator_name: 'Pedro López',
      last_message_at: '2026-10-20T12:00:00Z',
      last_message_body: 'Hola',
      last_message_attachments: 0,
      last_sender_id: 'x',
      unread_count: 2,
    };
    const { client } = fakeClient({}, [row]);
    await expect(internalUnread(client, TRIP)).resolves.toBe(2);
    await expect(internalUnread(client, LOAD)).resolves.toBe(0);
  });
});
