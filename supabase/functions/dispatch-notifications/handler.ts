// Edge Function `dispatch-notifications` (B09): sends the pending rows of
// public.notifications as Expo Push (to every device of the user) and email
// (to the web users: Cliente and Admin, D06), with the Spanish copy of
// packages/shared.
//
//   POST (no body), header `x-dispatch-secret: $NOTIFICATIONS_DISPATCH_SECRET`.
//   pg_cron calls it every minute (invoke_notification_dispatcher). At most
//   10 runs a minute go through (B24 rate limit, consume_service_rate_limit):
//   a leaked secret cannot hammer Expo and the email provider.
//
// Delivery guarantees:
//   * claim_notifications leases each row (skip locked), so two runs never
//     work on the same notification at the same time.
//   * Each channel has its own state (push_state, email_state): a retry only
//     repeats the channel that failed temporarily.
//   * Push is at most once: the claim marks it in flight before it is sent, and
//     if this run dies before recording the result, the next claim marks it
//     `unknown` instead of sending it again. Email carries an Idempotency-Key,
//     so after such a crash it is safely sent again.
//   * Temporary failures are retried with backoff by
//     record_notification_dispatch (5 attempts); tokens that Expo reports as
//     DeviceNotRegistered are deleted.
//
// Without EMAIL_PROVIDER_API_KEY or EMAIL_FROM, email is simulated: logged
// (without the address) and not sent.
import {
  notificationContent,
  type NotificationContent,
} from '../../../packages/shared/src/copy/notifications.ts';
import {
  notificationEmail,
  PUSH_ONLY_NOTIFICATION_TYPES,
} from '../../../packages/shared/src/copy/notification-email.ts';
import type { NotificationType, UserRole } from '../../../packages/shared/src/enums.ts';
import { createLogger, type Logger } from '../../../packages/shared/src/observability/logger.ts';

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface Dependencies {
  env: (name: string) => string | undefined;
  fetch: FetchLike;
  now?: () => number;
  /** Structured logger of the request (B25); a plain one when not given. */
  log?: Logger;
}

/** A row of claim_notifications. */
export interface ClaimedNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  data: Record<string, unknown>;
  created_at: string;
  attempt: number;
  push_pending: boolean;
  email_pending: boolean;
  email: string | null;
  role: UserRole | null;
  push_tokens: string[];
}

/**
 * Outcome of one channel in this attempt: final (sent, skipped because it
 * does not apply, failed for good) or retry (a temporary failure).
 */
export type ChannelOutcome = 'sent' | 'skipped' | 'failed' | 'retry';

/** An entry of record_notification_dispatch. */
export interface DispatchResult {
  id: string;
  attempt: number;
  push: ChannelOutcome;
  email: ChannelOutcome;
  error?: string;
}

const defaultLog = createLogger({ service: 'dispatch-notifications' });
const logOf = (deps: Dependencies) => deps.log ?? defaultLog;

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const RESEND_URL = 'https://api.resend.com/emails';
const EXPO_CHUNK = 100;
const BATCH_SIZE = 50;
const LEASE_SECONDS = 300;
/** No new batch after this; one batch takes well under the lease. */
const TIME_BUDGET_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;
const EMAIL_CONCURRENCY = 5;
/** Expo errors that a retry cannot fix. */
const FINAL_PUSH_ERRORS = new Set(['DeviceNotRegistered', 'MessageTooBig']);

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

/** Constant-time comparison of two secrets (through their SHA-256). */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const digest = async (value: string) =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** PostgREST headers for a key: new secret keys go only in `apikey`. */
function serviceHeaders(key: string): Record<string, string> {
  return key.startsWith('sb_')
    ? { apikey: key, 'Content-Type': 'application/json' }
    : { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'Error';
}

// ---------------------------------------------------------------------------
// Push (Expo)
// ---------------------------------------------------------------------------

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default';
  channelId: 'default';
}

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/** Ids for the deep link only (keys ending in `Id`), never free text. */
export function pushData(notification: ClaimedNotification): Record<string, unknown> {
  const ids = Object.fromEntries(
    Object.entries(notification.data ?? {}).filter(
      ([key, value]) => key.endsWith('Id') && typeof value === 'string',
    ),
  );
  return { ...ids, notificationId: notification.id, type: notification.type };
}

/** Tickets in the order of `messages`; a failed request yields RequestFailed tickets. */
async function sendExpo(messages: ExpoMessage[], deps: Dependencies): Promise<ExpoTicket[]> {
  const accessToken = deps.env('EXPO_ACCESS_TOKEN');
  const tickets: ExpoTicket[] = [];
  for (let start = 0; start < messages.length; start += EXPO_CHUNK) {
    const chunk = messages.slice(start, start + EXPO_CHUNK);
    let chunkTickets: ExpoTicket[] | null = null;
    try {
      const response = await deps.fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) {
        const body = (await response.json()) as { data?: unknown };
        if (Array.isArray(body.data) && body.data.length === chunk.length) {
          chunkTickets = body.data as ExpoTicket[];
        }
      } else {
        await response.body?.cancel();
        logOf(deps).error('expo push failed', { status: response.status });
      }
    } catch (error) {
      logOf(deps).error('expo push failed', { error });
    }
    tickets.push(
      ...(chunkTickets ??
        chunk.map((): ExpoTicket => ({ status: 'error', details: { error: 'RequestFailed' } }))),
    );
  }
  return tickets;
}

interface PushOutcome {
  outcome: ChannelOutcome;
  error?: string;
}

/** Sends the pending pushes; also returns the tokens Expo no longer knows. */
async function sendPushes(
  rows: ClaimedNotification[],
  contents: Map<string, NotificationContent>,
  deps: Dependencies,
): Promise<{ outcomes: Map<string, PushOutcome>; invalidTokens: string[] }> {
  const outcomes = new Map<string, PushOutcome>();
  const owners: string[] = [];
  const messages: ExpoMessage[] = [];
  for (const row of rows) {
    const tokens = row.push_pending ? [...new Set(row.push_tokens ?? [])] : [];
    if (tokens.length === 0) {
      outcomes.set(row.id, { outcome: 'skipped' });
      continue;
    }
    const { title, body } = contents.get(row.id)!;
    for (const token of tokens) {
      owners.push(row.id);
      messages.push({
        to: token,
        title,
        body,
        data: pushData(row),
        sound: 'default',
        channelId: 'default',
      });
    }
  }

  const tickets = messages.length > 0 ? await sendExpo(messages, deps) : [];
  const invalidTokens: string[] = [];
  const byRow = new Map<string, ExpoTicket[]>();
  tickets.forEach((ticket, i) => {
    const owner = owners[i]!;
    byRow.set(owner, [...(byRow.get(owner) ?? []), ticket]);
    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      invalidTokens.push(messages[i]!.to);
    }
  });

  for (const [id, rowTickets] of byRow) {
    const sent = rowTickets.some((t) => t.status === 'ok');
    const errors = rowTickets
      .filter((t) => t.status !== 'ok')
      .map((t) => t.details?.error ?? 'UnknownError');
    // Retry only when nothing arrived and some failure may be temporary: a
    // retry resends to every device of the user.
    const outcome: ChannelOutcome = sent
      ? 'sent'
      : errors.every((e) => FINAL_PUSH_ERRORS.has(e))
        ? 'failed'
        : 'retry';
    outcomes.set(id, {
      outcome,
      ...(errors.length > 0 ? { error: `push: ${[...new Set(errors)].join(', ')}` } : {}),
    });
  }
  return { outcomes, invalidTokens };
}

// ---------------------------------------------------------------------------
// Email (Resend; simulated without a key)
// ---------------------------------------------------------------------------

interface EmailOutcome {
  outcome: ChannelOutcome;
  simulated?: boolean;
  error?: string;
}

// Roles that use the web (D06-E1): the Gerente and the Coordinador since G10a.
// The operator only uses the app, so they get push, never email.
const EMAIL_ROLES: readonly (UserRole | null)[] = ['shipper', 'admin', 'manager', 'coordinator'];

async function sendEmail(row: ClaimedNotification, deps: Dependencies): Promise<EmailOutcome> {
  if (
    !row.email_pending ||
    !row.email ||
    !EMAIL_ROLES.includes(row.role) ||
    PUSH_ONLY_NOTIFICATION_TYPES.includes(row.type)
  ) {
    return { outcome: 'skipped' };
  }
  const message = notificationEmail(row.type, row.data, {
    role: row.role,
    siteUrl: deps.env('SITE_URL') || undefined,
  });
  const apiKey = deps.env('EMAIL_PROVIDER_API_KEY');
  const from = deps.env('EMAIL_FROM');
  if (!apiKey || !from) {
    logOf(deps).info('email simulated', { notificationId: row.id, type: row.type });
    return { outcome: 'skipped', simulated: true };
  }
  try {
    const response = await deps.fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `notification-${row.id}`,
      },
      body: JSON.stringify({
        from,
        to: [row.email],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    await response.body?.cancel();
    if (response.ok) return { outcome: 'sent' };
    // 409: the same idempotency key is still in flight. 429 and 5xx: later.
    const temporary = response.status === 409 || response.status === 429 || response.status >= 500;
    return { outcome: temporary ? 'retry' : 'failed', error: `email: HTTP ${response.status}` };
  } catch (error) {
    return { outcome: 'retry', error: `email: ${errorName(error)}` };
  }
}

/** Runs `task` over `items` with at most `limit` in flight. */
async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await task(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// One batch: send, then report.
// ---------------------------------------------------------------------------

export interface BatchSummary {
  claimed: number;
  pushed: number;
  emailed: number;
  simulatedEmails: number;
  retried: number;
  invalidTokens: number;
}

export async function dispatchBatch(
  rows: ClaimedNotification[],
  deps: Dependencies,
): Promise<{ results: DispatchResult[]; invalidTokens: string[]; summary: BatchSummary }> {
  const contents = new Map(rows.map((row) => [row.id, notificationContent(row.type, row.data)]));
  const [{ outcomes, invalidTokens }, emails] = await Promise.all([
    sendPushes(rows, contents, deps),
    mapLimit(rows, EMAIL_CONCURRENCY, (row) => sendEmail(row, deps)),
  ]);

  const results = rows.map((row, i): DispatchResult => {
    const push = outcomes.get(row.id)!;
    const email = emails[i]!;
    const error = [push.error, email.error].filter(Boolean).join('; ');
    return {
      id: row.id,
      attempt: row.attempt,
      push: push.outcome,
      email: email.outcome,
      ...(error ? { error } : {}),
    };
  });

  return {
    results,
    invalidTokens,
    summary: {
      claimed: rows.length,
      pushed: results.filter((r) => r.push === 'sent').length,
      emailed: results.filter((r) => r.email === 'sent').length,
      simulatedEmails: emails.filter((e) => e.simulated).length,
      retried: results.filter((r) => r.push === 'retry' || r.email === 'retry').length,
      invalidTokens: invalidTokens.length,
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP entry point
// ---------------------------------------------------------------------------

export async function handleDispatch(request: Request, deps: Dependencies): Promise<Response> {
  const log = logOf(deps);
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const secret = deps.env('NOTIFICATIONS_DISPATCH_SECRET');
  const supabaseUrl = deps.env('SUPABASE_URL');
  const serviceKey = deps.env('SUPABASE_SERVICE_ROLE_KEY');
  // Fail closed: without a secret nobody may trigger a dispatch.
  if (!secret || !supabaseUrl || !serviceKey) return json({ error: 'not_configured' }, 503);
  if (!(await sameSecret(request.headers.get('x-dispatch-secret') ?? '', secret))) {
    return json({ error: 'unauthorized' }, 401);
  }
  await request.body?.cancel();

  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const response = await deps.fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: serviceHeaders(serviceKey),
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`${fn} failed with ${response.status}`);
    }
    return response.json() as Promise<unknown>;
  };

  try {
    const retryAfter = await rpc('consume_service_rate_limit', {
      p_bucket: 'dispatch-notifications',
      p_subject: 'global',
    });
    if (!Number.isInteger(retryAfter) || (retryAfter as number) < 0) {
      throw new Error('consume_service_rate_limit returned a malformed answer');
    }
    if ((retryAfter as number) > 0) {
      return json({ error: 'rate_limited' }, 429, { 'Retry-After': String(retryAfter) });
    }
  } catch (error) {
    // Fail closed: without the counter nothing is sent.
    log.error('rate limit failed', { error });
    return json({ error: 'upstream_error' }, 502);
  }

  const now = deps.now ?? Date.now;
  const started = now();
  const total: BatchSummary = {
    claimed: 0,
    pushed: 0,
    emailed: 0,
    simulatedEmails: 0,
    retried: 0,
    invalidTokens: 0,
  };
  try {
    while (now() - started < TIME_BUDGET_MS) {
      const rows = (await rpc('claim_notifications', {
        p_limit: BATCH_SIZE,
        p_lease_seconds: LEASE_SECONDS,
      })) as ClaimedNotification[];
      if (rows.length === 0) break;

      const { results, invalidTokens, summary } = await dispatchBatch(rows, deps);
      if (invalidTokens.length > 0) {
        try {
          await rpc('delete_push_tokens', { p_tokens: [...new Set(invalidTokens)] });
        } catch (error) {
          // Not fatal: the next push to them fails the same way.
          log.error('delete_push_tokens failed', { error });
        }
      }
      await rpc('record_notification_dispatch', { p_results: results });
      for (const key of Object.keys(total) as (keyof BatchSummary)[]) total[key] += summary[key];
      if (rows.length < BATCH_SIZE) break;
    }
  } catch (error) {
    // The claimed rows are retried once their lease ends.
    log.error('dispatch failed', { error, ...total });
    return json({ error: 'upstream_error', ...total }, 502);
  }
  log.info('dispatch finished', { ...total });
  return json(total);
}
