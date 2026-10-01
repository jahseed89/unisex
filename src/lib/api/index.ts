/**
 * Public API surface for the data layer.
 *
 * Feature modules import from `@/lib/api` only. Nothing outside this folder
 * should construct a Supabase query by hand — that keeps PostgREST shapes,
 * error translation and cache invalidation in one place.
 */

export * from './db'
export * from './catalog'
export * from './booking'
export * from './commerce'
export * from './recruitment'
export * from './account'

// The admin module deliberately reuses several function names from the
// customer modules (listOrders, listProducts, listJobs). Exporting them
// individually keeps the two namespaces unambiguous for callers.
export {
  getDashboardStats,
  getDiary,
  getRequirementsForDiary,
  listBookings,
  addBookingInternalNote,
  setOrderStatus,
  recordOfflinePayment,
  listProductsAdmin,
  saveProduct,
  saveVariant,
  adjustStock,
  listInventoryMovements,
  listLowStock,
  listServicesAdmin,
  saveService,
  saveServiceVariant,
  listServiceCategoriesAdmin,
  saveServiceCategory,
  saveStaffProfile,
  listJobsAdmin,
  saveJob,
  listApplications,
  getApplicationAdmin,
  setApplicationStatus,
  listCustomers,
  listGalleryAdmin,
  saveGalleryItem,
  listLocationsAdmin,
  listProductCategoriesAdmin,
  type DiaryFilters,
  type CustomerSummary,
} from './admin'

export { ApiError, toApiError, isApiError, errorMessage } from '@/lib/supabase/errors'
export { getSupabase, supabase, invokeFunction, configurationNotice } from '@/lib/supabase/client'
export { qk, SLOT_KEY_PREFIX } from '@/lib/query/keys'
export { queryClient, resetQueryCache } from '@/lib/query/client'
