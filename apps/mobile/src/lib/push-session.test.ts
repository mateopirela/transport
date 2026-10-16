import { describe, expect, it, vi } from 'vitest';

import { createPushTokenSession, type PushTokenApi } from './push-session';

const TOKEN = 'ExponentPushToken[abcdefghij]';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function fakeApi(register: PushTokenApi['register'] = () => Promise.resolve()) {
  const calls: string[] = [];
  const api: PushTokenApi = {
    register: vi.fn((token, platform, signal) => {
      calls.push(`register ${token}`);
      return register(token, platform, signal);
    }),
    unregister: vi.fn((token: string) => {
      calls.push(`unregister ${token}`);
      return Promise.resolve();
    }),
  };
  return { api, calls };
}

describe('createPushTokenSession', () => {
  it('registers the token and removes it when the session ends', async () => {
    const { api, calls } = fakeApi();
    const session = createPushTokenSession(api);
    await session.sink()(TOKEN, 'ios');
    await session.end();
    expect(calls).toEqual([`register ${TOKEN}`, `unregister ${TOKEN}`]);
  });

  it('waits for a registration in flight before removing its token', async () => {
    const pending = deferred();
    const { api, calls } = fakeApi(() => pending.promise);
    const session = createPushTokenSession(api);
    const registering = session.sink()(TOKEN, 'android');
    const ending = session.end();
    await Promise.resolve();
    expect(calls).toEqual([`register ${TOKEN}`]);
    pending.resolve();
    await Promise.all([registering, ending]);
    expect(calls).toEqual([`register ${TOKEN}`, `unregister ${TOKEN}`]);
  });

  it('never saves a token of a session that already ended', async () => {
    const { api, calls } = fakeApi();
    const session = createPushTokenSession(api);
    const sink = session.sink();
    await session.end();
    await expect(sink(TOKEN, 'ios')).rejects.toThrow();
    expect(calls).toEqual([]);
    // The next session registers normally.
    await session.sink()(TOKEN, 'ios');
    expect(calls).toEqual([`register ${TOKEN}`]);
  });

  it('removes the token even if the registration failed or hung', async () => {
    vi.useFakeTimers();
    try {
      const { api, calls } = fakeApi(() => new Promise(() => undefined));
      const session = createPushTokenSession(api, 1000);
      const registering = session
        .sink()(TOKEN, 'ios')
        .catch(() => 'timed out');
      const ending = session.end();
      await vi.advanceTimersByTimeAsync(1000);
      await ending;
      expect(await registering).toBe('timed out');
      expect(calls).toEqual([`register ${TOKEN}`, `unregister ${TOKEN}`]);
      expect(vi.mocked(api.register).mock.calls[0]?.[2].aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does nothing on end when no token was registered', async () => {
    const { api, calls } = fakeApi();
    await createPushTokenSession(api).end();
    expect(calls).toEqual([]);
  });
});
