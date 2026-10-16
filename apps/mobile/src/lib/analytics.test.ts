import { describe, expect, it, vi } from 'vitest';

import { trackEvent } from './analytics';

const LOAD = 'f1700000-0000-4000-8000-000000000001';
const VEHICLE = 'e1700000-0000-4000-8000-000000000003';

function fakeClient(result: { error: unknown } | Error = { error: null }) {
  const rpc = vi.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  return { client: { rpc } as never, rpc };
}

describe('trackEvent', () => {
  it('calls track_product_event with the validated arguments', async () => {
    const { client, rpc } = fakeClient();
    const ok = await trackEvent(client, {
      name: 'recommendation_opened',
      loadId: LOAD,
      properties: { vehicle_id: VEHICLE, rank: 2, score: 71.5, return_trip: true },
    });
    expect(ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('track_product_event', {
      p_name: 'recommendation_opened',
      p_load_id: LOAD,
      p_properties: { vehicle_id: VEHICLE, rank: 2, score: 71.5, return_trip: true },
    });
  });

  it('drops an invalid event before the network', async () => {
    const { client, rpc } = fakeClient();
    const onError = vi.fn();
    const ok = await trackEvent(
      client,
      { name: 'offer_submitted', properties: { source: 'whatsapp' as never, counter: false } },
      onError,
    );
    expect(ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('never throws: RPC errors and network failures go to onError', async () => {
    const event = {
      name: 'offer_submitted',
      properties: { source: 'search', counter: false },
    } as const;
    for (const result of [{ error: { code: '22023' } }, new TypeError('Network request failed')]) {
      const { client } = fakeClient(result);
      const onError = vi.fn();
      await expect(trackEvent(client, event, onError)).resolves.toBe(false);
      expect(onError).toHaveBeenCalledOnce();
    }
    // Without onError the failure is swallowed.
    await expect(trackEvent(fakeClient(new Error('x')).client, event)).resolves.toBe(false);
  });
});
