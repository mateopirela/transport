// Structured logs (B25): one JSON object per line, so the Supabase and Vercel
// log explorers can filter by level, service, request id or event. Context is
// redacted (redact.ts) before it is written.
import { redact, redactText, serializeError } from './redact';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(msg: string, context?: LogContext): void;
  info(msg: string, context?: LogContext): void;
  warn(msg: string, context?: LogContext): void;
  /** `error` is serialized as { name, code, message } (redacted). */
  error(msg: string, context?: LogContext & { error?: unknown }): void;
  /** Same logger with extra fields on every line (e.g. the request id). */
  child(context: LogContext): Logger;
}

export interface LoggerOptions {
  service: string;
  /** Lines below this level are dropped. Default: info. */
  level?: LogLevel | undefined;
  /** Where each line goes. Default: console (error/warn/log by level). */
  sink?: ((level: LogLevel, line: string) => void) | undefined;
  now?: (() => Date) | undefined;
}

/** LOG_LEVEL from the environment; anything else falls back to `info`. */
export function parseLogLevel(value: string | undefined | null): LogLevel {
  const v = value?.trim().toLowerCase();
  return v === 'debug' || v === 'info' || v === 'warn' || v === 'error' ? v : 'info';
}

function consoleSink(level: LogLevel, line: string): void {
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  // Info and debug lines are regular output for the log collectors.
  // eslint-disable-next-line no-console
  else console.log(line);
}

export function createLogger(options: LoggerOptions, base: LogContext = {}): Logger {
  const min = LEVELS[options.level ?? 'info'];
  const sink = options.sink ?? consoleSink;
  const now = options.now ?? (() => new Date());

  function write(level: LogLevel, msg: string, context: LogContext = {}) {
    if (LEVELS[level] < min) return;
    const { error, ...rest } = context;
    const fields = redact({ ...base, ...rest }) as LogContext;
    const line: LogContext = {
      ...fields,
      level,
      ts: now().toISOString(),
      service: options.service,
      msg: redactText(msg),
    };
    if (error !== undefined) line.error = serializeError(error);
    sink(level, JSON.stringify(line));
  }

  return {
    debug: (msg, context) => write('debug', msg, context),
    info: (msg, context) => write('info', msg, context),
    warn: (msg, context) => write('warn', msg, context),
    error: (msg, context) => write('error', msg, context),
    child: (context) => createLogger(options, { ...base, ...context }),
  };
}
