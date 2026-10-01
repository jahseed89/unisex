import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  Clock,
  Coffee,
  LogIn,
  PlayCircle,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react'

import { useAuth } from '@/features/auth/AuthProvider'
import { formatDate, formatDateTime, formatNaira, formatTime } from '@/lib/utils/format'
import { formatDuration } from '@/components/shared/Cards'
import { cn } from '@/lib/utils/cn'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  SectionHeading,
  Skeleton,
  Stat,
} from '@/components/ui'
import { errorMessage } from '@/lib/supabase/errors'
import { AppointmentRow } from '../components/AppointmentRow'
import {
  expectedRevenue,
  pickNowNext,
  requirementsToReview,
  todayKey,
  totalMinutes,
  useSetAppointmentStatus,
  useStaffDiaryWindow,
  useStartService,
} from '../components/staffData'
import {
  healthFlags,
  type StaffAppointment,
} from '../components/staffTypes'

/**
 * "My day" — the stylist's home screen.
 *
 * One question, answered at the top: what am I doing now? Everything else is
 * secondary. This renders inside `DashboardLayout`, so no shell of its own.
 */
export default function StaffTodayPage() {
  const { profile, user } = useAuth()
  const staffId = user?.id
  const today = todayKey()

  const { appointments, isLoading, isFetching, error, refetch } = useStaffDiaryWindow(
    today,
    today,
    staffId,
  )

  const advance = useSetAppointmentStatus()
  const startService = useStartService()

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  const { current, next } = useMemo(() => pickNowNext(appointments), [appointments])
  const highlight = current ?? next

  const toReview = useMemo(() => requirementsToReview(appointments), [appointments])
  const bookedMinutes = totalMinutes(
    appointments.filter((a) => a.status !== 'cancelled' && a.status !== 'no_show'),
  )

  const runStatus = (appointment: StaffAppointment, status: Parameters<typeof advance.mutate>[0]['status']) =>
    advance.mutate({ id: appointment.id, status })

  return (
    <div className="space-y-10">
      {/* ----------------------------------------------------------------
          Header
      ---------------------------------------------------------------- */}
      <header>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="eyebrow mb-2">My day · {formatDate(today)}</p>
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
              Good day, {firstName}.
            </h1>
            <p className="mt-2 text-sm text-muted">
              {isLoading
                ? 'Loading your diary…'
                : appointments.length === 0
                  ? 'Nothing booked for today.'
                  : `${appointments.length} ${appointments.length === 1 ? 'appointment' : 'appointments'} today.`}
            </p>
          </div>

          <Button
            variant="outline"
            onClick={refetch}
            loading={isFetching}
            aria-label="Refresh today's appointments"
          >
            {!isFetching && <RefreshCw className="size-4" aria-hidden />}
            Refresh
          </Button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {isLoading ? (
            <>
              <StatSkeleton label="Appointments" />
              <StatSkeleton label="Hours booked" />
              <StatSkeleton label="Expected revenue" />
            </>
          ) : (
            <>
              <Stat
                label="Appointments"
                value={appointments.length}
                hint={
                  appointments.length === 0
                    ? 'A clear day'
                    : `${appointments.filter((a) => a.status === 'completed').length} completed`
                }
                icon={<CalendarDays />}
              />
              <Stat
                label="Hours booked"
                value={formatDuration(bookedMinutes)}
                hint={
                  appointments.length > 0
                    ? `${(bookedMinutes / 60 / Math.max(appointments.length, 1)).toFixed(1)} hr average`
                    : 'Nothing booked'
                }
                icon={<Clock />}
              />
              <Stat
                label="Expected revenue"
                value={formatNaira(expectedRevenue(appointments))}
                hint="Excludes cancellations and no-shows"
                icon={<Sparkles />}
              />
            </>
          )}
        </div>
      </header>

      {/* ----------------------------------------------------------------
          Error
      ---------------------------------------------------------------- */}
      {error ? (
        <Alert
          variant="danger"
          title="We could not load your diary"
          action={
            <Button size="sm" variant="outline" onClick={refetch}>
              Retry
            </Button>
          }
        >
          {errorMessage(error)}
        </Alert>
      ) : null}

      {/* ----------------------------------------------------------------
          Loading
      ---------------------------------------------------------------- */}
      {isLoading && !error && (
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((index) => (
            <Card key={index} className="p-5">
              <div className="flex gap-4">
                <div className="w-24 space-y-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ----------------------------------------------------------------
          Empty
      ---------------------------------------------------------------- */}
      {!isLoading && !error && appointments.length === 0 && (
        <EmptyState
          icon={<Coffee />}
          title="No appointments today"
          description="Your chair is clear. Use the time for aftercare notes, stock or training — or check the week ahead in your diary."
          action={
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Button asChild size="lg" variant="accent">
                <Link to="/staff/diary">
                  Open my diary
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/staff/requirements">Review requirements</Link>
              </Button>
            </div>
          }
        />
      )}

      {/* ----------------------------------------------------------------
          Now / next
      ---------------------------------------------------------------- */}
      {!isLoading && !error && highlight && (
        <NowNextCard
          appointment={highlight}
          isCurrent={highlight === current}
          next={next}
          busy={
            (startService.isPending && startService.variables === highlight.id) ||
            (advance.isPending && advance.variables?.id === highlight.id)
          }
          onStart={() => startService.mutate(highlight.id)}
          onCheckIn={() => runStatus(highlight, 'checked_in')}
          onComplete={() => runStatus(highlight, 'completed')}
        />
      )}

      {/* ----------------------------------------------------------------
          Requirements to review
      ---------------------------------------------------------------- */}
      {!isLoading && !error && toReview.length > 0 && (
        <ReviewStrip
          appointments={toReview}
          onOpen={(appointment) =>
            document.getElementById(`req-${appointment.id}`)?.scrollIntoView({ block: 'center' })
          }
        />
      )}

      {/* ----------------------------------------------------------------
          Today's list
      ---------------------------------------------------------------- */}
      {!isLoading && !error && appointments.length > 0 && (
        <section>
          <SectionHeading
            as="h2"
            eyebrow="Today"
            title="Everything on the books"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/staff/diary">
                  Full diary
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </Button>
            }
          />

          <ul className="mt-6 space-y-3">
            {appointments.map((appointment) => (
              <AppointmentRow
                key={appointment.id}
                id={`req-${appointment.id}`}
                appointment={appointment}
                busy={advance.isPending && advance.variables?.id === appointment.id}
                onCheckIn={() => runStatus(appointment, 'checked_in')}
                onStart={() => startService.mutate(appointment.id)}
                onComplete={() => runStatus(appointment, 'completed')}
                onCancel={() => runStatus(appointment, 'cancelled')}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function StatSkeleton({ label }: { label: string }) {
  return (
    <Card className="p-5" aria-hidden>
      <p className="text-[0.8125rem] font-medium text-muted">{label}</p>
      <Skeleton className="mt-2.5 h-7 w-24" />
    </Card>
  )
}

/** The single most important card on the screen. */
function NowNextCard({
  appointment,
  isCurrent,
  next,
  busy,
  onStart,
  onCheckIn,
  onComplete,
}: {
  appointment: StaffAppointment
  isCurrent: boolean
  /** Shown as "then" — only populated while this one is under way. */
  next: StaffAppointment | null
  busy: boolean
  onStart: () => void
  onCheckIn: () => void
  onComplete: () => void
}) {
  const flags = healthFlags(appointment.requirement)
  const label = isCurrent ? 'Now' : 'Next up'

  return (
    <Card
      className={cn(
        'overflow-hidden border-l-4',
        isCurrent ? 'border-l-bronze' : 'border-l-line-strong',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-sand/50 px-5 py-3">
        <Badge variant={isCurrent ? 'accent' : 'default'} size="sm" dot>
          {label}
        </Badge>
        <span className="text-sm font-semibold text-ink tabular-nums">
          {formatDateTime(appointment.starts_at)}
        </span>
        <span className="text-xs text-muted">
          {formatDuration(appointment.duration_minutes)} ·{' '}
          {appointment.service?.name ?? 'Salon service'}
        </span>
      </div>

      <div className="space-y-5 p-5">
        {flags.flagged && (
          <Alert variant="danger" title="Read the brief before you start">
            <span className="flex flex-wrap items-center gap-1.5">
              <AlertTriangle className="size-3.5" aria-hidden />
              {[
                flags.allergies.length > 0 ? `Allergies: ${flags.allergies.join(', ')}` : null,
                flags.scalp.length > 0 ? `Scalp: ${flags.scalp.join(', ')}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </Alert>
        )}

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-display text-xl font-semibold text-ink">
              {appointment.customer?.full_name ?? 'Client'}
            </p>
            <p className="mt-1 text-sm text-muted">
              Ref {appointment.reference} ·{' '}
              {appointment.service?.duration_minutes
                ? formatDuration(appointment.service.duration_minutes)
                : formatDuration(appointment.duration_minutes)}{' '}
              booked · {formatNaira(appointment.balance_due || appointment.total)} due
            </p>
            {appointment.requirement?.desired_style && (
              <p className="mt-2 text-sm text-ink-soft">
                Wants:{' '}
                <span className="font-medium">{appointment.requirement.desired_style}</span>
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2.5">
            {appointment.status === 'pending' && (
              <Button size="lg" variant="solid" loading={busy} onClick={onCheckIn}>
                {!busy && <LogIn className="size-4" aria-hidden />}
                Check in
              </Button>
            )}
            {(appointment.status === 'confirmed' || appointment.status === 'checked_in') && (
              <Button size="lg" variant="accent" loading={busy} onClick={onStart}>
                {!busy && <PlayCircle className="size-4" aria-hidden />}
                Start service
              </Button>
            )}
            {appointment.status === 'in_progress' && (
              <Button size="lg" variant="accent" loading={busy} onClick={onComplete}>
                {!busy && <CheckCheck className="size-4" aria-hidden />}
                Complete
              </Button>
            )}
            {(appointment.status === 'cancelled' || appointment.status === 'no_show') && (
              <Badge variant="danger" size="lg">
                <XCircle className="size-3.5" aria-hidden />
                Not going ahead
              </Badge>
            )}

            <Button asChild size="lg" variant="outline">
              <Link to={`/staff/requirements?appointment=${appointment.id}`}>
                <ClipboardList className="size-4" aria-hidden />
                {appointment.requirement ? 'Read the brief' : 'No brief'}
              </Link>
            </Button>
          </div>
        </div>

        {next && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-3 text-sm text-muted">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em]">
              Then
            </span>
            <span className="font-medium text-ink tabular-nums">
              {formatTime(next.starts_at)}
            </span>
            <span className="truncate">
              {next.customer?.full_name ?? 'Client'} —{' '}
              {next.service?.name ?? 'Salon service'}
            </span>
          </p>
        )}

        {busy && (
          <p className="text-xs text-muted" role="status">
            Updating appointment…
          </p>
        )}
      </div>
    </Card>
  )
}

/** Anything on today's book whose requirement the stylist has not read. */
function ReviewStrip({
  appointments,
  onOpen,
}: {
  appointments: StaffAppointment[]
  onOpen: (appointment: StaffAppointment) => void
}) {
  const allergyCount = appointments.filter(
    (a) => (a.requirement?.allergies?.length ?? 0) > 0,
  ).length

  return (
    <section className="rounded-lg border border-bronze/30 bg-bronze/[0.06] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <ClipboardList className="size-4.5 text-bronze-dark" aria-hidden />
            Requirements to review
          </h2>
          <p className="mt-1 text-sm text-muted">
            {appointments.length} {appointments.length === 1 ? 'brief' : 'briefs'} from today
            {allergyCount > 0 ? ` · ${allergyCount} with allergies flagged` : ''}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/staff/requirements">Open requirements</Link>
        </Button>
      </div>

      <ul className="mt-4 space-y-2">
        {appointments.map((appointment) => {
          const flags = healthFlags(appointment.requirement)
          return (
            <li key={appointment.id}>
              <button
                type="button"
                onClick={() => onOpen(appointment)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-line bg-surface px-3.5 py-2.5 text-left transition-colors hover:border-bronze focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
              >
                <span className="text-sm font-semibold text-ink tabular-nums">
                  {formatDateTime(appointment.starts_at)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">
                  {appointment.customer?.full_name ?? 'Client'} —{' '}
                  {appointment.service?.name ?? 'Salon service'}
                </span>
                {flags.allergies.length > 0 && (
                  <Badge variant="danger" size="sm">
                    <AlertTriangle className="size-3" aria-hidden />
                    {flags.allergies.join(', ')}
                  </Badge>
                )}
                {flags.scalp.length > 0 && (
                  <Badge variant="warning" size="sm">
                    {flags.scalp.join(', ')}
                  </Badge>
                )}
                <Badge variant="outline" size="sm">
                  {appointment.requirement?.status === 'submitted' ? 'Unread' : 'Reviewed'}
                </Badge>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
