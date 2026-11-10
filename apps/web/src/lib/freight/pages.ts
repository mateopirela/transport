// Paging of the freight ledger RPCs (I3), apart from the queries so it is
// tested without a server.

/** Rows per request; PostgREST caps a response (1,000 by default). */
export const FREIGHT_PAGE_SIZE = 1000;

/**
 * Every row of a ledger RPC, in pages: the totals of Cartera, Cobranza and
 * the admin's filters need all the trips, never the first 1,000. Each RPC
 * orders its rows with a unique tiebreaker (the ledger id), so the pages do
 * not overlap.
 */
export async function fetchAllPages<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += FREIGHT_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + FREIGHT_PAGE_SIZE - 1);
    if (error) throw new Error(`${label} failed: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < FREIGHT_PAGE_SIZE) return rows;
  }
}
