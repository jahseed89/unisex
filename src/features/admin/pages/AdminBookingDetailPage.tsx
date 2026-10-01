import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CalendarClock,
  Mail,
  MessageCircle,
  Phone,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react'

import {
  addBookingInternalNote,
  cancelAppointment,
  getAppointment,
  getAppointmentHistory,
  getRequirement,
  getStylists,
  qk,
  rescheduleAppointment,
  setAppointmentStatus,
} from '@/lib/api'
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui'
import { AppointmentSummary } from '@/components/shared/Cards'
import { MediaFrame } from '@/components/shared/MediaFrame'
import {
  AdminShell,
  AsyncSection,
  ConfirmDialog,
  DetailList,
  EmptyState,
  Panel,
  SaveStatus,
  StatusBadge,
} from '../components/adminKit'
import type { SaveState } from '../components/adminKit'
import { errorMessage } from '@/lib/supabase/errors'
import { withCustomerOne } from '../components/adminReads'
import type { AppointmentWithCustomer } from '../components/adminReads'
import { formatDate, formatDateTime, formatNaira, humanise, whatsappLink } from '@/lib/utils/format'
import type {
  AppointmentDetail,
  AppointmentStatus,
  AppointmentStatusEvent,
  Requirement,
  RequirementMedia,
} from '@/types'

/**
 * A single booking, and everything the front desk needs to run it.
 *
 * The three reads (`getAppointment`, `getRequirement`, `getAppointmentHistory`)
 * are folded into one query keyed on `qk.appointment(id)` so a status change
 * refreshes the whole screen in a single invalidation, and so the page has no
 * moment where the header shows one status and the timeline another.
 */

type RequirementWithMedia = Requirement & { media: RequirementMedia[] }

/**
 * Legal transitions, mirroring `fn_set_appointment_status`. Cancellation and
 * rescheduling have their own RPCs (each carries side effects this graph does
 * not model) so they are surfaced separately rather than as plain buttons.
 */
const FORWARD_MOVES: Record<AppointmentStatus, AppointmentStatus[]> = {
  draft: [],
  pending: ['confirmed'],
  confirmed: ['checked_in', 'in_progress', 'no_show'],
  checked_in: ['in_progress', 'no_show'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
  no_show: [],
  rescheduled: [],
}

const TERMINAL: AppointmentStatus[] = ['completed', 'cancelled', 'no_show', 'rescheduled']

const MOVE_COPY: Record<string, { label: string; note: string }> = {
  confirmed: {
    label: 'Confirm booking',
    note: 'The client is confirmed and the chair is held. They receive a confirmation notification.',
  },
  checked_in: { label: 'Check in', note: 'The client has arrived and is waiting.' },
  in_progress: { label: 'Start service', note: 'The stylist has begun work on the chair.' },
  completed: { label: 'Mark completed', note: 'Service finished. This is what counts towards service revenue.' },
  no_show: { label: 'Record no-show', note: 'The client did not arrive for the slot.' },
}

export default function AdminBookingDetailPage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()

  const [note, setNote] = useState('')
  const [noteState, setNoteState] = useState<SaveState>('idle')

  const [moveTarget, setMoveTarget] = useState<AppointmentStatus | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')
  const [newStaff, setNewStaff] = useState('')
  const [rescheduleNote, setRescheduleNote] = useState('')
  const [lightbox, setLightbox] = useState<RequirementMedia | null>(null)

  const query = useQuery({
    queryKey: qk.appointment(id),
    enabled: Boolean(id),
    queryFn: async () => {
      const appointment = await getAppointment(id)
      if (!appointment) return null
      const [requirement, history] = await Promise.all([
        getRequirement(id) as Promise<RequirementWithMedia | null>,
        getAppointmentHistory(id),
      ])
      return { appointment, requirement, history }
    },
    staleTime: 30_000,
  })

  const stylistsQuery = useQuery({ queryKey: qk.staff(), queryFn: getStylists, staleTime: 10 * 60_000 })

  useEffect(() => {
    if (query.data) setNote(query.data.appointment.internal_notes ?? '')
  }, [query.data])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.appointment(id) })
    // Partial key match: refreshes every bookings list page, whatever its filters.
    void queryClient.invalidateQueries({ queryKey: qk.adminBookings({}) })
  }

  const moveMutation = useMutation({
    mutationFn: ({ status, reason }: { status: AppointmentStatus; reason?: string }) =>
      status === 'cancelled'
        ? cancelAppointment(id, reason)
        : setAppointmentStatus(id, status, reason),
    onSuccess: (row) => {
      toast.success(`Booking ${row.reference} is now ${humanise(row.status).toLowerCase()}.`)
      setMoveTarget(null)
      setCancelOpen(false)
      setCancelReason('')
      invalidate()
    },
    onError: (error) => {
      // errorMessage() renders the server's own transition-guard message.
      toast.error(errorMessage(error))
      setMoveTarget(null)
    },
  })

  const rescheduleMutation = useMutation({
    mutationFn: () => {
      if (!newDate || !newTime) throw new Error('Pick a date and a time first.')
      return rescheduleAppointment({
        appointmentId: id,
        newStartsAt: new Date(`${newDate}T${newTime}:00`).toISOString(),
        newStaffId: newStaff || undefined,
        note: rescheduleNote.trim() || undefined,
      })
    },
    onSuccess: () => {
      toast.success('Appointment moved. The original slot has been released and the client notified.')
      setRescheduleOpen(false)
      setRescheduleNote('')
      invalidate()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const noteMutation = useMutation({
    mutationFn: () => addBookingInternalNote(id, note.trim()),
    onSuccess: () => {
      setNoteState('saved')
      toast.success('Internal note saved.')
      invalidate()
    },
    onError: (error) => {
      setNoteState('error')
      toast.error(errorMessage(error))
    },
  })

  const appointment = withCustomerOne(query.data?.appointment ?? null)
  const requirement = query.data?.requirement ?? null
  const history = query.data?.history ?? []

  const moves = appointment ? (FORWARD_MOVES[appointment.status] ?? []) : []
  const isTerminal = appointment ? TERMINAL.includes(appointment.status) : false
  // `in_progress` can only move forward to `completed`, so cancelling is closed there.
  const canCancel = appointment
    ? (['pending', 'confirmed', 'checked_in'] as AppointmentStatus[]).includes(appointment.status)
    : false
  const canReschedule = appointment?.status === 'confirmed'

  return (
    <AdminShell
      eyebrow="Administration"
      title={appointment ? `Booking ${appointment.reference}` : 'Booking'}
      breadcrumb={[
        { label: 'Admin', to: '/admin' },
        { label: 'Bookings', to: '/admin/bookings' },
      ]}
      actions={
        <Button asChild variant="outline">
          <Link to="/admin/bookings">
            <ArrowLeft aria-hidden />
            All bookings
          </Link>
        </Button>
      }
    >
      <AsyncSection
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={query.data === null && !query.isLoading}
        empty={
          <EmptyState
            icon={<CalendarClock aria-hidden />}
            title="That booking could not be found"
            description="It may have been removed, or the link may be out of date."
            action={
              <Button asChild>
                <Link to="/admin/bookings">Back to bookings</Link>
              </Button>
            }
          />
        }
        skeleton={<div className="h-96 animate-pulse rounded-lg bg-sand/60" />}
      >
        {appointment && (
          <>
            {/* Quick actions ------------------------------------------------ */}
            <Panel
              title="Actions"
              description="Only transitions the salon workflow allows from the current status are offered."
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <StatusBadge status={appointment.status} />

                {moves.map((move) => (
                  <Button
                    key={move}
                    variant={move === 'completed' ? 'accent' : 'solid'}
                    onClick={() => setMoveTarget(move)}
                  >
                    {MOVE_COPY[move]?.label ?? humanise(move)}
                  </Button>
                ))}

                <Button variant="outline" onClick={() => setRescheduleOpen(true)} disabled={!canReschedule}>
                  <CalendarClock aria-hidden />
                  Reschedule
                </Button>

                <Button
                  variant="destructiveOutline"
                  onClick={() => setCancelOpen(true)}
                  disabled={!canCancel}
                >
                  Cancel booking
                </Button>
              </div>

              <p className="mt-3.5 text-xs leading-relaxed text-muted">
                {isTerminal
                  ? 'This booking is closed. The status history below is the permanent record.'
                  : appointment?.status === 'pending'
                    ? 'Confirm the booking first — rescheduling releases the slot only once it is confirmed.'
                    : canReschedule
                      ? 'Rescheduling releases the current slot and creates a replacement linked back to this booking.'
                      : appointment?.status === 'in_progress'
                        ? 'Work has started, so this booking can only be completed or recorded as a no-show.'
                        : 'Reschedule becomes available once the booking is confirmed.'}
              </p>
            </Panel>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_1fr]">
              <div className="space-y-5">
                {/* Summary ------------------------------------------------ */}
                <Panel title="Appointment">
                  <AppointmentSummary appointment={appointment} />
                </Panel>

                {/* Requirements ------------------------------------------- */}
                <RequirementsPanel
                  requirement={requirement}
                  onOpenMedia={setLightbox}
                  serviceRequiresOne={Boolean(appointment.service)}
                />

                {/* Timeline ---------------------------------------------- */}
                <TimelinePanel history={history} />
              </div>

              <div className="space-y-5">
                {/* Customer ---------------------------------------------- */}
                <CustomerPanel appointment={appointment} />

                {/* Detail ------------------------------------------------ */}
                <Panel title="Record detail">
                  <DetailList
                    columns={1}
                    items={[
                      {
                        label: 'Service variant',
                        value: appointment.variant
                          ? `${appointment.variant.label} · ${formatNaira(appointment.variant.price)}`
                          : 'Standard — no variant chosen',
                      },
                      { label: 'Booked via', value: humanise(appointment.source) },
                      { label: 'Created', value: formatDate(appointment.created_at) },
                      {
                        label: 'Duration & buffer',
                        value: `${appointment.duration_minutes} min${
                          appointment.buffer_minutes > 0 ? ` + ${appointment.buffer_minutes} min buffer` : ''
                        }`,
                      },
                      {
                        label: 'Ends',
                        value: formatDateTime(appointment.ends_at),
                      },
                      ...(appointment.cancellation_reason
                        ? [{ label: 'Cancellation reason', value: appointment.cancellation_reason }]
                        : []),
                      ...(appointment.customer_notes
                        ? [{ label: 'Client note', value: appointment.customer_notes }]
                        : []),
                    ]}
                  />
                </Panel>

                {/* Payment ------------------------------------------------ */}
                {appointment.deposit_required && <PaymentPanel appointment={appointment} />}

                {/* Internal notes ---------------------------------------- */}
                <Panel title="Internal notes" description="Staff only — never shown to the client.">
                  <Field
                    label="Note"
                    htmlFor="internal-note"
                    hint="Saving replaces the stored note, so keep anything you still need in this box."
                  >
                    <Textarea
                      id="internal-note"
                      rows={5}
                      value={note}
                      onChange={(event) => {
                        setNote(event.target.value)
                        setNoteState('idle')
                      }}
                      placeholder="Product tinted 4-0 on the trolley. Client asked for a light hold, not a perm."
                    />
                  </Field>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button
                      onClick={() => noteMutation.mutate()}
                      loading={noteMutation.isPending}
                      loadingText="Saving…"
                      disabled={note.trim() === (appointment.internal_notes ?? '')}
                    >
                      Save note
                    </Button>
                    <SaveStatus state={noteState} />
                  </div>
                </Panel>
              </div>
            </div>
          </>
        )}
      </AsyncSection>

      {/* ------------------------------------------------------------------
          Dialogs
      ------------------------------------------------------------------ */}

      <ConfirmDialog
        open={moveTarget !== null}
        onOpenChange={(open) => !open && setMoveTarget(null)}
        title={moveTarget ? MOVE_COPY[moveTarget]?.label ?? `Move to ${humanise(moveTarget)}` : ''}
        description={appointment ? `Booking ${appointment.reference}` : undefined}
        consequence={
          moveTarget ? (
            MOVE_COPY[moveTarget]?.note ?? 'This changes the booking status.'
          ) : (
            ''
          )
        }
        confirmLabel={moveTarget ? MOVE_COPY[moveTarget]?.label ?? 'Confirm' : 'Confirm'}
        tone="default"
        pending={moveMutation.isPending}
        onConfirm={() => moveTarget && moveMutation.mutate({ status: moveTarget })}
      />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this booking?"
        description={
          appointment ? `${appointment.reference} · ${formatDateTime(appointment.starts_at)}` : undefined
        }
        body={
          <Field
            label="Reason"
            htmlFor="cancel-reason"
            hint="Stored on the booking and sent to the client with the cancellation."
          >
            <Textarea
              id="cancel-reason"
              rows={3}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Client called to say she is unwell and will rebook next week."
            />
          </Field>
        }
        consequence={
          <span className="block space-y-2">
            <span className="block">
              The slot is released immediately and the client is notified. This cannot be
              undone from here.
            </span>
            {appointment && appointment.deposit_paid > 0 && (
              <span className="block font-medium">
                {formatNaira(appointment.deposit_paid)} of deposit has already been taken.
                Cancelling does not refund it automatically — settle that separately.
              </span>
            )}
          </span>
        }
        confirmLabel="Cancel booking"
        pending={moveMutation.isPending}
        onConfirm={() =>
          moveMutation.mutate({ status: 'cancelled', reason: cancelReason.trim() || undefined })
        }
      />

      <Dialog
        open={rescheduleOpen}
        onOpenChange={(open) => !open && setRescheduleOpen(false)}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Reschedule booking</DialogTitle>
            <DialogDescription>
              The current slot is released and a replacement appointment is created, linked back
              to this booking.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="New date" htmlFor="reschedule-date" required>
                <Input
                  id="reschedule-date"
                  type="date"
                  value={newDate}
                  onChange={(event) => setNewDate(event.target.value)}
                />
              </Field>
              <Field label="New time" htmlFor="reschedule-time" required>
                <Input
                  id="reschedule-time"
                  type="time"
                  value={newTime}
                  onChange={(event) => setNewTime(event.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Stylist"
              htmlFor="reschedule-staff"
              hint="Leave as-is to keep the current stylist."
            >
              <Select
                id="reschedule-staff"
                value={newStaff}
                onChange={(event) => setNewStaff(event.target.value)}
                placeholder={appointment?.staff?.full_name ?? 'Keep current stylist'}
                options={(stylistsQuery.data ?? []).map((stylist) => ({
                  value: stylist.user_id,
                  label: stylist.title
                    ? `${stylist.full_name} — ${stylist.title}`
                    : stylist.full_name,
                }))}
              />
            </Field>

            <Field
              label="Reason"
              htmlFor="reschedule-note"
              hint="Recorded on the status history and sent to the client."
            >
              <Textarea
                id="reschedule-note"
                rows={3}
                value={rescheduleNote}
                onChange={(event) => setRescheduleNote(event.target.value)}
                placeholder="Client requested a later slot to fit her schedule."
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRescheduleOpen(false)}>
              Keep current slot
            </Button>
            <Button
              onClick={() => rescheduleMutation.mutate()}
              loading={rescheduleMutation.isPending}
              loadingText="Moving…"
              disabled={!newDate || !newTime}
            >
              Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox for the client's reference images. */}
      <Dialog open={lightbox !== null} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Reference image</DialogTitle>
            <DialogDescription>
              {lightbox?.caption ?? 'Uploaded by the client with their requirement.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {lightbox && (
              <MediaFrame
                src={lightbox.public_url}
                alt={
                  lightbox.caption ??
                  'Reference image uploaded by the client for this appointment'
                }
                seed={`reference-${lightbox.id}`}
                aspect="auto"
                rounded
              />
            )}
            <p className="mt-3 text-xs text-muted">
              Stored in the private requirements bucket and served through a short-lived signed
              link.
            </p>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function CustomerPanel({ appointment }: { appointment: AppointmentWithCustomer }) {
  const customer = appointment.customer
  const phone = customer?.phone_e164 ?? null
  const email = customer?.email ?? null

  if (!customer) {
    return (
      <Panel title="Customer">
        <p className="text-sm text-muted">
          This booking has no linked customer account — most likely a walk-in created by staff.
        </p>
      </Panel>
    )
  }

  const message = `Hello ${customer.full_name ?? 'there'} — this is Unisex Hair Studio about your appointment on ${formatDate(appointment.starts_at)}.`

  return (
    <Panel title="Customer">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blush text-sm font-semibold text-bronze-dark">
          {(customer.full_name ?? 'G').trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{customer.full_name ?? 'Guest'}</p>
          {customer.email && <p className="truncate text-xs text-muted">{customer.email}</p>}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {phone && (
          <a
            href={`tel:${phone}`}
            className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2.5 text-sm text-ink transition-colors hover:border-bronze hover:bg-sand/50"
          >
            <Phone className="size-4 shrink-0 text-bronze" aria-hidden />
            {phone}
          </a>
        )}

        {email && (
          <a
            href={`mailto:${email}`}
            className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2.5 text-sm text-ink transition-colors hover:border-bronze hover:bg-sand/50"
          >
            <Mail className="size-4 shrink-0 text-bronze" aria-hidden />
            <span className="truncate">{email}</span>
          </a>
        )}

        {phone && (
          <a
            href={whatsappLink(message, phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2.5 text-sm text-ink transition-colors hover:border-bronze hover:bg-sand/50"
          >
            <MessageCircle className="size-4 shrink-0 text-bronze" aria-hidden />
            Message on WhatsApp
          </a>
        )}
      </div>
    </Panel>
  )
}

function RequirementsPanel({
  requirement,
  onOpenMedia,
  serviceRequiresOne,
}: {
  requirement: RequirementWithMedia | null
  onOpenMedia: (media: RequirementMedia) => void
  serviceRequiresOne: boolean
}) {
  if (!requirement) {
    return (
      <Panel title="Requirement brief">
        <EmptyState
          icon={<TriangleAlert aria-hidden />}
          title={
            serviceRequiresOne
              ? 'No requirement was submitted'
              : 'No requirement needed for this service'
          }
          description={
            serviceRequiresOne
              ? 'This service asks for a brief before the appointment, but nothing has been captured. Follow up with the client.'
              : 'Walk in without a brief — everything you need is on the appointment record.'
          }
        />
      </Panel>
    )
  }

  const hasAllergies = requirement.allergies.length > 0
  const hasScalp = requirement.scalp_conditions.length > 0
  const media = requirement.media ?? []

  return (
    <Panel
      title="Requirement brief"
      description="Submitted by the client. Read this before the client sits down."
      action={<StatusBadge status={requirement.status} />}
    >
      {(hasAllergies || hasScalp) && (
        <Alert
          variant="danger"
          title="Read this before you pick up a product"
          className="mb-5"
        >
          <span className="flex flex-col gap-1.5">
            {hasAllergies && (
              <span className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <strong className="font-semibold">Allergies:</strong>{' '}
                  {requirement.allergies.join(', ')}
                </span>
              </span>
            )}
            {hasScalp && (
              <span className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <strong className="font-semibold">Scalp conditions:</strong>{' '}
                  {requirement.scalp_conditions.join(', ')}
                </span>
              </span>
            )}
            {requirement.medications && (
              <span>
                <strong className="font-semibold">Medications:</strong> {requirement.medications}
              </span>
            )}
          </span>
        </Alert>
      )}

      <DetailList
        columns={2}
        items={[
          { label: 'Desired style', value: requirement.desired_style },
          {
            label: 'Desired length',
            value: requirement.desired_length ?? 'Not specified',
          },
          {
            label: 'Desired texture',
            value: requirement.desired_texture ? humanise(requirement.desired_texture) : 'Not specified',
          },
          {
            label: 'Desired colour',
            value: requirement.desired_colour ?? 'No colour change',
          },
          {
            label: 'Current length',
            value: requirement.current_length ?? 'Not specified',
          },
          {
            label: 'Current texture',
            value: requirement.current_texture ? humanise(requirement.current_texture) : 'Not specified',
          },
          {
            label: 'Current colour',
            value: requirement.current_colour ?? 'Not specified',
          },
          {
            label: 'Current density',
            value: requirement.current_density ?? 'Not specified',
          },
          {
            label: 'Last treated',
            value: requirement.last_treatment
              ? `${requirement.last_treatment}${requirement.last_treated_at ? ` · ${formatDate(requirement.last_treated_at)}` : ''}`
              : 'Not specified',
          },
          {
            label: 'Patch test',
            value: requirement.patch_test_done
              ? `Done${requirement.patch_test_at ? ` · ${formatDate(requirement.patch_test_at)}` : ''}`
              : 'Not done',
          },
          {
            label: 'Budget',
            value:
              requirement.budget_min || requirement.budget_max
                ? `${formatNaira(requirement.budget_min)} – ${formatNaira(requirement.budget_max)}`
                : 'Not stated',
          },
          {
            label: 'Flexible on date',
            value: requirement.is_flexible_on_date ? 'Yes' : 'No',
          },
          {
            label: 'Submitted',
            value: requirement.submitted_at ? formatDate(requirement.submitted_at) : 'Not submitted',
          },
        ]}
      />

      {requirement.hair_goals.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted">
            Hair goals
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {requirement.hair_goals.map((goal) => (
              <li key={goal}>
                <Badge size="sm" variant="outline">
                  {goal}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(requirement.inspiration_notes || requirement.accessibility_needs) && (
        <div className="mt-5 space-y-4 border-t border-line pt-4">
          {requirement.inspiration_notes && (
            <div>
              <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted">
                In their words
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                {requirement.inspiration_notes}
              </p>
            </div>
          )}
          {requirement.accessibility_needs && (
            <div>
              <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted">
                Accessibility needs
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                {requirement.accessibility_needs}
              </p>
            </div>
          )}
        </div>
      )}

      {requirement.staff_response && (
        <div className="mt-5 rounded-md border border-line bg-sand/50 p-4">
          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-bronze-dark">
            Stylist reply
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            {requirement.staff_response}
          </p>
        </div>
      )}

      {media.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted">
            Reference images ({media.length})
          </p>
          <ul className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
            {media.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpenMedia(item)}
                  aria-label={`Open reference image${item.caption ? `: ${item.caption}` : ''}`}
                  className="block w-full overflow-hidden rounded-md transition-opacity hover:opacity-90"
                >
                  <MediaFrame
                    src={item.public_url}
                    alt={item.caption ?? `Client reference image, ${humanise(item.kind)}`}
                    seed={`req-${item.id}`}
                    aspect="square"
                    rounded
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}

function PaymentPanel({ appointment }: { appointment: AppointmentDetail }) {
  return (
    <Panel
      title="Payment"
      description="Totals are calculated by the database at booking time."
      action={<StatusBadge status={appointment.payment_status} dot={false} />}
    >
      <DetailList
        columns={1}
        items={[
          { label: 'Subtotal', value: formatNaira(appointment.subtotal) },
          ...(Number(appointment.discount) > 0
            ? [{ label: 'Discount', value: `−${formatNaira(appointment.discount)}` }]
            : []),
          { label: 'Total', value: formatNaira(appointment.total) },
          { label: 'Deposit required', value: formatNaira(appointment.deposit_amount) },
          { label: 'Deposit paid', value: formatNaira(appointment.deposit_paid) },
          {
            label: 'Balance due',
            value: (
              <span className={appointment.balance_due > 0 ? 'font-semibold text-clay' : ''}>
                {formatNaira(appointment.balance_due)}
              </span>
            ),
          },
        ]}
      />

      {appointment.balance_due > 0 && (
        <Alert variant="warning" className="mt-4">
          Take {formatNaira(appointment.balance_due)} in the chair before the client leaves.
        </Alert>
      )}
    </Panel>
  )
}

function TimelinePanel({ history }: { history: AppointmentStatusEvent[] }) {
  return (
    <Panel
      title="Status history"
      description="Every transition is written by the database trigger, so this cannot drift from the record."
    >
      {history.length === 0 ? (
        <p className="text-sm text-muted">No transitions recorded yet.</p>
      ) : (
        <ol className="space-y-0">
          {history.map((event, index) => (
            <li key={event.id} className="relative flex gap-4 pb-5 last:pb-0">
              {index < history.length - 1 && (
                <span
                  className="absolute top-5 left-[0.4375rem] h-full w-px bg-line"
                  aria-hidden
                />
              )}
              <span
                className="relative mt-1 size-3.5 shrink-0 rounded-full border-2 border-bronze bg-surface"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">
                  {event.from_status ? (
                    <>
                      <span className="text-muted">{humanise(event.from_status)}</span>
                      <span className="mx-1.5 text-faint" aria-label="to">
                        →
                      </span>
                    </>
                  ) : null}
                  <span className="font-medium">{humanise(event.to_status)}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">{formatDateTime(event.created_at)}</p>
                {event.note && (
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{event.note}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
