import { insert, rpc, rpcOne, select, update } from './db'
import { getSupabase } from '@/lib/supabase/client'
import { ApiError } from '@/lib/supabase/errors'
import type {
  Appointment,
  AppointmentDetail,
  AppointmentStatus,
  AppointmentStatusEvent,
  Requirement,
  RequirementDraft,
  RequirementMedia,
  Slot,
} from '@/types'

/**
 * Booking engine client.
 *
 * Availability and slot reservation are deliberately server-authoritative:
 * `fn_service_slots` renders the calendar, and `fn_create_appointment`
 * re-validates inside a transaction before an exclusion constraint settles any
 * remaining race.
 */

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export interface SlotQuery {
  locationId: string
  serviceId: string
  date: string
  staffId?: string
  serviceVariantId?: string
}

export async function getSlots(query: SlotQuery): Promise<Slot[]> {
  const rows = await rpc<Slot[]>('fn_service_slots', {
    p_location_id: query.locationId,
    p_service_id: query.serviceId,
    p_date: query.date,
    p_staff_id: query.staffId ?? null,
    p_service_variant_id: query.serviceVariantId ?? null,
    p_slot_interval_mins: 15,
  })
  return rows ?? []
}

/**
 * Collapse `(start, stylist)` rows into a time grid the UI can render directly.
 * Slots with more than one stylist carry `staffIds`, letting the customer choose
 * "first available" or a named stylist.
 */
export interface TimeSlotGroup {
  startsAt: string
  endsAt: string
  staffCount: number
  staffIds: string[]
  price: number
  /** Distinct start times per hour-of-day, used to render the day columns. */
  label: string
}

export function groupSlotsByTime(slots: Slot[]): TimeSlotGroup[] {
  const byStart = new Map<string, Slot[]>()
  for (const slot of slots) {
    const bucket = byStart.get(slot.starts_at)
    if (bucket) bucket.push(slot)
    else byStart.set(slot.starts_at, [slot])
  }

  return [...byStart.entries()]
    .map(([startsAt, group]) => {
      const first = group[0]!
      return {
        startsAt,
        endsAt: first.ends_at,
        staffCount: group.length,
        staffIds: group.map((g) => g.staff_id),
        price: group.reduce((min, g) => Math.min(min, g.price), first.price),
        label: new Date(startsAt).toLocaleTimeString('en-NG', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Africa/Lagos',
        }),
      }
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/** Which days in `[from, to]` have at least one bookable slot. */
export async function getDaysWithAvailability(
  locationId: string,
  serviceId: string,
  from: string,
  to: string,
  staffId?: string,
): Promise<string[]> {
  const days: string[] = []
  const cursor = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  const iso = (d: Date) => d.toISOString().slice(0, 10)

  // Bounded by max_advance_days (60), so a short burst of parallel calls is safe.
  const requests: Promise<void>[] = []
  while (cursor <= end) {
    const key = iso(cursor)
    requests.push(
      getSlots({ locationId, serviceId, date: key, staffId })
        .then((slots) => {
          if (slots.length > 0) days.push(key)
        })
        // A single day's failure must not void the whole month grid.
        .catch(() => undefined),
    )
    cursor.setDate(cursor.getDate() + 1)
  }

  await Promise.all(requests)
  return days.sort()
}

// ---------------------------------------------------------------------------
// Holds
// ---------------------------------------------------------------------------

/** Freeze a slot while the customer completes their requirement form. */
export async function holdSlot(input: {
  staffId: string
  serviceId: string
  locationId: string
  startsAt: string
  sessionToken: string
  ttlMinutes?: number
}): Promise<string> {
  return rpc<string>('fn_hold_slot', {
    p_staff_id: input.staffId,
    p_service_id: input.serviceId,
    p_location_id: input.locationId,
    p_starts_at: input.startsAt,
    p_session_token: input.sessionToken,
    p_ttl_minutes: input.ttlMinutes ?? 20,
  })
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export interface CreateAppointmentInput {
  serviceId: string
  locationId: string
  staffId: string
  startsAt: string
  serviceVariantId?: string | null
  customerId?: string
  customerNotes?: string
  requirement?: RequirementDraft
  holdToken?: string
}

const APPOINTMENT_SELECT = `
  *,
  service:service_id ( id, slug, name, summary, duration_minutes, image_url ),
  variant:service_variant_id ( id, label, price ),
  staff:staff_id ( user_id, full_name, title, photo_url ),
  location:location_id ( id, name, slug, address_line1, city, state ),
  requirement:requirements!appointment_id (
    id, status, desired_style, desired_colour, hair_goals, submitted_at
  )
`

export async function createAppointment(
  input: CreateAppointmentInput,
): Promise<AppointmentDetail> {
  const row = await rpcOne<AppointmentDetail & { id: string }>('fn_create_appointment', {
    p_service_id: input.serviceId,
    p_location_id: input.locationId,
    p_staff_id: input.staffId,
    p_starts_at: input.startsAt,
    p_service_variant_id: input.serviceVariantId ?? null,
    p_customer_id: input.customerId ?? null,
    p_customer_notes: input.customerNotes ?? null,
    p_source: 'web',
    p_requirement: input.requirement ?? null,
    p_hold_token: input.holdToken ?? null,
    p_force: false,
  })

  if (!row?.id) {
    throw new ApiError('We could not create that booking. Please try another time.')
  }
  return row
}

export async function getAppointment(id: string): Promise<AppointmentDetail | null> {
  const rows = await select<AppointmentDetail>('appointments', {
    select: APPOINTMENT_SELECT,
    filters: { id },
    range: { from: 0, to: 1 },
  })
  return rows[0] ?? null
}

export async function listAppointments(
  customerId: string,
  options: { upcomingOnly?: boolean; limit?: number } = {},
): Promise<AppointmentDetail[]> {
  return select<AppointmentDetail>('appointments', {
    select: APPOINTMENT_SELECT,
    filters: {
      customer_id: customerId,
      ...(options.upcomingOnly
        ? { starts_at: { gte: new Date().toISOString() } }
        : {}),
    },
    order: { column: 'starts_at', ascending: options.upcomingOnly ?? false },
    ...(options.limit ? { range: { from: 0, to: options.limit - 1 } } : {}),
  })
}

export async function cancelAppointment(id: string, reason?: string): Promise<Appointment> {
  return rpc<Appointment>('fn_cancel_appointment', {
    p_appointment_id: id,
    p_reason: reason ?? null,
  })
}

export async function rescheduleAppointment(input: {
  appointmentId: string
  newStartsAt: string
  newStaffId?: string
  note?: string
}): Promise<Appointment> {
  return rpc<Appointment>('fn_reschedule_appointment', {
    p_appointment_id: input.appointmentId,
    p_new_starts_at: input.newStartsAt,
    p_new_staff_id: input.newStaffId ?? null,
    p_note: input.note ?? null,
  })
}

/** Staff/admin status transitions. The server enforces the transition graph. */
export async function setAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  note?: string,
): Promise<Appointment> {
  return rpc<Appointment>('fn_set_appointment_status', {
    p_appointment_id: id,
    p_status: status,
    p_note: note ?? null,
  })
}

export async function getAppointmentHistory(
  appointmentId: string,
): Promise<AppointmentStatusEvent[]> {
  return select<AppointmentStatusEvent>('appointment_status_history', {
    filters: { appointment_id: appointmentId },
    order: { column: 'created_at', ascending: true },
  })
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

const REQUIREMENT_SELECT = `
  *,
  media:requirement_media ( id, storage_path, public_url, kind, caption, sort_order )
`

export async function getRequirement(appointmentId: string): Promise<Requirement | null> {
  const rows = await select<Requirement & { media: RequirementMedia[] }>('requirements', {
    select: REQUIREMENT_SELECT,
    filters: { appointment_id: appointmentId },
    range: { from: 0, to: 1 },
  })
  return rows[0] ?? null
}

export async function listRequirements(customerId: string): Promise<Requirement[]> {
  return select<Requirement>('requirements', {
    filters: { customer_id: customerId },
    order: { column: 'created_at', ascending: false },
  })
}

/** Patch a requirement in place (staff responses, status changes). */
export async function updateRequirement(
  id: string,
  patch: Partial<Requirement>,
): Promise<Requirement> {
  return update<Requirement>('requirements', id, patch)
}

// ---------------------------------------------------------------------------
// Reference image uploads
// ---------------------------------------------------------------------------

const REQUIREMENTS_BUCKET = 'requirements'

export interface UploadResult {
  storagePath: string
  publicUrl: string
  bytes: number
  mimeType: string
}

/**
 * Upload a reference image to the private `requirements` bucket, scoped under
 * the signed-in user's id. Reads back through a signed URL, never a public one.
 */
export async function uploadRequirementImage(
  userId: string,
  file: File,
  requirementId: string,
): Promise<UploadResult> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const storagePath = `${userId}/${requirementId}/${crypto.randomUUID()}.${extension}`

  const { error } = await getSupabase().storage
    .from(REQUIREMENTS_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: '3600',
    })

  if (error) throw new ApiError(error.message)

  const { data: signed, error: signError } = await getSupabase().storage
    .from(REQUIREMENTS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7)

  if (signError) throw new ApiError(signError.message)

  return {
    storagePath,
    publicUrl: signed.signedUrl,
    bytes: file.size,
    mimeType: file.type || 'image/jpeg',
  }
}

/** Record an uploaded file against a requirement so staff can see it. */
export async function attachRequirementMedia(input: {
  requirementId: string
  storagePath: string
  publicUrl: string
  kind?: RequirementMedia['kind']
  caption?: string
  width?: number
  height?: number
  bytes?: number
  mimeType?: string
  sortOrder?: number
}): Promise<RequirementMedia> {
  const kind: RequirementMedia['kind'] = input.kind ?? 'reference'

  return insert<RequirementMedia>('requirement_media', {
    requirement_id: input.requirementId,
    storage_path: input.storagePath,
    public_url: input.publicUrl,
    kind,
    caption: input.caption ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    bytes: input.bytes ?? null,
    mime_type: input.mimeType ?? null,
    sort_order: input.sortOrder ?? 0,
  })
}

export async function removeRequirementMedia(id: string, storagePath?: string): Promise<void> {
  if (storagePath) {
    await getSupabase().storage.from(REQUIREMENTS_BUCKET).remove([storagePath])
  }
  const { error } = await getSupabase().from('requirement_media').delete().eq('id', id)
  if (error) throw ApiError.fromPostgrest(error)
}

/** Refresh a signed URL for a previously uploaded reference image. */
export async function refreshSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await getSupabase().storage
    .from(REQUIREMENTS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24)
  if (error) throw new ApiError(error.message)
  return data.signedUrl
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/** Existing booking for a customer, used by the "you already have one" guard. */
export async function findActiveBooking(
  customerId: string,
  serviceId: string,
): Promise<AppointmentDetail | null> {
  const rows = await select<AppointmentDetail>('appointments', {
    select: APPOINTMENT_SELECT,
    filters: {
      customer_id: customerId,
      service_id: serviceId,
      status: { in: ['pending', 'confirmed'] },
    },
    order: { column: 'starts_at', ascending: true },
    range: { from: 0, to: 1 },
  })
  return rows[0] ?? null
}

