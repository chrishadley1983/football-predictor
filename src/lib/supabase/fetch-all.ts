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
 *     admin.from('knockout_predictions').select('*').order('id').in('entry_id', ids).range(from, to)
 *   )
 *
 * IMPORTANT: the query MUST include a stable `.order()` on a unique column
 * (e.g. the `id` primary key). `.range()` is OFFSET/LIMIT under the hood, and
 * Postgres does not guarantee a stable row order across separate OFFSET queries
 * unless an ORDER BY pins it. Without one, rows near a page boundary can be
 * returned in BOTH pages (duplicated) or NEITHER (skipped) — the former silently
 * double-counts in any per-row accumulation (this caused knockout scores to
 * render doubled), the latter silently truncates. As a safety net we also dedupe
 * on `id` when rows carry one, but that only guards against duplicates, not
 * skips — a stable order is still required for correctness.
 */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = []
  const seenIds = new Set<unknown>()
  let usingIdDedupe = true
  let from = 0
  for (;;) {
    const { data, error } = await buildQuery(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    for (const row of data as T[]) {
      // Safety net: if rows carry a unique `id`, drop any duplicate that an
      // unstable page order may have surfaced twice. If the first row has no
      // `id`, disable dedupe entirely (the query didn't select one).
      const id = (row as { id?: unknown } | null)?.id
      if (usingIdDedupe && id === undefined) {
        usingIdDedupe = false
      }
      if (usingIdDedupe) {
        if (seenIds.has(id)) continue
        seenIds.add(id)
      }
      all.push(row)
    }
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}
