import { qk } from '@/lib/api'

/**
 * Query keys for the staff feature.
 *
 * CONTRACT GAP: `qk` (`@/lib/query/keys`) has no staff-requirements entry, and
 * `qk` is outside this feature's file ownership. Rather than borrow an existing
 * factory whose key prefix would collide with a customer-account screen (the
 * stylist may also hold a `customer` role, so `qk.requirements(userId)` and
 * `qk.appointments(userId)` would clash), the staff screens keep their keys on
 * a dedicated `staff-requirements` root segment here.
 *
 * When `qk` grows prefix factories these should move there and this file can be
 * deleted — nothing else in the app should depend on the literal strings.
 */
export const sq = {
  /** Appointments joined with their full requirement and media. */
  staffRequirements: (from: string, to: string) => ['staff-requirements', from, to] as const,
} as const

/**
 * Root segments of every cached query the staff screens read or write.
 *
 * A status change invalidates whichever diary window happens to be open, so we
 * need prefix matches rather than one exact key. `qk` exposes no prefix-only
 * factories; taking element `0` of a real factory keeps the literal in one
 * place instead of at each call site.
 */
export const STAFF_QUERY_ROOTS = [
  qk.staffDiary('', '', '')[0],
  qk.adminBookings({})[0],
  qk.appointments('', '')[0],
  sq.staffRequirements('', '')[0],
] as const
