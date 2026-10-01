import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  LayoutList,
  RefreshCw,
  Rows3,
  Sparkles,
  Wallet,
} from 'lucide-react'

import { useAuth } from '@/features/auth/AuthProvider'
import { cn } from '@/lib/utils/cn'
import {
  formatDate,
  formatDateLong,
  formatNaira,
  fromDateKey,
} from '@/lib/utils/format'
import { formatDuration } from '@/components/shared/Cards'
import { DAY_SHORT } from '@/config/site'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  SectionHeading,
  Skeleton,
  Stat,
  statusTone,
} from '@/components/ui'
import { errorMessage } from '@/lib/supabase/errors'
import { AppointmentRow } from '../components/AppointmentRow'
import { DiaryTimeline } from '../components/DiaryTimeline'
import {
  expectedRevenue,
  groupByDay,
  shiftDay,
  todayKey,
  totalMinutes,
  useSetAppointmentStatus,
  useStaffDiaryWindow,
  useStartService,
  weekDays,
  weekStart,
} from '../components/staffData'
import { APPOINTMENT_STATUS_LABEL, type StaffAppointment } from '../components/staffTypes'

type ViewMode = 'list' | 'timeline'

const DAY_STRIP_LENGTH = 14

/**
 * The stylist's diary.
 *
 * The selected date lives in `?date=` so a stylist can send a colleague a link to
 * "my Thursday" and have it open on the right day. The week toggle reads the
 * same parameter and widens the range it covers.
 */
export default function StaffDiaryPage() {
  const { user } = useAuth()
  const staffId = user?.id

  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<ViewMode>('list')

  const today = todayKey()
  const rawDate = params.get('date')
  const anchor = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today
  const weekMode = params.get('range') === 'week'

  const setAnchor = (next: string, mode: 'day' | 'week') => {
    const search = new URLSearchParams(params)
    search.set('date', next)
    if (mode === 'week') search.set('range', 'week')
    else search.delete('range')
    setParams(search, { replace: true })
  }

  const from = weekMode ? weekStart(anchor) : anchor
  const to = weekMode ? shiftDay(from, 6) : anchor

  const { appointments, isLoading, isFetching, error, refetch } = useStaffDiaryWindow(
    from,
    to,
    staffId,
  )

  const advance = useSetAppointmentStatus()
  const startService = useStartService()

  const grouped = useMemo(() => groupByDay(appointments), [appointments])
  const days = useMemo(
    () => (weekMode ? weekDays(from) : [anchor]),
    [weekMode, from, anchor],
  )

  const byDay = useMemo(() => {
    const map = new Map<string, StaffAppointment[]>()
    for (const group of grouped) map.set(group.key, group.appointments)
    return map
  }, [grouped])

  const bookedMinutes = totalMinutes(
    appointments.filter((a) => a.status !== 'cancelled' && a.status !== 'no_show'),
  )

  const runStatus = (
    appointment: StaffAppointment,
    status: Parameters<typeof advance.mutate>[0]['status'],
  ) => advance.mutate({ id: appointment.id, status })

  /**
   * The strip always shows the next fortnight from today, whichever day is
   * open, so it reads as a calendar rather than a pager. The arrows can take
   * the stylist outside it when they need to.
   */
  const strip = useMemo(
    () => Array.from({ length: DAY_STRIP_LENGTH }, (_, index) => shiftDay(today, index)),
    [today],
  )

  return (
    <div className="space-y-8">
      {/* ----------------------------------------------------------------
          Header + navigation
      ---------------------------------------------------------------- */}
      <header className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="eyebrow mb-2">Diary</p>
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
              {weekMode
                ? `Week of ${formatDate(from)}`
                : formatDateLong(anchor)}
            </h1>
            <p className="mt-1.5 text-sm text-muted tabular-nums">
              {weekMode
                ? `${formatDate(from)} – ${formatDate(to)}`
                : formatDate(anchor)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={refetch}
              loading={isFetching}
              aria-label="Refresh the diary"
            >
              {!isFetching && <RefreshCw className="size-4" aria-hidden />}
              Refresh
            </Button>
          </div>
        </div>

        {/* Day strip + week toggle + arrows --------------------------- */}
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="iconSm"
              aria-label="Previous day"
              onClick={() => setAnchor(shiftDay(anchor, weekMode ? -7 : -1), weekMode ? 'week' : 'day')}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>

            <div className="relative min-w-0 flex-1">
              <div
                className="no-scrollbar flex gap-2 overflow-x-auto pb-1"
                role="group"
                aria-label="Choose a day"
              >
                {(weekMode ? weekDays(today) : strip).map((key) => {
                  const date = fromDateKey(key)
                  const active = key === anchor
                  const isToday = key === today

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAnchor(key, weekMode ? 'week' : 'day')}
                      aria-current={active ? 'date' : undefined}
                      aria-label={`${formatDateLong(key)}${isToday ? ', today' : ''}`}
                      className={cn(
                        'flex min-h-14 w-16 shrink-0 flex-col items-center justify-center rounded-md border transition-colors',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze',
                        active
                          ? 'border-ink bg-ink text-canvas'
                          : 'border-line bg-canvas text-ink-soft hover:border-line-strong hover:bg-sand',
                      )}
                    >
                      <span className="text-[0.625rem] font-medium uppercase tracking-[0.1em] opacity-70">
                        {DAY_SHORT[date.getDay()]}
                      </span>
                      <span className="font-display text-base font-semibold tabular-nums">
                        {date.getDate()}
                      </span>
                      {isToday && (
                        <span
                          className={cn(
                            'mt-0.5 size-1 rounded-full',
                            active ? 'bg-canvas' : 'bg-bronze',
                          )}
                          aria-hidden
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <Button
              variant="outline"
              size="iconSm"
              aria-label="Next day"
              onClick={() => setAnchor(shiftDay(anchor, weekMode ? 7 : 1), weekMode ? 'week' : 'day')}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <Button
              size="sm"
              variant={weekMode ? 'subtle' : 'ghost'}
              aria-pressed={weekMode}
              onClick={() => setAnchor(anchor, weekMode ? 'day' : 'week')}
            >
              <CalendarDays className="size-3.5" aria-hidden />
              {weekMode ? 'Week view' : 'Day view'}
            </Button>

            <div className="flex items-center gap-1 rounded-md border border-line p-0.5">
              <ViewToggle
                active={view === 'list'}
                onClick={() => setView('list')}
                Icon={LayoutList}
                label="List view"
              />
              <ViewToggle
                active={view === 'timeline'}
                onClick={() => setView('timeline')}
                Icon={Rows3}
                label="Timeline view"
              />
            </div>

            <Button size="sm" variant="ghost" onClick={() => setAnchor(today, 'day')}>
              Back to today
            </Button>
          </div>
        </div>
      </header>

      {/* ----------------------------------------------------------------
          Week summary
      ---------------------------------------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-3">
        {isLoading ? (
          <>
            <SummarySkeleton label="Appointments" />
            <SummarySkeleton label="Hours booked" />
            <SummarySkeleton label="Expected revenue" />
          </>
        ) : (
          <>
            <Stat
              label="Appointments"
              value={appointments.length}
              hint={weekMode ? 'Across the week' : 'On this day'}
              icon={<CalendarDays />}
            />
            <Stat
              label="Hours booked"
              value={formatDuration(bookedMinutes)}
              hint="Excludes cancellations"
              icon={<Clock />}
            />
            <Stat
              label="Expected revenue"
              value={formatNaira(expectedRevenue(appointments))}
              hint="Balance due, not deposits"
              icon={<Wallet />}
            />
          </>
        )}
      </div>

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
          {[0, 1, 2, 3].map((index) => (
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
          Content
      ---------------------------------------------------------------- */}
      {!isLoading && !error && (
        <div aria-live="polite">
          {appointments.length === 0 ? (
            <EmptyState
              icon={<CalendarDays />}
              title={weekMode ? 'Nothing booked this week' : 'Nothing booked on this day'}
              description={
                weekMode
                  ? 'Your diary is clear from Monday to Sunday. Use the arrows or switch to day view to look further ahead.'
                  : 'Pick another day from the strip above, or widen to the week.'
              }
              action={
                <Button size="lg" variant="accent" onClick={() => setAnchor(today, 'day')}>
                  Back to today
                </Button>
              }
            />
          ) : view === 'timeline' ? (
            <section>
              <SectionHeading
                as="h2"
                eyebrow="Timeline"
                title="The day laid out by the hour"
                description="Blocks are sized by appointment length and coloured by service. Select one to open its brief."
              />
              <div className="mt-8 rounded-lg border border-line bg-surface p-4">
                <DiaryTimeline days={days} appointmentsByDay={byDay} />
              </div>
              <StatusLegend />
            </section>
          ) : (
            <div className="space-y-10">
              {grouped.map((group) => (
                <section key={group.key}>
                  <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-2.5">
                    <h2 className="font-display text-lg font-semibold text-ink">
                      {formatDateLong(group.key)}
                    </h2>
                    <div className="flex items-center gap-3">
                      <p className="text-xs text-muted tabular-nums">
                        {group.appointments.length}{' '}
                        {group.appointments.length === 1 ? 'appointment' : 'appointments'} ·{' '}
                        {formatDuration(
                          totalMinutes(
                            group.appointments.filter(
                              (a) => a.status !== 'cancelled' && a.status !== 'no_show',
                            ),
                          ),
                        )}
                      </p>
                      <Badge variant="outline" size="sm">
                        {formatNaira(expectedRevenue(group.appointments))}
                      </Badge>
                    </div>
                  </div>

                  <ul className="mt-4 space-y-3">
                    {group.appointments.map((appointment) => (
                      <AppointmentRow
                        key={appointment.id}
                        appointment={appointment}
                        busy={
                          (advance.isPending && advance.variables?.id === appointment.id) ||
                          (startService.isPending && startService.variables === appointment.id)
                        }
                        onCheckIn={() => runStatus(appointment, 'checked_in')}
                        onStart={() => startService.mutate(appointment.id)}
                        onComplete={() => runStatus(appointment, 'completed')}
                        onCancel={() => runStatus(appointment, 'cancelled')}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------
          Cross-links
      ---------------------------------------------------------------- */}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        <p className="text-sm text-muted">
          Need the client brief before you walk in?
        </p>
        <div className="flex gap-2.5">
          <Button asChild variant="outline">
            <Link to="/staff/requirements">
              <ClipboardList className="size-4" aria-hidden />
              Requirements
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/staff/clients">My clients</Link>
          </Button>
        </div>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function ViewToggle({
  active,
  onClick,
  Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  Icon: typeof LayoutList
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        'flex min-h-9 items-center gap-1.5 rounded-sm px-3 text-[0.8125rem] font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bronze',
        active ? 'bg-ink text-canvas' : 'text-ink-soft hover:bg-sand',
      )}
    >
      <Icon className="size-4" aria-hidden />
      <span className="hidden sm:inline">{label.replace(' view', '')}</span>
    </button>
  )
}

function SummarySkeleton({ label }: { label: string }) {
  return (
    <Card className="p-5" aria-hidden>
      <p className="text-[0.8125rem] font-medium text-muted">{label}</p>
      <Skeleton className="mt-2.5 h-7 w-28" />
    </Card>
  )
}

function StatusLegend() {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted">Status:</span>
      {(['confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled'] as const).map(
        (status) => (
          <Badge key={status} size="sm" variant={statusTone(status)} dot>
            {APPOINTMENT_STATUS_LABEL[status]}
          </Badge>
        ),
      )}
      <span className="ml-auto flex items-center gap-1.5 text-xs text-muted">
        <Sparkles className="size-3.5 text-bronze" aria-hidden />
        Colour indicates the service
      </span>
    </div>
  )
}
