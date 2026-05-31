/**
 * In-memory fake of the Supabase JS client, scoped to exactly the query
 * surface used by the football-predictor server libraries
 * (scoring.ts, achievements.ts, golden-ticket.ts, seed-helpers.ts).
 *
 * Design choices that keep it small but faithful:
 *  - `.select(<projection>)` IGNORES its projection string and returns the
 *    WHOLE stored row objects. To test code that relies on embedded joins
 *    (e.g. `home_team:teams!fk(*)`), simply store rows that already contain
 *    the nested objects under the alias the code reads (`home_team`, etc.).
 *  - Filters chain as logical AND: `.eq()`, `.in()`, `.not(col,'is',null)`,
 *    and `.or('a.eq.x,b.eq.y')` (eq-only, the only operator the code uses).
 *  - The builder is thenable, so `await builder` and `Promise.all([builders])`
 *    both work. The underlying read/write executes once, lazily, on await.
 *  - `.single()` mirrors PostgREST: 0 rows -> { data: null, error: PGRST116 }.
 *  - `update` / `insert` / `delete` mutate the in-memory tables and resolve
 *    to `{ data, error: null }`.
 *
 * This lets the suite exercise the production functions unchanged.
 */

export type Row = Record<string, any>
export type Tables = Record<string, Row[]>

interface Filter {
  kind: 'eq' | 'in' | 'notNull' | 'or'
  col?: string
  value?: any
  values?: any[]
  orConds?: { col: string; value: string }[]
}

let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `gen-${idCounter}`
}

function matches(row: Row, filters: Filter[]): boolean {
  for (const f of filters) {
    if (f.kind === 'eq') {
      if (row[f.col!] !== f.value) return false
    } else if (f.kind === 'in') {
      if (!f.values!.includes(row[f.col!])) return false
    } else if (f.kind === 'notNull') {
      if (row[f.col!] === null || row[f.col!] === undefined) return false
    } else if (f.kind === 'or') {
      const ok = f.orConds!.some((c) => String(row[c.col]) === c.value)
      if (!ok) return false
    }
  }
  return true
}

class QueryBuilder<T = any> implements PromiseLike<{ data: T; error: any }> {
  private filters: Filter[] = []
  private op: 'select' | 'update' | 'insert' | 'delete' = 'select'
  private payload: any = null
  private isSingle = false
  private orderCol: string | null = null
  private orderAsc = true
  private limitN: number | null = null
  private rangeFrom: number | null = null
  private rangeTo: number | null = null

  constructor(private tables: Tables, private table: string) {}

  // ---- operations ----
  select(_projection?: string) {
    this.op = 'select'
    return this
  }
  update(patch: Row) {
    this.op = 'update'
    this.payload = patch
    return this
  }
  insert(rows: Row | Row[]) {
    this.op = 'insert'
    this.payload = rows
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }

  // ---- filters ----
  eq(col: string, value: any) {
    this.filters.push({ kind: 'eq', col, value })
    return this
  }
  in(col: string, values: any[]) {
    this.filters.push({ kind: 'in', col, values })
    return this
  }
  not(col: string, operator: string, value: any) {
    // Only `.not(col, 'is', null)` is used by the code under test.
    if (operator === 'is' && value === null) {
      this.filters.push({ kind: 'notNull', col })
    } else {
      throw new Error(`fake-supabase: unsupported .not(${col}, ${operator}, ${value})`)
    }
    return this
  }
  or(expr: string) {
    // e.g. "home_source.eq.W57,away_source.eq.W57"
    const orConds = expr.split(',').map((part) => {
      const [col, operator, value] = part.split('.')
      if (operator !== 'eq') {
        throw new Error(`fake-supabase: unsupported .or operator "${operator}"`)
      }
      return { col, value }
    })
    this.filters.push({ kind: 'or', orConds })
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col
    this.orderAsc = opts?.ascending !== false
    return this
  }
  limit(n: number) {
    this.limitN = n
    return this
  }
  range(from: number, to: number) {
    // PostgREST .range() is inclusive on both ends.
    this.rangeFrom = from
    this.rangeTo = to
    return this
  }
  single() {
    this.isSingle = true
    return this
  }
  maybeSingle() {
    this.isSingle = true
    return this
  }

  private rows(): Row[] {
    return (this.tables[this.table] ??= [])
  }

  private run(): { data: any; error: any } {
    const store = this.rows()

    if (this.op === 'select') {
      let result = store.filter((r) => matches(r, this.filters))
      if (this.orderCol) {
        const col = this.orderCol
        result = [...result].sort((a, b) => {
          const av = a[col]
          const bv = b[col]
          if (av === bv) return 0
          const cmp = av < bv ? -1 : 1
          return this.orderAsc ? cmp : -cmp
        })
      }
      if (this.limitN !== null) result = result.slice(0, this.limitN)
      if (this.rangeFrom !== null) {
        const to = this.rangeTo ?? result.length
        result = result.slice(this.rangeFrom, to + 1) // inclusive upper bound
      }

      if (this.isSingle) {
        if (result.length === 0) {
          return { data: null, error: { code: 'PGRST116', message: 'No rows found' } }
        }
        return { data: { ...result[0] }, error: null }
      }
      return { data: result.map((r) => ({ ...r })), error: null }
    }

    if (this.op === 'update') {
      const updated: Row[] = []
      for (const r of store) {
        if (matches(r, this.filters)) {
          Object.assign(r, this.payload)
          updated.push(r)
        }
      }
      return { data: updated.map((r) => ({ ...r })), error: null }
    }

    if (this.op === 'insert') {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload]
      const inserted: Row[] = []
      for (const r of incoming) {
        const withId = { id: r.id ?? nextId(), ...r }
        if (withId.id === undefined || withId.id === null) withId.id = nextId()
        store.push(withId)
        inserted.push(withId)
      }
      return { data: inserted.map((r) => ({ ...r })), error: null }
    }

    if (this.op === 'delete') {
      const remaining: Row[] = []
      for (const r of store) {
        if (!matches(r, this.filters)) remaining.push(r)
      }
      this.tables[this.table] = remaining
      return { data: null, error: null }
    }

    return { data: null, error: null }
  }

  then<TResult1 = { data: T; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: T; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    let value: { data: T; error: any }
    try {
      value = this.run() as { data: T; error: any }
    } catch (err) {
      return Promise.reject(err).then(onfulfilled as any, onrejected)
    }
    return Promise.resolve(value).then(onfulfilled, onrejected)
  }
}

export class FakeAdminClient {
  constructor(public tables: Tables) {}
  from(table: string) {
    return new QueryBuilder(this.tables, table)
  }
}

/** Build a fake admin client seeded with the given tables (deep-ish copied). */
export function makeFakeAdmin(seed: Tables = {}): FakeAdminClient {
  const tables: Tables = {}
  for (const [k, v] of Object.entries(seed)) {
    tables[k] = v.map((r) => ({ ...r }))
  }
  return new FakeAdminClient(tables)
}
