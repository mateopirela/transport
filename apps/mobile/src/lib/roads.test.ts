// Road intelligence in the app (H4): reads that degrade to "no roads" and the
// preference RPC.
import { describe, expect, it, vi } from 'vitest';

import { loadRoadContext, roadSuggesterFor, setRoadPreference } from './roads-api';
import type { Supabase } from './supabase';

function query(result: { data: unknown; error: unknown }) {
  const chain = {
    select: () => chain,
    is: () => Promise.resolve(result),
    in: () => Promise.resolve(result),
  };
  return chain;
}

describe('roads-api', () => {
  it('reads the catalog and the preferences, empty when they fail', async () => {
    const client = {
      rpc: vi.fn(() => Promise.resolve({ data: [{ bad: true }], error: null })),
      from: vi.fn(() => query({ data: [], error: { message: 'denied' } })),
    } as unknown as Supabase;
    await expect(loadRoadContext(client)).resolves.toEqual({ corridors: [], preferences: [] });

    const broken = {
      rpc: () => Promise.reject(new Error('offline')),
      from: () => query({ data: [], error: null }),
    } as unknown as Supabase;
    await expect(loadRoadContext(broken)).resolves.toEqual({ corridors: [], preferences: [] });
  });

  it('builds a suggester with the units axles, or none when the units cannot be read', async () => {
    const ok = {
      rpc: () => Promise.resolve({ data: [], error: null }),
      from: () =>
        query({
          data: [{ id: 'u1', kind: 'rigid', unit_type: 'torton', axle_count: null }],
          error: null,
        }),
    } as unknown as Supabase;
    const suggest = await roadSuggesterFor(ok, ['u1']);
    expect(typeof suggest).toBe('function');

    const denied = {
      rpc: () => Promise.resolve({ data: [], error: null }),
      from: () => query({ data: null, error: { message: 'denied' } }),
    } as unknown as Supabase;
    await expect(roadSuggesterFor(denied, ['u1'])).resolves.toBeUndefined();
  });

  it('sets and clears a preference through the RPC', async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const client = { rpc } as unknown as Supabase;
    await setRoadPreference(client, 'r1', 's1', 'avoid');
    await setRoadPreference(client, 'r1', 's1', null);
    expect(rpc).toHaveBeenNthCalledWith(1, 'set_carrier_road_preference', {
      p_carrier_route_id: 'r1',
      p_segment_id: 's1',
      p_preference: 'avoid',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'set_carrier_road_preference', {
      p_carrier_route_id: 'r1',
      p_segment_id: 's1',
    });
    const failing = {
      rpc: () => Promise.resolve({ data: null, error: { code: '42501' } }),
    } as unknown as Supabase;
    await expect(setRoadPreference(failing, 'r1', 's1', 'prefer')).rejects.toEqual({
      code: '42501',
    });
  });
});
