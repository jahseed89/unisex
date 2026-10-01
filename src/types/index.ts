/**
 * Domain types.
 *
 * These mirror the Postgres schema exactly. In a connected project, regenerate
 * with `npm run supabase:types` and replace this file, keeping the hand-written
 * view/row-type aliases at the bottom.
 *
 * Naming follows the database: `snake_case` columns on rows, because the client
 * reads them straight from PostgREST. Domain-shaped inputs and UI state use
 * camelCase.
 */

// ---------------------------------------------------------------------------
// Enums (mirror of the Postgres enum values)
// ---------------------------------------------------------------------------
export type UserGender = 'female' | 'male' | 'non_binary' | 'other' | 'prefer_not_to_say'
export type HairTexture = 'straight' | 'wavy' | 'curly' | 'coily' | 'kinky'
export type HairClass = 'human' | 'synthetic' | 'blend' | 'vegan'
export type RoleKey = 'customer' | 'staff' | 'supervisor' | 'admin'

export type AppointmentStatus =
  | 'draft'
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled'

export type BookingSource = 'web' | 'phone' | 'whatsapp' | 'walk_in' | 'admin' | 'recurring'

export type RequirementStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'changes_requested'
  | 'closed'

export type ProductKind = 'wig' | 'extension' | 'hair_care' | 'styling' | 'accessory' | 'tool' | 'treatment'
export type ProductStatus = 'draft' | 'active' | 'archived'
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'ready_for_pickup'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'returned'
  | 'refunded'
export type FulfilmentType = 'pickup' | 'delivery'
export type PaymentStatus =
  | 'unpaid'
  | 'awaiting_payment'
  | 'partially_paid'
  | 'paid'
  | 'refunded'
  | 'partially_refunded'
  | 'failed'
  | 'voided'
export type PaymentProvider =
  | 'paystack'
  | 'flutterwave'
  | 'moniepoint'
  | 'bank_transfer'
  | 'cash'
  | 'pos'
  | 'waived'

export type JobStatus = 'draft' | 'open' | 'on_hold' | 'closed' | 'archived'
export type EmploymentType =
  | 'full_time'
  | 'part_time'
  | 'contract'
  | 'internship'
  | 'apprenticeship'
  | 'freelance'
export type ApplicationStatus =
  | 'submitted'
  | 'screening'
  | 'shortlisted'
  | 'interview_scheduled'
  | 'interviewed'
  | 'offer'
  | 'hired'
  | 'rejected'
  | 'withdrawn'

export type ReviewStatus = 'pending' | 'published' | 'rejected' | 'flagged'
export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'whatsapp' | 'push'
export type NotificationCategory = 'general' | 'booking' | 'commerce' | 'recruitment' | 'system' | 'promotional'

// ---------------------------------------------------------------------------
// Core rows
// ---------------------------------------------------------------------------
export interface Profile {
  id: string
  email: string
  full_name: string | null
  slug: string | null
  phone_e164: string | null
  phone_verified_at: string | null
  avatar_url: string | null
  cover_url: string | null
  gender: UserGender | null
  date_of_birth: string | null
  bio: string | null
  hair_class: HairClass | null
  hair_texture: HairTexture | null
  allergies: string[]
  accessibility_needs: string | null
  locale: string
  marketing_opt_in: boolean
  whatsapp_opt_in: boolean
  sms_opt_in: boolean
  email_opt_in: boolean
  status: 'active' | 'suspended' | 'deleted'
  onboarding_step: 'profile' | 'preferences' | 'complete'
  created_at: string
  updated_at: string
}

export interface Role {
  id: number
  key: RoleKey
  name: string
  description: string | null
  capabilities: string[]
  rank: number
}

export interface StaffProfile {
  user_id: string
  slug: string | null
  title: string | null
  headline: string | null
  bio: string | null
  photo_url: string | null
  portfolio_urls: string[]
  specialities: string[]
  employment_type: EmploymentType | null
  is_bookable: boolean
  accepts_walk_ins: boolean
  max_daily_bookings: number
  hired_on: string | null
  employment_end_on: string | null
  rating_avg: number | null
  rating_count: number
}

/** Row shape of the `staff_public` view — safe to expose to anonymous users. */
export type PublicStaff = Pick<
  StaffProfile,
  'user_id' | 'title' | 'headline' | 'bio' | 'photo_url' | 'portfolio_urls' |
  'specialities' | 'employment_type' | 'is_bookable' | 'accepts_walk_ins' | 'rating_avg' | 'rating_count'
> & {
  full_name: string
  slug: string | null
}

export interface SalonLocation {
  id: string
  name: string
  slug: string
  address_line1: string
  address_line2: string | null
  city: string
  state: string
  country: string
  postal_code: string | null
  latitude: string | null
  longitude: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  timezone: string
  is_primary: boolean
  is_active: boolean
  display_order: number
}

export interface BusinessSettings {
  business_name: string
  legal_name: string | null
  tagline: string | null
  currency: string
  tax_pct: number
  tax_inclusive: boolean
  booking_lead_time_hours: number
  max_advance_days: number
  min_notice_hours: number
  cancellation_window_hours: number
  deposit_required: boolean
  deposit_pct: number
  free_delivery_threshold: number | null
  standard_delivery_fee: number
  accepts_delivery: boolean
  accepts_pickup: boolean
  support_email: string | null
  support_phone: string | null
  whatsapp_number: string | null
  instagram: string | null
  facebook: string | null
  tiktok: string | null
  x_twitter: string | null
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
export interface ServiceCategory {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  image_url: string | null
  display_order: number
  is_active: boolean
}

export interface Service {
  id: string
  slug: string
  name: string
  category_id: string | null
  summary: string
  description: string | null
  includes: string[]
  excludes: string[]
  aftercare: string[]
  duration_minutes: number
  buffer_minutes: number
  price_from: number
  price_to: number | null
  price_unit: string
  requires_consultation: boolean
  requires_requirement: boolean
  gender_restriction: UserGender | null
  image_url: string | null
  gallery_urls: string[]
  badge: string | null
  is_featured: boolean
  is_popular: boolean
  display_order: number
  status: 'draft' | 'active' | 'archived'
  rating_avg: number | null
  rating_count: number
  bookings_count: number
}

export interface ServiceVariant {
  id: string
  service_id: string
  slug: string
  label: string
  description: string | null
  price: number
  duration_minutes: number
  display_order: number
  is_active: boolean
}

/** Row shape of the `service_catalog` view. */
export interface ServiceCatalogEntry extends Service {
  category_name: string | null
  category_slug: string | null
  variant_id: string | null
  variant_name: string | null
  variant_price: number | null
  variant_duration: number | null
}

export interface GalleryItem {
  id: string
  title: string | null
  slug: string | null
  category: string
  image_url: string
  before_image_url: string | null
  after_image_url: string | null
  alt_text: string | null
  stylist_id: string | null
  service_id: string | null
  tags: string[]
  is_featured: boolean
  display_order: number
  is_published: boolean
}

export interface Review {
  id: string
  customer_id: string | null
  appointment_id: string | null
  service_id: string | null
  staff_id: string | null
  product_id: string | null
  rating: number
  title: string | null
  body: string
  image_urls: string[]
  staff_reply: string | null
  replied_at: string | null
  status: ReviewStatus
  is_featured: boolean
  created_at: string
}

export interface Faq {
  id: string
  question: string
  answer: string
  category: string
  display_order: number
  is_published: boolean
}

export interface Page {
  id: string
  slug: string
  title: string
  eyebrow: string | null
  excerpt: string | null
  body_md: string | null
  hero_image_url: string | null
  is_published: boolean
  meta_title: string | null
  meta_description: string | null
  published_at: string | null
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------
export interface Appointment {
  id: string
  reference: string
  customer_id: string
  service_id: string
  service_variant_id: string | null
  staff_id: string | null
  location_id: string
  starts_at: string
  ends_at: string
  duration_minutes: number
  buffer_minutes: number
  status: AppointmentStatus
  payment_status: PaymentStatus
  source: BookingSource
  subtotal: number
  discount: number
  total: number
  deposit_required: boolean
  deposit_amount: number
  deposit_paid: number
  balance_due: number
  customer_notes: string | null
  internal_notes: string | null
  cancellation_reason: string | null
  confirmed_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  rescheduled_from_id: string | null
  created_at: string
}

/** An appointment joined with its display relations, as used by every screen. */
export interface AppointmentDetail extends Appointment {
  service: Pick<Service, 'id' | 'slug' | 'name' | 'summary' | 'duration_minutes' | 'image_url'> | null
  variant: Pick<ServiceVariant, 'id' | 'label' | 'price'> | null
  staff: Pick<PublicStaff, 'user_id' | 'full_name' | 'title' | 'photo_url'> | null
  customer: Pick<Profile, 'id' | 'full_name' | 'email' | 'phone_e164' | 'avatar_url'> | null
  location: Pick<SalonLocation, 'id' | 'name' | 'slug' | 'address_line1' | 'city' | 'state'> | null
  requirement: Requirement | null
}

export interface Slot {
  starts_at: string
  ends_at: string
  staff_id: string
  staff_name: string
  staff_title: string | null
  staff_photo_url: string | null
  price: number
  staff_count: number
}

export interface AppointmentStatusEvent {
  id: number
  appointment_id: string
  from_status: AppointmentStatus | null
  to_status: AppointmentStatus
  actor_id: string | null
  note: string | null
  created_at: string
}

export interface Requirement {
  id: string
  appointment_id: string
  customer_id: string
  current_length: string | null
  current_texture: HairTexture | null
  current_colour: string | null
  current_density: number | null
  last_treated_at: string | null
  last_treatment: string | null
  desired_style: string
  desired_length: string | null
  desired_texture: HairTexture | null
  desired_colour: string | null
  hair_goals: string[]
  inspiration_notes: string | null
  allergies: string[]
  scalp_conditions: string[]
  medications: string | null
  accessibility_needs: string | null
  patch_test_done: boolean
  patch_test_at: string | null
  budget_min: number | null
  budget_max: number | null
  is_flexible_on_date: boolean
  status: RequirementStatus
  submitted_at: string | null
  staff_response: string | null
  created_at: string
  updated_at: string
}

export interface RequirementMedia {
  id: string
  requirement_id: string
  storage_path: string
  public_url: string
  kind: 'reference' | 'current_state' | 'inspiration' | 'after'
  caption: string | null
  width: number | null
  height: number | null
  bytes: number | null
  mime_type: string | null
  sort_order: number
  created_at: string
}

/** Client-side shape of the requirements form. */
export interface RequirementDraft {
  current_length?: string
  current_texture?: HairTexture | ''
  current_colour?: string
  current_density?: number
  last_treated_at?: string
  last_treatment?: string
  desired_style: string
  desired_length?: string
  desired_texture?: HairTexture | ''
  desired_colour?: string
  hair_goals?: string[]
  inspiration_notes?: string
  allergies?: string[]
  scalp_conditions?: string[]
  medications?: string
  accessibility_needs?: string
  patch_test_done?: boolean
  patch_test_at?: string
  budget_min?: number
  budget_max?: number
  is_flexible_on_date?: boolean
}

// ---------------------------------------------------------------------------
// Commerce
// ---------------------------------------------------------------------------
export interface ProductCategory {
  id: string
  slug: string
  name: string
  description: string | null
  parent_id: string | null
  image_url: string | null
  display_order: number
  is_active: boolean
}

export interface Product {
  id: string
  slug: string
  name: string
  kind: ProductKind
  category_id: string | null
  brand: string | null
  summary: string
  description: string | null
  ingredients: string[]
  benefits: string[]
  how_to_use: string[]
  care_instructions: string | null
  base_price: number
  compare_at_price: number | null
  hair_class: HairClass | null
  hair_texture: HairTexture | null
  length_cm: number | null
  weight_g: number | null
  cap_construction: string | null
  is_pre_stretched: boolean
  is_glueless: boolean
  image_url: string | null
  gallery_urls: string[]
  video_url: string | null
  /** Withheld from the browser by column-level grants; server-side only. */
  cost_price: number | null
  tax_rate: number
  meta_title: string | null
  meta_description: string | null
  status: ProductStatus
  is_featured: boolean
  is_best_seller: boolean
  display_order: number
  published_at: string | null
  created_at: string
  rating_avg: number | null
  rating_count: number
  sold_count: number
}

/** A saved product in the customer's wishlist. */
export interface WishlistEntry {
  id: string
  user_id: string
  product_id: string
  created_at: string
}

/** Row shape of the `product_catalog` view (one row per purchasable variant). */
export interface ProductCatalogEntry extends Product {
  category_name: string | null
  category_slug: string | null
  variant_id: string | null
  sku: string | null
  variant_name: string | null
  attributes: Record<string, string | number>
  variant_price: number | null
  variant_compare_at_price: number | null
  available_stock: number
  stock_on_hand: number
  is_default_variant: boolean
  variant_image_url: string | null
}

export interface ProductVariant {
  id: string
  product_id: string
  sku: string
  slug: string
  name: string
  attributes: Record<string, string | number>
  price: number
  compare_at_price: number | null
  stock_on_hand: number
  stock_reserved: number
  safety_stock: number
  low_stock_threshold: number
  backorder_allowed: boolean
  weight_grams: number | null
  image_url: string | null
  is_default: boolean
  is_active: boolean
}

export interface InventoryMovement {
  id: number
  variant_id: string
  product_id: string | null
  delta: number
  balance_after: number
  reason: string
  reference_type: string | null
  reference_id: string | null
  note: string | null
  actor_id: string | null
  created_at: string
}

export interface CartLine {
  id: string
  variant_id: string
  product_id: string
  quantity: number
  unit_price: number
  line_total: number
  sku: string
  variant_name: string
  attributes: Record<string, string | number>
  image_url: string | null
  product_slug: string
  product_name: string
  kind: ProductKind
  available_stock: number
  exceeds_stock: boolean
}

export interface CartTotals {
  subtotal: number
  discount: number
  shipping: number
  tax: number
  total: number
  item_count: number
  free_shipping_threshold: number | null
  coupon_code: string | null
  coupon_message: string | null
}

export interface CartPayload {
  cart: { id: string; coupon_code: string | null; currency: string } | null
  items: CartLine[]
  totals: CartTotals
}

export interface Order {
  id: string
  order_number: string
  customer_id: string | null
  status: OrderStatus
  fulfilment_type: FulfilmentType
  location_id: string | null
  subtotal: number
  discount_total: number
  shipping_total: number
  tax_total: number
  total: number
  paid_total: number
  refund_total: number
  currency: string
  payment_status: PaymentStatus
  coupon_code: string | null
  contact_name: string
  contact_email: string
  contact_phone: string
  delivery_address: DeliveryAddress | null
  delivery_notes: string | null
  customer_notes: string | null
  internal_notes: string | null
  cancel_reason: string | null
  tracking_number: string | null
  courier: string | null
  placed_at: string
  confirmed_at: string | null
  fulfilled_at: string | null
  cancelled_at: string | null
}

export interface OrderDetail extends Order {
  items: OrderItem[]
  location: Pick<SalonLocation, 'id' | 'name' | 'address_line1' | 'city' | 'state' | 'phone'> | null
  payments: Payment[]
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string | null
  variant_id: string | null
  name_snapshot: string
  variant_snapshot: string | null
  sku_snapshot: string | null
  image_snapshot: string | null
  attributes: Record<string, string | number>
  unit_price: number
  quantity: number
  line_total: number
  fulfilled_qty: number
  refunded_qty: number
}

export interface DeliveryAddress {
  line1?: string
  line2?: string
  city?: string
  state?: string
  landmark?: string
  phone?: string
}

export interface Payment {
  id: string
  reference: string
  customer_id: string | null
  order_id: string | null
  appointment_id: string | null
  provider: PaymentProvider
  provider_reference: string | null
  amount: number
  refunded_amount: number
  currency: string
  status: PaymentStatus
  channel: string | null
  purpose: string
  paid_at: string | null
  created_at: string
}

export interface CouponPreview {
  is_valid: boolean
  message: string
  discount_amount: number
  coupon_code: string | null
}

// ---------------------------------------------------------------------------
// Recruitment
// ---------------------------------------------------------------------------
export interface Job {
  id: string
  slug: string
  title: string
  department: string | null
  employment_type: EmploymentType
  location_id: string | null
  is_remote: boolean
  is_hybrid: boolean
  summary: string
  description: string
  responsibilities: string[]
  requirements: string[]
  nice_to_have: string[]
  benefits: string[]
  salary_min: number | null
  salary_max: number | null
  salary_currency: string
  salary_period: string
  is_disclosed: boolean
  openings: number
  filled_count: number
  min_experience_years: number | null
  status: JobStatus
  is_featured: boolean
  published_at: string | null
  closes_at: string | null
  screening_questions: ScreeningQuestion[]
  views_count: number
}

export interface ScreeningQuestion {
  key: string
  label: string
  type: 'text' | 'textarea' | 'url' | 'date' | 'select' | 'tel' | 'email' | 'number'
  required?: boolean
  options?: string[]
  placeholder?: string
}

export interface JobApplication {
  id: string
  reference: string
  job_id: string
  applicant_id: string | null
  full_name: string
  email: string
  phone_e164: string | null
  location: string | null
  cover_letter: string | null
  portfolio_url: string | null
  portfolio_urls: string[]
  cv_path: string | null
  cv_file_name: string | null
  cv_bytes: number | null
  answers: Record<string, string>
  experience_years: number | null
  status: ApplicationStatus
  stage_notes: string | null
  rating: number | null
  interview_at: string | null
  submitted_at: string
  reviewed_at: string | null
}

export interface ApplicationEvent {
  id: number
  application_id: string
  from_status: ApplicationStatus | null
  to_status: ApplicationStatus
  actor_id: string | null
  note: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export interface AppNotification {
  id: string
  recipient_id: string
  type: string
  category: NotificationCategory
  title: string
  body: string | null
  action_url: string | null
  action_label: string | null
  icon: string | null
  priority: 'low' | 'normal' | 'high' | 'critical'
  data: Record<string, unknown>
  is_read: boolean
  read_at: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export interface AuthUser {
  id: string
  email: string | null
  phone: string | null
  created_at: string
  email_confirmed_at?: string | null
  user_metadata: Record<string, unknown>
}

/** What the UI needs to make authorisation decisions. */
export interface SessionState {
  user: AuthUser | null
  profile: Profile | null
  roles: RoleKey[]
  isAuthenticated: boolean
  isStaff: boolean
  isAdmin: boolean
  isLoading: boolean
}

// ---------------------------------------------------------------------------
// Dashboard aggregates (fn_admin_dashboard_stats)
// ---------------------------------------------------------------------------
export interface DashboardSeriesPoint {
  day: string
  service_revenue: number
  product_revenue: number
  appointments: number
}

export interface DashboardStats {
  range: { from: string; to: string }
  appointments: {
    total: number
    completed: number
    cancelled: number
    no_show: number
    upcoming: number
    revenue: number
  }
  revenue: { services: number; products: number; collected: number }
  commerce: {
    orders: number
    open_orders: number
    units_sold: number
    low_stock: number
    out_of_stock: number
  }
  recruitment: {
    open_jobs: number
    applications: number
    awaiting_review: number
    shortlisted: number
  }
  customers: { new: number; total: number; returning: number }
  series: DashboardSeriesPoint[]
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------
export type Nullable<T> = T | null
export type Paginated<T> = { data: T[]; count: number; hasMore: boolean }
