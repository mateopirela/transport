import { describe, expect, it } from 'vitest';

import { fetchAllPages, FREIGHT_PAGE_SIZE } from './pages';

/** A fake RPC over `total` rows that records the ranges it was asked for. */
function fakeRpc(total: number) {
  const ranges: [number, number][] = [];
  const rows = Array.from({ length: total }, (_, i) => i);
  const fetchPage = (from: number, to: number) => {
    ranges.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  };
  return { ranges, fetchPage };
}

describe('fetchAllPages', () => {
  it('reads every page past the 1,000-row cap of PostgREST', async () => {
    const { ranges, fetchPage } = fakeRpc(FREIGHT_PAGE_SIZE * 2 + 5);
    const rows = await fetchAllPages(fetchPage, 'rpc');
    expect(rows).toHaveLength(FREIGHT_PAGE_SIZE * 2 + 5);
    expect(rows.at(-1)).toBe(FREIGHT_PAGE_SIZE * 2 + 4);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('asks once more when the last page is exactly full', async () => {
    const { ranges, fetchPage } = fakeRpc(FREIGHT_PAGE_SIZE);
    expect(await fetchAllPages(fetchPage, 'rpc')).toHaveLength(FREIGHT_PAGE_SIZE);
    expect(ranges).toHaveLength(2);
  });

  it('stops at an empty result and fails with the RPC name', async () => {
    expect(await fetchAllPages(fakeRpc(0).fetchPage, 'rpc')).toEqual([]);
    await expect(
      fetchAllPages(
        () => Promise.resolve({ data: null, error: { message: 'boom' } }),
        'carrier_freight_ledger',
      ),
    ).rejects.toThrow('carrier_freight_ledger failed: boom');
  });
});
