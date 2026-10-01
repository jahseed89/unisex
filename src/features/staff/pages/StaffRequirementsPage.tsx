import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Filter,
  HeartPulse,
  RefreshCw,
} from 'lucide-react'

import { cn } from '@/lib/utils/cn'
import { formatDateTime } from '@/lib/utils/format'
import { formatDuration } from '@/components/shared/Cards'
import { errorMessage } from '@/lib/supabase/errors'
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  SectionHeading,
  Skeleton,
} from '@/components/ui'
import { Avatar } from '@/components/shared/MediaFrame'
import { RequirementSheet } from '../components/RequirementSheet'
import { shiftDay, todayKey, useStaffRequirements } from '../components/staffData'
import {
  healthFlags,
  REQUIREMENT_STATUS_LABEL,
  type StaffAppointment,
} from '../components/staffTypes'

type FilterKey = 'needs_review' | 'reviewed' | 'allergies' | 'all'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'needs_review', label: 'Needs review' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'allergies', label: 'Allergies flagged' },
  { key: 'all', label: 'All' },
]

/** How far ahead the stylist can be booked — matches `max_advance_days`. */
const HORIZON_DAYS = 60

/**
 * The reason the product exists.
 *
 * A stylist must read the brief before the client sits down, so this screen is
 * built around one action: open a brief, read it, mark it read. The health and
 * safety block leads inside the sheet because it changes what may be used.
 */
export default function StaffRequirementsPage() {
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<FilterKey>('needs_review')
  const [search, setSearch] = useState('')

  const today = todayKey()
  const from = today
  const to = shiftDay(today, HORIZON_DAYS)

  const { appointments, isLoading, isFetching, error, refetch } = useStaffRequirements(from, to)

  const openId = params.get('appointment')
  const selected = useMemo(
    () => appointments.find((a) => a.id === openId) ?? null,
    [appointments, openId],
  )

  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('appointment', id)
    else next.delete('appointment')
    setParams(next, { replace: true })
  }

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()

    return appointments
      .filter((appointment) => {
        const requirement = appointment.requirement
        if (!requirement) return false

        if (filter === 'needs_review' && requirement.status !== 'submitted') return false
        if (filter === 'reviewed' && requirement.status !== 'under_review') return false
        if (filter === 'allergies' && (requirement.allergies?.length ?? 0) === 0) return false

        if (term) {
          const haystack = [
            appointment.customer?.full_name,
            appointment.customer?.email,
            appointment.service?.name,
            requirement.desired_style,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          if (!haystack.includes(term)) return false
        }

        return true
      })
      // Soonest first — the brief that matters today is the one at the top.
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  }, [appointments, filter, search])

  const counts = useMemo(
    () => ({
      needs_review: appointments.filter((a) => a.requirement?.status === 'submitted').length,
      reviewed: appointments.filter((a) => a.requirement?.status === 'under_review').length,
      allergies: appointments.filter((a) => (a.requirement?.allergies?.length ?? 0) > 0).length,
      all: appointments.length,
    }),
    [appointments],
  )

  return (
    <div className="space-y-8">
      {/* ----------------------------------------------------------------
          Header
      ---------------------------------------------------------------- */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow mb-2">Requirements</p>
          <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
            Client briefs
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Everything your upcoming clients have told you about their hair,
            their scalp and what they want — soonest first. Read it before they
            sit down.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={refetch}
          loading={isFetching}
          aria-label="Refresh requirements"
        >
          {!isFetching && <RefreshCw className="size-4" aria-hidden />}
          Refresh
        </Button>
      </header>

      {/* ----------------------------------------------------------------
          Filters
      ---------------------------------------------------------------- */}
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <label htmlFor="requirement-search" className="sr-only">
              Search client briefs
            </label>
            <Input
              id="requirement-search"
              type="search"
              value={search}
              placeholder="Search by client, service or desired style"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Filter className="size-3.5" aria-hidden />
            <span>
              Next {HORIZON_DAYS} days
            </span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter briefs">
          {FILTERS.map((entry) => {
            const active = filter === entry.key
            return (
              <button
                key={entry.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(entry.key)}
                className={cn(
                  'flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-[0.8125rem] font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze',
                  active
                    ? 'border-ink bg-ink text-canvas'
                    : 'border-line-strong bg-canvas text-ink-soft hover:border-ink hover:text-ink',
                )}
              >
                {entry.key === 'allergies' && (
                  <AlertTriangle className="size-3.5" aria-hidden />
                )}
                {entry.label}
                <span className={cn('tabular-nums', active ? 'opacity-75' : 'text-muted')}>
                  {counts[entry.key]}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ----------------------------------------------------------------
          Error
      ---------------------------------------------------------------- */}
      {error ? (
        <Alert
          variant="danger"
          title="We could not load requirements"
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
          {[0, 1, 2, 3, 4].map((index) => (
            <Card key={index} className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-6 w-20 rounded-pill" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ----------------------------------------------------------------
          Empty
      ---------------------------------------------------------------- */}
      {!isLoading && !error && visible.length === 0 && (
        <EmptyState
          icon={<ClipboardList />}
          title={
            appointments.length === 0
              ? 'No requirements to review'
              : search.trim()
                ? 'No briefs match that search'
                : `Nothing ${filter === 'reviewed' ? 'reviewed' : 'to review'} right now`
          }
          description={
            appointments.length === 0
              ? `No upcoming client has submitted a brief in the next ${HORIZON_DAYS} days. When one does, it appears here the moment they book.`
              : filter === 'reviewed'
                ? 'You have read every brief in this window. Switch to “Needs review” to see what is still outstanding.'
                : 'Try another filter, or clear the search to see every brief.'
          }
          action={
            appointments.length === 0 ? (
              <Button asChild size="lg" variant="outline">
                <Link to="/staff/diary">
                  <CalendarDays className="size-4" aria-hidden />
                  Open my diary
                </Link>
              </Button>
            ) : (
              <Button
                size="lg"
                variant="outline"
                onClick={() => {
                  setFilter('all')
                  setSearch('')
                }}
              >
                Show all briefs
              </Button>
            )
          }
        />
      )}

      {/* ----------------------------------------------------------------
          List
      ---------------------------------------------------------------- */}
      {!isLoading && !error && visible.length > 0 && (
        <section aria-live="polite">
          <SectionHeading
            as="h2"
            eyebrow={`${visible.length} ${visible.length === 1 ? 'brief' : 'briefs'}`}
            title="Soonest first"
          />

          <ul className="mt-6 space-y-2.5">
            {visible.map((appointment) => (
              <RequirementRow
                key={appointment.id}
                appointment={appointment}
                onOpen={() => setOpen(appointment.id)}
              />
            ))}
          </ul>
        </section>
      )}

      <RequirementSheet
        appointment={selected}
        open={selected !== null}
        onOpenChange={(next) => !next && setOpen(null)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function RequirementRow({
  appointment,
  onOpen,
}: {
  appointment: StaffAppointment
  onOpen: () => void
}) {
  const requirement = appointment.requirement
  const flags = healthFlags(requirement)
  const status = requirement?.status ?? 'draft'
  const name = appointment.customer?.full_name ?? 'Client'
  const soonest = Boolean(requirement && requirement.status === 'submitted')

  return (
    <li>
      <Card
        interactive
        className={cn(
          'border-l-4 p-4',
          soonest ? 'border-l-bronze' : 'border-l-transparent',
        )}
      >
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full flex-wrap items-center gap-x-4 gap-y-3 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bronze"
          aria-label={`Open the brief for ${name}, ${appointment.service?.name ?? 'service'} on ${formatDateTime(appointment.starts_at)}`}
        >
          <Avatar name={name} src={appointment.customer?.avatar_url} size="sm" />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            <p className="mt-0.5 truncate text-sm text-muted">
              {appointment.service?.name ?? 'Salon service'}
              {requirement?.desired_style ? ` — ${requirement.desired_style}` : ''}
            </p>
            <p className="mt-0.5 text-xs text-faint tabular-nums">
              {formatDateTime(appointment.starts_at)} ·{' '}
              {formatDuration(appointment.duration_minutes)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {flags.allergies.length > 0 && (
              <Badge variant="danger" size="sm">
                <AlertTriangle className="size-3" aria-hidden />
                Allergy
              </Badge>
            )}
            {flags.scalp.length > 0 && (
              <Badge variant="warning" size="sm">
                <HeartPulse className="size-3" aria-hidden />
                Scalp
              </Badge>
            )}
            <Badge
              size="sm"
              variant={
                status === 'submitted'
                  ? 'warning'
                  : status === 'under_review'
                    ? 'success'
                    : 'default'
              }
              dot
            >
              {REQUIREMENT_STATUS_LABEL[status]}
            </Badge>
          </div>

          <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
        </button>
      </Card>
    </li>
  )
}
