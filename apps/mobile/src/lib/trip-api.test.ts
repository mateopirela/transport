import { describe, expect, it } from 'vitest';

import type { Supabase } from './supabase';
import { sendQueuedAction } from './trip-api';
import type { QueuedIncidentAction } from './trip-queue';

const TRIP = '00000000-0000-4000-8000-000000000001';
const KEY = '00000000-0000-4000-8000-0000000000aa';

/** A client whose rpc() records its calls and answers with `error`. */
function fakeClient(error: unknown = null) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve({ data: null, error });
    },
  } as unknown as Supabase;
  return { client, calls };
}

const report: QueuedIncidentAction = {
  kind: 'incident',
  id: KEY,
  tripId: TRIP,
  occurredAt: '2026-10-15T10:00:00.000Z',
  incidentKind: 'delay',
  description: 'Tráfico',
  lat: 25.7,
  lng: -100.3,
};

describe('sendQueuedAction: incident (F7)', () => {
  it('reports the incident with its original time and its id as idempotency key', async () => {
    const { client, calls } = fakeClient();
    await sendQueuedAction(client, report);
    expect(calls).toEqual([
      {
        fn: 'report_incident',
        args: {
          p_trip_id: TRIP,
          p_kind: 'delay',
          p_description: 'Tráfico',
          p_occurred_at: '2026-10-15T10:00:00.000Z',
          p_latitude: 25.7,
          p_longitude: -100.3,
          p_client_event_id: KEY,
        },
      },
    ]);
  });

  it('sends the same key on a retry, and no location when there is none', async () => {
    const offline = { ...report, lat: null, lng: null };
    const failing = fakeClient({ code: '08006', message: 'connection lost' });
    await expect(sendQueuedAction(failing.client, offline)).rejects.toMatchObject({
      code: '08006',
    });

    const retry = fakeClient();
    await sendQueuedAction(retry.client, offline);
    expect(retry.calls[0]?.args).toEqual(failing.calls[0]?.args);
    expect(retry.calls[0]?.args).not.toHaveProperty('p_latitude');
    expect(retry.calls[0]?.args).toHaveProperty('p_client_event_id', KEY);
  });
});
