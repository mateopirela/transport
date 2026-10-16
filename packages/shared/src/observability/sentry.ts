// Sentry settings shared by web, mobile and the Edge Functions (B25). Pure
// code (no SDK import): every app passes these options to its own SDK. The
// DSN is optional: without a valid one Sentry is never initialized.
import { redact, redactText } from './redact';

/** Sentry DSN: https://<public key>@<host>/<project id>. It holds no secret. */
const DSN = /^https:\/\/[0-9a-f]+@[a-z0-9.-]+(:\d+)?\/\d+$/iu;

export function isValidSentryDsn(dsn: string | undefined | null): dsn is string {
  return typeof dsn === 'string' && DSN.test(dsn.trim());
}

/** 0–1 from the environment; anything else (or empty) is the default. */
export function parseSampleRate(value: string | undefined | null, fallback: number): number {
  if (value === undefined || value === null || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

export const DEFAULT_TRACES_SAMPLE_RATE = 0.1;

/** The part of a Sentry event we scrub. Structural, so any SDK's Event fits. */
export interface ScrubbableEvent {
  user?: Record<string, unknown> | null | undefined;
  request?:
    | {
        url?: string | undefined;
        query_string?: unknown;
        cookies?: unknown;
        headers?: Record<string, string> | undefined;
        data?: unknown;
      }
    | undefined;
  extra?: Record<string, unknown> | undefined;
  contexts?: Record<string, unknown> | undefined;
  breadcrumbs?: { message?: string | undefined; data?: Record<string, unknown> | undefined }[];
  exception?: { values?: { value?: string | undefined }[] | undefined } | undefined;
  message?: string | undefined;
}

/** Only the ids of the user travel; never the email, name or IP. */
const USER_KEYS = new Set(['id', 'role', 'company_id']);
const HEADER_KEYS = new Set(['user-agent', 'content-type', 'accept', 'x-request-id']);

function stripQuery(url: string): string {
  const i = url.search(/[?#]/u);
  return i === -1 ? url : url.slice(0, i);
}

/**
 * `beforeSend`/`beforeSendTransaction`: removes personal data and credentials
 * from an event before it leaves the device or the server.
 */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  if (event.user) {
    event.user = Object.fromEntries(
      Object.entries(event.user).filter(([k]) => USER_KEYS.has(k)),
    ) as E['user'];
  }
  if (event.request) {
    const { url, headers } = event.request;
    event.request = {
      ...(url ? { url: stripQuery(url) } : {}),
      ...(headers
        ? {
            headers: Object.fromEntries(
              Object.entries(headers).filter(([k]) => HEADER_KEYS.has(k.toLowerCase())),
            ),
          }
        : {}),
    };
  }
  if (event.extra) event.extra = redact(event.extra) as Record<string, unknown>;
  if (event.contexts) event.contexts = redact(event.contexts) as Record<string, unknown>;
  if (event.message) event.message = redactText(event.message);
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      ...(b.message ? { message: redactText(b.message) } : {}),
      ...(b.data ? { data: redact(b.data) as Record<string, unknown> } : {}),
    }));
  }
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = redactText(value.value);
  }
  return event;
}

export interface SentrySettingsInput {
  dsn: string | undefined | null;
  /** e.g. development, staging, production. */
  environment: string | undefined | null;
  release?: string | undefined | null;
  tracesSampleRate?: string | undefined | null;
}

export interface SentrySettings {
  dsn: string;
  environment: string;
  release?: string;
  tracesSampleRate: number;
  sendDefaultPii: false;
  beforeSend: <E extends ScrubbableEvent>(event: E) => E;
  beforeSendTransaction: <E extends ScrubbableEvent>(event: E) => E;
}

/** Options for `Sentry.init`, or null (Sentry off) when the DSN is missing or invalid. */
export function sentrySettings(input: SentrySettingsInput): SentrySettings | null {
  if (!isValidSentryDsn(input.dsn)) return null;
  const release = input.release?.trim();
  return {
    dsn: input.dsn.trim(),
    environment: input.environment?.trim() || 'development',
    ...(release ? { release } : {}),
    tracesSampleRate: parseSampleRate(input.tracesSampleRate, DEFAULT_TRACES_SAMPLE_RATE),
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeSendTransaction: scrubEvent,
  };
}
