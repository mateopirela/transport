import { describe, expect, it } from 'vitest';

import { selectAll } from './paging';

describe('selectAll', () => {
  const rows = Array.from({ length: 7 }, (_, i) => i);
  const source = (from: number, to: number) =>
    Promise.resolve({ data: rows.slice(from, to + 1), error: null });

  it('reads every page until a short one', async () => {
    const ranges: [number, number][] = [];
    const result = await selectAll((from, to) => {
      ranges.push([from, to]);
      return source(from, to);
    }, 3);
    expect(result).toEqual(rows);
    expect(ranges).toEqual([
      [0, 2],
      [3, 5],
      [6, 8],
    ]);
  });

  it('stops after an exactly full last page with an empty one', async () => {
    const result = await selectAll((from, to) => source(from, to), 7);
    expect(result).toEqual(rows);
  });

  it('throws on a query error instead of returning a partial list', async () => {
    await expect(
      selectAll(() => Promise.resolve({ data: null, error: { message: 'boom' } }), 3),
    ).rejects.toThrow('boom');
  });
});
