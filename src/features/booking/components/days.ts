import { fromDateKey, toDateKey } from '@/lib/utils/format'
import type { DayCell } from './DateStrip'

/**
 * Day maths for the availability rail.
 *
 * Kept out of the component file so the module exports components only — which
 * is what makes React Fast Refresh work in development.
 */

/** The next `count` days, starting today, as local yyyy-MM-dd keys. */
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

/**
 * `getDaysWithAvailability` derives each returned key with `toISOString()`, which
 * turns a local-midnight date into the previous day anywhere east of UTC (Lagos
 * is UTC+1). We mirror that conversion exactly so the rail lines up with the
 * response. The helper itself should be using `toDateKey()` — see handoff notes.
 */
export function availabilityKey(key: string): string {
  return fromDateKey(key).toISOString().slice(0, 10)
}

/** Attach the availability sweep's results to the strip's cells. */
export function toDayCells(
  cells: { key: string }[],
  availableDays: string[] | undefined,
  known: boolean,
): DayCell[] {
  // The sweep's keys are already UTC-shifted — do not shift them twice.
  const returned = new Set(availableDays ?? [])
  return cells.map(({ key }, index) => ({
    key,
    known,
    available: returned.has(availabilityKey(key)),
    caption: index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : null,
  }))
}
