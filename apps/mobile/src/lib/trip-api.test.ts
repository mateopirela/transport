import { describe, expect, it } from 'vitest';

import type { Supabase } from './supabase';
import { reportIncident } from './trip-api';

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

describe('reportIncident', () => {
  it('sends the idempotency key of the report with the incident', async () => {
    const { client, calls } = fakeClient();
    await reportIncident(
      client,
      TRIP,
      { kind: 'delay', description: 'Tráfico' },
      { lat: 25.7, lng: -100.3 },
      KEY,
    );
    expect(calls).toEqual([
      {
        fn: 'report_incident',
        args: {
          p_trip_id: TRIP,
          p_kind: 'delay',
          p_description: 'Tráfico',
          p_latitude: 25.7,
          p_longitude: -100.3,
          p_client_event_id: KEY,
        },
      },
    ]);
  });

  it('sends the same key on a retry, and no location when there is none', async () => {
    const failing = fakeClient({ code: '08006', message: 'connection lost' });
    await expect(
      reportIncident(failing.client, TRIP, { kind: 'other', description: 'x' }, null, KEY),
    ).rejects.toMatchObject({ code: '08006' });

    const retry = fakeClient();
    await reportIncident(retry.client, TRIP, { kind: 'other', description: 'x' }, null, KEY);
    expect(retry.calls[0]?.args).toEqual(failing.calls[0]?.args);
    expect(retry.calls[0]?.args).not.toHaveProperty('p_latitude');
    expect(retry.calls[0]?.args).toHaveProperty('p_client_event_id', KEY);
  });
});
