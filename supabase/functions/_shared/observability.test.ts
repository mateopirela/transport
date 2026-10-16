// observe(): request ids, one structured line per request, and unexpected
// exceptions turned into a reported JSON 500. Run with `deno test`.
import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1.0.19';

import { observe, type ErrorReporter } from './observability.ts';
import { sentryReporter } from './sentry.ts';

function setup(env: Record<string, string> = {}, reporter?: ErrorReporter) {
  const lines: Record<string, unknown>[] = [];
  let clock = 1000;
  const wrap = (handler: Parameters<typeof observe>[1]) =>
    observe('test-fn', handler, {
      env: (name) => env[name],
      reporter,
      errorHeaders: { 'Access-Control-Allow-Origin': '*' },
      sink: (_level, line) => lines.push(JSON.parse(line)),
      now: () => (clock += 25),
    });
  return { lines, wrap };
}

Deno.test('logs one line per request and echoes a valid request id', async () => {
  const { lines, wrap } = setup();
  const served = wrap((_request, log) => {
    log.info('working', { authorization: 'Bearer secret' });
    return Promise.resolve(new Response('ok', { status: 201 }));
  });
  const response = await served(
    new Request('http://x/fn', { method: 'POST', headers: { 'x-request-id': 'req-12345678' } }),
  );
  assertEquals(response.status, 201);
  assertEquals(response.headers.get('x-request-id'), 'req-12345678');
  assertEquals(lines.length, 2);
  assertEquals(lines[0]?.authorization, '[redacted]');
  assertEquals(lines[1], {
    requestId: 'req-12345678',
    method: 'POST',
    status: 201,
    durationMs: 25,
    level: 'info',
    ts: lines[1]?.ts,
    service: 'test-fn',
    msg: 'request finished',
  });
});

Deno.test('replaces an unsafe request id with a fresh one', async () => {
  const { lines, wrap } = setup();
  const served = wrap(() => Promise.resolve(new Response('ok')));
  const response = await served(
    new Request('http://x/fn', { headers: { 'x-request-id': 'bad id; drop' } }),
  );
  const id = response.headers.get('x-request-id') ?? '';
  assertMatch(id, /^[0-9a-f-]{36}$/u);
  assertEquals(lines[0]?.requestId, id);
});

Deno.test('an unexpected exception is logged, reported and answered with a JSON 500', async () => {
  const captured: { error: unknown; tags: Record<string, string> }[] = [];
  const reporter: ErrorReporter = {
    capture: (error, tags) => {
      captured.push({ error, tags });
      return Promise.resolve();
    },
  };
  const { lines, wrap } = setup({ LOG_LEVEL: 'warn' }, reporter);
  const served = wrap(() => Promise.reject(new TypeError('boom for ana@a.mx')));
  const response = await served(new Request('http://x/fn', { method: 'POST' }));

  assertEquals(response.status, 500);
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), '*');
  const body = (await response.json()) as { error: string; requestId: string };
  assertEquals(body.error, 'internal_error');
  assertEquals(captured.length, 1);
  assertEquals(captured[0]?.tags, { service: 'test-fn', requestId: body.requestId });
  // LOG_LEVEL=warn: only the error line, with the message redacted.
  assertEquals(lines.length, 1);
  assertEquals(lines[0]?.level, 'error');
  assertEquals(lines[0]?.error, { name: 'TypeError', message: 'boom for [redacted]' });
});

Deno.test('a failing reporter does not change the answer', async () => {
  const reporter: ErrorReporter = { capture: () => Promise.reject(new Error('offline')) };
  const { lines, wrap } = setup({}, reporter);
  const served = wrap(() => Promise.reject(new Error('boom')));
  const response = await served(new Request('http://x/fn'));
  assertEquals(response.status, 500);
  assert(lines.some((l) => l.msg === 'error report failed'));
});

Deno.test('Sentry stays off without a valid DSN', async () => {
  assertEquals(await sentryReporter(() => undefined), null);
  assertEquals(await sentryReporter((n) => (n === 'SENTRY_DSN' ? 'not-a-dsn' : undefined)), null);
});
