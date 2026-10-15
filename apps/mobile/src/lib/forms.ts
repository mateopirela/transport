import type { z } from 'zod';

export type FieldErrors<K extends string = string> = Partial<Record<K, string>>;

/**
 * Validates form values with a shared zod schema and returns either the parsed
 * output or the first message of each invalid field (keyed by top-level field).
 */
export function validateForm<S extends z.ZodType>(
  schema: S,
  values: unknown,
): { ok: true; data: z.output<S> } | { ok: false; errors: FieldErrors } {
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, data: result.data };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    errors[field] ??= issue.message;
  }
  return { ok: false, errors };
}
