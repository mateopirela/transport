// Observability of the Edge Functions (B25): every request gets a request id
// and a structured log line (packages/shared/observability/logger.ts), and an
// unexpected exception is logged, reported to Sentry (when SENTRY_DSN is set)
// and answered with a JSON 500 instead of the runtime's bare error.
import {
  createLogger,
  parseLogLevel,
  type Logger,
} from '../../../packages/shared/src/observability/logger.ts';

/** Where unexpected exceptions go (Sentry in production, a fake in tests). */
export interface ErrorReporter {
  capture(error: unknown, tags: Record<string, string>): Promise<void>;
}

export interface ObserveOptions {
  env: (name: string) => string | undefined;
  reporter?: ErrorReporter | null | undefined;
  /** Extra headers of the 500 answer (e.g. CORS of a browser-facing function). */
  errorHeaders?: Record<string, string> | undefined;
  sink?: ((level: string, line: string) => void) | undefined;
  now?: (() => number) | undefined;
}

export type ObservedHandler = (request: Request, log: Logger) => Promise<Response>;

/** A caller's x-request-id is kept only if it is a short, plain token. */
const REQUEST_ID = /^[\w-]{8,64}$/u;

function requestIdOf(request: Request): string {
  const given = request.headers.get('x-request-id');
  return given && REQUEST_ID.test(given) ? given : crypto.randomUUID();
}

export function observe(
  service: string,
  handler: ObservedHandler,
  options: ObserveOptions,
): (request: Request) => Promise<Response> {
  const base = createLogger({
    service,
    level: parseLogLevel(options.env('LOG_LEVEL')),
    sink: options.sink,
  });
  const now = options.now ?? Date.now;

  return async (request) => {
    const requestId = requestIdOf(request);
    const log = base.child({ requestId });
    const started = now();
    let response: Response;
    try {
      response = await handler(request, log);
    } catch (error) {
      log.error('unhandled error', { error, method: request.method, durationMs: now() - started });
      try {
        await options.reporter?.capture(error, { service, requestId });
      } catch (reportError) {
        log.warn('error report failed', { error: reportError });
      }
      response = new Response(JSON.stringify({ error: 'internal_error', requestId }), {
        status: 500,
        headers: { ...options.errorHeaders, 'Content-Type': 'application/json' },
      });
    }
    log.info('request finished', {
      method: request.method,
      status: response.status,
      durationMs: now() - started,
    });
    try {
      response.headers.set('x-request-id', requestId);
    } catch {
      // Immutable headers (e.g. a proxied response): the log still has the id.
    }
    return response;
  };
}
