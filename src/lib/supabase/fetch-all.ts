/**
 * Supabase returns at most 1,000 rows per request by default. For tables that
 * can exceed that (notably group_predictions and knockout_predictions, which
 * grow as entries × groups/matches), reading without pagination silently
 * truncates results — producing wrong scores or an incomplete leaderboard.
 *
 * `fetchAllRows` pages through a query in 1,000-row windows using `.range()`
 * and concatenates the results. Pass a factory that applies `.range(from, to)`
 * to your query so each page can be requested:
 *
 *   const preds = await fetchAllRows((from, to) =>
 *     admin.from('knockout_predictions').select('*').in('entry_id', ids).range(from, to)
 *   )
 */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await buildQuery(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    all.push(...(data as T[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}
