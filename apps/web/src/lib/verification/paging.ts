/** PostgREST caps each response (1,000 rows by default); reads are paged. */
export const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Reads every row of a query, page by page, until a short page. The query
 * must order by a unique key so pages neither overlap nor skip rows.
 */
export async function selectAll<T>(
  page: (from: number, to: number) => Page<T>,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(`Query failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}
