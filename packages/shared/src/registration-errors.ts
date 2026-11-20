// Errors of `register_company` (G2) the forms put on a field (D42: the error
// goes where it failed). Shared by the web and the app.

/** What register_company puts in the detail of a repeated RFC (S1, D50-5). */
export const RFC_TAKEN_DETAIL = 'rfc_taken';

/** The form field a repeated RFC belongs to. */
export const RFC_TAKEN_FIELD = 'rfc';

/**
 * Whether an error of `register_company` is a repeated RFC. Since S1 the RPC
 * raises 23505 with the detail `rfc_taken`; before, the bare unique
 * violation of `companies_rfc_key` (still recognized: a database from before
 * the migration answers like that).
 */
export function isRfcTakenError(
  error:
    { code?: string | null; message?: string | null; details?: string | null } | null | undefined,
): boolean {
  if (!error || error.code !== '23505') return false;
  return error.details === RFC_TAKEN_DETAIL || (error.message ?? '').includes('companies_rfc_key');
}
