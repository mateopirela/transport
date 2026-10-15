// Session storage on top of expo-secure-store (Keychain / Android Keystore).
//
// SecureStore values should stay under ~2 KB, but a Supabase session (JWT,
// refresh token and user) is usually larger. The value is split into chunks
// written under a fresh "generation" first; only then does the manifest under
// the main key switch to that generation, and the previous chunks are deleted.
// A crash mid-write therefore leaves either the old or the new value, never a
// mix of both.
//
// Before touching chunks, the generations involved are recorded in a journal
// key. The next write or removal deletes every journaled generation that is
// not the current one, so chunks orphaned by a crash never stay behind (not
// even after sign-out).

export interface KeyValueBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Same shape as Supabase's `SupportedStorage`. */
export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const MANIFEST_PREFIX = 'chunked:v1:';
/**
 * UTF-16 code units per chunk. A code unit takes at most 3 UTF-8 bytes (a
 * surrogate pair, 2 units, takes 4), so 600 units stay below 1,800 bytes.
 */
export const DEFAULT_CHUNK_SIZE = 600;

/** SecureStore keys only allow letters, digits, ".", "-" and "_". */
export function toStoreKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/gu, '_');
}

/** Splits a string without ever separating the two halves of a surrogate pair. */
export function splitIntoChunks(value: string, chunkSize: number): string[] {
  if (chunkSize < 2) throw new Error('chunkSize must be at least 2');
  const chunks: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(start + chunkSize, value.length);
    const last = value.charCodeAt(end - 1);
    if (end < value.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks;
}

interface Manifest {
  generation: string;
  count: number;
}

function parseEntry(entry: string): Manifest | null {
  const [generation, countText] = entry.split(':');
  const count = Number(countText);
  if (!generation || !/^[A-Za-z0-9]+$/u.test(generation) || !Number.isInteger(count) || count < 0) {
    return null;
  }
  return { generation, count };
}

function parseManifest(raw: string | null): Manifest | null {
  if (raw === null || !raw.startsWith(MANIFEST_PREFIX)) return null;
  return parseEntry(raw.slice(MANIFEST_PREFIX.length));
}

const formatEntry = ({ generation, count }: Manifest) => `${generation}:${count}`;

/** Journal: generations whose chunks may be left over, e.g. `g1:3,g2:4`. */
function parseJournal(raw: string | null): Manifest[] {
  if (!raw) return [];
  return raw.split(',').flatMap((entry) => parseEntry(entry) ?? []);
}

const chunkKey = (base: string, generation: string, index: number) =>
  `${base}.${generation}.${index}`;
const journalKey = (base: string) => `${base}.journal`;

export function createChunkedStorage(
  backend: KeyValueBackend,
  {
    chunkSize = DEFAULT_CHUNK_SIZE,
    newGeneration = () => Math.random().toString(36).slice(2, 10) || '0',
  }: { chunkSize?: number; newGeneration?: () => string } = {},
): AsyncStorageLike {
  async function removeChunks(base: string, manifest: Manifest | null): Promise<void> {
    if (!manifest) return;
    for (let i = 0; i < manifest.count; i += 1) {
      await backend.removeItem(chunkKey(base, manifest.generation, i));
    }
  }

  /** Deletes the chunks of every journaled generation except the current one. */
  async function sweep(base: string, current: Manifest | null): Promise<void> {
    const journal = parseJournal(await backend.getItem(journalKey(base)));
    if (journal.length === 0) return;
    for (const entry of journal) {
      if (entry.generation !== current?.generation) await removeChunks(base, entry);
    }
    await backend.removeItem(journalKey(base));
  }

  /** Adds generations to the journal, keeping the ones already recorded. */
  async function writeJournal(base: string, entries: (Manifest | null)[]): Promise<void> {
    const recorded = parseJournal(await backend.getItem(journalKey(base)));
    const all = [...recorded, ...entries.filter((entry): entry is Manifest => entry !== null)];
    const unique = [...new Map(all.map((entry) => [entry.generation, entry])).values()];
    await backend.setItem(journalKey(base), unique.map(formatEntry).join(','));
  }

  // Operations run one at a time so concurrent writes cannot interleave chunks.
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  return {
    getItem: (key) =>
      serialize(async () => {
        const base = toStoreKey(key);
        const manifest = parseManifest(await backend.getItem(base));
        if (!manifest) return null;
        let value = '';
        for (let i = 0; i < manifest.count; i += 1) {
          const chunk = await backend.getItem(chunkKey(base, manifest.generation, i));
          // A missing chunk means the value is unusable: behave as signed out.
          if (chunk === null) return null;
          value += chunk;
        }
        return value;
      }),

    setItem: (key, value) =>
      serialize(async () => {
        const base = toStoreKey(key);
        const previous = parseManifest(await backend.getItem(base));
        await sweep(base, previous);
        let generation = newGeneration().replace(/[^A-Za-z0-9]/gu, '') || '0';
        if (previous && generation === previous.generation) generation = `${generation}x`;
        const chunks = splitIntoChunks(value, chunkSize);
        const next: Manifest = { generation, count: chunks.length };
        // Whichever of the two generations loses survives only in the journal.
        await writeJournal(base, [next, previous]);
        try {
          for (const [i, chunk] of chunks.entries()) {
            await backend.setItem(chunkKey(base, generation, i), chunk);
          }
          await backend.setItem(base, `${MANIFEST_PREFIX}${formatEntry(next)}`);
        } catch (error) {
          // The previous value is still the current one; drop the partial write.
          await removeChunks(base, next).catch(() => undefined);
          throw error;
        }
        await removeChunks(base, previous);
        await backend.removeItem(journalKey(base));
      }),

    removeItem: (key) =>
      serialize(async () => {
        const base = toStoreKey(key);
        const previous = parseManifest(await backend.getItem(base));
        // Journal the generation so a crash below still gets it cleaned up,
        // but never let a failed write (e.g. storage full) block the removal.
        await writeJournal(base, [previous]).catch(() => undefined);
        // Deleting the manifest invalidates the value: from here on getItem
        // returns null even if the cleanup below fails.
        await backend.removeItem(base);
        await removeChunks(base, previous).catch(() => undefined);
        await sweep(base, null).catch(() => undefined);
      }),
  };
}
