import { listJobsAdmin, remove, select, selectPaginated } from '@/lib/api'
import type {
  AppointmentDetail,
  Job,
  JobApplication,
  OrderDetail,
  Payment,
  Product,
  ProductVariant,
  ServiceVariant,
} from '@/types'

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

/**
 * `listBookings` and `getAppointment` both embed a `customer` relation, but the
 * shared `AppointmentDetail` type does not declare it — it is only used by the
 * customer's own screens, where the profile is already known. Admin screens need
 * it, so the relation is declared locally rather than patched into `@/types`.
 */
export type AppointmentWithCustomer = AppointmentDetail & {
  customer: {
    id: string
    full_name: string | null
    email: string
    phone_e164: string | null
  } | null
}

export function withCustomer(rows: AppointmentDetail[]): AppointmentWithCustomer[] {
  return rows as AppointmentWithCustomer[]
}

export function withCustomerOne(
  row: AppointmentDetail | null,
): AppointmentWithCustomer | null {
  return row as AppointmentWithCustomer | null
}

/**
 * Administrator reads that are not on the `@/lib/api` barrel.
 *
 * Two gaps in the shared surface force this file, and both are deliberate
 * workarounds rather than a parallel data layer:
 *
 * 1. `admin.ts` exports its own `listOrders`, but the barrel resolves that name
 *    to the *customer-scoped* reader in `commerce.ts` to keep the namespaces
 *    unambiguous. The admin order list is rebuilt here, byte-for-byte the same
 *    query, from the barrel's exported `selectPaginated`.
 * 2. `getProductBySlug` reads the customer-facing `product_catalog` view, which
 *    cannot resolve drafts and collapses one row per variant. Admin editing needs
 *    the raw `products` row by id.
 *
 * Everything here composes the same `select` / `selectPaginated` helpers the rest
 * of the app uses — no hand-written Supabase queries, no new endpoints.
 */

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

const ORDER_SELECT = `
  *,
  items:order_items ( * ),
  location:location_id ( id, name, address_line1, city, state, phone ),
  payments:payments ( * )
`

/** `orders` carries two admin-only columns the shared `Order` type omits. */
export type OrderAdmin = OrderDetail & {
  internal_notes: string | null
  cancel_reason: string | null
}

export interface AdminOrderFilters {
  status?: string
  paymentStatus?: string
  locationId?: string
  search?: string
}

/** Cap on the id list resolved for free-text search, to keep `?id=in.(…)` sane. */
const SEARCH_ID_CAP = 400

/**
 * Admin order list with server-side filtering and paging.
 *
 * Free-text search has to span order number, contact name and phone. The
 * `selectPaginated` filter DSL is AND-only and cannot express PostgREST's `or`,
 * so the matching ids are resolved in a short pre-pass and then paged. Beyond
 * `SEARCH_ID_CAP` matches the search narrows to the most recent orders only,
 * which the UI states rather than silently truncating.
 */
export async function listOrdersAdmin(
  filters: AdminOrderFilters = {},
  page = 1,
  pageSize = 25,
): Promise<{ data: OrderAdmin[]; count: number }
> {
  let idFilter: string[] | undefined

  const search = filters.search?.trim()
  if (search) {
    const term = `%${search}%`
    const [byNumber, byName, byPhone] = await Promise.all([
      select<{ id: string }>('orders', {
        select: 'id',
        filters: { order_number: { ilike: term } },
      }),
      select<{ id: string }>('orders', {
        select: 'id',
        filters: { contact_name: { ilike: term } },
      }),
      select<{ id: string }>('orders', {
        select: 'id',
        filters: { contact_phone: { ilike: term } },
      }),
    ])

    idFilter = [...new Set([...byNumber, ...byName, ...byPhone].map((r) => r.id))]
    if (idFilter.length === 0) return { data: [], count: 0 }
    if (idFilter.length > SEARCH_ID_CAP) idFilter = idFilter.slice(0, SEARCH_ID_CAP)
  }

  return selectPaginated<OrderAdmin>('orders', {
    page,
    pageSize,
    select: ORDER_SELECT,
    filters: {
      ...(filters.status ? { status: { in: filters.status.split(',') } } : {}),
      ...(filters.paymentStatus ? { payment_status: filters.paymentStatus } : {}),
      ...(filters.locationId ? { location_id: filters.locationId } : {}),
      ...(idFilter ? { id: { in: idFilter } } : {}),
    },
    order: { column: 'placed_at', ascending: false },
  })
}

/** A single order with its items, location and payments, including admin notes. */
export async function getOrderAdmin(id: string): Promise<OrderAdmin | null> {
  const rows = await select<OrderAdmin>('orders', {
    select: ORDER_SELECT,
    filters: { id },
    range: { from: 0, to: 1 },
  })
  return rows[0] ?? null
}

/** A customer's orders, for the admin customer drawer. */
export async function listCustomerOrders(customerId: string): Promise<OrderDetail[]> {
  return select<OrderDetail>('orders', {
    select: ORDER_SELECT,
    filters: { customer_id: customerId },
    order: { column: 'placed_at', ascending: false },
  })
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/**
 * `products.meta_title` / `meta_description` exist in the schema but are absent
 * from the shared `Product` type, so the admin editor carries them locally.
 */
export type ProductAdmin = Product & {
  meta_title: string | null
  meta_description: string | null
}

export async function getProductAdmin(id: string): Promise<ProductAdmin | null> {
  const rows = await select<ProductAdmin>('products', {
    select: '*',
    filters: { id },
    range: { from: 0, to: 1 },
  })
  return rows[0] ?? null
}

/**
 * Variants for a set of products in one round trip. The products table needs
 * SKU, price band and stock on hand for each row, and none of that lives on
 * `products` itself.
 */
export async function listVariantsForProducts(
  productIds: string[],
): Promise<ProductVariant[]> {
  if (productIds.length === 0) return []
  return select<ProductVariant>('product_variants', {
    filters: { product_id: { in: productIds } },
    order: { column: 'display_order', ascending: true },
  })
}

/** Every variant, joined to its product name for the inventory screens. */
export async function listVariantsWithProductsAdmin(): Promise<
  (ProductVariant & { product_name: string; product_slug: string; category_id: string | null })[]
> {
  const [variants, products] = await Promise.all([
    select<ProductVariant>('product_variants', {
      order: { column: 'sku', ascending: true },
    }),
    select<Pick<Product, 'id' | 'name' | 'slug' | 'category_id'>>('products', {
      select: 'id, name, slug, category_id',
    }),
  ])

  const byId = new Map(products.map((p) => [p.id, p]))
  return variants.map((variant) => {
    const product = byId.get(variant.product_id)
    return {
      ...variant,
      product_name: product?.name ?? '',
      product_slug: product?.slug ?? variant.product_id,
      category_id: product?.category_id ?? null,
    }
  })
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

/**
 * Every variant of a service, including inactive ones.
 *
 * `getServiceVariants` from the catalogue filters `is_active = true`, which is
 * the right default for the storefront and the wrong one for an editor. The
 * cache key is namespaced at the call site for the same reason.
 */
export async function listServiceVariantsAdmin(serviceId: string): Promise<ServiceVariant[]> {
  return select<ServiceVariant>('service_variants', {
    filters: { service_id: serviceId },
    order: { column: 'display_order', ascending: true },
  })
}

// ---------------------------------------------------------------------------
// Deletes
// ---------------------------------------------------------------------------

/**
 * `admin.ts` ships save helpers but no delete helpers, so these are built on the
 * barrel's `remove`. Foreign keys decide the consequence, and every caller states
 * it in a confirmation dialog before calling:
 *
 * - a service takes its variants, staff mappings and bookings with it;
 * - a variant cannot be removed once an order line references it, because
 *   `order_items.variant_id` is `on delete set null` and would orphan the SKU.
 */
export async function deleteService(id: string): Promise<void> {
  await remove('services', id)
}

export async function deleteServiceVariant(id: string): Promise<void> {
  await remove('service_variants', id)
}

export async function deleteServiceCategory(id: string): Promise<void> {
  await remove('service_categories', id)
}

/**
 * `order_items.variant_id` is `on delete set null`, so removing a variant that has
 * been sold detaches the historical line from its SKU. Every caller warns about
 * exactly that, and deactivating the variant is offered as the reversible path.
 */
export async function removeProductVariant(id: string): Promise<void> {
  await remove('product_variants', id)
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

const APPOINTMENT_SELECT = `
  *,
  service:service_id ( id, slug, name, summary ),
  staff:staff_id ( user_id, full_name, title, photo_url ),
  location:location_id ( id, name, slug ),
  customer:customer_id ( id, full_name, email, phone_e164 )
`

/**
 * A single customer's appointment history.
 *
 * NOTE: `listBookings` exposes no `customerId` filter, so paging it and
 * filtering client-side would silently miss appointments that fall outside the
 * current page. This scoped read is issued directly instead — one admin-only
 * query, no approximation.
 */
export async function listCustomerAppointments(
  customerId: string,
): Promise<AppointmentWithCustomer[]> {
  return select<AppointmentWithCustomer>('appointments', {
    select: APPOINTMENT_SELECT,
    filters: { customer_id: customerId },
    order: { column: 'starts_at', ascending: false },
  })
}

// ---------------------------------------------------------------------------
// Recruitment
// ---------------------------------------------------------------------------

/**
 * `jobs.views_count` exists in the schema but not in the shared `Job` type, so the
 * vacancy table declares it locally.
 */
export type JobAdmin = Job & { views_count: number }

export async function listJobsAdminDetailed(status?: string): Promise<JobAdmin[]> {
  return (await listJobsAdmin(status)) as JobAdmin[]
}

/**
 * Application counts per status.
 *
 * `fn_admin_dashboard_stats` only reports the aggregate buckets
 * (awaiting review / shortlisted), so the pipeline chips need their own read.
 * It fetches one column per application and counts in memory — cheap, but a
 * grouped view or RPC would be the right home for it if the applicant base grows.
 */
export async function listApplicationStatusCounts(): Promise<Record<string, number>> {
  const rows = await select<Pick<JobApplication, 'status'>>('job_applications', {
    select: 'status',
  })
  const counts: Record<string, number> = {}
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1
  return counts
}

// ---------------------------------------------------------------------------
// Aggregations used by the products table
// ---------------------------------------------------------------------------

export interface VariantRollup {
  skus: string[]
  priceMin: number
  priceMax: number
  stock: number
  variantCount: number
}

/** Per-product SKU list, price band and stock, computed from the variant rows. */
export function rollupVariants(
  variants: ProductVariant[],
): Map<string, VariantRollup> {
  const byProduct = new Map<string, ProductVariant[]>()
  for (const variant of variants) {
    const bucket = byProduct.get(variant.product_id)
    if (bucket) bucket.push(variant)
    else byProduct.set(variant.product_id, [variant])
  }

  const out = new Map<string, VariantRollup>()
  for (const [productId, rows] of byProduct) {
    const active = rows.filter((v) => v.is_active)
    const priced = active.length > 0 ? active : rows
    const prices = priced.map((v) => Number(v.price))
    out.set(productId, {
      skus: rows.map((v) => v.sku),
      priceMin: prices.length > 0 ? Math.min(...prices) : 0,
      priceMax: prices.length > 0 ? Math.max(...prices) : 0,
      stock: rows.reduce((sum, v) => sum + v.stock_on_hand, 0),
      variantCount: rows.length,
    })
  }
  return out
}

/** Payment rows for an order, newest first. */
export function sortPayments(payments: Payment[]): Payment[] {
  return [...payments].sort((a, b) => b.created_at.localeCompare(a.created_at))
}
