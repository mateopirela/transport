import { clientTripsCopy } from '@transport/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../supabase/server', () => ({ createClient: () => Promise.resolve({ rpc }) }));

const { reportIncident } = await import('./actions');

const TRIP = 'bf200000-0000-4000-8000-0000000000a1';
const KEY = 'bf200000-0000-4000-8000-0000000000b1';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const report = { tripId: TRIP, kind: 'delay', description: 'Tráfico en la autopista' };

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: 'bf200000-0000-4000-8000-0000000000c1', error: null });
});

describe('reportIncident', () => {
  it('sends the attempt key to report_incident', async () => {
    const state = await reportIncident({}, form({ ...report, clientEventId: KEY }));
    expect(state).toEqual({ message: clientTripsCopy.incidents.sent });
    expect(rpc).toHaveBeenCalledWith('report_incident', {
      p_trip_id: TRIP,
      p_kind: 'delay',
      p_description: 'Tráfico en la autopista',
      p_client_event_id: KEY,
    });
  });

  it('sends the same key on every submit of the same attempt', async () => {
    await reportIncident({}, form({ ...report, clientEventId: KEY }));
    await reportIncident({}, form({ ...report, clientEventId: KEY }));
    expect(rpc).toHaveBeenCalledTimes(2);
    for (const [, args] of rpc.mock.calls) expect(args).toMatchObject({ p_client_event_id: KEY });
  });

  it('reports without a key when it is missing or malformed', async () => {
    await reportIncident({}, form(report));
    await reportIncident({}, form({ ...report, clientEventId: 'not-a-uuid' }));
    expect(rpc).toHaveBeenCalledTimes(2);
    for (const [, args] of rpc.mock.calls) {
      expect(args).toMatchObject({ p_client_event_id: undefined });
    }
  });
});
