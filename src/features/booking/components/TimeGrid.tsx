import { CalendarX2 } from 'lucide-react'

import { Alert, Button, EmptyState, Skeleton } from '@/components/ui'
import type { TimeSlotGroup } from '@/lib/api'
import { cn } from '@/lib/utils/cn'

export interface TimeGridProps {
  groups: TimeSlotGroup[]
  /** ISO `starts_at` of the chosen slot, or ''. */
  selectedStartsAt: string
  onSelect: (group: TimeSlotGroup) => void
  /** Epoch ms — anything earlier is inside the lead-time window and unbookable. */
  earliestBookableMs: number
  isLoading: boolean
  error: unknown
  onRetry: () => void
  dateKey: string
}

/**
 * The day's times, rendered as a grid of buttons.
 *
 * `groupSlotsByTime` has already collapsed `(start, stylist)` rows, so a time
 * with two stylists shows as one button labelled "2 stylists" and the customer
 * picks a time rather than a person. Times inside the lead time are disabled
 * rather than hidden, so the grid does not reflow as the clock moves.
 */
export function TimeGrid({
  groups,
  selectedStartsAt,
  onSelect,
  earliestBookableMs,
  isLoading,
  error,
  onRetry,
  dateKey,
}: TimeGridProps) {
  if (error) {
    return (
      <Alert
        variant="danger"
        title="We could not load times for this day"
        action={
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        }
      >
        Try again, or pick another day.
      </Alert>
    )
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4" aria-hidden>
        {Array.from({ length: 12 }, (_, index) => (
          <Skeleton key={index} className="h-[4.25rem] rounded-md" />
        ))}
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<CalendarX2 aria-hidden />}
        title="Nothing free on this day"
        description="Every chair is taken or the salon is closed. Try the next day — the rail above shows which ones are open."
      />
    )
  }

  return (
    <div
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4"
      role="group"
      aria-label={`Available times on ${dateKey}`}
    >
      {groups.map((group) => {
        const disabled = new Date(group.startsAt).getTime() < earliestBookableMs
        const selected = group.startsAt === selectedStartsAt

        return (
          <button
            key={group.startsAt}
            type="button"
            onClick={() => onSelect(group)}
            disabled={disabled}
            aria-pressed={selected}
            aria-label={`${group.label}${group.staffCount > 1 ? `, ${group.staffCount} stylists available` : ''}${
              disabled ? ', too soon to book' : ''
            }`}
            className={cn(
              'flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-md border px-2 py-2.5 transition-colors duration-200',
              selected
                ? 'border-ink bg-ink text-canvas'
                : disabled
                  ? 'cursor-not-allowed border-line bg-sand/40 text-faint'
                  : 'border-line bg-surface text-ink hover:border-bronze hover:bg-sand/50',
            )}
          >
            <span className="font-display text-[0.9375rem] font-semibold leading-none tabular-nums">
              {group.label}
            </span>
            {group.staffCount > 1 && (
              <span
                className={cn(
                  'rounded-pill px-2 py-0.5 text-[0.625rem] font-medium',
                  selected ? 'bg-white/15 text-canvas' : 'bg-bronze/12 text-bronze-dark',
                )}
              >
                {group.staffCount} stylists
              </span>
            )}
            {disabled && <span className="text-[0.625rem]">Lead time</span>}
          </button>
        )
      })}
    </div>
  )
}
