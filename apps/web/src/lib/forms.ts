import type { z } from 'zod';

/** State returned by the server actions of the auth forms. */
export interface FormState {
  /** Error for the whole form (Spanish copy). */
  error?: string;
  /** Success notice for the whole form (Spanish copy). */
  message?: string;
  /** First error per field, keyed by field name. */
  fieldErrors?: Record<string, string>;
  /** Submitted values to refill the form (never passwords). */
  values?: Record<string, string>;
}

const SECRET_FIELDS = new Set(['password', 'passwordConfirmation']);

/**
 * Text entries of a form. Empty strings are dropped so optional fields parse
 * as missing and required ones report "obligatorio".
 */
export function formEntries(formData: FormData): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const [key, value] of formData) {
    if (typeof value === 'string' && value !== '' && !key.startsWith('$')) entries[key] = value;
  }
  return entries;
}

/** The entries that are safe to send back to the browser to refill the form. */
export function refillValues(entries: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(entries).filter(([key]) => !SECRET_FIELDS.has(key)));
}

/** Turns a zod error into the form state: one message per field. */
export function invalidForm(error: z.ZodError, entries: Record<string, string>): FormState {
  const fieldErrors: Record<string, string> = {};
  let formError: string | undefined;
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    if (key === '') formError ??= issue.message;
    else fieldErrors[key] ??= issue.message;
  }
  return { error: formError, fieldErrors, values: refillValues(entries) };
}
