import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  getDiary,
  getRequirementsForDiary,
  listBookings,
  qk,
  setAppointmentStatus,
} from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { fromDateKey, toDateKey } from '@/lib/utils/format'
import { sq, STAFF_QUERY_ROOTS } from './staffKeys'
import {
  APPOINTMENT_STATUS_LABEL,
  OPEN_APPOINTMENT_STATUSES,
  PENDING_REVIEW_STATUSES,
  type RequirementWithMedia,
  type StaffAppointment,
} from './staffTypes'
import type { AppointmentStatus } from '@/types'

/**
 * Data access for the staff dashboard.
 *
 * Two queries are needed for a diary window and neither is sufficient alone:
 *
 *   - `getDiary` is RLS-scoped to the stylist's own appointments and carries
 *     the service / location / requirement relations, but it does **not** select
 *     the `customer` relation.
 *   - `listBookings` selects `customer` and is likewise RLS-scoped, but carries
 *     no requirement data.
 *
 * CONTRACT GAP: `getDiary`'s select string should include
 * `customer:customer_id ( id, full_name, email, phone_e164 )` so one query is
 * enough. Until it does, the two are merged here on `id`. `listBookings` is
 * staff-usable (the `appointments_select_participants` policy allows a stylist to
 * read their own bookings) and is filtered by `staffId` here rather than trusting
 * that alone.
 */

// ---------------------------------------------------------------------------
// Diary window
// ---------------------------------------------------------------------------

const BOOKING_PAGE_SIZE = 200
/** Hard ceiling on pagination so a very wide client-history range cannot hang. */
const MAX_BOOKING_PAGES = 5

/** Every page of `listBookings` for one filter set, bounded by `maxPages`. */
export async function fetchAllBookings(
  filters: Record<string, unknown>,
  maxPages = MAX_BOOKING_PAGES,
): Promise<StaffAppointment[]> {
  const rows: StaffAppointment[] = []
  let page = 1
  let total = 0

  do {
    const result = await listBookings(filters, page, BOOKING_PAGE_SIZE)
    total = result.count
    rows.push(...(result.data as StaffAppointment[]))
    page += 1
  } while (rows.length < total && page <= maxPages)

  return rows
}

export interface StaffDiaryWindow {
  appointments: StaffAppointment[]
  isLoading: boolean
  isFetching: boolean
  error: unknown
  refetch: () => void
}

/** One stylist's appointments for `[from, to]`, with customers resolved. */
export function useStaffDiaryWindow(
  from: string,
  to: string,
  staffId: string | undefined,
): StaffDiaryWindow {
  const diary = useQuery({
    queryKey: qk.staffDiary(from, to, staffId),
    queryFn: () => getDiary({ from, to, staffId }),
    enabled: Boolean(staffId),
    staleTime: 60_000,
  })

  const people = useQuery({
    queryKey: qk.adminBookings({ scope: 'staff-customers', staffId, from, to }),
    queryFn: () => fetchAllBookings({ staffId, from, to }),
    enabled: Boolean(staffId),
    staleTime: 60_000,
  })

  const customerById = new Map<string, StaffAppointment['customer']>(
    (people.data ?? []).map((row) => [row.id, row.customer ?? null]),
  )

  const appointments = (diary.data ?? []).map((row) => ({
    ...row,
    customer: customerById.get(row.id) ?? null,
  }))

  return {
    appointments,
    isLoading: diary.isLoading,
    isFetching: diary.isFetching || people.isFetching,
    // The diary is the record the page is built on; a customer-lookup failure
    // degrades the names but must not blank the screen.
    error: diary.error,
    refetch: () => {
      void diary.refetch()
      void people.refetch()
    },
  }
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

export interface StaffRequirementsResult {
  appointments: StaffAppointment[]
  isLoading: boolean
  isFetching: boolean
  error: unknown
  refetch: () => void
}

/**
 * Upcoming appointments joined with their full requirement and reference media.
 * `getRequirementsForDiary` is already RLS-scoped to the caller's own
 * appointments, so no `staffId` filter is applied or needed.
 */
export function useStaffRequirements(from: string, to: string): StaffRequirementsResult {
  const query = useQuery({
    queryKey: sq.staffRequirements(from, to),
    queryFn: () => getRequirementsForDiary(from, to) as Promise<StaffAppointment[]>,
    staleTime: 60_000,
  })

  return {
    appointments: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => void query.refetch(),
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

function useInvalidateStaffQueries() {
  const queryClient = useQueryClient()
  return () => {
    for (const root of STAFF_QUERY_ROOTS) {
      void queryClient.invalidateQueries({ queryKey: [root] })
    }
  }
}

/** Advance or close out an appointment; invalidates every open staff window. */
export function useSetAppointmentStatus() {
  const invalidate = useInvalidateStaffQueries()

  return useMutation({
    mutationFn: (input: { id: string; status: AppointmentStatus; note?: string }) =>
      setAppointmentStatus(input.id, input.status, input.note),
    onSuccess: (_row, variables) => {
      toast.success(`Marked ${APPOINTMENT_STATUS_LABEL[variables.status].toLowerCase()}`)
      invalidate()
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'That status change was not allowed.'))
    },
  })
}

/**
 * "Start service" in one tap. The server graph only allows
 * confirmed → checked_in → in_progress, so the client walks both steps; if the
 * second is rejected the client is still legitimately checked in.
 */
export function useStartService() {
  const invalidate = useInvalidateStaffQueries()

  return useMutation({
    mutationFn: async (id: string) => {
      await setAppointmentStatus(id, 'checked_in')
      return setAppointmentStatus(id, 'in_progress')
    },
    onSuccess: () => {
      toast.success('Service started')
      invalidate()
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'We could not start that service.'))
    },
  })
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

export function todayKey(): string {
  return toDateKey(new Date())
}

export function shiftDay(key: string, days: number): string {
  const date = fromDateKey(key)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

/** Monday-based week containing `key`. */
export function weekStart(key: string): string {
  const date = fromDateKey(key)
  const offset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - offset)
  return toDateKey(date)
}

export function weekDays(startKey: string): string[] {
  return Array.from({ length: 7 }, (_, index) => shiftDay(startKey, index))
}

export function dayKeyOf(iso: string): string {
  return toDateKey(new Date(iso))
}

export function minutesFromMidnight(iso: string): number {
  const date = new Date(iso)
  return date.getHours() * 60 + date.getMinutes()
}

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

export interface DayGroup {
  key: string
  appointments: StaffAppointment[]
}

export function groupByDay(appointments: StaffAppointment[]): DayGroup[] {
  const buckets = new Map<string, StaffAppointment[]>()
  for (const appointment of appointments) {
    const key = dayKeyOf(appointment.starts_at)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(appointment)
    else buckets.set(key, [appointment])
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, rows]) => ({
      key,
      appointments: rows.sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    }))
}

export interface NowNext {
  /** Something is happening in the chair right now, or is due to start. */
  current: StaffAppointment | null
  /** The first appointment after `current`, when there is a genuine gap. */
  next: StaffAppointment | null
}

/**
 * The appointment in the chair, and the one after it.
 *
 * `current` is the soonest still-open appointment: an in-progress service, an
 * appointment whose start/end window contains `now`, or failing both the next
 * one to begin. `next` is only populated when that first one is already under
 * way, so the screen can say "now" and "then" without guessing. Finished, missed
 * and cancelled appointments are never candidates.
 */
export function pickNowNext(
  appointments: StaffAppointment[],
  now: Date = new Date(),
): NowNext {
  const open = appointments
    .filter((a) => OPEN_APPOINTMENT_STATUSES.includes(a.status))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  const inProgress = open.find((a) => a.status === 'in_progress')
  if (inProgress) return { current: inProgress, next: open.find((a) => a.id !== inProgress.id) ?? null }

  const nowMs = now.getTime()
  const live = open.find((a) => {
    // A pending booking is not yet the client's chair.
    if (a.status === 'pending') return false
    const start = new Date(a.starts_at).getTime()
    const end = new Date(a.ends_at).getTime()
    return start <= nowMs && end >= nowMs
  })
  if (live) return { current: live, next: open.find((a) => a.id !== live.id) ?? null }

  const current = open.find((a) => new Date(a.starts_at).getTime() > nowMs) ?? null
  return { current, next: null }
}

export function totalMinutes(appointments: StaffAppointment[]): number {
  return appointments.reduce((sum, a) => sum + (a.duration_minutes || 0), 0)
}

/** Revenue that is still expected to land: everything not cancelled or missed. */
export function expectedRevenue(appointments: StaffAppointment[]): number {
  return appointments
    .filter((a) => a.status !== 'cancelled' && a.status !== 'no_show')
    .reduce((sum, a) => sum + Number(a.total || 0), 0)
}

/** Appointments whose requirement is waiting on the stylist to read it. */
export function requirementsToReview(
  appointments: StaffAppointment[],
): StaffAppointment[] {
  return appointments.filter((a) => PENDING_REVIEW_STATUSES.includes(a.requirement?.status ?? 'draft'))
}

export function requirementMedia(requirement: RequirementWithMedia | null | undefined) {
  return (requirement?.media ?? []).filter((item) => Boolean(item?.public_url))
}

// ---------------------------------------------------------------------------
// Timeline colour
// ---------------------------------------------------------------------------

/**
 * A warm tone per service, derived from the name so a given service keeps the
 * same colour across every view. Classes are literal because Tailwind v4 only
 * emits what it can see in source.
 */
const SERVICE_TONES = [
  'border-bronze/30 bg-bronze/[0.14] text-ink',
  'border-clay/25 bg-clay/[0.12] text-ink',
  'border-blush bg-blush/70 text-ink',
  'border-sage/25 bg-sage/[0.12] text-ink',
  'border-line-strong bg-sand text-ink',
] as const

function nameHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

export function serviceTone(name: string | null | undefined): string {
  return SERVICE_TONES[nameHash(name ?? 'service') % SERVICE_TONES.length] ?? SERVICE_TONES[0]
}
