import { insert, remove, rpc, rpcOne, select, selectPaginated, selectOne, update, upsert } from './db'
import type {
  Appointment,
  AppointmentDetail,
  ApplicationEvent,
  DashboardStats,
  GalleryItem,
  InventoryMovement,
  Job,
  JobApplication,
  Order,
  OrderDetail,
  Product,
  ProductCategory,
  ProductVariant,
  Service,
  ServiceCategory,
  ServiceVariant,
  StaffProfile,
  SalonLocation,
} from '@/types'

/**
 * Staff and administrator operations.
 *
 * RLS is the authority on every function here — each is scoped to the caller's
 * role, and the mutation endpoints re-check permissions server-side.
 */

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export async function getDashboardStats(from: string, to: string): Promise<DashboardStats> {
  return rpc<DashboardStats>('fn_admin_dashboard_stats', {
    p_from: from,
    p_to: to,
  })
}

// ---------------------------------------------------------------------------
// Diary
// ---------------------------------------------------------------------------
export interface DiaryFilters {
  from: string
  to: string
  staffId?: string
  status?: string
  locationId?: string
}

/**
 * A single stylist's diary. Staff may only ever read their own — RLS enforces
 * that, so no client-side filtering is required.
 */
export async function getDiary(filters: DiaryFilters): Promise<AppointmentDetail[]> {
  return select<AppointmentDetail>('appointments', {
    select: `
      *,
      service:service_id ( id, slug, name, summary, duration_minutes ),
      staff:staff_id ( user_id, full_name, title, photo_url ),
      location:location_id ( id, name, slug ),
      requirement:requirements!appointment_id (
        id, status, desired_style, desired_colour, hair_goals,
        scalp_conditions, allergies, submitted_at
      )
    `,
    filters: {
      starts_at: { gte: `${filters.from}T00:00:00` },
      ends_at: { lte: `${filters.to}T23:59:59` },
      ...(filters.staffId ? { staff_id: filters.staffId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.locationId ? { location_id: filters.locationId } : {}),
    },
    order: { column: 'starts_at', ascending: true },
  })
}

/** Requirements awaiting the stylist's attention. */
export async function getRequirementsForDiary(
  from: string,
  to: string,
): Promise<AppointmentDetail[]> {
  return select<AppointmentDetail>('appointments', {
    select: `
      *,
      service:service_id ( id, slug, name ),
      staff:staff_id ( user_id, full_name, title, photo_url ),
      customer:customer_id ( id, full_name, email, phone_e164 ),
      requirement:requirements!appointment_id (
        *, media:requirement_media ( * )
      )
    `,
    filters: {
      ...(from && { starts_at: { gte: `${from}T00:00:00` } }),
      ...(to && { ends_at: { lte: `${to}T23:59:59` } }),
      status: { in: ['pending', 'confirmed'] },
    },
    order: { column: 'starts_at', ascending: true },
  })
}

// ---------------------------------------------------------------------------
// Bookings administration
// ---------------------------------------------------------------------------
export async function listBookings(
  filters: Record<string, unknown>,
  page = 1,
  pageSize = 25,
): Promise<{ data: AppointmentDetail[]; count: number }> {
  return selectPaginated<AppointmentDetail>('appointments', {
    page,
    pageSize,
    select: `
      *,
      service:service_id ( id, slug, name, summary ),
      staff:staff_id ( user_id, full_name, title, photo_url ),
      location:location_id ( id, name, slug ),
      customer:customer_id ( id, full_name, email, phone_e164 )
    `,
    filters: {
      ...(filters.status ? { status: { in: String(filters.status).split(',') } } : {}),
      ...(filters.staffId ? { staff_id: filters.staffId } : {}),
      ...(filters.locationId ? { location_id: filters.locationId } : {}),
      // A to-bound is applied to starts_at so an appointment that runs past
      // midnight still appears on the day it began.
      ...(filters.from ? { starts_at: { gte: `${filters.from}T00:00:00` } } : {}),
      ...(filters.to ? { starts_at: { lte: `${filters.to}T23:59:59` } } : {}),
    },
    order: { column: 'starts_at', ascending: false },
  })
}

export async function addBookingInternalNote(appointmentId: string, note: string): Promise<Appointment> {
  return update<Appointment>('appointments', appointmentId, { internal_notes: note })
}

// ---------------------------------------------------------------------------
// Orders administration
// ---------------------------------------------------------------------------
/**
 * Paged, filtered order list for staff. Distinct from the customer-scoped
 * listOrders() in commerce.ts — hence the suffix.
 */
export async function listOrdersAdmin(
  filters: Record<string, unknown>,
  page = 1,
  pageSize = 25,
): Promise<{ data: OrderDetail[]; count: number }> {
  return selectPaginated<OrderDetail>('orders', {
    page,
    pageSize,
    select: `
      *,
      items:order_items ( * ),
      location:location_id ( id, name, city ),
      payments:payments ( * )
    `,
    filters: {
      ...(filters.status ? { status: { in: String(filters.status).split(',') } } : {}),
      ...(filters.paymentStatus ? { payment_status: filters.paymentStatus } : {}),
      ...(filters.locationId ? { location_id: filters.locationId } : {}),
    },
    order: { column: 'placed_at', ascending: false },
  })
}

export async function setOrderStatus(input: {
  orderId: string
  status: Order['status']
  note?: string
  tracking?: string
  courier?: string
}): Promise<Order> {
  return rpc<Order>('fn_set_order_status', {
    p_order_id: input.orderId,
    p_status: input.status,
    p_note: input.note ?? null,
    p_tracking: input.tracking ?? null,
    p_courier: input.courier ?? null,
  })
}

export async function recordOfflinePayment(input: {
  orderId: string
  amount: number
  provider: 'cash' | 'pos' | 'bank_transfer' | 'moniepoint'
  reference?: string
  note?: string
}): Promise<{ id: string }> {
  return rpc('fn_record_offline_payment', {
    p_order_id: input.orderId,
    p_amount: input.amount,
    p_provider: input.provider,
    p_reference: input.reference ?? null,
    p_note: input.note ?? null,
  })
}

// ---------------------------------------------------------------------------
// Product & inventory administration
// ---------------------------------------------------------------------------
export async function listProductsAdmin(
  filters: { search?: string; status?: string; categoryId?: string } = {},
  page = 1,
  pageSize = 25,
): Promise<{ data: Product[]; count: number }> {
  return selectPaginated<Product>('products', {
    page,
    pageSize,
    filters: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.categoryId ? { category_id: filters.categoryId } : {}),
      ...(filters.search
        ? { name: { ilike: `%${filters.search}%` } }
        : {}),
    },
    order: { column: 'created_at', ascending: false },
  })
}

export async function saveProduct(input: Partial<Product> & { id?: string }): Promise<Product> {
  if (input.id) return update<Product>('products', input.id, input)
  return upsert<Product>('products', input)
}

export async function saveVariant(input: Partial<ProductVariant> & { id?: string }): Promise<ProductVariant> {
  if (input.id) return update<ProductVariant>('product_variants', input.id, input)
  return upsert<ProductVariant>('product_variants', input)
}

export async function adjustStock(input: {
  variantId: string
  delta: number
  reason: 'restock' | 'adjustment' | 'wastage' | 'damage' | 'return' | 'transfer'
  note?: string
}): Promise<ProductVariant> {
  return rpc<ProductVariant>('fn_adjust_stock', {
    p_variant_id: input.variantId,
    p_delta: input.delta,
    p_reason: input.reason,
    p_note: input.note ?? null,
    p_reference_type: null,
    p_reference_id: null,
  })
}

export async function listInventoryMovements(
  variantId?: string,
  limit = 100,
): Promise<InventoryMovement[]> {
  return select<InventoryMovement>('inventory_movements', {
    filters: variantId ? { variant_id: variantId } : {},
    order: { column: 'created_at', ascending: false },
    range: { from: 0, to: limit - 1 },
  })
}

/** Variants at or below their reorder threshold. */
export async function listLowStock(): Promise<(ProductVariant & { product_name?: string })[]> {
  const variants = await select<ProductVariant>('product_variants', {
    filters: { is_active: true },
  })
  const low = variants.filter((v) => v.stock_on_hand <= v.low_stock_threshold)

  if (low.length === 0) return []

  const products = await select<Product>('products', {
    select: 'id, name, slug',
    filters: { id: { in: [...new Set(low.map((v) => v.product_id))] } },
  })
  const names = new Map(products.map((p) => [p.id, p.name]))

  return low.map((v) => ({ ...v, product_name: names.get(v.product_id) ?? '' }))
}

// ---------------------------------------------------------------------------
// Service administration
// ---------------------------------------------------------------------------
export async function listServicesAdmin(
  filters: { search?: string; status?: string; categoryId?: string } = {},
): Promise<Service[]> {
  return select<Service>('services', {
    filters: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.categoryId ? { category_id: filters.categoryId } : {}),
      ...(filters.search ? { name: { ilike: `%${filters.search}%` } } : {}),
    },
    order: { column: 'display_order', ascending: true },
  })
}

export async function saveService(input: Partial<Service> & { id?: string }): Promise<Service> {
  if (input.id) return update<Service>('services', input.id, input)
  return upsert<Service>('services', input)
}

export async function saveServiceVariant(
  input: Partial<ServiceVariant> & { id?: string },
): Promise<ServiceVariant> {
  if (input.id) return update<ServiceVariant>('service_variants', input.id, input)
  return upsert<ServiceVariant>('service_variants', input)
}

export async function listServiceCategoriesAdmin(): Promise<ServiceCategory[]> {
  return select<ServiceCategory>('service_categories', {
    order: { column: 'display_order', ascending: true },
  })
}

export async function saveServiceCategory(
  input: Partial<ServiceCategory> & { id?: string },
): Promise<ServiceCategory> {
  if (input.id) return update<ServiceCategory>('service_categories', input.id, input)
  return upsert<ServiceCategory>('service_categories', input)
}

export async function saveStaffProfile(
  input: Partial<StaffProfile> & { user_id: string },
): Promise<StaffProfile> {
  return upsert<StaffProfile>('staff_profiles', input)
}

// ---------------------------------------------------------------------------
// Recruitment administration
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Deletes
//
// Each returns a boolean: false means the row was rejected by a database
// guard (for example a foreign key from an existing booking), which the UI
// should present as "archive instead of delete".
// ---------------------------------------------------------------------------

export async function deleteService(id: string): Promise<boolean> {
  try {
    await remove('services', id)
    return true
  } catch {
    return false
  }
}

export async function deleteServiceVariant(id: string): Promise<boolean> {
  try {
    await remove('service_variants', id)
    return true
  } catch {
    return false
  }
}

export async function deleteServiceCategory(id: string): Promise<boolean> {
  try {
    await remove('service_categories', id)
    return true
  } catch {
    return false
  }
}

export async function deleteProductVariant(id: string): Promise<boolean> {
  try {
    await remove('product_variants', id)
    return true
  } catch {
    return false
  }
}

/** A product with order history must be archived, not deleted. */
export async function deleteProduct(id: string): Promise<boolean> {
  try {
    await remove('products', id)
    return true
  } catch {
    return false
  }
}

export async function listJobsAdmin(status?: string): Promise<Job[]> {
  return select<Job>('jobs', {
    filters: status ? { status } : {},
    order: { column: 'published_at', ascending: false },
  })
}

export async function saveJob(input: Partial<Job> & { id?: string }): Promise<Job> {
  if (input.id) return update<Job>('jobs', input.id, input)
  return upsert<Job>('jobs', input)
}

export async function listApplications(
  filters: { jobId?: string; status?: string; search?: string } = {},
  page = 1,
  pageSize = 25,
): Promise<{ data: JobApplication[]; count: number }> {
  return selectPaginated<JobApplication>('job_applications', {
    page,
    pageSize,
    select: '*',
    filters: {
      ...(filters.jobId ? { job_id: filters.jobId } : {}),
      ...(filters.status ? { status: { in: filters.status.split(',') } } : {}),
      ...(filters.search ? { full_name: { ilike: `%${filters.search}%` } } : {}),
    },
    order: { column: 'submitted_at', ascending: false },
  })
}

export async function getApplicationAdmin(id: string): Promise<
  (JobApplication & { job: Job | null; events: ApplicationEvent[] }) | null
> {
  const application = await selectOne<JobApplication>('job_applications', {
    filters: { id },
    range: { from: 0, to: 1 },
  })
  if (!application) return null

  const [job, events] = await Promise.all([
    selectOne<Job>('jobs', { filters: { id: application.job_id }, range: { from: 0, to: 1 } }),
    select<ApplicationEvent>('application_events', {
      filters: { application_id: id },
      order: { column: 'created_at', ascending: true },
    }),
  ])

  return { ...application, job, events }
}

export async function setApplicationStatus(input: {
  applicationId: string
  status: JobApplication['status']
  note?: string
  rating?: number
  interviewAt?: string
}): Promise<JobApplication> {
  return rpc<JobApplication>('fn_set_application_status', {
    p_application_id: input.applicationId,
    p_status: input.status,
    p_note: input.note ?? null,
    p_rating: input.rating ?? null,
    p_interview_at: input.interviewAt ?? null,
  })
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
export interface CustomerSummary {
  id: string
  full_name: string | null
  email: string
  phone_e164: string | null
  status: string
  created_at: string
  appointment_count: number
  order_count: number
  lifetime_value: number
}

export async function listCustomers(
  filters: { search?: string } = {},
  page = 1,
  pageSize = 25,
): Promise<{ data: CustomerSummary[]; count: number }> {
  const { data, count } = await selectPaginated<{
    id: string
    full_name: string | null
    email: string
    phone_e164: string | null
    status: string
    created_at: string
  }>('profiles', {
    page,
    pageSize,
    select: 'id, full_name, email, phone_e164, status, created_at',
    filters: {
      ...(filters.search ? { email: { ilike: `%${filters.search}%` } } : {}),
    },
    order: { column: 'created_at', ascending: false },
  })

  if (data.length === 0) return { data: [], count }

  const ids = data.map((r) => r.id)

  const [appointments, orders] = await Promise.all([
    select<{ customer_id: string; total: number }>('appointments', {
      select: 'customer_id, total',
      filters: { customer_id: { in: ids }, status: 'completed' },
    }),
    select<{ customer_id: string; total: number }>('orders', {
      select: 'customer_id, total',
      filters: { customer_id: { in: ids }, payment_status: 'paid' },
    }),
  ])

  const apptCounts = new Map<string, { count: number; value: number }>()
  for (const row of appointments) {
    const entry = apptCounts.get(row.customer_id) ?? { count: 0, value: 0 }
    entry.count += 1
    entry.value += Number(row.total)
    apptCounts.set(row.customer_id, entry)
  }

  const orderCounts = new Map<string, { count: number; value: number }>()
  for (const row of orders) {
    const entry = orderCounts.get(row.customer_id) ?? { count: 0, value: 0 }
    entry.count += 1
    entry.value += Number(row.total)
    orderCounts.set(row.customer_id, entry)
  }

  return {
    count,
    data: data.map((row) => {
      const a = apptCounts.get(row.id)
      const o = orderCounts.get(row.id)
      return {
        ...row,
        appointment_count: a?.count ?? 0,
        order_count: o?.count ?? 0,
        lifetime_value: (a?.value ?? 0) + (o?.value ?? 0),
      }
    }),
  }
}

// ---------------------------------------------------------------------------
// Gallery, locations, product categories
// ---------------------------------------------------------------------------
export async function listGalleryAdmin(): Promise<GalleryItem[]> {
  return select<GalleryItem>('gallery_items', {
    order: { column: 'display_order', ascending: true },
  })
}

export async function saveGalleryItem(
  input: Partial<GalleryItem> & { id?: string },
): Promise<GalleryItem> {
  if (input.id) return update<GalleryItem>('gallery_items', input.id, input)
  return insert<GalleryItem>('gallery_items', input)
}

export async function listLocationsAdmin(): Promise<SalonLocation[]> {
  return select<SalonLocation>('salon_locations', {
    order: { column: 'display_order', ascending: true },
  })
}

export async function listProductCategoriesAdmin(): Promise<ProductCategory[]> {
  return select<ProductCategory>('product_categories', {
    order: { column: 'display_order', ascending: true },
  })
}

export { rpcOne, type ApplicationEvent }
