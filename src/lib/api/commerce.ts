import { getSupabase } from '@/lib/supabase/client'
import { ApiError } from '@/lib/supabase/errors'
import { rpc, select, selectOne } from './db'
import type {
  CartPayload,
  CouponPreview,
  DeliveryAddress,
  FulfilmentType,
  Order,
  OrderDetail,
  OrderItem,
  Product,
  ProductCatalogEntry,
  ProductCategory,
  ProductKind,
  ProductVariant,
  WishlistEntry,
} from '@/types'

/**
 * Storefront client.
 *
 * All money is computed by Postgres (`fn_cart_totals`, `fn_checkout`); the client
 * only ever renders what the server returns. Stock is re-checked inside the
 * checkout transaction.
 */

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
export interface ProductFilters {
  kind?: ProductKind
  category?: string
  search?: string
  hairClass?: string
  minPrice?: number
  maxPrice?: number
  inStockOnly?: boolean
  sort?: 'featured' | 'price_asc' | 'price_desc' | 'newest' | 'rating'
  limit?: number
}

export async function getProductCategories(): Promise<ProductCategory[]> {
  return select<ProductCategory>('product_categories', {
    filters: { is_active: true },
    order: { column: 'display_order', ascending: true },
  })
}

/**
 * Products from the catalog view, which already carries one row per purchasable
 * variant along with live stock. Collapsed to one row per product so variant
 * choice happens on the card, not in a list.
 */
export async function getProducts(filters: ProductFilters = {}): Promise<ProductCatalogEntry[]> {
  const spec = '*'
  let rows = await select<ProductCatalogEntry>('product_catalog', { select: spec })

  if (filters.category) rows = rows.filter((r) => r.category_slug === filters.category)
  if (filters.kind) rows = rows.filter((r) => r.kind === filters.kind)
  if (filters.hairClass) rows = rows.filter((r) => r.hair_class === filters.hairClass)
  if (filters.inStockOnly) rows = rows.filter((r) => r.available_stock > 0)

  if (filters.minPrice !== undefined) {
    rows = rows.filter((r) => effectivePrice(r) >= filters.minPrice!)
  }
  if (filters.maxPrice !== undefined) {
    rows = rows.filter((r) => effectivePrice(r) <= filters.maxPrice!)
  }

  if (filters.search) {
    const term = filters.search.toLowerCase()
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        r.summary.toLowerCase().includes(term) ||
        (r.brand ?? '').toLowerCase().includes(term),
    )
  }

  // One row per product, keeping the default (or first available) variant.
  const collapsed = collapseVariants(rows)

  const sorted = applySort(collapsed, filters.sort ?? 'featured')

  return filters.limit ? sorted.slice(0, filters.limit) : sorted
}

export async function getProductBySlug(slug: string): Promise<ProductCatalogEntry | null> {
  const rows = await select<ProductCatalogEntry>('product_catalog', {
    select: '*',
    filters: { slug },
  })
  return collapseVariants(rows)[0] ?? null
}

export async function getProductVariants(productId: string): Promise<ProductVariant[]> {
  return select<ProductVariant>('product_variants', {
    filters: { product_id: productId, is_active: true },
    order: { column: 'display_order', ascending: true },
  })
}

export async function getRelatedProducts(productId: string, limit = 4): Promise<ProductCatalogEntry[]> {
  const product = await selectOne<Product>('products', {
    select: 'id, category_id',
    filters: { id: productId, status: 'active' },
  })
  if (!product?.category_id) return []

  const rows = await select<ProductCatalogEntry>('product_catalog', {
    select: '*',
    filters: { category_id: product.category_id },
  })
  return collapseVariants(rows).filter((p) => p.id !== productId).slice(0, limit)
}

function effectivePrice(product: ProductCatalogEntry): number {
  return product.variant_price ?? product.base_price
}

/** Keep one row per product, preferring the default variant then any in stock. */
function collapseVariants(rows: ProductCatalogEntry[]): ProductCatalogEntry[] {
  const byProduct = new Map<string, ProductCatalogEntry[]>()

  for (const row of rows) {
    const bucket = byProduct.get(row.id)
    if (bucket) bucket.push(row)
    else byProduct.set(row.id, [row])
  }

  return [...byProduct.values()].map((variants) => {
    const inStock = variants.filter((v) => v.available_stock > 0)
    const pool = inStock.length > 0 ? inStock : variants
    return (
      pool.find((v) => v.is_default_variant) ??
      pool.sort((a, b) => (a.variant_id ?? '').localeCompare(b.variant_id ?? ''))[0] ??
      pool[0]!
    )
  })
}

function applySort(
  products: ProductCatalogEntry[],
  sort: NonNullable<ProductFilters['sort']>,
): ProductCatalogEntry[] {
  const sorted = [...products]
  switch (sort) {
    case 'price_asc':  return sorted.sort((a, b) => effectivePrice(a) - effectivePrice(b))
    case 'price_desc': return sorted.sort((a, b) => effectivePrice(b) - effectivePrice(a))
    case 'newest':     return sorted.sort((a, b) => b.created_at.localeCompare(a.created_at))
    case 'rating':     return sorted.sort((a, b) => (b.rating_avg ?? 0) - (a.rating_avg ?? 0))
    case 'featured':
    default:
      return sorted.sort(
        (a, b) =>
          Number(b.is_featured) - Number(a.is_featured) ||
          Number(b.is_best_seller) - Number(a.is_best_seller) ||
          a.display_order - b.display_order,
      )
  }
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export async function getCart(sessionToken?: string | null): Promise<CartPayload> {
  return rpc<CartPayload>('fn_get_cart', { p_session_token: sessionToken ?? null })
}

export async function addToCart(
  variantId: string,
  quantity = 1,
  sessionToken?: string | null,
): Promise<CartPayload> {
  await rpc('fn_add_to_cart', {
    p_variant_id: variantId,
    p_quantity: quantity,
    p_session_token: sessionToken ?? null,
  })
  return getCart(sessionToken)
}

export async function updateCartItem(
  itemId: string,
  quantity: number,
): Promise<CartPayload> {
  await rpc('fn_update_cart_item', { p_cart_item_id: itemId, p_quantity: quantity })
  return getCart()
}

export async function removeCartItem(itemId: string): Promise<CartPayload> {
  await rpc('fn_remove_cart_item', { p_cart_item_id: itemId })
  return getCart()
}

export async function applyCoupon(code: string): Promise<CouponPreview> {
  return rpc<CouponPreview>('fn_apply_cart_coupon', { p_code: code })
}

/** Preview a discount without mutating the cart (used by the promo field). */
export async function previewCoupon(code: string): Promise<CouponPreview> {
  return rpc<CouponPreview>('fn_coupon_preview', {
    p_code: code,
    p_subtotal: 0,
    p_product_ids: [],
  })
}

export async function availableStock(variantId: string): Promise<number> {
  return rpc<number>('fn_available_stock', { p_variant_id: variantId })
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export interface CheckoutInput {
  cartId: string
  contactName: string
  contactEmail: string
  contactPhone: string
  fulfilmentType: FulfilmentType
  locationId?: string | null
  deliveryAddress?: DeliveryAddress | null
  notes?: string
  couponCode?: string
}

export async function checkout(input: CheckoutInput): Promise<Order> {
  // NOTE: required parameters precede defaulted ones in fn_checkout.
  return rpc<Order>('fn_checkout', {
    p_cart_id: input.cartId,
    p_contact_name: input.contactName,
    p_contact_email: input.contactEmail,
    p_contact_phone: input.contactPhone,
    p_fulfilment_type: input.fulfilmentType,
    p_location_id: input.locationId ?? null,
    p_delivery_address: input.deliveryAddress ?? null,
    p_notes: input.notes ?? null,
    p_coupon_code: input.couponCode ?? null,
  })
}

/** Initialise a Paystack transaction and redirect. Server-verified via webhook. */
export interface PaymentSession {
  authorizationUrl: string
  accessCode: string
  reference: string
  amount: number
}

export async function startPayment(order: Order, email: string): Promise<PaymentSession> {
  const { data, error } = await getSupabase().functions.invoke('paystack-initialize', {
    body: {
      order_id: order.id,
      amount: order.total - order.paid_total,
      email,
      reference: `ORD-${order.order_number}`,
    },
  })

  if (error) throw new ApiError(error.message || 'Could not start the payment')

  const session = (data ?? {}) as {
    authorization_url?: string
    access_code?: string
    reference?: string
    amount?: number
  }

  if (!session.authorization_url) {
    throw new ApiError('Payment could not be started. Please try again.')
  }

  return {
    authorizationUrl: session.authorization_url,
    accessCode: session.access_code ?? '',
    reference: session.reference ?? '',
    amount: session.amount ?? order.total,
  }
}

/** Bank-transfer fallback for customers who prefer to pay offline. */
export async function requestBankTransfer(order: Order): Promise<{ instructions: string; reference: string }> {
  const { data, error } = await getSupabase().functions.invoke('bank-transfer-instructions', {
    body: { order_id: order.id },
  })
  if (error) throw new ApiError(error.message || 'Could not fetch transfer details')
  return data as { instructions: string; reference: string }
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
const ORDER_SELECT = `
  *,
  items:order_items ( * ),
  location:location_id ( id, name, address_line1, city, state, phone ),
  payments:payments ( * )
`

export async function listOrders(customerId: string): Promise<Order[]> {
  return select<Order>('orders', {
    filters: { customer_id: customerId },
    order: { column: 'placed_at', ascending: false },
  })
}

export async function getOrder(id: string): Promise<OrderDetail | null> {
  const rows = await select<OrderDetail>('orders', {
    select: ORDER_SELECT,
    filters: { id },
    range: { from: 0, to: 1 },
  })
  return rows[0] ?? null
}

export async function listOrderItems(orderId: string): Promise<OrderItem[]> {
  return select<OrderItem>('order_items', {
    filters: { order_id: orderId },
    order: { column: 'created_at', ascending: true },
  })
}

// ---------------------------------------------------------------------------
// Wishlist
// ---------------------------------------------------------------------------
export type WishlistItem = WishlistEntry & { product: ProductCatalogEntry | null }

export async function listWishlist(userId: string): Promise<WishlistItem[]> {
  const entries = await select<WishlistEntry>('wishlist_items', {
    filters: { user_id: userId },
    order: { column: 'created_at', ascending: false },
  })

  if (entries.length === 0) return []

  const products = await select<ProductCatalogEntry>('product_catalog', { select: '*' })
  const byId = new Map(products.map((p) => [p.id, p]))

  return entries.map((entry) => ({
    ...entry,
    product: byId.get(entry.product_id) ?? null,
  })) as WishlistItem[]
}

export async function toggleWishlist(userId: string, productId: string): Promise<boolean> {
  const existing = await select<{ id: string }>('wishlist_items', {
    select: 'id',
    filters: { user_id: userId, product_id: productId },
    range: { from: 0, to: 1 },
  })

  if (existing.length > 0) {
    const { error } = await getSupabase().from('wishlist_items').delete().eq('id', existing[0]!.id)
    if (error) throw ApiError.fromPostgrest(error)
    return false
  }

  const { error } = await getSupabase()
    .from('wishlist_items')
    .insert({ user_id: userId, product_id: productId })
  if (error) throw ApiError.fromPostgrest(error)
  return true
}

