import { useMemo } from 'react'

import { site } from '@/config/site'
import { cn } from '@/lib/utils/cn'
import { whatsappLink } from '@/lib/utils/format'

/**
 * Shared pieces for the account surfaces.
 *
 * Everything here is presentational — the pages own their data, query keys and
 * mutations. Kept in one place so the status vocabulary (tone + human label)
 * cannot drift between the list, detail and notification screens.
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
  now = new Date(),
): AppointmentBucket {
  if (CLOSED_STATUSES.has(appointment.status)) return 'cancelled'
  return new Date(appointment.starts_at) >= now ? 'upcoming' : 'past'
}

/** Only these statuses can still be moved or called off by the customer. */
export function isModifiable(status: string): boolean {
  return status === 'pending' || status === 'confirmed'
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
export interface TimelineStep {
  key: string
  label: string
  meta?: string | null
  /** `done` entries are filled; `current` gets the bronze ring. */
  state: 'done' | 'current' | 'pending'
  note?: string | null
}

/**
 * Vertical status history. Rendered as an ordered list so the sequence is
 * available to assistive technology, not just implied by the dots.
 */
export function StatusTimeline({
  steps,
  className,
}: {
  steps: TimelineStep[]
  className?: string
}) {
  if (steps.length === 0) return null

  return (
    <ol className={cn('space-y-0', className)}>
      {steps.map((step, index) => {
        const last = index === steps.length - 1
        return (
          <li key={step.key} className="flex gap-3.5">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex size-3.5 shrink-0 items-center justify-center rounded-full border-2',
                  step.state === 'pending'
                    ? 'border-line-strong bg-canvas'
                    : step.state === 'current'
                      ? 'border-bronze bg-bronze'
                      : 'border-bronze bg-bronze/25',
                )}
                aria-hidden
              />
              {!last && <span className="w-px flex-1 bg-line" aria-hidden />}
            </div>

            <div className={cn('min-w-0 flex-1', last ? 'pb-0' : 'pb-6')}>
              <p
                className={cn(
                  'text-sm font-medium leading-snug',
                  step.state === 'pending' ? 'text-muted' : 'text-ink',
                )}
              >
                {step.label}
              </p>
              {step.meta && <p className="mt-0.5 text-xs text-muted">{step.meta}</p>}
              {step.note && (
                <p className="mt-1.5 rounded-md border border-line bg-sand/50 px-3 py-2 text-xs leading-relaxed text-ink-soft">
                  {step.note}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Directions
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

/**
 * Days from today as `yyyy-MM-dd` keys, skipping none — the caller renders the
 * strip and the availability query decides which are selectable.
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

/** Today plus the following `count` days, as `yyyy-MM-dd`. */
export function todayKey(): string {
  return upcomingDayKeys(1)[0]!
}

/** The set of appointment statuses the customer may reschedule from. */
export const MODIFIABLE_STATUSES = ['pending', 'confirmed'] as const

/** Human labels for the notification category filters. */
export const NOTIFICATION_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'booking', label: 'Booking' },
  { value: 'commerce', label: 'Commerce' },
  { value: 'recruitment', label: 'Recruitment' },
] as const

export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number]['value']

/** Stable key for a notification in a list, tolerant of the field being absent. */
export function notificationKey(notification: { id?: string; reference?: string }): string {
  return notification.id ?? notification.reference ?? ''
}

/** Order status → the milestone timeline shown on the detail screen. */
export function orderTimeline(order: {
  placed_at: string
  confirmed_at: string | null
  fulfilled_at: string | null
  cancelled_at: string | null
  status: string
}): TimelineStep[] {
  const cancelled = order.cancelled_at !== null || order.status === 'cancelled'
  const fulfilled =
    order.fulfilled_at !== null ||
    order.status === 'delivered' ||
    order.status === 'completed'

  const steps: TimelineStep[] = [
    {
      key: 'placed',
      label: 'Order placed',
      meta: new Date(order.placed_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }),
      state: 'done',
    },
    {
      key: 'confirmed',
      label: 'Confirmed by the studio',
      meta: order.confirmed_at
        ? new Date(order.confirmed_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
        : null,
      state: cancelled ? 'pending' : order.confirmed_at ? 'done' : 'current',
    },
  ]

  if (cancelled) {
    steps.push({
      key: 'cancelled',
      label: 'Order cancelled',
      meta: order.cancelled_at
        ? new Date(order.cancelled_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
        : null,
      state: 'current',
    })
    return steps
  }

  steps.push({
    key: 'packed',
    label: 'Packed and ready',
    meta: null,
    state: fulfilled ? 'done' : 'current',
  })

  steps.push({
    key: 'fulfilled',
    label: order.fulfilment_type === 'pickup' ? 'Collected from the studio' : 'Delivered',
    meta: order.fulfilled_at
      ? new Date(order.fulfilled_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
      : null,
    state: fulfilled ? 'current' : 'pending',
  })

  return steps
}

/** Memo-friendly memo for a stable "hours until start" figure. */
export function hoursUntil(startsAt: string, now: Date = new Date()): number {
  return (new Date(startsAt).getTime() - now.getTime()) / 3_600_000
}

/** True when the booking sits inside the studio's cancellation window. */
export function insideCancellationWindow(startsAt: string, now: Date = new Date()): boolean {
  const hours = hoursUntil(startsAt, now)
  return hours > 0 && hours < site.policy.cancellationWindowHours
}

/** Everything the signed-in customer still owes, if anything. */
export function outstandingBalance(appointment: {
  balance_due: number
  total: number
  deposit_paid: number
}): number {
  if (appointment.balance_due > 0) return appointment.balance_due
  return Math.max(0, appointment.total - appointment.deposit_paid)
}

/** Localised address lines for a salon location row. */
export function formatAddress(location: {
  address_line1?: string | null
  city?: string | null
  state?: string | null
}): string {
  return [location.address_line1, location.city, location.state].filter(Boolean).join(', ')
}

/** Small helper so pages never hand-format a number inline. */
export function pluraliseItems(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** Memoised list of unique, trimmed, non-empty strings. */
export function useUniqueList(values: string[]): string[] {
  return useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const value of values) {
      const trimmed = value.trim()
      if (!trimmed) continue
      const key = trimmed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(trimmed)
    }
    return out
  }, [values])
}
