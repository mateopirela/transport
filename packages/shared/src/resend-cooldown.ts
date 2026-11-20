// "Reenviar correo" (D15-E3): the wait between two emails to the same
// address. Pure, so the web (S2) and the app (S3) count the same.
//
// Supabase Auth refuses a second confirmation or recovery email to the same
// user before `max_frequency` ([auth.email] in supabase/config.toml: 1 s in
// the local stack, 60 s by default in a hosted project), and caps the emails
// per hour ([auth.rate_limit] email_sent, or the SMTP's own limit). The wait
// shown here is never shorter than the hosted `max_frequency`, so the button
// is not offered while Auth would still refuse it.

/** Seconds between two emails to the same address. */
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Seconds left before another email can be asked for; 0 when it can be sent
 * now. `lastSentAt` and `now` are epoch milliseconds; without a previous
 * send (null) there is no wait. A clock that went backwards waits at most
 * the whole cooldown.
 */
export function resendWaitSeconds(
  lastSentAt: number | null | undefined,
  now: number,
  cooldownSeconds: number = RESEND_COOLDOWN_SECONDS,
): number {
  if (lastSentAt === null || lastSentAt === undefined || !Number.isFinite(lastSentAt)) return 0;
  if (!Number.isFinite(now) || cooldownSeconds <= 0) return 0;
  const elapsedMs = Math.max(0, now - lastSentAt);
  const leftMs = cooldownSeconds * 1000 - elapsedMs;
  return leftMs <= 0 ? 0 : Math.min(cooldownSeconds, Math.ceil(leftMs / 1000));
}

/** Whether "Reenviar correo" is available now. */
export function canResend(
  lastSentAt: number | null | undefined,
  now: number,
  cooldownSeconds: number = RESEND_COOLDOWN_SECONDS,
): boolean {
  return resendWaitSeconds(lastSentAt, now, cooldownSeconds) === 0;
}

/**
 * Whether an Auth error is one of its email limits: the per-user
 * `max_frequency` or the hourly cap (`over_email_send_rate_limit`, HTTP 429).
 * The screen then says to wait instead of offering the button again at once.
 */
export function isEmailRateLimitError(
  error: { code?: string | null; status?: number | null } | null | undefined,
): boolean {
  if (!error) return false;
  return (
    error.code === 'over_email_send_rate_limit' ||
    error.code === 'over_request_rate_limit' ||
    error.status === 429
  );
}
