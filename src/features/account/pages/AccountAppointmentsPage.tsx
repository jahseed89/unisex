import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, CalendarPlus, Clock, History } from 'lucide-react'

import { listAppointments, qk } from '@/lib/api'
import { errorMessage } from '@/lib/supabase/errors'
import { useAuth } from '@/features/auth/AuthProvider'
import { useSeo } from '@/components/seo/Seo'
import { formatDate, formatDateTime, formatNaira } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { Alert, Badge, Button, Card, EmptyState, Skeleton, statusTone } from '@/components/ui'
import { formatDuration } from '@/components/shared/Cards'
import { CancelAppointmentDialog } from '@/features/account/components/CancelAppointmentDialog'
import { RescheduleDialog } from '@/features/account/components/RescheduleDialog'
import { StaffAvatar } from '@/features/account/components/AccountRows'
import {
  bucketFor,
  isModifiable,
  statusLabel,
  type AppointmentBucket,
} from '@/features/account/components/accountUi'
import type { AppointmentDetail } from '@/types'

/**
 * Every appointment the signed-in client has.
 *
 * Tabs are a *client-side* partition of one `listAppointments` query, not three
 * requests: the dataset is small, and splitting it keeps the tabs instant and
 * consistent when a mutation invalidates the list.
 */
const TABS: { value: AppointmentBucket; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function AccountAppointmentsPage() {
  const { user } = useAuth()
  const userId = user?.id
  const [tab, setTab] = useState<AppointmentBucket>('upcoming')

  useSeo({
    title: 'Your appointments',
    description: 'Review, reschedule or cancel your Black Chery Unisex Studio appointments.',
    path: '/account/appointments',
    noindex: true,
  })

  const query = useQuery({
    queryKey: qk.appointments(userId ?? 'anonymous'),
    queryFn: () => listAppointments(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
  })

  const all = useMemo(() => query.data ?? [], [query.data])

  const grouped = useMemo(() => {
    const now = new Date()
    const buckets: Record<AppointmentBucket, AppointmentDetail[]> = {
      upcoming: [],
      past: [],
      cancelled: [],
    }
    for (const appointment of all) buckets[bucketFor(appointment, now)].push(appointment)
    // Upcoming reads soonest-first; history reads most-recent-first.
    buckets.upcoming.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    buckets.past.sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    buckets.cancelled.sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    return buckets
  }, [all])

  const rows = grouped[tab]
  const isEmpty = !query.isLoading && !query.isError && all.length === 0

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow mb-2.5">Your bookings</p>
          <h1 className="display-section">Appointments</h1>
          <p className="lede mt-3">
            Everything you have booked with us. Move or call off a visit yourself — availability is
            live.
          </p>
        </div>
        <Button asChild variant="accent" size="lg" className="shrink-0">
          <Link to="/book">
            <CalendarPlus className="size-4" aria-hidden />
            Book another
          </Link>
        </Button>
      </header>

      {query.isLoading && <AppointmentsSkeleton />}

      {!query.isLoading && query.isError && (
        <Alert
          variant="danger"
          title="We could not load your appointments"
          action={
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
              Retry
            </Button>
          }
        >
          {errorMessage(query.error)}
        </Alert>
      )}

      {isEmpty && (
        <EmptyState
          icon={<CalendarDays className="size-5" aria-hidden />}
          title="No appointments yet"
          description="Book your first chair and we will keep your brief, references and reminders on file for next time."
          action={
            <Button asChild size="lg" variant="accent">
              <Link to="/book">Book an appointment</Link>
            </Button>
          }
        />
      )}

      {!query.isLoading && !query.isError && all.length > 0 && (
        <>
          {/* Tabs */}
          <div
            className="flex flex-wrap gap-1.5 border-b border-line pb-3"
            role="tablist"
            aria-label="Appointment status"
          >
            {TABS.map((entry) => {
              const count = grouped[entry.value].length
              const active = tab === entry.value

              return (
                <button
                  key={entry.value}
                  type="button"
                  role="tab"
                  id={`tab-${entry.value}`}
                  aria-selected={active}
                  aria-controls={`panel-${entry.value}`}
                  onClick={() => setTab(entry.value)}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-ink text-canvas'
                      : 'text-ink-soft hover:bg-sand hover:text-ink',
                  )}
                >
                  {entry.label}
                  <span
                    className={cn(
                      'rounded-pill px-1.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums',
                      active ? 'bg-white/15 text-canvas' : 'bg-sand text-muted',
                    )}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          <div
            id={`panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
            tabIndex={-1}
          >
            {rows.length === 0 ? (
              <EmptyState
                icon={tab === 'cancelled' ? <History className="size-5" aria-hidden /> : <Clock className="size-5" aria-hidden />}
                title={
                  tab === 'upcoming'
                    ? 'Nothing coming up'
                    : tab === 'past'
                      ? 'No past visits yet'
                      : 'Nothing cancelled'
                }
                description={
                  tab === 'upcoming'
                    ? 'Your diary is clear. Book whenever you are ready — we hold slots live.'
                    : tab === 'past'
                      ? 'Once you have been in the chair, your visits and their receipts appear here.'
                      : 'Cancelled appointments are kept here for your records.'
                }
                action={
                  tab === 'upcoming' ? (
                    <Button asChild size="lg" variant="accent">
                      <Link to="/book">Book an appointment</Link>
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="space-y-3">
                {rows.map((appointment) => (
                  <li key={appointment.id}>
                    <AppointmentRow appointment={appointment} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------
function AppointmentRow({ appointment }: { appointment: AppointmentDetail }) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  const modifiable = isModifiable(appointment.status)
  const price = appointment.total

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* When + what */}
        <div className="flex min-w-0 flex-1 gap-4">
          <div className="flex w-16 shrink-0 flex-col items-center justify-center rounded-md border border-line bg-sand/60 py-2 text-center">
            <span className="text-[0.625rem] uppercase tracking-wider text-muted">
              {formatDate(appointment.starts_at, 'MMM')}
            </span>
            <span className="font-display text-xl font-semibold leading-none tabular-nums text-ink">
              {formatDate(appointment.starts_at, 'd')}
            </span>
            <span className="mt-0.5 text-[0.625rem] text-muted">
              {formatDate(appointment.starts_at, 'EEE')}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base font-semibold text-ink">
                <Link
                  to={`/account/appointments/${appointment.id}`}
                  className="transition-colors hover:text-bronze-dark"
                >
                  {appointment.service?.name ?? 'Salon service'}
                </Link>
              </h2>
              <Badge variant={statusTone(appointment.status)} size="sm" dot>
                {statusLabel(appointment.status)}
              </Badge>
              <Badge variant={statusTone(appointment.payment_status)} size="sm">
                {statusLabel(appointment.payment_status)}
              </Badge>
            </div>

            <p className="mt-1.5 text-sm text-ink-soft">
              {formatDateTime(appointment.starts_at)} · {formatDuration(appointment.duration_minutes)}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                {appointment.staff ? (
                  <>
                    <StaffAvatar
                      userId={appointment.staff.user_id}
                      name={appointment.staff.full_name}
                      size="xs"
                    />
                    {appointment.staff.full_name}
                  </>
                ) : (
                  'Stylist to be assigned'
                )}
              </span>
              {appointment.variant && <span>{appointment.variant.label}</span>}
              <span className="tabular-nums">{formatNaira(price)}</span>
              <span className="text-faint">Ref {appointment.reference}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/account/appointments/${appointment.id}`}>View</Link>
          </Button>
          {modifiable && (
            <>
              <Button variant="subtle" size="sm" onClick={() => setRescheduleOpen(true)}>
                Reschedule
              </Button>
              <Button
                variant="destructiveOutline"
                size="sm"
                onClick={() => setCancelOpen(true)}
              >
                Cancel
              </Button>
            </>
          )}
        </div>
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
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
function AppointmentsSkeleton() {
  return (
    <div className="space-y-8" aria-hidden>
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex gap-2 border-b border-line pb-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-11 w-28 rounded-md" />
        ))}
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex gap-4 rounded-lg border border-line bg-surface p-5">
            <Skeleton className="h-16 w-16 shrink-0 rounded-md" />
            <div className="flex-1 space-y-2.5">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
