/**
 * A live count that several views of the same thing share (the unread
 * notifications of the sidebar and of the menu panel): one source per key,
 * opened by the first view and closed by the last, so two views never open
 * two subscriptions nor show two different counts.
 */
export interface SharedCounts {
  /** The count of a key: the live one while a view is subscribed, else `seed`. */
  read: (key: string, seed: number) => number;
  /**
   * Adds a view. `seed` is the count the server rendered: it starts the count,
   * and a view that arrives with a newer one resets it. Returns how to leave.
   */
  subscribe: (key: string, seed: number, listener: () => void) => () => void;
}

interface Entry {
  count: number;
  seed: number;
  listeners: Set<() => void>;
  /** Stops the source; null only while it is being opened. */
  close: (() => void) | null;
}

/**
 * `open` starts the source of a key (a Realtime subscription) and hands it
 * `set` to report each new count; it returns how to stop it.
 */
export function createSharedCounts(
  open: (key: string, set: (count: number) => void) => () => void,
): SharedCounts {
  const entries = new Map<string, Entry>();

  const update = (entry: Entry, count: number) => {
    if (entry.count === count) return;
    entry.count = count;
    for (const listener of entry.listeners) listener();
  };

  return {
    read: (key, seed) => entries.get(key)?.count ?? seed,
    subscribe: (key, seed, listener) => {
      let entry = entries.get(key);
      if (!entry) {
        const created: Entry = { count: seed, seed, listeners: new Set(), close: null };
        entries.set(key, created);
        // A count that arrives after the last view left changes nothing anyone reads.
        created.close = open(key, (count) => update(created, count));
        entry = created;
      } else if (entry.seed !== seed) {
        // A newer render of the server: its count replaces the live one.
        entry.seed = seed;
        update(entry, seed);
      }
      const joined = entry;
      // Its own function: two views that pass the same listener still count as two.
      const view = () => listener();
      joined.listeners.add(view);
      return () => {
        joined.listeners.delete(view);
        if (joined.listeners.size > 0 || entries.get(key) !== joined) return;
        entries.delete(key);
        joined.close?.();
      };
    },
  };
}
