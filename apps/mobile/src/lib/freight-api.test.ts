import { FREIGHT_PAGE_SIZE } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { loadCollections } from './freight-api';
import type { Supabase } from './supabase';

const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

function row(i: number) {
  return {
    ledger_id: id(i),
    trip_id: `trip-${i}`,
    // Even trips are due the 3rd, odd ones the 4th; the first trip has none.
    due_on: i === 0 ? null : `2026-12-0${3 + (i % 2)}`,
    trip_created_at: new Date(Date.UTC(2026, 10, 1) + i * 1000).toISOString(),
    freight_cents: 1000000,
    commission_cents: 30000,
    net_cents: 970000,
    paid_cents: 0,
    pending_cents: 970000,
    payments: [],
  };
}

/** carrier_freight_ledger over `total` rows, read by ledger id after `gt`. */
function fakeClient(total: number) {
  const calls: (string | null)[] = [];
  const rows = Array.from({ length: total }, (_, i) => row(i));
  const page = (after: string | null) => ({
    gt: (column: string, value: string) => {
      expect(column).toBe('ledger_id');
      return page(value);
    },
    order: (column: string) => {
      expect(column).toBe('ledger_id');
      return page(after);
    },
    limit: (n: number) => {
      calls.push(after);
      const data = rows.filter((r) => after === null || r.ledger_id > after).slice(0, n);
      return Promise.resolve({ data, error: null });
    },
  });
  const client = {
    rpc: (name: string) => {
      expect(name).toBe('carrier_freight_ledger');
      return page(null);
    },
  } as unknown as Supabase;
  return { client, calls };
}

describe('loadCollections', () => {
  it('reads every trip past the 1,000-row cap by ledger id, in the order of the RPC', async () => {
    const { client, calls } = fakeClient(FREIGHT_PAGE_SIZE + 3);
    const rows = await loadCollections(client);
    expect(rows).toHaveLength(FREIGHT_PAGE_SIZE + 3);
    expect(new Set(rows.map((r) => r.ledger_id)).size).toBe(FREIGHT_PAGE_SIZE + 3);
    expect(calls).toEqual([null, id(FREIGHT_PAGE_SIZE - 1)]);
    // Due the 3rd first (newest trip first), then the 4th, the one without a date last.
    expect(rows[0]?.ledger_id).toBe(id(FREIGHT_PAGE_SIZE + 2));
    expect(rows[0]?.due_on).toBe('2026-12-03');
    expect(rows.at(-1)?.ledger_id).toBe(id(0));
    expect(rows[0]?.net_cents).toBe(970000);
  });
});
