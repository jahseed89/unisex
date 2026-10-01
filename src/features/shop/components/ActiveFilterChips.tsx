import { X } from 'lucide-react'
import { Button } from '@/components/ui'
import type { ActiveChip } from './filters'

/**
 * Active filters, each individually dismissible.
 *
 * Announced politely so a screen-reader user hears the new result count after
 * a filter is removed.
 */
export function ActiveFilterChips({
  chips,
  resultCount,
  onRemove,
  onClearAll,
  className,
}: {
  chips: ActiveChip[]
  resultCount: number
  onRemove: (id: string) => void
  onClearAll: () => void
  className?: string
}) {
  if (chips.length === 0) return null

  return (
    <div className={className}>
      <ul className="flex flex-wrap items-center gap-2" aria-label="Active filters">
        {chips.map((chip) => (
          <li key={chip.id}>
            <button
              type="button"
              onClick={() => onRemove(chip.id)}
              aria-label={`Remove filter ${chip.label}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-line-strong bg-surface py-1 pl-3 pr-2 text-xs font-medium text-ink transition-colors hover:border-danger hover:text-danger"
            >
              {chip.label}
              <X className="size-3.5" aria-hidden />
            </button>
          </li>
        ))}
        <li>
          <Button variant="link" size="sm" onClick={onClearAll} className="text-xs">
            Clear all
          </Button>
        </li>
      </ul>
      <p className="sr-only" role="status" aria-live="polite">
        {chips.length} filter{chips.length === 1 ? '' : 's'} applied, {resultCount} result
        {resultCount === 1 ? '' : 's'}.
      </p>
    </div>
  )
}
