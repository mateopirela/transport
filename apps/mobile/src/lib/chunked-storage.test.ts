import { describe, expect, it } from 'vitest';

import {
  createChunkedStorage,
  splitIntoChunks,
  toStoreKey,
  type KeyValueBackend,
} from './chunked-storage';

function memoryBackend() {
  const data = new Map<string, string>();
  const backend: KeyValueBackend = {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      if (!/^[A-Za-z0-9._-]+$/u.test(key)) throw new Error(`invalid key ${key}`);
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
  return { data, backend };
}

const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;

describe('toStoreKey', () => {
  it('keeps allowed characters and replaces the rest', () => {
    expect(toStoreKey('sb-127-auth-token')).toBe('sb-127-auth-token');
    expect(toStoreKey('sb:host/auth token')).toBe('sb_host_auth_token');
  });
});

describe('splitIntoChunks', () => {
  it('splits and rejoins any string', () => {
    const value = 'a'.repeat(1234);
    const chunks = splitIntoChunks(value, 500);
    expect(chunks.map((c) => c.length)).toEqual([500, 500, 234]);
    expect(chunks.join('')).toBe(value);
    expect(splitIntoChunks('', 10)).toEqual([]);
  });

  it('never splits a surrogate pair', () => {
    const value = `${'a'.repeat(9)}🚚${'b'.repeat(5)}`;
    const chunks = splitIntoChunks(value, 10);
    expect(chunks[0]).toBe('a'.repeat(9));
    expect(chunks.join('')).toBe(value);
    for (const chunk of chunks) expect(chunk.isWellFormed()).toBe(true);
  });

  it('rejects a chunk size that cannot hold a surrogate pair', () => {
    expect(() => splitIntoChunks('abc', 1)).toThrow();
  });
});

describe('createChunkedStorage', () => {
  const session = JSON.stringify({
    access_token: 'x'.repeat(1500),
    refresh_token: 'r'.repeat(40),
    user: { user_metadata: { full_name: 'José Ñúñez 🚚' } },
  });

  it('round-trips a value larger than one SecureStore item', async () => {
    const { data, backend } = memoryBackend();
    const storage = createChunkedStorage(backend);
    await storage.setItem('sb-local-auth-token', session);
    expect(await storage.getItem('sb-local-auth-token')).toBe(session);
    for (const value of data.values()) expect(utf8Bytes(value)).toBeLessThanOrEqual(2048);
    expect(data.size).toBeGreaterThan(2);
  });

  it('returns null for unknown keys and for legacy unchunked values', async () => {
    const { data, backend } = memoryBackend();
    const storage = createChunkedStorage(backend);
    expect(await storage.getItem('missing')).toBeNull();
    data.set('legacy', '{"access_token":"x"}');
    expect(await storage.getItem('legacy')).toBeNull();
  });

  it('replaces the previous value and deletes its chunks', async () => {
    const { data, backend } = memoryBackend();
    let n = 0;
    const storage = createChunkedStorage(backend, { chunkSize: 4, newGeneration: () => `g${++n}` });
    await storage.setItem('k', 'aaaaaaaaaaaa');
    await storage.setItem('k', 'bbbbb');
    expect(await storage.getItem('k')).toBe('bbbbb');
    expect([...data.keys()].sort()).toEqual(['k', 'k.g2.0', 'k.g2.1']);
  });

  it('keeps the old value readable if a write fails before switching the manifest', async () => {
    const { backend } = memoryBackend();
    const storage = createChunkedStorage(backend, { chunkSize: 4 });
    await storage.setItem('k', 'old-value');
    let writes = 0;
    const failing: KeyValueBackend = {
      ...backend,
      setItem: async (key, value) => {
        writes += 1;
        if (writes === 2) throw new Error('disk full');
        await backend.setItem(key, value);
      },
    };
    await expect(
      createChunkedStorage(failing, { chunkSize: 4 }).setItem('k', 'new-value'),
    ).rejects.toThrow();
    expect(await storage.getItem('k')).toBe('old-value');
  });

  it('treats a missing chunk as no session', async () => {
    const { data, backend } = memoryBackend();
    const storage = createChunkedStorage(backend, { chunkSize: 4, newGeneration: () => 'g' });
    await storage.setItem('k', 'abcdefgh');
    data.delete('k.g.1');
    expect(await storage.getItem('k')).toBeNull();
  });

  it('ignores a tampered manifest', async () => {
    const { data, backend } = memoryBackend();
    const storage = createChunkedStorage(backend);
    for (const manifest of [
      'chunked:v1:../x:1',
      'chunked:v1:g:-1',
      'chunked:v1:g:abc',
      'chunked:v1::1',
    ]) {
      data.set('k', manifest);
      expect(await storage.getItem('k')).toBeNull();
    }
  });

  it('removes the manifest and every chunk', async () => {
    const { data, backend } = memoryBackend();
    const storage = createChunkedStorage(backend, { chunkSize: 4 });
    await storage.setItem('k', 'abcdefghij');
    await storage.removeItem('k');
    expect(data.size).toBe(0);
    expect(await storage.getItem('k')).toBeNull();
  });

  it('serializes concurrent writes so the last one wins intact', async () => {
    const { data, backend } = memoryBackend();
    const slow: KeyValueBackend = {
      ...backend,
      setItem: async (key, value) => {
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 3));
        await backend.setItem(key, value);
      },
    };
    const storage = createChunkedStorage(slow, { chunkSize: 3 });
    await Promise.all([
      storage.setItem('k', 'first-value'),
      storage.setItem('k', 'second-value'),
      storage.setItem('k', 'third-value'),
    ]);
    expect(await storage.getItem('k')).toBe('third-value');
    // Only the manifest and the chunks of the last value remain.
    expect(data.size).toBe(1 + Math.ceil('third-value'.length / 3));
  });

  it('reuses a fresh generation when the generator repeats itself', async () => {
    const { backend } = memoryBackend();
    const storage = createChunkedStorage(backend, { chunkSize: 4, newGeneration: () => 'same' });
    await storage.setItem('k', 'aaaaaaaa');
    await storage.setItem('k', 'bbbbbbbb');
    expect(await storage.getItem('k')).toBe('bbbbbbbb');
  });
});
