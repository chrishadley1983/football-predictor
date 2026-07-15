import { describe, it, expect } from 'vitest'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

/**
 * Regression tests for the pagination helper.
 *
 * The live knockout-scoring bug (leaderboard showed doubled KO totals) came
 * from `.range()` pagination without a stable ORDER BY: Postgres returned some
 * rows near the 1000-row page boundary in BOTH pages, and the scoring loop
 * accumulated each of those predictions twice. fetchAllRows now dedupes on `id`
 * as a safety net, so a caller that momentarily surfaces a duplicate row can
 * never inflate a per-row total.
 */
describe('fetchAllRows', () => {
  // Build a fake paged query that returns the given pages in order.
  const pagedFrom = (pages: unknown[][]) => {
    let call = 0
    return async () => {
      const data = pages[call] ?? []
      call++
      return { data, error: null }
    }
  }

  it('concatenates full pages until a short page ends the sweep', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `a${i}` }))
    const page2 = [{ id: 'b0' }, { id: 'b1' }]
    const rows = await fetchAllRows<{ id: string }>(pagedFrom([page1, page2]))
    expect(rows).toHaveLength(1002)
  })

  it('drops rows an unstable page order surfaces twice (dedupe by id)', async () => {
    // page 2 repeats the last two rows of page 1 — the exact shape that
    // doubled knockout scores in production.
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `p${i}` }))
    const overlap = [{ id: 'p998' }, { id: 'p999' }]
    const page2 = [...overlap, { id: 'p1000' }]
    const rows = await fetchAllRows<{ id: string }>(pagedFrom([page1, page2]))

    const ids = rows.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length) // no duplicates survive
    expect(rows).toHaveLength(1001) // 1000 + the one genuinely new row
    expect(ids.filter((id) => id === 'p999')).toHaveLength(1)
  })

  it('does not dedupe when rows carry no id (order is the only guard)', async () => {
    const page1 = Array.from({ length: 1000 }, () => ({ value: 'x' }))
    const page2 = [{ value: 'x' }, { value: 'x' }]
    const rows = await fetchAllRows<{ value: string }>(pagedFrom([page1, page2]))
    // Without an id we can't tell rows apart — every row is kept as-is.
    expect(rows).toHaveLength(1002)
  })

  it('throws when the query errors', async () => {
    const failing = async () => ({ data: null, error: { message: 'boom' } })
    await expect(fetchAllRows(failing)).rejects.toThrow('boom')
  })
})
