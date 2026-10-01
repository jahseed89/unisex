import { rpc, select, selectOne } from './db'
import type {
  BusinessSettings,
  Faq,
  GalleryItem,
  Page,
  PublicStaff,
  Review,
  SalonLocation,
  Service,
  ServiceCatalogEntry,
  ServiceCategory,
  ServiceVariant,
} from '@/types'

/**
 * Public catalogue reads. Every function here is reachable by anonymous
 * visitors — RLS scopes each to `status = 'active'` / `is_published`.
 */

// ---------------------------------------------------------------------------
// Business configuration
// ---------------------------------------------------------------------------
export async function getSettings(): Promise<BusinessSettings> {
  const row = await selectOne<BusinessSettings>('business_settings', {
    filters: { id: true },
  })
  if (!row) throw new Error('Business settings are not configured')
  return row
}

export async function getLocations(): Promise<SalonLocation[]> {
  return select<SalonLocation>('salon_locations', {
    filters: { is_active: true },
    order: { column: 'display_order', ascending: true },
  })
}

export async function getPrimaryLocation(): Promise<SalonLocation | null> {
  return selectOne<SalonLocation>('salon_locations', {
    filters: { is_primary: true, is_active: true },
  })
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------
export interface ServiceFilters {
  category?: string
  search?: string
  featuredOnly?: boolean
  limit?: number
}

export async function getServiceCategories(): Promise<ServiceCategory[]> {
  return select<ServiceCategory>('service_categories', {
    filters: { is_active: true },
    order: { column: 'display_order', ascending: true },
  })
}

export async function getServices(filters: ServiceFilters = {}): Promise<ServiceCatalogEntry[]> {
  const spec: string[] = [
    'id', 'slug', 'name', 'category_id', 'summary', 'description',
    'includes', 'excludes', 'aftercare',
    'duration_minutes', 'price_from', 'price_to', 'price_unit',
    'requires_consultation', 'requires_requirement', 'gender_restriction',
    'image_url', 'gallery_urls', 'badge', 'is_featured', 'is_popular',
    'rating_avg', 'rating_count', 'bookings_count',
  ]

  let query = await select<ServiceCatalogEntry>('service_catalog', { select: spec.join(',') })

  if (filters.category) {
    query = query.filter((s) => s.category_slug === filters.category!)
  }
  if (filters.featuredOnly) {
    query = query.filter((s) => s.is_featured)
  }
  if (filters.search) {
    const term = filters.search.toLowerCase()
    query = query.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        s.summary.toLowerCase().includes(term),
    )
  }
  if (filters.limit) {
    query = query.slice(0, filters.limit)
  }

  return sortByDisplayOrder(query)
}

export async function getServiceBySlug(slug: string): Promise<ServiceCatalogEntry | null> {
  const rows = await select<ServiceCatalogEntry>('service_catalog', {
    select: '*',
    filters: { slug },
    range: { from: 0, to: 1 },
  })
  return rows[0] ?? null
}

export async function getServiceVariants(serviceId: string): Promise<ServiceVariant[]> {
  return select<ServiceVariant>('service_variants', {
    filters: { service_id: serviceId, is_active: true },
    order: { column: 'display_order', ascending: true },
  })
}

/** Distinct services, de-duplicated from the per-variant catalog rows. */
function dedupeServices(rows: ServiceCatalogEntry[]): ServiceCatalogEntry[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    if (seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
}

function sortByDisplayOrder(rows: ServiceCatalogEntry[]): ServiceCatalogEntry[] {
  return dedupeServices(rows).sort((a, b) => a.display_order - b.display_order)
}

// ---------------------------------------------------------------------------
// Stylists
// ---------------------------------------------------------------------------
export async function getStylists(): Promise<PublicStaff[]> {
  const rows = await select<PublicStaff>('staff_public', {
    order: { column: 'rating_avg', ascending: false, nullsFirst: false },
  })
  return rows.filter((s) => s.is_bookable)
}

export async function getStylist(userId: string): Promise<PublicStaff | null> {
  const rows = await select<PublicStaff>('staff_public', {
    filters: { user_id: userId },
    range: { from: 0, to: 1 },
  })
  return rows[0] ?? null
}

/** Which stylists can perform a given service. */
export async function getStylistsForService(serviceId: string): Promise<string[]> {
  const rows = await select<{ staff_id: string }>('staff_services', {
    select: 'staff_id',
    filters: { service_id: serviceId, is_active: true },
  })
  return rows.map((r) => r.staff_id)
}

// ---------------------------------------------------------------------------
// Editorial content
// ---------------------------------------------------------------------------
export type GalleryCategory = GalleryItem['category']

export async function getGallery(category?: string): Promise<GalleryItem[]> {
  return select<GalleryItem>('gallery_items', {
    filters: { is_published: true, ...(category ? { category } : {}) },
    order: { column: 'display_order', ascending: true },
  })
}

export async function getFeaturedReviews(limit = 6): Promise<Review[]> {
  const reviews = await select<Review>('reviews', {
    filters: { status: 'published', is_featured: true },
    order: { column: 'created_at', ascending: false },
    range: { from: 0, to: limit - 1 },
  })

  // Reviews carry only ids; attach author and service names for display.
  const [profiles, services] = await Promise.all([
    safeMap(profilesById([...new Set(reviews.map((r) => r.customer_id).filter(Boolean))])),
    safeMap(servicesById([...new Set(reviews.map((r) => r.service_id).filter(Boolean))])),
  ])

  return reviews.map((review) => {
    const author = review.customer_id ? profiles[review.customer_id] : undefined
    const service = review.service_id ? services[review.service_id] : undefined
    return {
      ...review,
      author_name: author?.full_name ?? null,
      service_name: service?.name ?? null,
    }
  }) as Review[]
}

export async function getFaqs(category?: string): Promise<Faq[]> {
  return select<Faq>('faqs', {
    filters: { is_published: true, ...(category ? { category } : {}) },
    order: { column: 'display_order', ascending: true },
  })
}

export async function getPage(slug: string): Promise<Page | null> {
  const rows = await select<Page>('pages', {
    filters: { slug, is_published: true },
    range: { from: 0, to: 1 },
  })
  return rows[0] ?? null
}

/**
 * Aggregate availability across every published service. Used by the SEO
 * generator, which has no session and cannot call RLS-protected RPCs.
 */
export async function getServiceCounts(): Promise<Record<string, number>> {
  const rows = await select<Service>('services', {
    select: 'id, category_id',
    filters: { status: 'active' },
  })
  return { total: rows.length }
}

/** Count helper used by service-category landing pages. */
export async function countServicesInCategory(categorySlug: string): Promise<number> {
  const rows = await select<ServiceCatalogEntry>('service_catalog', {
    select: 'id, category_slug',
  })
  return new Set(rows.filter((r) => r.category_slug === categorySlug).map((r) => r.id)).size
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
async function profilesById(
  ids: (string | null)[],
): Promise<Record<string, { full_name: string | null; avatar_url: string | null }>> {
  const clean = ids.filter((id): id is string => Boolean(id))
  if (clean.length === 0) return {}
  const rows = await select<{ id: string; full_name: string | null; avatar_url: string | null }>(
    'profiles',
    { select: 'id, full_name, avatar_url', filters: { id: { in: clean } } },
  )
  return Object.fromEntries(rows.map((r) => [r.id, r]))
}

async function servicesById(
  ids: (string | null)[],
): Promise<Record<string, { name: string; slug: string }>> {
  const clean = ids.filter((id): id is string => Boolean(id))
  if (clean.length === 0) return {}
  const rows = await select<{ id: string; name: string; slug: string }>('services', {
    select: 'id, name, slug',
    filters: { id: { in: clean } },
  })
  return Object.fromEntries(rows.map((r) => [r.id, r]))
}

/** Reviews are non-critical; a lookup failure must not break the section. */
async function safeMap<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise
  } catch {
    return {} as T
  }
}

/** Review rows enriched for display, extending the base type locally. */
export type DisplayReview = Review & {
  author_name?: string | null
  service_name?: string | null
}

export { rpc }
