import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  CalendarDays,
  CalendarPlus,
  MapPin,
  MessageCircle,
  Star,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  getAppointment,
  getAppointmentHistory,
  getRequirement,
  qk,
  submitReview,
} from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { analytics } from '@/lib/analytics'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSeo } from '@/components/seo/Seo'
import { formatDate, formatDateTime, formatNaira, humanise } from '@/lib/utils/format'
import { Alert, Badge, Button, Card, EmptyState, Skeleton, statusTone } from '@/components/ui'
import { AppointmentSummary, formatDuration } from '@/components/shared/Cards'
import { MediaFrame } from '@/components/shared/MediaFrame'
import { CancelAppointmentDialog } from '@/features/account/components/CancelAppointmentDialog'
import { RescheduleDialog } from '@/features/account/components/RescheduleDialog'
import { StatusTimeline } from '@/features/account/components/StatusTimeline'
import { ReviewForm } from '@/features/account/components/ReviewForm'
import {
  appointmentWhatsappLink,
  directionsLink,
  isModifiable,
  outstandingBalance,
  statusLabel,
  type TimelineStep,
} from '@/features/account/components/accountUi'
import type { Requirement, RequirementMedia } from '@/types'

/**
 * `getRequirement` joins `requirement_media` in its PostgREST spec but types the
 * result as a bare `Requirement`, so the joined relation is narrowed locally
 * rather than by editing a shared file.
 */
type RequirementWithMedia = Requirement & { media?: RequirementMedia[] }

/**
 * A single appointment, in full.
 *
 * Composed from four bounded reads — the row, its status history, the
 * requirement the client submitted and (implicitly) the review form. Money is
 * read straight off the row, never recomputed, because `fn_create_appointment`
 * and the deposit columns are the authority.
 */
export default function AppointmentDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const userId = user?.id

  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  useSeo({
    title: 'Appointment',
    description: 'Details, requirements and payments for your Unisex Hair Studio appointment.',
    path: `/account/appointments/${id}`,
    noindex: true,
  })

  const appointmentQuery = useQuery({
    queryKey: qk.appointment(id),
    queryFn: () => getAppointment(id),
    enabled: Boolean(id),
    staleTime: 30_000,
  })

  const historyQuery = useQuery({
    queryKey: ['appointment-history', id],
    queryFn: () => getAppointmentHistory(id),
    enabled: Boolean(id),
    staleTime: 30_000,
  })

  const requirementQuery = useQuery({
    queryKey: ['appointment-requirement', id],
    queryFn: () => getRequirement(id) as Promise<RequirementWithMedia | null>,
    enabled: Boolean(id),
    staleTime: 60_000,
  })

  const appointment = appointmentQuery.data ?? null
  const modifiable = appointment ? isModifiable(appointment.status) : false

  const reviewMutation = useMutation({
    mutationFn: (input: { rating: number; title: string; body: string }) =>
      submitReview({
        customerId: userId!,
        appointmentId: id,
        serviceId: appointment?.service_id ?? null,
        rating: input.rating,
        title: input.title || undefined,
        body: input.body,
      }),
    onSuccess: () => {
      toast.success('Thank you — your review is with us', {
        description: 'We read every one. It will appear on the site once it is approved.',
      })
      analytics.bookingCompleted(appointment?.reference ?? id, 0)
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'We could not save your review. Please try again.'))
    },
  })

  // --- Loading --------------------------------------------------------------
  if (appointmentQuery.isLoading) return <DetailSkeleton />

  // --- Error / missing ------------------------------------------------------
  if (appointmentQuery.isError) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Alert
          variant="danger"
          title="We could not load this appointment"
          action={
            <Button size="sm" variant="outline" onClick={() => void appointmentQuery.refetch()}>
              Retry
            </Button>
          }
        >
          {errorMessage(appointmentQuery.error)}
        </Alert>
      </div>
    )
  }

  if (!appointment) {
    return (
      <div className="space-y-6">
        <BackLink />
        <EmptyState
          icon={<CalendarDays className="size-5" aria-hidden />}
          title="Appointment not found"
          description="It may have been removed, or the link may belong to another account."
          action={
            <Button asChild size="lg" variant="accent">
              <Link to="/account/appointments">See all appointments</Link>
            </Button>
          }
        />
      </div>
    )
  }

  // --- Timeline -------------------------------------------------------------
  const events = historyQuery.data ?? []
  const balance = outstandingBalance(appointment)
  const requirement = requirementQuery.data ?? null
  const media = requirement?.media ?? []
  const completed = appointment.status === 'completed'

  const timeline: TimelineStep[] = [
    {
      key: 'booked',
      label: 'Appointment booked',
      meta: formatDateTime(appointment.starts_at),
      state: 'done',
    },
    ...events.map((event) => ({
      key: String(event.id),
      label: statusLabel(event.to_status),
      meta: formatDate(event.created_at, 'EEE d MMM yyyy, h:mm a'),
      note: event.note,
      state: (appointment.status === event.to_status ? 'current' : 'done') as TimelineStep['state'],
    })),
  ]
  if (timeline.length === 1 && appointment.status !== 'pending') {
    timeline.push({
      key: 'current',
      label: `Currently ${statusLabel(appointment.status).toLowerCase()}`,
      meta: null,
      state: 'current',
    })
  }

  return (
    <div className="space-y-8">
      <BackLink />

      {/* Masthead -------------------------------------------------------- */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <Badge variant={statusTone(appointment.status)} dot>
              {statusLabel(appointment.status)}
            </Badge>
            <Badge variant={statusTone(appointment.payment_status)}>
              {statusLabel(appointment.payment_status)}
            </Badge>
          </div>
          <h1 className="display-section">{appointment.service?.name ?? 'Salon service'}</h1>
          <p className="lede mt-3">
            {formatDateTime(appointment.starts_at)} · {formatDuration(appointment.duration_minutes)}
            {appointment.staff ? ` with ${appointment.staff.full_name}` : ''}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2.5">
          {modifiable && (
            <>
              <Button variant="outline" size="lg" onClick={() => setRescheduleOpen(true)}>
                <CalendarDays className="size-4" aria-hidden />
                Reschedule
              </Button>
              <Button variant="destructiveOutline" size="lg" onClick={() => setCancelOpen(true)}>
                Cancel
              </Button>
            </>
          )}
          <Button asChild variant="accent" size="lg">
            <Link to="/book">
              <CalendarPlus className="size-4" aria-hidden />
              Book another
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="space-y-6">
          {/* Summary --------------------------------------------------- */}
          <Card className="p-5 md:p-6">
            <AppointmentSummary appointment={appointment} />
          </Card>

          {/* Requirement ----------------------------------------------- */}
          <Card className="p-5 md:p-6">
            <h2 className="font-display text-lg font-semibold text-ink">Your requirement</h2>
            <p className="mt-1 text-sm text-muted">
              What your stylist reads before you arrive. Nothing here is visible to anyone else.
            </p>

            {requirementQuery.isLoading && (
              <div className="mt-5 space-y-3" aria-hidden>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            )}

            {requirementQuery.isError && (
              <Alert variant="danger" title="We could not load your requirement" className="mt-5">
                {errorMessage(requirementQuery.error)}
              </Alert>
            )}

            {!requirementQuery.isLoading && !requirementQuery.isError && !requirement && (
              <p className="mt-5 rounded-md border border-dashed border-line-strong bg-sand/40 px-4 py-6 text-center text-sm text-muted">
                No requirement was submitted for this visit.
              </p>
            )}

            {requirement && (
              <div className="mt-5 space-y-5">
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Detail label="Desired style">{requirement.desired_style}</Detail>
                  <Detail label="Desired length">{requirement.desired_length}</Detail>
                  <Detail label="Desired texture">
                    {requirement.desired_texture ? humanise(requirement.desired_texture) : null}
                  </Detail>
                  <Detail label="Desired colour">{requirement.desired_colour}</Detail>
                  <Detail label="Current length">{requirement.current_length}</Detail>
                  <Detail label="Current texture">
                    {requirement.current_texture ? humanise(requirement.current_texture) : null}
                  </Detail>
                  {requirement.hair_goals.length > 0 && (
                    <Detail label="Goals">
                      <span className="flex flex-wrap gap-1.5">
                        {requirement.hair_goals.map((goal) => (
                          <Badge key={goal} size="sm">
                            {humanise(goal)}
                          </Badge>
                        ))}
                      </span>
                    </Detail>
                  )}
                  {requirement.inspiration_notes && (
                    <Detail label="Notes" wide>
                      {requirement.inspiration_notes}
                    </Detail>
                  )}
                  {requirement.allergies.length > 0 && (
                    <Detail label="Allergies" wide>
                      <span className="flex flex-wrap gap-1.5">
                        {requirement.allergies.map((item) => (
                          <Badge key={item} size="sm" variant="warning">
                            {item}
                          </Badge>
                        ))}
                      </span>
                    </Detail>
                  )}
                  {requirement.accessibility_needs && (
                    <Detail label="Accessibility needs" wide>
                      {requirement.accessibility_needs}
                    </Detail>
                  )}
                </dl>

                {/* Reference images */}
                {media.length > 0 && (
                  <div>
                    <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
                      Reference images
                    </h3>
                    <ul className="mt-3 flex flex-wrap gap-2.5">
                      {media.map((item) => (
                        <li key={item.id} className="w-24">
                          <MediaFrame
                            src={item.public_url}
                            alt={item.caption ?? 'Reference image submitted with your requirement'}
                            seed={item.id}
                            aspect="square"
                            rounded
                          />
                          <p className="mt-1.5 text-[0.625rem] leading-snug text-muted">
                            {item.caption ?? humanise(item.kind)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {requirement.staff_response && (
                  <Alert variant="info" title="A note from your stylist">
                    {requirement.staff_response}
                  </Alert>
                )}
              </div>
            )}
          </Card>

          {/* Review ----------------------------------------------------- */}
          <Card className="p-5 md:p-6">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <Star className="size-4.5 text-bronze" aria-hidden />
              Leave a review
            </h2>

            {completed ? (
              <ReviewForm
                isSubmitting={reviewMutation.isPending}
                error={reviewMutation.isError ? errorMessage(reviewMutation.error) : null}
                onSubmit={(value) => reviewMutation.mutate(value)}
                stylistName={appointment.staff?.full_name ?? null}
                serviceName={appointment.service?.name ?? null}
              />
            ) : (
              <p className="mt-3 rounded-md border border-dashed border-line-strong bg-sand/40 px-4 py-6 text-center text-sm leading-relaxed text-muted">
                You can review this visit once it is marked complete
                {appointment.status === 'cancelled' || appointment.status === 'no_show'
                  ? ' — though this one was cancelled, so there is nothing to say about the service.'
                  : '.'}
              </p>
            )}
          </Card>
        </div>

        {/* Sidebar ------------------------------------------------------- */}
        <aside className="space-y-5 lg:sticky lg:top-24">
          {/* Money */}
          <Card className="p-5">
            <h2 className="font-display text-base font-semibold text-ink">Payment</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
              <Row label="Service total" value={formatNaira(appointment.total)} />
              {appointment.discount > 0 && (
                <Row label="Discount" value={`−${formatNaira(appointment.discount)}`} tone="text-success" />
              )}
              <Row label="Deposit paid" value={formatNaira(appointment.deposit_paid)} />
              <div className="flex justify-between gap-4 border-t border-line pt-2.5">
                <dt className="font-medium text-ink">{balance > 0 ? 'Balance due' : 'Paid in full'}</dt>
                <dd className="font-semibold tabular-nums text-ink">{formatNaira(balance)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              {balance > 0
                ? 'Payable in the studio on the day. We accept card, transfer and cash.'
                : appointment.deposit_paid > 0
                  ? 'Your deposit covered this visit — nothing else to pay.'
                  : 'This visit was settled on the day.'}
            </p>
          </Card>

          {/* Timeline */}
          <Card className="p-5">
            <h2 className="font-display text-base font-semibold text-ink">Progress</h2>
            <StatusTimeline steps={timeline} className="mt-4" />
          </Card>

          {/* Location */}
          {appointment.location && (
            <Card className="p-5">
              <h2 className="font-display text-base font-semibold text-ink">Where</h2>
              <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">
                {appointment.location.name}
                <br />
                <span className="text-muted">
                  {appointment.location.address_line1}, {appointment.location.city}
                </span>
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Button asChild variant="outline" size="md">
                  <a
                    href={directionsLink(appointment.location)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MapPin className="size-4" aria-hidden />
                    Get directions
                  </a>
                </Button>
                <Button asChild variant="subtle" size="md">
                  <a
                    href={appointmentWhatsappLink(
                      appointment.reference,
                      formatDateTime(appointment.starts_at),
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="size-4" aria-hidden />
                    Message us on WhatsApp
                  </a>
                </Button>
              </div>
            </Card>
          )}
        </aside>
      </div>

      <RescheduleDialog
        appointment={appointment}
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
      />
      <CancelAppointmentDialog
        appointment={appointment}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
function BackLink() {
  return (
    <Link
      to="/account/appointments"
      className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden />
      All appointments
    </Link>
  )
}

function Detail({
  label,
  children,
  wide,
}: {
  label: string
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm leading-relaxed text-ink-soft">{children ?? '—'}</dd>
    </div>
  )
}

function Row({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular-nums ${tone ?? 'text-ink'}`}>{value}</dd>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-8" aria-hidden>
      <Skeleton className="h-4 w-32" />
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4 rounded-lg border border-line bg-surface p-6">
          <div className="flex gap-4">
            <Skeleton className="size-20 rounded-lg" />
            <div className="flex-1 space-y-2.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="mt-4 h-32 w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-56 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
