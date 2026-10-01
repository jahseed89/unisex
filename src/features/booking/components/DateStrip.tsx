import { Skeleton } from '@/components/ui'
import { DAY_SHORT } from '@/config/site'
import { cn } from '@/lib/utils/cn'
import { formatDate, fromDateKey, toDateKey } from '@/lib/utils/format'

export interface DayCell {
  /** yyyy-MM-dd, local. */
  key: string
  /** True when the month grid knows this day has at least one bookable slot. */
  available: boolean
  /** False while the availability sweep is still in flight. */
  known: boolean
  /** Today and the following five days get a short caption so the rail is scannable. */
  caption: string | null
}

export interface DateStripProps {
  days: DayCell[]
  selectedKey: string
  onSelect: (key: string) => void
  isLoading: boolean
  /** Set when the availability sweep failed — the rail stays usable as a fallback. */
  degraded: boolean
}

/**
 * Horizontal 30-day rail.
 *
 * Days without availability stay visible but disabled, with the reason spelled
 * out for screen readers — a gap in the rail is more confusing than a struck-out
 * day. Touch targets are 72px tall so the strip is comfortable on a 375px
 * screen, and it is a scroll-snap rail so a flick moves one day at a time.
 */
export function DateStrip({ days, selectedKey, onSelect, isLoading, degraded }: DateStripProps) {
  return (
    <div>
      <div
        className="rail gap-2 pb-2 no-scrollbar"
        role="group"
        aria-label="Choose a date"
      >
        {isLoading && days.length === 0
          ? Array.from({ length: 14 }, (_, index) => (
              <Skeleton key={index} className="h-[4.75rem] w-[4.25rem] shrink-0 rounded-md" />
            ))
          : days.map((day) => {
              const date = fromDateKey(day.key)
              const weekday = DAY_SHORT[date.getDay()] ?? ''
              const month = date.toLocaleDateString('en-NG', { month: 'short' })
              const isSelected = day.key === selectedKey
              const disabled = day.known && !day.available
              const unavailableReason = !day.available
                ? day.known
                  ? ' — fully booked or closed'
                  : ' — availability not confirmed yet'
                : ''

              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => onSelect(day.key)}
                  disabled={disabled}
                  aria-pressed={isSelected}
                  aria-label={`${formatDate(day.key, 'EEEE d MMMM')}${unavailableReason}`}
                  className={cn(
                    'flex w-[4.25rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-2 transition-colors duration-200',
                    isSelected
                      ? 'border-ink bg-ink text-canvas'
                      : disabled
                        ? 'cursor-not-allowed border-line bg-sand/40 text-faint line-through'
                        : 'border-line bg-surface text-ink hover:border-bronze hover:bg-sand/50',
                  )}
                >
                  <span className="text-[0.625rem] font-medium uppercase tracking-[0.12em] opacity-80">
                    {weekday}
                  </span>
                  <span className="font-display text-lg font-semibold leading-none">
                    {date.getDate()}
                  </span>
                  <span className="text-[0.5625rem] uppercase tracking-[0.1em] opacity-70">
                    {day.caption ?? month}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'mt-0.5 size-1 rounded-full',
                      !day.known ? 'bg-transparent' : day.available ? 'bg-bronze' : 'bg-transparent',
                      isSelected && day.available && 'bg-canvas',
                    )}
                  />
                </button>
              )
            })}
      </div>

      <p className="mt-1.5 text-xs text-muted" aria-live="polite">
        {degraded
          ? 'Live availability is unavailable — pick a date and we will show its times.'
          : isLoading
            ? 'Checking which days have space…'
            : 'Struck-out days are fully booked. Bookings open 60 days ahead.'}
      </p>
    </div>
  )
}

/** Builds the rail's cells for the next `count` days, starting today. */
export function buildDayCells(count: number): { key: string; date: Date }[] {
  const cells: { key: string; date: Date }[] = []
  const start = new Date()
  start.setHours(0, 0, 0, 0)

  for (let offset = 0; offset < count; offset++) {
    const date = new Date(start)
    date.setDate(date.getDate() + offset)
    cells.push({ key: toDateKey(date), date })
  }
  return cells
}
