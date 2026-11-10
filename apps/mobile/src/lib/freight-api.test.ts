import { describe, expect, it } from 'vitest';

import { COLLECTIONS_PAGE_SIZE, loadCollections } from './freight-api';
import type { Supabase } from './supabase';

function row(i: number) {
  return {
    ledger_id: `ledger-${i}`,
    trip_id: `trip-${i}`,
    freight_cents: 1000000,
    commission_cents: 30000,
    net_cents: 970000,
    paid_cents: 0,
    pending_cents: 970000,
    payments: [],
  };
}

/** A client whose carrier_freight_ledger has `total` rows, paged by range. */
function fakeClient(total: number) {
  const ranges: [number, number][] = [];
  const names: string[] = [];
  const rows = Array.from({ length: total }, (_, i) => row(i));
  const client = {
    rpc: (name: string) => {
      names.push(name);
      return {
        range: (from: number, to: number) => {
          ranges.push([from, to]);
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
    },
  } as unknown as Supabase;
  return { client, ranges, names };
}

describe('loadCollections', () => {
  it('reads every trip past the 1,000-row cap, so the totals are complete', async () => {
    const { client, ranges, names } = fakeClient(COLLECTIONS_PAGE_SIZE + 3);
    const rows = await loadCollections(client);
    expect(rows).toHaveLength(COLLECTIONS_PAGE_SIZE + 3);
    expect(rows.at(-1)?.trip_id).toBe(`trip-${COLLECTIONS_PAGE_SIZE + 2}`);
    expect(rows[0]?.net_cents).toBe(970000);
    expect(new Set(names)).toEqual(new Set(['carrier_freight_ledger']));
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
});
