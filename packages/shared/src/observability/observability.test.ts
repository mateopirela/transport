import { describe, expect, it } from 'vitest';

import {
  createLogger,
  isSensitiveKey,
  isValidSentryDsn,
  parseLogLevel,
  parseSampleRate,
  PRODUCT_EVENT_NAMES,
  productEventArgs,
  redact,
  REDACTED,
  redactText,
  scrubEvent,
  sentrySettings,
  serializeError,
  type LogLevel,
} from './index';

const DSN = 'https://abc123def456@o123.ingest.us.sentry.io/4504';
const VEHICLE = 'e1700000-0000-4000-8000-000000000003';

describe('redact', () => {
  it('flags credentials, contacts and positions, not look-alikes', () => {
    for (const key of ['Authorization', 'apikey', 'service_role_key', 'email', 'origin_lat', 'lng'])
      expect(isSensitiveKey(key), key).toBe(true);
    for (const key of ['plate', 'latest', 'status', 'tripId', 'related', 'count'])
      expect(isSensitiveKey(key), key).toBe(false);
  });

  it('replaces sensitive keys at any depth and keeps the rest', () => {
    expect(
      redact({ tripId: 't1', nested: { password: 'x', list: [{ lat: 25.6, n: 1 }] } }),
    ).toEqual({ tripId: 't1', nested: { password: REDACTED, list: [{ lat: REDACTED, n: 1 }] } });
  });

  it('keeps counts under credential-like keys, never positions', () => {
    expect(
      redact({ invalidTokens: 3, pushToken: 'ExponentPushToken[x]', originLat: 25.6 }),
    ).toEqual({ invalidTokens: 3, pushToken: REDACTED, originLat: REDACTED });
  });

  it('scrubs tokens and emails inside text and truncates it', () => {
    const text = redactText('Bearer abc.def-123 eyJa.eyJb.sig ana@fletes.mx');
    expect(text).not.toMatch(/abc\.def|eyJa|ana@/u);
    expect(redactText('x'.repeat(900))).toHaveLength(500);
  });

  it('stops at a maximum depth', () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 10; i++) deep = { child: deep };
    expect(JSON.stringify(redact(deep))).toContain('[truncated]');
  });

  it('serializes errors without the raw object', () => {
    const error = Object.assign(new Error('failed for ana@a.mx'), { code: '42501', status: 403 });
    expect(serializeError(error)).toEqual({
      name: 'Error',
      message: `failed for ${REDACTED}`,
      code: '42501',
      status: 403,
    });
    expect(serializeError('boom')).toEqual({ name: 'string', message: 'boom' });
    expect(redact({ error })).toEqual({ error: serializeError(error) });
  });
});

describe('createLogger', () => {
  function capture(level?: LogLevel) {
    const lines: { level: LogLevel; line: Record<string, unknown> }[] = [];
    const log = createLogger({
      service: 'recommendations',
      level,
      now: () => new Date('2026-10-16T12:00:00Z'),
      sink: (lvl, line) => lines.push({ level: lvl, line: JSON.parse(line) }),
    });
    return { log, lines };
  }

  it('writes one JSON object per line with service, level and time', () => {
    const { log, lines } = capture();
    log.child({ requestId: 'r1' }).info('served', { recommendations: 3 });
    expect(lines).toEqual([
      {
        level: 'info',
        line: {
          level: 'info',
          ts: '2026-10-16T12:00:00.000Z',
          service: 'recommendations',
          msg: 'served',
          requestId: 'r1',
          recommendations: 3,
        },
      },
    ]);
  });

  it('redacts context and serializes the error', () => {
    const { log, lines } = capture();
    log.error('rpc failed', { authorization: 'Bearer x', error: new TypeError('bad') });
    expect(lines[0]?.line).toMatchObject({
      authorization: REDACTED,
      error: { name: 'TypeError', message: 'bad' },
    });
  });

  it('drops lines below the level', () => {
    const { log, lines } = capture('warn');
    log.debug('a');
    log.info('b');
    log.warn('c');
    log.error('d');
    expect(lines.map((l) => l.level)).toEqual(['warn', 'error']);
  });

  it('parses LOG_LEVEL with an info fallback', () => {
    expect(parseLogLevel(' DEBUG ')).toBe('debug');
    expect(parseLogLevel('verbose')).toBe('info');
    expect(parseLogLevel(undefined)).toBe('info');
  });
});

describe('sentry settings', () => {
  it('accepts only https DSNs with a project id', () => {
    expect(isValidSentryDsn(DSN)).toBe(true);
    expect(isValidSentryDsn('')).toBe(false);
    expect(isValidSentryDsn(undefined)).toBe(false);
    expect(isValidSentryDsn('http://abc@o1.sentry.io/1')).toBe(false);
    expect(isValidSentryDsn('https://o1.sentry.io/1')).toBe(false);
  });

  it('is off without a valid DSN', () => {
    expect(sentrySettings({ dsn: '', environment: 'production' })).toBeNull();
    expect(sentrySettings({ dsn: 'not-a-dsn', environment: 'production' })).toBeNull();
  });

  it('builds options without default PII', () => {
    const s = sentrySettings({
      dsn: ` ${DSN} `,
      environment: '',
      release: 'web@1',
      tracesSampleRate: '0.5',
    });
    expect(s).toMatchObject({
      dsn: DSN,
      environment: 'development',
      release: 'web@1',
      tracesSampleRate: 0.5,
      sendDefaultPii: false,
    });
    expect(sentrySettings({ dsn: DSN, environment: 'staging' })).not.toHaveProperty('release');
  });

  it('parses the sample rate within 0–1', () => {
    expect(parseSampleRate('1', 0.1)).toBe(1);
    expect(parseSampleRate('2', 0.1)).toBe(0.1);
    expect(parseSampleRate('abc', 0.1)).toBe(0.1);
    expect(parseSampleRate(' ', 0.2)).toBe(0.2);
    expect(parseSampleRate(null, 0.3)).toBe(0.3);
  });

  it('scrubs users, requests, extras, breadcrumbs and messages', () => {
    const event = scrubEvent({
      user: { id: 'u1', email: 'ana@a.mx', ip_address: '1.2.3.4', role: 'carrier' },
      request: {
        url: 'https://app.mx/cliente/viajes?token=abc#x',
        query_string: 'token=abc',
        cookies: { sb: 'x' },
        headers: { Authorization: 'Bearer x', 'User-Agent': 'UA', cookie: 'x' },
        data: { password: 'x' },
      },
      extra: { lat: 25.6, tripId: 't1' },
      contexts: { trip: { lng: -100.3 } },
      breadcrumbs: [{ message: 'login ana@a.mx', data: { phone: '81' } }, {}],
      exception: { values: [{ value: 'Bearer secret.token' }, {}] },
      message: 'for ana@a.mx',
    });
    expect(event).toEqual({
      user: { id: 'u1', role: 'carrier' },
      request: { url: 'https://app.mx/cliente/viajes', headers: { 'User-Agent': 'UA' } },
      extra: { lat: REDACTED, tripId: 't1' },
      contexts: { trip: { lng: REDACTED } },
      breadcrumbs: [{ message: `login ${REDACTED}`, data: { phone: REDACTED } }, {}],
      exception: { values: [{ value: `Bearer ${REDACTED}` }, {}] },
      message: `for ${REDACTED}`,
    });
    expect(scrubEvent({ request: {} })).toEqual({ request: {} });
  });
});

describe('product events', () => {
  it('lists the same names as the SQL enum', () => {
    expect(PRODUCT_EVENT_NAMES).toEqual([
      'recommendations_viewed',
      'recommendation_opened',
      'offer_submitted',
    ]);
  });

  it('builds the RPC arguments of a valid event', () => {
    expect(
      productEventArgs({
        name: 'recommendation_opened',
        loadId: VEHICLE,
        properties: { vehicle_id: VEHICLE, rank: 1, score: 87.5, return_trip: true },
      }),
    ).toEqual({
      p_name: 'recommendation_opened',
      p_load_id: VEHICLE,
      p_properties: { vehicle_id: VEHICLE, rank: 1, score: 87.5, return_trip: true },
    });
    expect(
      productEventArgs({
        name: 'recommendations_viewed',
        properties: { recommendations: 0, return_trips: 0, units: 1 },
      }),
    ).not.toHaveProperty('p_load_id');
  });

  it('rejects unknown keys, bad values and bad load ids', () => {
    const extra = { source: 'search', counter: false, email: 'a@b.mx' };
    expect(productEventArgs({ name: 'offer_submitted', properties: extra as never })).toBeNull();
    expect(
      productEventArgs({
        name: 'offer_submitted',
        properties: { source: 'whatsapp' as never, counter: false },
      }),
    ).toBeNull();
    expect(
      productEventArgs({
        name: 'offer_submitted',
        loadId: 'not-a-uuid',
        properties: { source: 'search', counter: false },
      }),
    ).toBeNull();
  });
});
