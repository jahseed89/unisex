/**
 * Query key factory.
 *
 * A single registry keeps invalidation honest: every `useMutation` in the app
 * invalidates through these factories rather than hand-writing strings, so a
 * rename cannot silently orphan a cache entry.
 */
/**
 * Builds a query-key segment, dropping undefined parts.
 * Preferred over `(x ? [...] : [...]) as const`, which TypeScript rejects
 * because `as const` only applies to literal references.
 */
const key = (...parts: (string | undefined)[]): readonly string[] =>
  parts.filter((part): part is string => part !== undefined)

export const qk = {
  // Public content
  settings: () => ['settings'] as const,
  locations: () => ['locations'] as const,

  serviceCategories: () => ['service-categories'] as const,
  services: (filters?: Record<string, unknown>) =>
    filters ? (['services', filters] as const) : (['services'] as const),
  servicesFlat: () => ['services'] as const,
  service: (slug: string) => ['service', slug] as const,
  serviceVariants: (serviceId: string) => ['service-variants', serviceId] as const,
  staff: () => ['staff'] as const,
  staffMember: (userId: string) => ['staff', userId] as const,
  staffServices: (serviceId: string) => ['staff-services', serviceId] as const,

  gallery: (category?: string) => key('gallery', category),
  reviews: (serviceId?: string) => key('reviews', serviceId),
  faqs: () => ['faqs'] as const,
  page: (slug: string) => ['page', slug] as const,

  // Booking
  slots: (serviceId: string, date: string, staffId?: string, variantId?: string) =>
    ['slots', serviceId, date, staffId ?? 'any', variantId ?? 'std'] as const,
  slotsRange: (serviceId: string, from: string, to: string, staffId?: string) =>
    ['slots-range', serviceId, from, to, staffId ?? 'any'] as const,

  // Session
  session: () => ['session'] as const,
  profile: (userId?: string) => ['profile', userId ?? 'me'] as const,

  // Account
  appointments: (userId: string, status?: string) => ['appointments', userId, status ?? 'all'] as const,
  appointment: (id: string) => ['appointment', id] as const,
  requirements: (userId: string) => ['requirements', userId] as const,
  orders: (userId: string) => ['orders', userId] as const,
  order: (id: string) => ['order', id] as const,
  wishlist: (userId: string) => ['wishlist', userId] as const,
  notifications: (userId: string) => ['notifications', userId] as const,
  unreadCount: (userId: string) => ['notifications', userId, 'count'] as const,

  // Commerce
  cart: (token?: string) => ['cart', token ?? 'session'] as const,
  productCategories: () => ['product-categories'] as const,
  products: (filters?: Record<string, unknown>) =>
    filters ? (['products', filters] as const) : (['products'] as const),
  product: (slug: string) => ['product', slug] as const,

  // Recruitment
  jobs: (filters?: { department?: string; search?: string }) =>
    filters && (filters.department || filters.search)
      ? (['jobs', filters] as const)
      : (['jobs'] as const),
  jobsFlat: () => ['jobs'] as const,
  job: (slug: string) => ['job', slug] as const,
  applications: () => ['applications'] as const,
  application: (id: string) => ['application', id] as const,

  // Staff / admin
  dashboard: (from: string, to: string) => ['dashboard', from, to] as const,
  staffDiary: (from: string, to: string, staffId?: string) =>
    ['staff-diary', from, to, staffId ?? 'all'] as const,
  adminBookings: (filters: Record<string, unknown>) => ['admin-bookings', filters] as const,
  adminOrders: (filters: Record<string, unknown>) => ['admin-orders', filters] as const,
  adminProducts: (filters?: Record<string, unknown>) =>
    filters ? (['admin-products', filters] as const) : (['admin-products'] as const),
  adminProduct: (id: string) => ['admin-product', id] as const,
  adminVariants: (productId: string) => ['admin-variants', productId] as const,
  inventory: (variantId?: string) => ['inventory', variantId ?? 'all'] as const,
  adminApplications: (filters: Record<string, unknown>) => ['admin-applications', filters] as const,
  adminJobs: () => ['admin-jobs'] as const,
  adminCustomers: (filters?: Record<string, unknown>) =>
    filters ? (['admin-customers', filters] as const) : (['admin-customers'] as const),
  notificationsAdmin: (filters: Record<string, unknown>) => ['admin-notifications', filters] as const,
  auditLog: (entityType?: string) => key('audit-log', entityType ?? 'all'),
} as const

/**
 * Slots are derived from location hours, staff rules and existing bookings, so
 * any booking mutation must invalidate them. Used as a partial matcher.
 */
export const SLOT_KEY_PREFIX = 'slots' as const
