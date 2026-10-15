/** Upper bound for page numbers taken from the URL. */
export const MAX_PAGE = 1000;

/** 1-based page number from an untrusted query parameter. */
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(page) ? Math.min(Math.max(page, 1), MAX_PAGE) : 1;
}

/** URL of `pathname` with `params` replaced (empty values dropped). */
export function withParams(
  pathname: string,
  current: Record<string, string | undefined>,
  changes: Record<string, string | number | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...changes })) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const search = query.toString();
  return search ? `${pathname}?${search}` : pathname;
}
