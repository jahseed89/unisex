import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarPlus,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  MessageCircle,
  Navigation,
  Sparkles,
} from 'lucide-react'

import {
  errorMessage,
  getRequirement,
  listAppointments,
  qk,
} from '@/lib/api'
import { Alert, Badge, Button, Card, Divider, EmptyState, statusTone } from '@/components/ui'
import { ContentSkeleton } from '@/components/layout/RouteLoader'
import { AppointmentSummary } from '@/components/shared/Cards'
import { PageHeader } from '@/components/shared/Cards'
import { useSeo } from '@/components/seo/Seo'
import { useAuth } from '@/features/auth/AuthProvider'
import { downloadAppointmentIcs, directionsUrl } from '@/features/booking/components/calendar'
import {
  COLOUR_OPTIONS,
  GOAL_OPTIONS,
  LENGTH_OPTIONS,
  SCALP_OPTIONS,
  TEXTURE_OPTIONS,
  optionLabel,
  optionLabels,
} from '@/features/booking/components/requirementOptions'
import { site } from '@/config/site'
import { formatDateTime, formatNaira, whatsappLink } from '@/lib/utils/format'
import type { AppointmentDetail, Requirement, RequirementMedia } from '@/types'

/**
 * `getRequirement` joins `requirement_media` but its declared return type drops
 * the relation, so the shape is restored locally rather than casting to `any`.
 */
type RequirementWithMedia = Requirement & { media?: RequirementMedia[] }

/**
 * Booking confirmation.
 *
 * A reference is a bearer token for someone else's details, so the page always
 * resolves it through the signed-in customer's own appointment list rather than
 * a lookup by reference. No reference, no appointment.
 */
export default function BookingConfirmationPage() {
  const { reference = '' } = useParams<{ reference: string }>()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()

  useSeo({
    title: 'Booking confirmed',
    description: 'Your appointment at Unisex Hair Studio.',
    noindex: true,
  })

  const appointments = useQuery({
    queryKey: qk.appointments(user?.id ?? ''),
    queryFn: () => listAppointments(user!.id),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  })

  const appointment = useMemo<AppointmentDetail | null>(
    () =>
      appointments.data?.find(
        (item) => item.reference.toLowerCase() === reference.toLowerCase(),
      ) ?? null,
    [appointments.data, reference],
  )

  const requirement = useQuery({
    queryKey: qk.requirements(`${user?.id ?? ''}/${appointment?.id ?? ''}`),
    queryFn: () => getRequirement(appointment!.id),
    enabled: Boolean(appointment?.id),
    staleTime: 60_000,
  })
  // ------------------------------------------------------------------ states
  if (!isAuthenticated) {
    return (
      <div className="container-page section-y">
        <div className="mx-auto max-w-lg">
          <EmptyState
            icon={<CheckCircle2 aria-hidden />}
            title="Sign in to see your booking"
            description={`Booking ${reference} belongs to an account. Sign in with the email you booked with and it will open straight away.`}
            action={
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <Button asChild size="lg">
                  <Link to={`/auth/sign-in?redirect=/book/confirmed/${reference}`}>Sign in</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/book">Book another appointment</Link>
                </Button>
              </div>
            }
          />
          <p className="mt-6 text-center text-xs text-muted">
            Booking in someone else's name? Call us on{' '}
            <a
              href={`tel:${site.contact.phone.replace(/\s/g, '')}`}
              className="underline underline-offset-4"
            >
              {site.contact.phone}
            </a>{' '}
            and we will confirm it for you.
          </p>
        </div>
      </div>
    )
  }

  if (authLoading || appointments.isLoading) {
    return (
      <div className="container-page section-y">
        <div className="mx-auto max-w-3xl">
          <ContentSkeleton lines={8} />
        </div>
      </div>
    )
  }

  if (appointments.error) {
    return (
      <div className="container-page section-y">
        <div className="mx-auto max-w-2xl">
          <Alert
            variant="danger"
            title="We could not load your bookings"
            action={
              <Button size="sm" variant="outline" onClick={() => void appointments.refetch()}>
                Retry
              </Button>
            }
          >
            {errorMessage(appointments.error)}
          </Alert>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/account/appointments">All my appointments</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!appointment) {
    return (
      <div className="container-page section-y">
        <div className="mx-auto max-w-2xl">
          <EmptyState
            icon={<CheckCircle2 aria-hidden />}
            title="We could not find that booking"
            description={`No booking on your account uses the reference ${reference}. Check the reference in your confirmation message, or browse your appointments.`}
            action={
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <Button asChild size="lg">
                  <Link to="/account/appointments">My appointments</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/book">Book an appointment</Link>
                </Button>
              </div>
            }
          />
        </div>
      </div>
    )
  }

  const detail: RequirementWithMedia | null = requirement.data ?? null
  const deposit = appointment.deposit_amount
  const balance = appointment.balance_due || appointment.total
  const stylistName = appointment.staff?.full_name ?? 'To be assigned'
  const media = detail?.media ?? []

  const addToCalendar = () =>
    downloadAppointmentIcs({
      id: appointment.id,
      title: `${appointment.service?.name ?? 'Salon appointment'}${
        appointment.variant ? ` (${appointment.variant.label})` : ''
      }`,
      startsAt: appointment.starts_at,
      durationMinutes: appointment.duration_minutes,
      stylistName,
      locationLine: appointment.location
        ? `${appointment.location.name}, ${appointment.location.address_line1}, ${appointment.location.city}`
        : `${site.address.street}, ${site.address.locality}, ${site.address.region}`,
      description: `Booking ${appointment.reference} at Unisex Hair Studio with ${stylistName}.`,
    })

  return (
    <>
      <PageHeader
        eyebrow={`Reference ${appointment.reference}`}
        title="You are booked in."
        description={
          appointment.status === 'pending'
            ? 'We are holding the chair. A stylist will confirm shortly and will review your requirement before you arrive.'
            : 'Your appointment is confirmed. Your stylist has your requirement — here is everything they will be working from.'
        }
        action={<Badge variant={statusTone(appointment.status)} size="lg" dot>{appointment.status}</Badge>}
      />

      <div className="container-page py-12 md:py-16">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-12">
          {/* ------------------------------------------------------------- */}
          {/* Left: the booking                                                */}
          {/* ------------------------------------------------------------- */}
          <div className="space-y-8">
            <Card className="p-5 sm:p-6">
              <AppointmentSummary appointment={appointment} />
            </Card>

            <Card className="p-5 sm:p-6">
              <h2 className="font-display text-lg font-semibold text-ink">Your requirement</h2>
              <p className="mt-1 text-sm text-muted">
                This is what your stylist will read before you arrive.
              </p>

              {requirement.isLoading ? (
                <div className="mt-5">
                  <ContentSkeleton lines={4} />
                </div>
              ) : detail ? (
                <>
                  <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                    <Field label="Style requested" value={detail.desired_style} />
                    <Field label="Desired length" value={detail.desired_length} />
                    <Field
                      label="Current length"
                      value={optionLabel(LENGTH_OPTIONS, detail.current_length)}
                    />
                    <Field
                      label="Natural texture"
                      value={optionLabel(
                        TEXTURE_OPTIONS.map((option) => ({
                          value: option.value,
                          label: option.label,
                        })),
                        detail.current_texture,
                      )}
                    />
                    <Field
                      label="Current colour"
                      value={optionLabel(COLOUR_OPTIONS, detail.current_colour)}
                    />
                    <Field label="Desired colour" value={detail.desired_colour} />
                    <Field label="Goals" value={optionLabels(GOAL_OPTIONS, detail.hair_goals)} />
                    <Field
                      label="Scalp"
                      value={optionLabels(SCALP_OPTIONS, detail.scalp_conditions)}
                    />
                    <Field label="Allergies" value={detail.allergies?.join(', ')} />
                    <Field label="Budget" value={budgetLabel(detail.budget_min, detail.budget_max)} />
                    <Field
                      label="Date flexibility"
                      value={
                        detail.is_flexible_on_date ? 'Yes — happy to be moved' : 'This date only'
                      }
                    />
                  </dl>

                  {detail.inspiration_notes && (
                    <div className="mt-5 border-t border-line pt-4">
                      <p className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-bronze-dark">
                        Your notes
                      </p>
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                        {detail.inspiration_notes}
                      </p>
                    </div>
                  )}

                  {media.length > 0 && (
                    <div className="mt-5 border-t border-line pt-4">
                      <p className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-bronze-dark">
                        Reference images ({media.length})
                      </p>
                      <ul className="mt-3 grid grid-cols-4 gap-2.5 sm:grid-cols-5">
                        {media.map((item, index) => (
                          <li key={item.id}>
                            <img
                              src={item.public_url}
                              alt={item.caption ?? `Reference ${index + 1} for your appointment`}
                              className="aspect-square w-full rounded-md border border-line object-cover"
                              loading="lazy"
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <Alert variant="neutral" title="No requirement attached" className="mt-5">
                  You booked without completing the requirements form. Your stylist will ask on the
                  day — or send them from your account.
                </Alert>
              )}
            </Card>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* Right: money, directions, actions                               */}
          {/* ------------------------------------------------------------- */}
          <div className="space-y-5 lg:sticky lg:top-24">
            <Card className="p-5 sm:p-6">
              <h2 className="font-display text-base font-semibold text-ink">Payment</h2>
              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Service total</dt>
                  <dd className="font-medium tabular-nums text-ink">
                    {formatNaira(appointment.total)}
                  </dd>
                </div>
                {deposit > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted">Deposit</dt>
                    <dd className="font-medium tabular-nums text-ink">
                      {formatNaira(appointment.deposit_paid)} of {formatNaira(deposit)}
                    </dd>
                  </div>
                )}
                <Divider />
                <div className="flex justify-between gap-4">
                  <dt className="font-semibold text-ink">
                    {deposit > 0 ? 'Balance due on the day' : 'Total due on the day'}
                  </dt>
                  <dd className="font-display text-lg font-semibold tabular-nums text-ink">
                    {formatNaira(balance)}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                Pay by card, transfer or cash in the salon. Nothing is charged now unless a deposit
                is shown above.
              </p>
            </Card>

            {appointment.location && (
              <Card className="p-5 sm:p-6">
                <h2 className="font-display text-base font-semibold text-ink">Where to come</h2>
                <p className="mt-2.5 flex items-start gap-2.5 text-sm leading-relaxed text-ink-soft">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
                  <span>
                    <strong className="font-semibold text-ink">{appointment.location.name}</strong>
                    <br />
                    {appointment.location.address_line1}
                    <br />
                    {appointment.location.city}, {appointment.location.state}
                  </span>
                </p>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  fullWidth
                  className="mt-4"
                >
                  <a
                    href={directionsUrl(appointment.location)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Navigation aria-hidden />
                    Get directions
                    <ExternalLink aria-hidden />
                  </a>
                </Button>
              </Card>
            )}

            <Card className="p-5 sm:p-6">
              <h2 className="font-display text-base font-semibold text-ink">On the day</h2>
              <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-muted">
                <li className="flex gap-2.5">
                  <Clock className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
                  Arrive five minutes early so you can settle in — your slot starts on time.
                </li>
                <li className="flex gap-2.5">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
                  Come with clean, detangled or sectioned hair unless we agreed otherwise.
                </li>
                <li className="flex gap-2.5">
                  <MessageCircle className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
                  Running late? WhatsApp us — we can usually shift you by 30 minutes.
                </li>
              </ul>
            </Card>

            <div className="space-y-2.5">
              <Button type="button" variant="accent" size="lg" fullWidth onClick={addToCalendar}>
                <CalendarPlus aria-hidden />
                Add to calendar
              </Button>
              <Button asChild variant="outline" size="lg" fullWidth>
                <Link to={`/account/appointments/${appointment.id}`}>Manage this booking</Link>
              </Button>
              <Button asChild variant="ghost" size="lg" fullWidth>
                <Link to="/book">Book another appointment</Link>
              </Button>
              <Button asChild variant="ghost" size="lg" fullWidth>
                <a
                  href={whatsappLink(
                    `Hi! I have a booking ${appointment.reference} at Unisex Hair Studio on ${formatDateTime(appointment.starts_at)}.`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle aria-hidden />
                  Message us on WhatsApp
                </a>
              </Button>
            </div>

            <p className="text-center text-xs leading-relaxed text-muted">
              Need to change something?{' '}
              <Link
                to="/policies/bookings"
                className="underline underline-offset-4 hover:text-ink"
              >
                Read the booking policy
              </Link>{' '}
              — free changes up to 24 hours before.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

function Field({ label, value }: { label: string; value?: string | null }) {
  const empty = !value || value === '—'
  return (
    <div>
      <dt className="text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </dt>
      <dd className={empty ? 'mt-1 text-sm text-faint' : 'mt-1 text-sm text-ink'}>
        {empty ? 'Not specified' : value}
      </dd>
    </div>
  )
}

function budgetLabel(min: number | null, max: number | null): string {
  if (min && max) return `${formatNaira(min)} – ${formatNaira(max)}`
  if (min) return `From ${formatNaira(min)}`
  if (max) return `Up to ${formatNaira(max)}`
  return ''
}
