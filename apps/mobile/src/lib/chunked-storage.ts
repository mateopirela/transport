// Session storage on top of expo-secure-store (Keychain / Android Keystore).
//
// SecureStore values should stay under ~2 KB, but a Supabase session (JWT,
// refresh token and user) is usually larger. The value is split into chunks
// written under a fresh "generation" first; only then does the manifest under
// the main key switch to that generation, and the previous chunks are deleted.
// A crash mid-write therefore leaves either the old or the new value, never a
// mix of both.

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

function parseManifest(raw: string | null): Manifest | null {
  if (raw === null || !raw.startsWith(MANIFEST_PREFIX)) return null;
  const [generation, countText] = raw.slice(MANIFEST_PREFIX.length).split(':');
  const count = Number(countText);
  if (!generation || !/^[A-Za-z0-9]+$/u.test(generation) || !Number.isInteger(count) || count < 0) {
    return null;
  }
  return { generation, count };
}

const chunkKey = (base: string, generation: string, index: number) =>
  `${base}.${generation}.${index}`;

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
        let generation = newGeneration().replace(/[^A-Za-z0-9]/gu, '') || '0';
        if (previous && generation === previous.generation) generation = `${generation}x`;
        const chunks = splitIntoChunks(value, chunkSize);
        const next: Manifest = { generation, count: chunks.length };
        try {
          for (const [i, chunk] of chunks.entries()) {
            await backend.setItem(chunkKey(base, generation, i), chunk);
          }
          await backend.setItem(base, `${MANIFEST_PREFIX}${generation}:${chunks.length}`);
        } catch (error) {
          // The previous value is still the current one; drop the partial write.
          await removeChunks(base, next).catch(() => undefined);
          throw error;
        }
        await removeChunks(base, previous);
      }),

    removeItem: (key) =>
      serialize(async () => {
        const base = toStoreKey(key);
        const previous = parseManifest(await backend.getItem(base));
        await backend.removeItem(base);
        await removeChunks(base, previous);
      }),
  };
}
