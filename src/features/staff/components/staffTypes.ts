import type {
  AppointmentDetail,
  AppointmentStatus,
  Requirement,
  RequirementMedia,
  RequirementStatus,
} from '@/types'

/**
 * Row shapes the staff screens actually receive.
 *
 * CONTRACT GAP: `AppointmentDetail` in `@/types` models the `service`, `staff`,
 * `location` and `requirement` relations but not `customer`, and its
 * `Requirement` has no `media` array — yet `getRequirementsForDiary` selects
 * `customer:customer_id (...)` and `requirement:requirements!appointment_id (*,
 * media:requirement_media (*))`. These are the same shapes with the missing
 * columns added. `src/types` is outside this feature's ownership, so they are
 * declared here and should be folded into `@/types` later.
 */
export interface StaffCustomer {
  id: string
  full_name: string | null
  email: string | null
  phone_e164: string | null
  avatar_url?: string | null
}

/** `requirements` row as selected by the staff requirement queries. */
export type RequirementWithMedia = Requirement & {
  media?: RequirementMedia[] | null
  previous_salon_notes?: string | null
  reviewed_at?: string | null
  reviewed_by?: string | null
}

/** An appointment as the staff screens consume it: customer always resolved. */
export type StaffAppointment = Omit<AppointmentDetail, 'requirement'> & {
  customer?: StaffCustomer | null
  requirement?: RequirementWithMedia | null
}

// ---------------------------------------------------------------------------
// Status vocabulary
// ---------------------------------------------------------------------------

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  draft: 'Draft',
  pending: 'Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show',
  rescheduled: 'Rescheduled',
}

export const REQUIREMENT_STATUS_LABEL: Record<RequirementStatus, string> = {
  draft: 'Not sent',
  submitted: 'Needs review',
  under_review: 'Reviewed',
  approved: 'Approved',
  changes_requested: 'Changes requested',
  closed: 'Closed',
}

/** Requirements a stylist is expected to have read before the client arrives. */
export const PENDING_REVIEW_STATUSES: RequirementStatus[] = ['submitted', 'under_review']

/**
 * Statuses that still occupy the chair. Cancelled, missed and finished
 * appointments are excluded from "now / next".
 */
export const OPEN_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'pending',
  'confirmed',
  'checked_in',
  'in_progress',
]

export interface StatusAction {
  status: AppointmentStatus
  label: string
  /** Renders as the solid primary control — exactly one per row. */
  primary?: boolean
}

/**
 * The transitions this UI offers, mirroring the server graph in
 * `fn_set_appointment_status`. Deliberately narrow: these are the four things a
 * stylist does at the chair, not the whole legal graph (confirming on a client's
 * behalf, marking a no-show, are reception/admin moves). The server re-checks
 * every transition, so this list is guidance rather than a guarantee.
 */
export function statusActions(status: AppointmentStatus): StatusAction[] {
  switch (status) {
    case 'pending':
      return [{ status: 'cancelled', label: 'Cancel' }]
    case 'confirmed':
      return [
        { status: 'checked_in', label: 'Check in', primary: true },
        { status: 'cancelled', label: 'Cancel' },
      ]
    case 'checked_in':
      return [
        { status: 'in_progress', label: 'Start service', primary: true },
        { status: 'cancelled', label: 'Cancel' },
      ]
    case 'in_progress':
      return [{ status: 'completed', label: 'Complete', primary: true }]
    default:
      return []
  }
}

/** Allergy / scalp flags that should stop a stylist before they start. */
export function healthFlags(requirement: RequirementWithMedia | null | undefined): {
  allergies: string[]
  scalp: string[]
  medications: string | null
  flagged: boolean
} {
  const allergies = (requirement?.allergies ?? []).filter(Boolean)
  const scalp = (requirement?.scalp_conditions ?? []).filter(Boolean)
  const medications = requirement?.medications?.trim() ? requirement.medications : null
  return {
    allergies,
    scalp,
    medications,
    flagged: allergies.length > 0 || scalp.length > 0 || Boolean(medications),
  }
}
