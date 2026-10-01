import type { PostgrestFilterBuilder } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase/client'
import { ApiError, toApiError } from '@/lib/supabase/errors'

/**
 * Thin typed wrappers over PostgREST and RPC.
 *
 * Every call unwraps `{ data, error }` into a thrown {@link ApiError}, so the
 * React layer only ever deals with values and exceptions.
 */

export type Query = Record<string, unknown>

/** Build `?a=b&c=d`, skipping undefined/null and expanding arrays. */
export function toSearchParams(query: Query = {}): string {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue

    if (Array.isArray(value)) {
      if (value.length === 0) continue
      params.set(key, `{${value.join(',')}}`)
    } else if (typeof value === 'object') {
      params.set(key, JSON.stringify(value))
    } else {
      params.set(key, String(value))
    }
  }

  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

// ---------------------------------------------------------------------------
// Select / mutate
// ---------------------------------------------------------------------------

export interface SelectOptions {
  select?: string
  /** Column filters: `{ status: 'eq.active' }` */
  filters?: Record<string, unknown>
  order?: { column: string; ascending?: boolean; nullsFirst?: boolean }
  range?: { from: number; to: number }
  /** Row count for the *filtered* set, not the page. */
  count?: 'exact' | 'estimated' | 'planned'
  /** Skip PostgREST when the caller handles missing rows itself. */
  maybeSingle?: boolean
}

export async function select<T>(table: string, options: SelectOptions = {}): Promise<T[]> {
  let query = getSupabase().from(table).select(options.select ?? '*', {
    count: options.count,
  })

  for (const [column, spec] of Object.entries(options.filters ?? {})) {
    query = applyFilter(query, column, spec as FilterValue)
  }

  if (options.order) {
    query = query.order(options.order.column, {
      ascending: options.order.ascending ?? false,
      nullsFirst: options.order.nullsFirst,
    })
  }
  if (options.range) {
    query = query.range(options.range.from, options.range.to)
  }

  const { data, error } = await query
  if (error) throw ApiError.fromPostgrest(error)
  return (data ?? []) as T[]
}

export async function selectOne<T>(
  table: string,
  options: SelectOptions = {},
): Promise<T | null> {
  const rows = await select<T>(table, { ...options, maybeSingle: true, range: undefined })
  return rows[0] ?? null
}

/** Select plus the total filtered row count, for paginated lists. */
export async function selectPaginated<T>(
  table: string,
  options: SelectOptions & { page: number; pageSize: number },
): Promise<{ data: T[]; count: number }> {
  let query = getSupabase().from(table).select(options.select ?? '*', { count: 'exact' })

  for (const [column, spec] of Object.entries(options.filters ?? {})) {
    query = applyFilter(query, column, spec as FilterValue)
  }
  if (options.order) {
    query = query.order(options.order.column, { ascending: options.order.ascending ?? false })
  }
  const from = (options.page - 1) * options.pageSize
  query = query.range(from, from + options.pageSize - 1)

  const { data, error, count } = await query
  if (error) throw ApiError.fromPostgrest(error)
  return { data: (data ?? []) as T[], count: count ?? 0 }
}

export async function insert<T>(
  table: string,
  values: Partial<T> | Partial<T>[],
): Promise<T> {
  // PostgREST types each table's insert shape exactly; Partial<T> is the
  // looser contract every call site here actually works to.
  const payload = values as never
  const { data, error } = await getSupabase().from(table).insert(payload).select().single()
  if (error) throw ApiError.fromPostgrest(error)
  return data as T
}

export async function update<T>(
  table: string,
  id: string | string[],
  patch: Partial<T>,
): Promise<T> {
  const { data, error } = await getSupabase().from(table).update(patch as never).eq('id', id).select().single()
  if (error) throw ApiError.fromPostgrest(error)
  return data as T
}

export async function upsert<T>(table: string, values: Partial<T>): Promise<T> {
  const { data, error } = await getSupabase().from(table).upsert(values as never).select().single()
  if (error) throw ApiError.fromPostgrest(error)
  return data as T
}

export async function remove(table: string, id: string | string[]): Promise<void> {
  const { error } = await getSupabase().from(table).delete().eq('id', id)
  if (error) throw ApiError.fromPostgrest(error)
}

// ---------------------------------------------------------------------------
// RPC
// ---------------------------------------------------------------------------

export async function rpc<T>(fn: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, params)
  if (error) throw ApiError.fromPostgrest(error)
  return data as T
}

/** Single-row RPC result (set-returning functions that yield exactly one row). */
export async function rpcOne<T>(fn: string, params: Record<string, unknown> = {}): Promise<T | null> {
  const rows = await rpc<T[]>(fn, params)
  if (Array.isArray(rows)) return (rows[0] ?? null) as T | null
  return (rows ?? null) as T | null
}

// ---------------------------------------------------------------------------
// Filter DSL
// ---------------------------------------------------------------------------

type FilterValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | string[]
  | { in: (string | number)[] }
  | { gte: string | number }
  | { lte: string | number }
  | { gt: string | number }
  | { lt: string | number }
  | { like: string }
  | { ilike: string }
  | { not: string | number | boolean }
  | { contains: string[] }
  | { overlaps: string[] }
  | { fts: string }
  | { is: null }

/**
 * PostgREST builder. The generic parameters are unused because every filter
 * narrows to the same builder shape.
 */
type PostgrestQuery = PostgrestFilterBuilder<any, any, any, any>

function applyFilter(
  query: PostgrestQuery,
  column: string,
  spec: FilterValue,
): PostgrestQuery {
  if (spec === undefined) return query

  if (spec === null) return query.is(column, null)
  if (spec === true) return query.eq(column, true)
  if (typeof spec === 'boolean') return query.eq(column, spec)

  if (Array.isArray(spec)) return query.in(column, spec)

  if (typeof spec === 'object' && spec !== null) {
    const [op, value] = Object.entries(spec)[0] as [string, unknown]
    switch (op) {
      case 'in':       return query.in(column, value as string[])
      case 'gte':      return query.gte(column, value as string | number)
      case 'lte':      return query.lte(column, value as string | number)
      case 'gt':       return query.gt(column, value as string | number)
      case 'lt':       return query.lt(column, value as string | number)
      case 'like':     return query.like(column, value as string)
      case 'ilike':    return query.ilike(column, value as string)
      case 'not':      return query.neq(column, value as string | number | boolean)
      case 'contains': return query.contains(column, value as string[])
      case 'overlaps': return query.overlaps(column, value as string[])
      case 'fts':      return query.textSearch(column, value as string)
      case 'is':       return query.is(column, value as null)
      default:         return query.eq(column, value as string)
    }
  }

  return query.eq(column, spec)
}

/** Wrap an async operation so any thrown value becomes an ApiError. */
export async function guard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw toApiError(error)
  }
}
