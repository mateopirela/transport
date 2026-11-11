import { describe, expect, it, vi } from 'vitest';

import { createSharedCounts } from './shared-count';

/** A view that only needs to be there. */
function view() {
  // Nothing to redraw in a test.
}

/** A source that records how many times it opened and closed, and lets the test report counts. */
function source() {
  const setters = new Map<string, (count: number) => void>();
  const opened = vi.fn();
  const closed = vi.fn();
  const counts = createSharedCounts((key, set) => {
    opened(key);
    setters.set(key, set);
    return () => closed(key);
  });
  return {
    counts,
    opened,
    closed,
    report: (key: string, count: number) => setters.get(key)?.(count),
  };
}

describe('createSharedCounts', () => {
  it('reads the seed while nobody is subscribed', () => {
    const { counts, opened } = source();
    expect(counts.read('ana', 3)).toBe(3);
    expect(opened).not.toHaveBeenCalled();
  });

  it('opens one source for two views of the same key', () => {
    const { counts, opened, closed } = source();
    const leaveSidebar = counts.subscribe('ana', 2, view);
    const leaveMenu = counts.subscribe('ana', 2, view);
    expect(opened).toHaveBeenCalledTimes(1);

    leaveMenu();
    expect(closed).not.toHaveBeenCalled();
    leaveSidebar();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('gives a view that arrives later the live count, not its own seed', () => {
    const { counts, report } = source();
    counts.subscribe('ana', 2, view);
    report('ana', 5);
    // The menu panel opens with the count the server rendered a while ago.
    expect(counts.read('ana', 2)).toBe(5);
  });

  it('tells every view of a new count, and only when it changes', () => {
    const { counts, report } = source();
    const sidebar = vi.fn();
    const menu = vi.fn();
    counts.subscribe('ana', 2, sidebar);
    counts.subscribe('ana', 2, menu);

    report('ana', 3);
    report('ana', 3);
    expect(sidebar).toHaveBeenCalledTimes(1);
    expect(menu).toHaveBeenCalledTimes(1);
    expect(counts.read('ana', 2)).toBe(3);
  });

  it('takes the count of a newer server render', () => {
    const { counts, report } = source();
    const sidebar = vi.fn();
    counts.subscribe('ana', 2, sidebar);
    report('ana', 5);

    counts.subscribe('ana', 0, view);
    expect(counts.read('ana', 0)).toBe(0);
    expect(sidebar).toHaveBeenCalledTimes(2);
  });

  it('keeps the keys apart', () => {
    const { counts, opened, report } = source();
    counts.subscribe('ana', 1, view);
    counts.subscribe('jorge', 4, view);
    report('ana', 7);
    expect(opened).toHaveBeenCalledTimes(2);
    expect(counts.read('ana', 0)).toBe(7);
    expect(counts.read('jorge', 0)).toBe(4);
  });

  it('starts again from the seed after the last view left', () => {
    const { counts, opened, report } = source();
    const leave = counts.subscribe('ana', 2, view);
    report('ana', 9);
    leave();
    // A count that arrives late changes nothing anyone reads.
    report('ana', 11);
    expect(counts.read('ana', 2)).toBe(2);

    counts.subscribe('ana', 2, view);
    expect(opened).toHaveBeenCalledTimes(2);
  });

  it('leaves once, however many times it is asked', () => {
    const { counts, closed } = source();
    const leave = counts.subscribe('ana', 2, view);
    const stay = counts.subscribe('ana', 2, view);
    leave();
    leave();
    expect(closed).not.toHaveBeenCalled();
    stay();
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
