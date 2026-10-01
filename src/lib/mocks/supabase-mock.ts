import { buildDatabase, DEMO_ADMIN, DEMO_ACCOUNT, DEMO_STAFF } from './fixtures'

/**
 * An in-memory Supabase stand-in for local development and design review.
 *
 * It implements the slice of the surface this app actually uses — the
 * PostgREST builder chain, `rpc()`, `auth`, `storage` and `functions.invoke` —
 * over the fixtures. Anything unimplemented throws loudly rather than silently
 * returning an empty array, so a gap shows up as a bug instead of a blank page.
 *
 * Returned builders are thenable, which is how `await supabase.from(t).select()`
 * resolves in the real client too.
 */

type Row = Record<string, unknown>

interface QueryState {
  table: string
  select?: string
  mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  filters: { column: string; op: string; value: unknown }[]
  order: { column: string; ascending: boolean; nullsFirst?: boolean }[]
  range?: { from: number; to: number }
  payload?: Row | Row[]
  countMode?: 'exact' | 'estimated' | 'planned'
  maybeSingle?: boolean
  single: boolean
}

export interface MockResult<T> {
  data: T | null
  error: { message: string; code: string; details?: string } | null
  count: number | null
}

const LATENCY_MS = 140
const STORAGE_KEY = 'uhs:mock-session'

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
interface MockUser {
  id: string
  email: string | null
  phone: string | null
  created_at: string
  email_confirmed_at: string
  user_metadata: Record<string, unknown>
}

function demoUser(
  email: string,
  id: string | undefined,
  fullName: string,
  phone: string,
): [string, MockUser] {
  return [
    email,
    {
      id: id ?? `mock-${email.split('@')[0]}`,
      email,
      phone,
      created_at: '2025-01-05T09:00:00Z',
      email_confirmed_at: '2025-01-05T09:05:00Z',
      user_metadata: { full_name: fullName },
    },
  ]
}

const DEMO_USERS: Record<string, MockUser> = Object.fromEntries([
  demoUser(DEMO_ACCOUNT.email, DEMO_ACCOUNT.id, DEMO_ACCOUNT.full_name, '+2348000000099'),
  demoUser(DEMO_ADMIN.email, DEMO_ADMIN.id, DEMO_ADMIN.full_name, '+2348000000002'),
  demoUser(DEMO_STAFF.email, DEMO_STAFF.id, DEMO_STAFF.full_name, '+2348000000001'),
])

function readSession(): { user: MockUser | null } | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as { user: MockUser | null }
  } catch {
    return null
  }
}

function writeSession(user: MockUser | null): void {
  if (typeof localStorage === 'undefined') return
  if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify({ user }))
  else localStorage.removeItem(STORAGE_KEY)
}

// ---------------------------------------------------------------------------
// PostgREST filter semantics
// ---------------------------------------------------------------------------
/**
 * Orderable comparison between two cell values.
 *
 * Postgres will happily compare numbers and strings, but mixing types throws.
 * Mirroring that here keeps the mock's behaviour close enough that a filter
 * that works in preview also works in production.
 */
function comparable(
  a: unknown,
  b: unknown,
  compare: (x: string | number, y: string | number) => boolean,
): boolean {
  if (a == null || b == null) return false
  if (typeof a === 'number' && typeof b === 'number') return compare(a, b)
  if (typeof a === 'string' && typeof b === 'string') return compare(a, b)
  if (typeof a === 'boolean' && typeof b === 'boolean') return compare(Number(a), Number(b))
  return false
}

function matchFilter(row: Row, filter: { column: string; op: string; value: unknown }): boolean {
  const actual = row[filter.column]

  switch (filter.op) {
    case 'eq':
      // `filters: { id: true }` is how the API layer expresses `eq.true`.
      if (filter.value === true) return actual === true
      if (filter.value === false) return actual === false
      return actual === filter.value
    case 'neq':
      return actual !== filter.value
    // Only primitives are orderable. JSON values and null are excluded so the
    // comparison cannot silently produce a false "no match".
    case 'gt':  return comparable(actual, filter.value, (a, b) => a > b)
    case 'gte': return comparable(actual, filter.value, (a, b) => a >= b)
    case 'lt':  return comparable(actual, filter.value, (a, b) => a < b)
    case 'lte': return comparable(actual, filter.value, (a, b) => a <= b)
    case 'is':
      return filter.value === null ? actual === null || actual === undefined : actual !== null
    case 'in': {
      const list = filter.value as unknown[]
      return list.includes(actual)
    }
    case 'like': {
      const pattern = String(filter.value).replace(/%/g, '')
      return String(actual ?? '').toLowerCase().includes(pattern.toLowerCase())
    }
    case 'ilike': {
      const pattern = String(filter.value).replace(/%/g, '')
      return String(actual ?? '').toLowerCase().includes(pattern.toLowerCase())
    }
    case 'contains': {
      const list = Array.isArray(actual) ? actual : []
      return (filter.value as unknown[]).every((item) => list.includes(item))
    }
    case 'overlaps': {
      const list = Array.isArray(actual) ? actual : []
      return (filter.value as unknown[]).some((item) => list.includes(item))
    }
    case 'textSearch': {
      const needle = String(filter.value).toLowerCase()
      return Object.values(row).some(
        (value) => typeof value === 'string' && value.toLowerCase().includes(needle),
      )
    }
    default:
      return true
  }
}

/**
 * Apply an embedded-relation select such as
 * `*, service:service_id ( id, name ), location:location_id ( id, city )`.
 *
 * Supports the `alias:fk ( cols )` and `relation!fk ( cols )` forms this app
 * uses. Relations are resolved by matching the foreign key name to
 * `<table>.id`.
 */
function applyEmbedded(row: Row, spec: string, db: Record<string, Row[]>): Row {
  const commaDepth = splitTopLevel(spec)
  const base: Row = { ...row }

  for (const part of commaDepth) {
    const embedMatch = part.trim().match(/^([\w]+)(?:!([\w]+))?\s*\((.*)\)$/s)
    if (!embedMatch) continue

    const [, alias, fkOverride, columnSpec] = embedMatch
    const target = alias as string
    const fk = (fkOverride ?? target) as string
    const columns = splitTopLevel(columnSpec as string).map((c) => c.trim())

    // Find the local column holding the foreign key, then the related table.
    const fkValue = row[fk]
    if (fkValue == null) {
      base[target] = null
      continue
    }

    const relatedTable = inferRelatedTable(db, fk, fkValue)
    if (!relatedTable) {
      base[target] = null
      continue
    }

    const related = db[relatedTable]?.find((candidate) => candidate.id === fkValue) ?? null
    if (!related) {
      base[target] = null
      continue
    }

    // Nested embeds are resolved by recursing on the projected row.
    let projected: Row = { ...related }
    for (const column of columns) {
      if (column.includes('(')) {
        projected = applyEmbedded(projected, column, db)
      } else {
        projected[column] = related[column]
      }
    }
    base[target] = projected
  }

  return base
}

function splitTopLevel(spec: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''

  for (const char of spec) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) parts.push(current)
  return parts
}

/** Map `service_id` → `services`, `staff_id` → `staff_profiles`, etc. */
function inferRelatedTable(db: Record<string, Row[]>, fk: string, fkValue: unknown): string | null {
  const guesses = [
    fk.replace(/_id$/, ''),
    `${fk.replace(/_id$/, '')}_profiles`,
    `public.${fk.replace(/_id$/, '')}`,
  ]

  for (const guess of guesses) {
    const rows = db[guess]
    if (Array.isArray(rows) && rows.some((row) => row.id === fkValue)) return guess
  }
  return null
}

function projectColumns(row: Row, select: string | undefined): Row {
  if (!select) return row
  const columns = splitTopLevel(select)
    .map((c) => c.trim())
    .filter((c) => c && !c.includes('('))

  if (columns.includes('*')) {
    const embedded = splitTopLevel(select).filter((c) => c.includes('('))
    const copy: Row = { ...row }
    for (const spec of embedded) {
      const alias = spec.trim().split(':')[0]!.trim()
      if (row[alias] != null) copy[alias] = row[alias]
    }
    return copy
  }

  const out: Row = {}
  for (const column of columns) out[column] = row[column]
  return out
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------
class MockQueryBuilder implements PromiseLike<MockResult<unknown>> {
  private state: QueryState
  private db: Record<string, Row[]>

  constructor(db: Record<string, Row[]>, table: string) {
    this.db = db
    this.state = { table, mode: 'select', filters: [], order: [], single: false }
  }

  private clone(): MockQueryBuilder {
    const next = new MockQueryBuilder(this.db, this.state.table)
    next.state = { ...this.state, filters: [...this.state.filters], order: [...this.state.order] }
    return next
  }

  select(columns = '*', options?: { count?: string; head?: boolean }): MockQueryBuilder {
    const next = this.clone()
    next.state.mode = 'select'
    next.state.select = columns
    next.state.countMode = (options?.count as QueryState['countMode']) ?? undefined
    return next
  }

  insert(values: Row | Row[]): MockQueryBuilder {
    const next = this.clone()
    next.state.mode = 'insert'
    next.state.payload = values
    next.state.single = true
    return next
  }

  upsert(values: Row | Row[], options?: { onConflict?: string }): MockQueryBuilder {
    const next = this.clone()
    next.state.mode = 'upsert'
    next.state.payload = values
    void options
    next.state.single = true
    return next
  }

  update(values: Row): MockQueryBuilder {
    const next = this.clone()
    next.state.mode = 'update'
    next.state.payload = values
    next.state.single = true
    return next
  }

  delete(): MockQueryBuilder {
    const next = this.clone()
    next.state.mode = 'delete'
    next.state.single = false
    return next
  }

  eq(column: string, value: unknown) { return this.push('eq', column, value) }
  neq(column: string, value: unknown) { return this.push('neq', column, value) }
  gt(column: string, value: unknown) { return this.push('gt', column, value) }
  gte(column: string, value: unknown) { return this.push('gte', column, value) }
  lt(column: string, value: unknown) { return this.push('lt', column, value) }
  lte(column: string, value: unknown) { return this.push('lte', column, value) }
  is(column: string, value: unknown) { return this.push('is', column, value) }
  like(column: string, value: unknown) { return this.push('like', column, value) }
  ilike(column: string, value: unknown) { return this.push('ilike', column, value) }
  contains(column: string, value: unknown) { return this.push('contains', column, value) }
  overlaps(column: string, value: unknown) { return this.push('overlaps', column, value) }
  textSearch(column: string, value: unknown) { return this.push('textSearch', column, value) }

  in(column: string, values: unknown[]) { return this.push('in', column, values) }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): MockQueryBuilder {
    const next = this.clone()
    next.state.order.push({
      column,
      ascending: options?.ascending ?? false,
      nullsFirst: options?.nullsFirst,
    })
    return next
  }

  range(from: number, to: number): MockQueryBuilder {
    const next = this.clone()
    next.state.range = { from, to }
    return next
  }

  limit(count: number): MockQueryBuilder {
    const next = this.clone()
    next.state.range = { from: 0, to: count - 1 }
    return next
  }

  single(): PromiseLike<MockResult<unknown>> {
    const next = this.clone()
    next.state.single = true
    next.state.maybeSingle = false
    return next.execute()
  }

  maybeSingle(): PromiseLike<MockResult<unknown>> {
    const next = this.clone()
    next.state.single = true
    next.state.maybeSingle = true
    return next.execute()
  }

  private push(op: string, column: string, value: unknown): MockQueryBuilder {
    const next = this.clone()
    next.state.filters.push({ column, op, value })
    return next
  }

  // -------------------------------------------------------------------------
  // Execution
  // -------------------------------------------------------------------------
  then<TResult1 = MockResult<unknown>, TResult2 = never>(
    onfulfilled?: ((value: MockResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<MockResult<unknown>> {
    await new Promise((resolve) => setTimeout(resolve, LATENCY_MS))

    const table = this.state.table
    const rows = this.db[table]

    if (!rows) {
      return {
        data: null,
        error: {
          message: `Mock: unknown table "${table}". Add it to buildDatabase() in src/lib/mocks/fixtures.ts.`,
          code: '42P01',
        },
        count: null,
      }
    }

    switch (this.state.mode) {
      case 'insert':
        return this.runInsert(rows)
      case 'upsert':
        return this.runUpsert(rows)
      case 'update':
        return this.runUpdate(rows)
      case 'delete':
        return this.runDelete(rows)
      default:
        return this.runSelect(rows)
    }
  }

  private runSelect(rows: Row[]): MockResult<unknown> {
    const filtered = rows.filter((row) =>
      this.state.filters.every((filter) => matchFilter(row, filter)),
    )

    const ordered = [...filtered]
    for (const order of [...this.state.order].reverse()) {
      ordered.sort((a, b) => {
        const left = a[order.column]
        const right = b[order.column]
        if (left == null && right == null) return 0
        if (left == null) return order.nullsFirst === false ? 1 : -1
        if (right == null) return order.nullsFirst === false ? -1 : 1
        const result = left < right ? -1 : left > right ? 1 : 0
        return order.ascending ? result : -result
      })
    }

    const count = ordered.length
    const paged = this.state.range ? ordered.slice(this.state.range.from, this.state.range.to + 1) : ordered

    const projected = paged.map((row) => {
      const withEmbeds =
        this.state.select && this.state.select.includes('(')
          ? applyEmbedded(row, this.state.select, this.db)
          : row
      return projectColumns(withEmbeds, this.state.select)
    })

    if (this.state.maybeSingle) {
      return { data: projected[0] ?? null, error: null, count }
    }
    if (this.state.single) {
      return projected.length === 0
        ? { data: null, error: { message: 'No rows found', code: 'PGRST116' }, count }
        : { data: projected[0], error: null, count }
    }

    return { data: projected, error: null, count: this.state.countMode ? count : null }
  }

  private runInsert(rows: Row[]): MockResult<unknown> {
    const payload = this.state.payload
    if (!payload) return { data: null, error: { message: 'Nothing to insert', code: '22023' }, count: null }

    const incoming = Array.isArray(payload) ? payload : [payload]
    const created: Row[] = []

    for (const item of incoming) {
      const row: Row = {
        id: item.id ?? `mock-${Math.random().toString(36).slice(2, 12)}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...item,
      }
      rows.push(row)
      created.push(row)
    }

    return Array.isArray(payload)
      ? { data: created, error: null, count: created.length }
      : { data: created[0], error: null, count: 1 }
  }

  private runUpsert(rows: Row[]): MockResult<unknown> {
    const payload = this.state.payload
    if (!payload) return { data: null, error: { message: 'Nothing to upsert', code: '22023' }, count: null }

    const incoming = Array.isArray(payload) ? payload : [payload]
    const saved: Row[] = []

    for (const item of incoming) {
      const existing = item.id ? rows.find((row) => row.id === item.id) : undefined
      if (existing) {
        Object.assign(existing, item, { updated_at: new Date().toISOString() })
        saved.push(existing)
      } else {
        const row: Row = {
          id: item.id ?? `mock-${Math.random().toString(36).slice(2, 12)}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...item,
        }
        rows.push(row)
        saved.push(row)
      }
    }

    return Array.isArray(payload)
      ? { data: saved, error: null, count: saved.length }
      : { data: saved[0], error: null, count: 1 }
  }

  private runUpdate(rows: Row[]): MockResult<unknown> {
    const targets = rows.filter((row) =>
      this.state.filters.every((filter) => matchFilter(row, filter)),
    )
    const patch = (this.state.payload ?? {}) as Row

    for (const target of targets) {
      Object.assign(target, patch, { updated_at: new Date().toISOString() })
    }

    return { data: targets[0] ?? null, error: null, count: targets.length }
  }

  private runDelete(rows: Row[]): MockResult<unknown> {
    const keep: Row[] = []
    let removed = 0

    for (const row of rows) {
      const matches = this.state.filters.every((filter) => matchFilter(row, filter))
      if (matches) removed++
      else keep.push(row)
    }

    this.db[this.state.table] = keep
    return { data: null, error: null, count: removed }
  }
}

// ---------------------------------------------------------------------------
// Availability engine (mirrors fn_service_slots closely enough to review)
// ---------------------------------------------------------------------------
function generateSlots(params: {
  p_location_id: string
  p_service_id: string
  p_date: string
  p_staff_id: string | null
  p_service_variant_id: string | null
}): Row[] {
  const db = getDb()
  const service = table(db, 'services').find((s) => s.id === params.p_service_id)
  if (!service) return []

  const hours = table(db, 'location_hours').find(
    (h) =>
      h.location_id === params.p_location_id &&
      h.weekday === new Date(`${params.p_date}T12:00:00Z`).getUTCDay(),
  )
  if (!hours || (hours as { is_closed: boolean }).is_closed) return []

  const variant = params.p_service_variant_id
    ? table(db, 'service_variants').find((v) => v.id === params.p_service_variant_id)
    : null

  const duration = Number(variant?.duration_minutes ?? service.duration_minutes) + Number(service.buffer_minutes ?? 0)
  const price = Number(variant?.price ?? service.price_from) || 0

  const [openHour, openMinute] = String(hours.opens_at).split(':').map(Number)
  const [closeHour, closeMinute] = String(hours.closes_at).split(':').map(Number)

  const eligible = params.p_staff_id
    ? table(db, 'staff_profiles').filter((s) => s.user_id === params.p_staff_id && s.is_bookable)
    : table(db, 'staff_profiles').filter((s) => s.is_bookable)

  if (eligible.length === 0) return []

  const slots: Row[] = []
  const startMinutes = openHour! * 60 + openMinute!
  const endMinutes = closeHour! * 60 + closeMinute!

  for (const stylist of eligible) {
    for (let minute = startMinutes; minute + duration <= endMinutes; minute += 30) {
      const hh = String(Math.floor(minute / 60)).padStart(2, '0')
      const mm = String(minute % 60).padStart(2, '0')
      // Nigeria is UTC+1 year-round.
      const startsAt = `${params.p_date}T${hh}:${mm}:00+01:00`
      const endsAt = new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString()

      // Never offer a slot that has already passed, or is inside the lead time.
      if (new Date(startsAt).getTime() < Date.now() + 4 * 3_600_000) continue

      const conflict = table(db, 'appointments').some(
        (a) =>
          a.staff_id === stylist.user_id &&
          ['pending', 'confirmed', 'checked_in', 'in_progress'].includes(a.status as string) &&
          new Date(a.starts_at as string) < new Date(endsAt) &&
          new Date(a.ends_at as string) > new Date(startsAt),
      )
      if (conflict) continue

      slots.push({
        starts_at: startsAt,
        ends_at: endsAt,
        staff_id: stylist.user_id,
        staff_name: table(db, 'profiles').find((p) => p.id === stylist.user_id)?.full_name ?? '',
        staff_title: stylist.title,
        staff_photo_url: stylist.photo_url,
        price,
        staff_count: eligible.length,
      })
    }
  }

  return slots
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
let database: Record<string, Row[]> | null = null
function getDb(): Record<string, Row[]> {
  if (!database) database = buildDatabase()
  return database
}

/** Replace a table's contents. */
function setTable(db: Record<string, Row[]>, name: string, rows: Row[]): void {
  db[name] = rows
}

/**
 * Read a table, asserting that it exists. Fixtures are the only place tables
 * are declared, so a missing one is a programming error rather than a runtime
 * condition worth handling.
 */
function table(db: Record<string, Row[]>, name: string): Row[] {
  const rows = db[name]
  if (!rows) {
    throw new Error(
      `Mock: table "${name}" is missing from buildDatabase() in src/lib/mocks/fixtures.ts`,
    )
  }
  return rows
}

/** Reset all mock state. Useful when switching demo accounts. */
export function resetMockDatabase(): void {
  database = buildDatabase()
}

const RPC_IMPLEMENTATIONS: Record<string, (params: Row) => unknown> = {
  fn_service_slots: (params) => {
    const data = generateSlots({
      p_location_id: params.p_location_id as string,
      p_service_id: params.p_service_id as string,
      p_date: params.p_date as string,
      p_staff_id: (params.p_staff_id as string) ?? null,
      p_service_variant_id: (params.p_service_variant_id as string) ?? null,
    })
    return { data, error: null }
  },

  fn_is_slot_available: (params) => {
    const data = generateSlots({
      p_location_id: params.p_location_id as string,
      p_service_id: params.p_service_id as string,
      p_date: (params.p_starts_at as string).slice(0, 10),
      p_staff_id: params.p_staff_id as string,
      p_service_variant_id: null,
    })
    const hit = data.some((slot) => slot.starts_at === params.p_starts_at)
    return { data: hit, error: null }
  },

  fn_my_role_keys: (params) => {
    const db = getDb()
    void params
    const session = readSession()
    if (!session?.user) return { data: ['customer'], error: null }
    const keys = table(db, 'user_roles')
      .filter((r) => r.user_id === session.user!.id)
      .map((r) => table(db, 'roles').find((role) => role.id === r.role_id)?.key)
      .filter(Boolean) as string[]
    return { data: keys.length > 0 ? keys : ['customer'], error: null }
  },

  fn_get_cart: () => {
    const db = getDb()
    const session = readSession()
    const cart = table(db, 'carts').find((c) => session?.user && c.user_id === session.user.id)
    if (!cart) {
      return {
        data: {
          cart: null,
          items: [],
          totals: {
            subtotal: 0, discount: 0, shipping: 0, tax: 0,
            total: 0, item_count: 0,
            free_shipping_threshold: 75000,
            coupon_code: null, coupon_message: null,
          },
        },
        error: null,
      }
    }
    const items = table(db, 'cart_items')
      .filter((item) => item.cart_id === cart.id)
      .map((item) => {
        const variant = table(db, 'product_variants').find((v) => v.id === item.variant_id)!
        const product = table(db, 'products').find((p) => p.id === item.product_id)!
        return {
          id: item.id,
          variant_id: variant.id,
          product_id: product.id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: Number(item.unit_price) * Number(item.quantity),
          sku: variant.sku,
          variant_name: variant.name,
          attributes: variant.attributes,
          image_url: product.image_url,
          product_slug: product.slug,
          product_name: product.name,
          kind: product.kind,
          available_stock: Number(variant.stock_on_hand),
          exceeds_stock: Number(variant.stock_on_hand) < Number(item.quantity),
        }
      })

    const subtotal = items.reduce((sum, item) => sum + item.line_total, 0)
    const threshold = 75000
    const shipping = subtotal >= threshold ? 0 : 2500

    return {
      data: {
        cart: { id: cart.id, coupon_code: cart.coupon_code, currency: 'NGN' },
        items,
        totals: {
          subtotal,
          discount: 0,
          shipping,
          tax: 0,
          total: subtotal + shipping,
          item_count: items.reduce((sum, item) => sum + Number(item.quantity), 0),
          free_shipping_threshold: threshold,
          coupon_code: cart.coupon_code,
          coupon_message: null,
        },
      },
      error: null,
    }
  },

  fn_get_or_create_cart: () => {
    const db = getDb()
    const session = readSession()
    const existing = table(db, 'carts').find((c) => session?.user && c.user_id === session.user.id)
    if (existing) return { data: existing, error: null }

    const cart = {
      id: `cart-${Math.random().toString(36).slice(2, 10)}`,
      user_id: session?.user?.id ?? null,
      session_token: null,
      currency: 'NGN',
      coupon_code: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    table(db, 'carts').push(cart)
    return { data: cart, error: null }
  },

  fn_add_to_cart: (params) => {
    const db = getDb()
    const session = readSession()
    let cart = table(db, 'carts').find((c) => session?.user && c.user_id === session.user.id)
    if (!cart) {
      cart = {
        id: `cart-${Math.random().toString(36).slice(2, 10)}`,
        user_id: session?.user?.id ?? null,
        session_token: null,
        currency: 'NGN',
        coupon_code: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      table(db, 'carts').push(cart)
    }

    const variant = table(db, 'product_variants').find((v) => v.id === params.p_variant_id)
    if (!variant) return { data: null, error: { message: 'Variant not found', code: 'PGRST116' } }

    const quantity = Number(params.p_quantity ?? 1)
    const existing = table(db, 'cart_items').find(
      (item) => item.cart_id === cart!.id && item.variant_id === params.p_variant_id,
    )

    if (existing) {
      existing.quantity = Number(existing.quantity) + quantity
      existing.unit_price = variant.price
    } else {
      table(db, 'cart_items').push({
        id: `ci-${Math.random().toString(36).slice(2, 10)}`,
        cart_id: cart.id,
        variant_id: variant.id,
        product_id: variant.product_id,
        quantity,
        unit_price: variant.price,
        added_at: new Date().toISOString(),
      })
    }

    return { data: variant, error: null }
  },

  fn_update_cart_item: (params) => {
    const db = getDb()
    const item = table(db, 'cart_items').find((i) => i.id === params.p_cart_item_id)
    if (item) item.quantity = Number(params.p_quantity)
    return { data: item ?? null, error: null }
  },

  fn_remove_cart_item: (params) => {
    const db = getDb()
    setTable(
      db,
      'cart_items',
      table(db, 'cart_items').filter((i) => i.id !== params.p_cart_item_id),
    )
    return { data: null, error: null }
  },

  fn_coupon_preview: (params) => {
    const codes: Record<string, { type: string; value: number; min: number; max?: number }> = {
      WELCOME10: { type: 'percentage', value: 10, min: 25000, max: 20000 },
      FREESHIP: { type: 'free_shipping', value: 1, min: 25000 },
    }
    const code = String(params.p_code ?? '').toUpperCase()
    const found = codes[code]
    const subtotal = Number(params.p_subtotal ?? 0)

    if (!found) {
      return { data: { is_valid: false, message: 'This code is not recognised', discount_amount: 0, coupon_code: null }, error: null }
    }
    if (subtotal < found.min) {
      return { data: { is_valid: false, message: `Spend ₦${found.min.toLocaleString('en-NG')} to use this code`, discount_amount: 0, coupon_code: code }, error: null }
    }
    const discount =
      found.type === 'percentage'
        ? Math.min((subtotal * found.value) / 100, found.max ?? subtotal)
        : 0
    return { data: { is_valid: true, message: 'Applied', discount_amount: discount, coupon_code: code }, error: null }
  },

  fn_apply_cart_coupon: (params) => {
    const db = getDb()
    const session = readSession()
    const cart = table(db, 'carts').find((c) => session?.user && c.user_id === session.user.id)
    if (cart) {
      const code = String(params.p_code ?? '').toUpperCase()
      cart.coupon_code = code === 'WELCOME10' ? code : null
    }
    return RPC_IMPLEMENTATIONS.fn_coupon_preview!({
      p_code: params.p_code,
      p_subtotal: 0,
      p_product_ids: [],
    })
  },

  fn_cart_totals: () => {
    const result = RPC_IMPLEMENTATIONS.fn_get_cart!({}) as { data: { totals: Row } }
    return { data: result.data.totals, error: null }
  },

  fn_checkout: (params) => {
    const db = getDb()
    const session = readSession()
    const cart = table(db, 'carts').find((c) => session?.user && c.user_id === session.user.id)
    const items = cart ? table(db, 'cart_items').filter((i) => i.cart_id === cart.id) : []

    const subtotal = items.reduce((sum, item) => {
      const variant = table(db, 'product_variants').find((v) => v.id === item.variant_id)
      return sum + Number(variant?.price ?? 0) * Number(item.quantity)
    }, 0)
    const shipping = subtotal >= 75000 ? 0 : 2500

    const orderNumber = `ORD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    const order = {
      id: `ord-${Math.random().toString(36).slice(2, 10)}`,
      order_number: orderNumber,
      customer_id: session?.user?.id ?? null,
      status: 'pending',
      fulfilment_type: params.p_fulfilment_type ?? 'pickup',
      location_id: params.p_location_id ?? null,
      subtotal,
      discount_total: 0,
      shipping_total: shipping,
      tax_total: 0,
      total: subtotal + shipping,
      paid_total: 0,
      refund_total: 0,
      currency: 'NGN',
      payment_status: 'awaiting_payment',
      coupon_code: cart?.coupon_code ?? null,
      contact_name: params.p_contact_name,
      contact_email: params.p_contact_email,
      contact_phone: params.p_contact_phone,
      delivery_address: params.p_delivery_address ?? null,
      delivery_notes: null,
      customer_notes: params.p_notes ?? null,
      internal_notes: null,
      tracking_number: null,
      courier: null,
      placed_at: new Date().toISOString(),
      confirmed_at: null,
      fulfilled_at: null,
      cancelled_at: null,
    }

    table(db, 'orders').push(order)

    for (const item of items) {
      const variant = table(db, 'product_variants').find((v) => v.id === item.variant_id)!
      const product = table(db, 'products').find((p) => p.id === item.product_id)!
      table(db, 'order_items').push({
        id: `oi-${Math.random().toString(36).slice(2, 10)}`,
        order_id: order.id,
        product_id: product.id,
        variant_id: variant.id,
        name_snapshot: product.name,
        variant_snapshot: variant.name,
        sku_snapshot: variant.sku,
        image_snapshot: product.image_url,
        attributes: variant.attributes,
        unit_price: variant.price,
        quantity: item.quantity,
        line_total: Number(variant.price) * Number(item.quantity),
        cost_snapshot: null,
        fulfilled_qty: 0,
        refunded_qty: 0,
        created_at: new Date().toISOString(),
      })
      variant.stock_on_hand = Number(variant.stock_on_hand) - Number(item.quantity)
    }

    if (cart) setTable(db, 'cart_items', table(db, 'cart_items').filter((i) => i.cart_id !== cart.id))

    return { data: order, error: null }
  },

  fn_create_appointment: (params) => {
    const db = getDb()
    const session = readSession()
    const service = table(db, 'services').find((s) => s.id === params.p_service_id)
    if (!service) {
      return { data: null, error: { message: 'Service not available', code: 'P0002' } }
    }

    const duration = Number(service.duration_minutes)
    const startsAt = params.p_starts_at as string
    const endsAt = new Date(new Date(startsAt).getTime() + (duration + 30) * 60_000).toISOString()

    // Overlap check, mirroring the exclusion constraint.
    const clash = table(db, 'appointments').some(
      (a) =>
        a.staff_id === params.p_staff_id &&
        ['pending', 'confirmed', 'checked_in', 'in_progress'].includes(a.status as string) &&
        new Date(a.starts_at as string) < new Date(endsAt) &&
        new Date(a.ends_at as string) > new Date(startsAt),
    )
    if (clash) {
      return { data: null, error: { message: 'That slot was just taken. Please pick another time.', code: 'P0001' } }
    }

    const appointment = {
      id: `appt-${Math.random().toString(36).slice(2, 10)}`,
      reference: `UHS-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      customer_id: session?.user?.id ?? null,
      service_id: params.p_service_id,
      service_variant_id: params.p_service_variant_id ?? null,
      staff_id: params.p_staff_id,
      location_id: params.p_location_id,
      starts_at: startsAt,
      ends_at: endsAt,
      duration_minutes: duration,
      buffer_minutes: 30,
      status: 'pending',
      payment_status: 'unpaid',
      source: 'web',
      subtotal: service.price_from,
      discount: 0,
      total: service.price_from,
      deposit_required: false,
      deposit_amount: 0,
      deposit_paid: 0,
      balance_due: service.price_from,
      customer_notes: params.p_customer_notes ?? null,
      internal_notes: null,
      cancellation_reason: null,
      cancelled_by: null,
      cancelled_at: null,
      confirmed_at: null,
      checked_in_at: null,
      completed_at: null,
      rescheduled_from_id: null,
      is_recurring: false,
      recurrence_group_id: null,
      calendar_event_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    table(db, 'appointments').push(appointment)

    if (params.p_requirement) {
      table(db, 'requirements').push({
        id: `req-${Math.random().toString(36).slice(2, 10)}`,
        appointment_id: appointment.id,
        customer_id: session?.user?.id ?? null,
        ...params.p_requirement,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        reviewed_at: null,
        reviewed_by: null,
        staff_response: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }

    return { data: appointment, error: null }
  },

  fn_set_appointment_status: (params) => {
    const db = getDb()
    const appointment = table(db, 'appointments').find((a) => a.id === params.p_appointment_id)
    if (!appointment) return { data: null, error: { message: 'Appointment not found', code: 'P0002' } }
    appointment.status = params.p_status
    appointment.updated_at = new Date().toISOString()
    return { data: appointment, error: null }
  },

  fn_cancel_appointment: (params) => {
    const db = getDb()
    const appointment = table(db, 'appointments').find((a) => a.id === params.p_appointment_id)
    if (!appointment) return { data: null, error: { message: 'Appointment not found', code: 'P0002' } }
    appointment.status = 'cancelled'
    appointment.cancellation_reason = params.p_reason ?? null
    appointment.cancelled_at = new Date().toISOString()
    return { data: appointment, error: null }
  },

  fn_hold_slot: () => ({
    data: `hold-${Math.random().toString(36).slice(2, 10)}`,
    error: null,
  }),

  fn_available_stock: (params) => {
    const db = getDb()
    const variant = table(db, 'product_variants').find((v) => v.id === params.p_variant_id)
    return { data: Number(variant?.stock_on_hand ?? 0), error: null }
  },

  fn_admin_dashboard_stats: () => {
    const db = getDb()
    const revenue = table(db, 'appointments')
      .filter((a) => a.status === 'completed')
      .reduce((sum, a) => sum + Number(a.total), 0)
    const productRevenue = table(db, 'orders')
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => sum + Number(o.total), 0)

    // Built oldest → newest so index 0 and the last index are always defined.
    const series = Array.from({ length: 30 }, (_, index) => {
      const day = new Date(Date.now() - (29 - index) * 86_400_000).toISOString().slice(0, 10)
      return {
        day,
        service_revenue: index % 7 === 3 ? 0 : Math.round(180000 + ((index * 37) % 120) * 1000),
        product_revenue: index % 5 === 2 ? 0 : Math.round(90000 + ((index * 53) % 80) * 500),
        appointments: (index * 7) % 11,
      }
    })

    return {
      data: {
        range: {
          from: String(series[0]?.day ?? todayStamp()),
          to: String(series[series.length - 1]?.day ?? todayStamp()),
        },
        appointments: {
          total: 428, completed: 366, cancelled: 21, no_show: 9,
          upcoming: table(db, 'appointments').filter((a) => new Date(a.starts_at as string) > new Date()).length,
          revenue,
        },
        revenue: { services: revenue, products: productRevenue, collected: productRevenue },
        commerce: {
          orders: table(db, 'orders').length,
          open_orders: table(db, 'orders').filter((o) => o.status === 'pending').length,
          units_sold: table(db, 'products').reduce((sum, p) => sum + Number(p.sold_count ?? 0), 0),
          low_stock: table(db, 'product_variants').filter((v) => Number(v.stock_on_hand) <= Number(v.low_stock_threshold)).length,
          out_of_stock: table(db, 'product_variants').filter((v) => Number(v.stock_on_hand) === 0).length,
        },
        recruitment: {
          open_jobs: table(db, 'jobs').filter((j) => j.status === 'open').length,
          applications: table(db, 'job_applications').length,
          awaiting_review: table(db, 'job_applications').filter((a) => a.status === 'submitted').length,
          shortlisted: table(db, 'job_applications').filter((a) => ['shortlisted', 'interview_scheduled', 'interviewed'].includes(a.status as string)).length,
        },
        customers: { new: 137, total: 1284, returning: 402 },
        series,
      },
      error: null,
    }
  },

  fn_submit_application: (params) => {
    const db = getDb()
    const payload = (params.p_payload ?? {}) as Row
    const application = {
      id: `app-${Math.random().toString(36).slice(2, 10)}`,
      reference: `APP-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      job_id: payload.job_id,
      applicant_id: readSession()?.user?.id ?? null,
      full_name: payload.full_name,
      email: payload.email,
      phone_e164: payload.phone ?? null,
      location: payload.location ?? null,
      cover_letter: payload.cover_letter ?? null,
      portfolio_url: payload.portfolio_url ?? null,
      portfolio_urls: payload.portfolio_urls ?? [],
      cv_path: payload.cv_path ?? null,
      cv_file_name: payload.cv_file_name ?? null,
      cv_bytes: payload.cv_bytes ?? null,
      answers: payload.answers ?? {},
      experience_years: payload.experience_years ?? null,
      status: 'submitted',
      stage_notes: null,
      rating: null,
      interview_at: null,
      consent_contact: true,
      consented_at: new Date().toISOString(),
      submitted_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
      updated_at: new Date().toISOString(),
    }
    table(db, 'job_applications').unshift(application)
    return { data: application, error: null }
  },

  fn_set_application_status: (params) => {
    const db = getDb()
    const application = table(db, 'job_applications').find((a) => a.id === params.p_application_id)
    if (application) {
      application.status = params.p_status
      if (params.p_note) application.stage_notes = params.p_note
    }
    return { data: application ?? null, error: null }
  },

  fn_withdraw_application: (params) => {
    const db = getDb()
    const application = table(db, 'job_applications').find((a) => a.id === params.p_application_id)
    if (application) application.status = 'withdrawn'
    return { data: application ?? null, error: null }
  },

  fn_set_order_status: (params) => {
    const db = getDb()
    const order = table(db, 'orders').find((o) => o.id === params.p_order_id)
    if (order) order.status = params.p_status
    return { data: order ?? null, error: null }
  },

  fn_record_offline_payment: (params) => {
    const db = getDb()
    const order = table(db, 'orders').find((o) => o.id === params.p_order_id)
    if (order) {
      order.paid_total = Number(order.total)
      order.payment_status = 'paid'
      order.status = 'confirmed'
    }
    return {
      data: {
        id: `pay-${Math.random().toString(36).slice(2, 10)}`,
        order_id: params.p_order_id,
        amount: params.p_amount,
        provider: params.p_provider,
        status: 'paid',
      },
      error: null,
    }
  },

  fn_adjust_stock: (params) => {
    const db = getDb()
    const variant = table(db, 'product_variants').find((v) => v.id === params.p_variant_id)
    if (variant) {
      variant.stock_on_hand = Math.max(0, Number(variant.stock_on_hand) + Number(params.p_delta))
    }
    return { data: variant ?? null, error: null }
  },

  fn_slugify: (params) => ({
    data: String(params.p_text ?? '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, ''),
    error: null,
  }),

  fn_naira: (params) => ({ data: `₦${Number(params.p_amount ?? 0).toLocaleString('en-NG')}`, error: null }),

  fn_next_reference: (params) => ({
    data: `${params.p_prefix ?? 'REF'}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    error: null,
  }),
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

export function createMockClient() {
  const db = getDb()
  const listeners = new Set<(event: string, session: { user: MockUser | null } | null) => void>()

  const notify = (event: string) => {
    const session = readSession()
    for (const listener of listeners) listener(event, session)
  }

  const client = {
    from(table: string) {
      return new MockQueryBuilder(db, table)
    },

    async rpc(fn: string, params: Row = {}) {
      await new Promise((resolve) => setTimeout(resolve, LATENCY_MS / 2))
      const implementation = RPC_IMPLEMENTATIONS[fn]
      if (!implementation) {
        return {
          data: null,
          error: {
            message: `Mock: RPC "${fn}" is not implemented. Add it to RPC_IMPLEMENTATIONS in src/lib/mocks/supabase-mock.ts.`,
            code: '42883',
          },
        }
      }
      return implementation(params) as { data: unknown; error: unknown }
    },

    auth: {
      async getSession() {
        const session = readSession()
        return { data: { session: session ? { ...session, access_token: 'mock-token', expires_at: 0 } : null }, error: null }
      },

      onAuthStateChange(callback: (event: string, session: unknown) => void) {
        const wrapped = (event: string, session: unknown) => callback(event, session)
        listeners.add(wrapped as never)
        return {
          data: {
            subscription: { unsubscribe: () => listeners.delete(wrapped as never) },
          },
        }
      },

      async getUser(token: string) {
        const session = readSession()
        if (token === 'mock-token' && session?.user) return { data: { user: session.user }, error: null }
        return { data: { user: null }, error: { message: 'Invalid token', code: '401' } }
      },

      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const user = DEMO_USERS[email.toLowerCase()]
        if (!user) {
          return { data: { user: null, session: null }, error: { message: 'Invalid login credentials', code: '400' } }
        }
        if (password.length < 6) {
          return { data: { user: null, session: null }, error: { message: 'Invalid login credentials', code: '400' } }
        }
        writeSession(user)
        notify('SIGNED_IN')
        return { data: { user, session: { user } }, error: null }
      },

      async signUp({ email, options }: { email: string; options?: { data?: Row } }) {
        const user: MockUser = {
          id: `mock-${Math.random().toString(36).slice(2, 10)}`,
          email,
          phone: null,
          created_at: new Date().toISOString(),
          email_confirmed_at: new Date().toISOString(),
          user_metadata: options?.data ?? {},
        }
        writeSession(user)

        table(db, 'profiles').push({
          id: user.id,
          email,
          full_name: (options?.data?.full_name as string) ?? email.split('@')[0],
          slug: `member-${user.id.slice(0, 6)}`,
          phone_e164: null,
          avatar_url: null,
          gender: null,
          bio: null,
          allergies: [],
          accessibility_needs: null,
          locale: 'en-NG',
          marketing_opt_in: false,
          whatsapp_opt_in: true,
          sms_opt_in: false,
          email_opt_in: true,
          status: 'active',
          onboarding_step: 'profile',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        table(db, 'user_roles').push({
          user_id: user.id,
          role_id: 1,
          granted_by: null,
          granted_at: new Date().toISOString(),
          expires_at: null,
        })

        notify('SIGNED_IN')
        return { data: { user, session: { user } }, error: null }
      },

      async signInWithOAuth() {
        return { data: { provider: 'google', url: null }, error: null }
      },

      async signOut() {
        writeSession(null)
        notify('SIGNED_OUT')
        return { error: null }
      },

      async updateUser({ password, phone }: { password?: string; phone?: string } = {}) {
        const session = readSession()
        if (session?.user && phone) session.user.phone = phone
        writeSession(session?.user ?? null)
        // Password updates are a no-op in preview mode: the mock has no
        // credential store, and the caller only needs the call to succeed.
        void password
        return { data: { user: session?.user ?? null }, error: null }
      },

      async resetPasswordForEmail() {
        return { data: {}, error: null }
      },
    },

    storage: {
      from(bucket: string) {
        return {
          async upload(path: string, _file: File) {
            // Reference images are personal data, so nothing is persisted.
            return { path, error: null }
          },
          async createSignedUrl(_path: string) {
            return {
              data: { signedUrl: `https://placehold.co/900x900/f4eee6/a98467?text=${encodeURIComponent(bucket)}` },
              error: null,
            }
          },
          async remove() {
            return { data: [], error: null }
          },
        }
      },
    },

    functions: {
      async invoke(name: string) {
        // Payments are simulated in mock mode so the checkout flow is reviewable
        // end to end without Paystack credentials.
        return { data: { ok: true, function: name }, error: null }
      },
    },

    channel() {
      return {
        on() { return this },
        subscribe() { return this },
        unsubscribe() { return Promise.resolve() },
      }
    },

    removeChannel() {
      return Promise.resolve()
    },
  }

  return client
}

export { DEMO_ACCOUNT, DEMO_ADMIN, DEMO_STAFF, DEMO_USERS }
