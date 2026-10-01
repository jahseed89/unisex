import { site } from '@/config/site'
import { whatsappLink } from '@/lib/utils/format'

/**
 * Shared, pure helpers for the account surfaces.
 *
 * Everything here is presentational or a pure function — the pages own their
 * data, query keys and mutations. Kept in one place so the status vocabulary
 * (tone + human label) cannot drift between the list, detail and notification
 * screens.
 */

const BY_DESK = 64
const BY_STUDIO = 1_280_000

export function formatFileSize(bytes: number | null | undefined): string {
  const value = Number(bytes ?? 0)
  if (!Number.isFinite(value) || value <= 0) return '—'
  if (value >= BY_STUDIO) return `${(value / BY_STUDIO).toFixed(1)} MB`
  if (value >= BY_DESK) return `${Math.max(1, Math.round(value / BY_DESK))} KB`
  return `${value} B`
}

// ---------------------------------------------------------------------------
// Status vocabulary
// ---------------------------------------------------------------------------
const STATUS_LABELS: Record<string, string> = {
  // Appointments
  draft: 'Draft',
  pending: 'Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show',
  rescheduled: 'Rescheduled',
  // Payments
  unpaid: 'Unpaid',
  awaiting_payment: 'Awaiting payment',
  partially_paid: 'Part paid',
  paid: 'Paid',
  refunded: 'Refunded',
  partially_refunded: 'Part refunded',
  failed: 'Failed',
  voided: 'Voided',
  // Orders
  processing: 'Processing',
  ready_for_pickup: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  returned: 'Returned',
  // Recruitment
  submitted: 'Submitted',
  screening: 'In screening',
  shortlisted: 'Shortlisted',
  interview_scheduled: 'Interview scheduled',
  interviewed: 'Interviewed',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
  // Requirements / reviews
  under_review: 'Under review',
  approved: 'Approved',
  changes_requested: 'Changes requested',
  closed: 'Closed',
  published: 'Published',
  flagged: 'Flagged',
  // Fulfilment
  pickup: 'Studio pickup',
  delivery: 'Delivery',
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/[_-]/g, ' ')
}

/** Grouping used by the appointment tabs. */
export type AppointmentBucket = 'upcoming' | 'past' | 'cancelled'

const CLOSED_STATUSES = new Set(['cancelled', 'no_show', 'rescheduled'])

export function bucketFor(
  appointment: { starts_at: string; status: string },
  now: Date = new Date(),
): AppointmentBucket {
  if (CLOSED_STATUSES.has(appointment.status)) return 'cancelled'
  return new Date(appointment.starts_at) >= now ? 'upcoming' : 'past'
}

/** Only these statuses can still be moved or called off by the customer. */
export function isModifiable(status: string): boolean {
  return status === 'pending' || status === 'confirmed'
}

// ---------------------------------------------------------------------------
// Timeline model
// ---------------------------------------------------------------------------
export interface TimelineStep {
  key: string
  label: string
  meta?: string | null
  /** `done` entries are filled; `current` gets the bronze dot. */
  state: 'done' | 'current' | 'pending'
  note?: string | null
}

function stamp(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Order status → the milestone timeline shown on the detail screen. */
export function orderTimeline(order: {
  placed_at: string
  confirmed_at: string | null
  fulfilled_at: string | null
  cancelled_at: string | null
  status: string
  fulfilment_type: string
}): TimelineStep[] {
  const cancelled = order.cancelled_at !== null || order.status === 'cancelled'
  const fulfilled =
    order.fulfilled_at !== null ||
    order.status === 'delivered' ||
    order.status === 'completed'

  const steps: TimelineStep[] = [
    { key: 'placed', label: 'Order placed', meta: stamp(order.placed_at), state: 'done' },
    {
      key: 'confirmed',
      label: 'Confirmed by the studio',
      meta: stamp(order.confirmed_at),
      state: cancelled ? 'pending' : order.confirmed_at ? 'done' : 'current',
    },
  ]

  if (cancelled) {
    steps.push({ key: 'cancelled', label: 'Order cancelled', meta: stamp(order.cancelled_at), state: 'current' })
    return steps
  }

  steps.push({ key: 'packed', label: 'Packed and ready', meta: null, state: fulfilled ? 'done' : 'current' })
  steps.push({
    key: 'fulfilled',
    label: order.fulfilment_type === 'pickup' ? 'Collected from the studio' : 'Delivered',
    meta: stamp(order.fulfilled_at),
    state: fulfilled ? 'current' : 'pending',
  })

  return steps
}

// ---------------------------------------------------------------------------
// Directions & contact
// ---------------------------------------------------------------------------
/**
 * A map link for a salon location. Prefers live coordinates; falls back to a
 * search for the street address when the row has none.
 */
export function directionsLink(location: {
  address_line1?: string | null
  city?: string | null
  state?: string | null
  latitude?: string | null
  longitude?: string | null
}): string {
  if (location.latitude && location.longitude) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${location.latitude},${location.longitude}`,
    )}`
  }

  const query = [location.address_line1, location.city, location.state]
    .filter(Boolean)
    .join(', ')
    .trim()

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query || `${site.name} Lagos`,
  )}`
}

/** Pre-filled WhatsApp conversation about a specific appointment. */
export function appointmentWhatsappLink(reference: string, when: string): string {
  return whatsappLink(
    `Hi! I need to make a change to appointment ${reference} (${when}). Could you help?`,
  )
}

/** Pre-filled WhatsApp conversation about a specific order. */
export function orderWhatsappLink(orderNumber: string): string {
  return whatsappLink(`Hi! I need some help with my order ${orderNumber}.`)
}

/** Pre-filled WhatsApp conversation from the “need help” CTA. */
export function helpWhatsappLink(): string {
  return whatsappLink("Hi! I need some help with my order at Unisex Hair Studio.")
}

/** Localised address lines for a salon location row. */
export function formatAddress(location: {
  address_line1?: string | null
  city?: string | null
  state?: string | null
}): string {
  return [location.address_line1, location.city, location.state]
    .filter(Boolean)
    .join(', ')
}

// ---------------------------------------------------------------------------
// Dates & numbers
// ---------------------------------------------------------------------------
/**
 * Days from today as `yyyy-MM-dd` keys. Local calendar arithmetic, so a
 * `Date` in UTC never shifts the strip by a day.
 */
export function upcomingDayKeys(count: number, from: Date = new Date()): string[] {
  const keys: string[] = []
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate())

  for (let index = 0; index < count; index++) {
    const year = cursor.getFullYear()
    const month = String(cursor.getMonth() + 1).padStart(2, '0')
    const day = String(cursor.getDate()).padStart(2, '0')
    keys.push(`${year}-${month}-${day}`)
    cursor.setDate(cursor.getDate() + 1)
  }

  return keys
}

/** Today as a `yyyy-MM-dd` key. */
export function todayKey(): string {
  return upcomingDayKeys(1)[0] ?? ''
}

/** Hours until a start time; negative once it has passed. */
export function hoursUntil(startsAt: string, now: Date = new Date()): number {
  return (new Date(startsAt).getTime() - now.getTime()) / 3_600_000
}

/** True when the booking sits inside the studio's cancellation window. */
export function insideCancellationWindow(startsAt: string, now: Date = new Date()): boolean {
  const hours = hoursUntil(startsAt, now)
  return hours > 0 && hours < site.policy.cancellationWindowHours
}

/** Everything the customer still owes, if anything. */
export function outstandingBalance(appointment: {
  balance_due: number
  total: number
  deposit_paid: number
}): number {
  if (appointment.balance_due > 0) return appointment.balance_due
  return Math.max(0, appointment.total - appointment.deposit_paid)
}

/** `3 items` / `1 item`. */
export function pluraliseItems(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** Bucket label for the Today / Yesterday / Earlier grouping. */
export function dayBucket(createdAt: string, now: Date = new Date()): 'Today' | 'Yesterday' | 'Earlier' {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return 'Earlier'

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const time = date.getTime()

  if (time >= startOfToday) return 'Today'
  if (time >= startOfToday - 86_400_000) return 'Yesterday'
  return 'Earlier'
}

// ---------------------------------------------------------------------------
// Notification filters
// ---------------------------------------------------------------------------
export const NOTIFICATION_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'booking', label: 'Booking' },
  { value: 'commerce', label: 'Commerce' },
  { value: 'recruitment', label: 'Recruitment' },
] as const

export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number]['value']

/** Which categories an application is still "active" for the withdraw action. */
const CLOSED_APPLICATION_STATUSES = new Set(['hired', 'rejected', 'withdrawn'])

export function applicationIsActive(status: string): boolean {
  return !CLOSED_APPLICATION_STATUSES.has(status)
}
